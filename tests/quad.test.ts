import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { RigidBody } from '../src/sim/body';
import { PHYSICS_DT } from '../src/sim/constants';
import { mixQuadX } from '../src/sim/mixer';
import { FREESTYLE_5 } from '../src/sim/profiles';
import { Quad, dragImpulse, inflowFactor, type MotorInput } from '../src/sim/quad';
import { throttleCurve } from '../src/sim/throttle';

const P = FREESTYLE_5;

function setup() {
  return { body: new RigidBody(P.mass, P.size), quad: new Quad(P) };
}

function input(throttle: number, roll = 0, pitch = 0, yaw = 0, armed = true): MotorInput {
  return { throttle, roll, pitch, yaw, armed };
}

function run(body: RigidBody, quad: Quad, inp: MotorInput, steps: number, lockRotation = false): void {
  const q = body.orientation.clone();
  for (let i = 0; i < steps; i++) {
    quad.step(body, inp, PHYSICS_DT);
    body.step(PHYSICS_DT);
    if (lockRotation) {
      body.orientation.copy(q);
      body.angularVelocity.set(0, 0, 0);
    }
  }
}

describe('throttleCurve', () => {
  it('keeps the ends and flattens the middle', () => {
    expect(throttleCurve(0, 0.1, 0)).toBe(0);
    expect(throttleCurve(1, 0.1, 0)).toBeCloseTo(1);
    expect(throttleCurve(0.5, 0.1, 0)).toBeCloseTo(0.4625);
  });
});

describe('mixQuadX', () => {
  const out = [0, 0, 0, 0];

  it('gives equal motors with no corrections', () => {
    mixQuadX(0.4, 0, 0, 0, true, out);
    expect(out).toEqual([0.4, 0.4, 0.4, 0.4]);
  });

  it('airmode lifts throttle so corrections still fit at zero throttle', () => {
    mixQuadX(0, 0.3, 0, 0, true, out);
    expect(Math.min(...out)).toBeCloseTo(0);
    expect(out[1]! - out[0]!).toBeCloseTo(0.6); // full roll authority kept
  });

  it('shrinks corrections larger than the motor range and stays in 0..1', () => {
    mixQuadX(0.5, 1, 1, 1, true, out);
    for (const m of out) {
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
    }
  });
});

describe('dragImpulse', () => {
  it('never reverses the velocity, even at absurd speed', () => {
    const v = 1000;
    const j = dragImpulse(v, 0.05, 0, P.mass, PHYSICS_DT);
    expect(j).toBeLessThan(0);
    expect(v + j / P.mass).toBeGreaterThan(0);
  });
});

describe('inflowFactor', () => {
  it('is 1 in still air, drops when air flows through the prop, and is clamped', () => {
    expect(inflowFactor(0, 10)).toBe(1);
    expect(inflowFactor(10, 10)).toBeCloseTo(0.82);
    expect(inflowFactor(1000, 10)).toBe(0.55);
    expect(inflowFactor(-1000, 10)).toBe(1.1);
  });
});

describe('Quad', () => {
  it('motor reaches 63% of a step in its time constant', () => {
    const { body, quad } = setup();
    // Feed the target directly through a non-airmode mix with full throttle
    quad.profile = { ...P, airmode: false, throttleExpo: 0 };
    const steps = Math.round(P.motorResponseMs / 1000 / PHYSICS_DT);
    body.gravityScale = 0;
    run(body, quad, input(1), steps);
    expect(quad.motors[0]).toBeCloseTo(1 - Math.exp(-(steps * PHYSICS_DT) / (P.motorResponseMs / 1000)), 6);
    expect(quad.motors[0]).toBeGreaterThan(0.6);
    expect(quad.motors[0]).toBeLessThan(0.66);
  });

  it('hovers at ~38-40% throttle stick', () => {
    // Bisect the stick that leaves the quad with no vertical speed after it settles
    const climbRate = (stick: number) => {
      const { body, quad } = setup();
      run(body, quad, input(stick), 480, true);
      return body.velocity.y;
    };
    let lo = 0.2;
    let hi = 0.6;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (climbRate(mid) > 0) hi = mid;
      else lo = mid;
    }
    expect(lo).toBeGreaterThan(0.38);
    expect(lo).toBeLessThan(0.4);
  });

  it('unpowered drop from 5 m hits the ground at ~8.2 m/s', () => {
    const { body, quad } = setup();
    body.position.y = 5;
    while (body.position.y > 0) run(body, quad, input(0, 0, 0, 0, false), 1);
    expect(-body.velocity.y).toBeGreaterThan(8.1);
    expect(-body.velocity.y).toBeLessThan(8.35);
  });

  it.each([
    ['roll right', input(0.4, 0.2), 'z', -1],
    ['pitch nose up', input(0.4, 0, 0.2), 'x', 1],
    ['yaw right', input(0.4, 0, 0, 0.2), 'y', -1],
  ] as const)('%s turns the body the right way', (_name, inp, axis, sign) => {
    const { body, quad } = setup();
    body.gravityScale = 0;
    run(body, quad, inp, 24);
    expect(Math.sign(body.angularVelocity[axis])).toBe(sign);
    // The other two axes stay still
    for (const other of ['x', 'y', 'z'] as const) {
      if (other !== axis) expect(Math.abs(body.angularVelocity[other])).toBeLessThan(1e-9);
    }
  });

  it('top speed nose-down 60° at full throttle is about 100 km/h', () => {
    const { body, quad } = setup();
    body.position.y = 1000;
    body.orientation.copy(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (-60 * Math.PI) / 180));
    run(body, quad, input(1), 240 * 30, true);
    const kmh = body.velocity.length() * 3.6;
    expect(kmh).toBeGreaterThan(90);
    expect(kmh).toBeLessThan(115);
  });

  it('cuts the motors when disarmed', () => {
    const { body, quad } = setup();
    run(body, quad, input(0.8), 240);
    run(body, quad, input(0.8, 0, 0, 0, false), 240);
    for (const m of quad.motors) expect(m).toBeLessThan(1e-6);
  });
});
