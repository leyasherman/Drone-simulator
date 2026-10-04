import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { RigidBody, boxInertia } from '../src/sim/body';
import { FixedStepClock } from '../src/sim/clock';
import { GRAVITY, PHYSICS_DT } from '../src/sim/constants';

const SIZE = new Vector3(0.22, 0.05, 0.22);
const MASS = 0.65;

function makeBody(): RigidBody {
  return new RigidBody(MASS, SIZE);
}

/** A fixed control script so runs exercise forces and torques, not just gravity. */
function applyScript(body: RigidBody, step: number): void {
  const t = step * PHYSICS_DT;
  body.addBodyForce(new Vector3(0, MASS * GRAVITY * (1.2 + 0.5 * Math.sin(t * 3)), 0));
  body.addBodyTorque(new Vector3(0.002 * Math.sin(t * 5), 0.001, 0.003 * Math.cos(t * 2)));
}

describe('boxInertia', () => {
  it('matches m/12 (b² + c²)', () => {
    const I = boxInertia(12, new Vector3(1, 2, 3));
    expect(I.x).toBeCloseTo(13);
    expect(I.y).toBeCloseTo(10);
    expect(I.z).toBeCloseTo(5);
  });
});

describe('RigidBody', () => {
  it('free fall from 5 m reaches the ground at √(2gh) ≈ 9.90 m/s', () => {
    const body = makeBody();
    body.position.y = 5;
    while (body.position.y > 0) body.step(PHYSICS_DT);
    // Semi-implicit Euler overshoots the crossing by at most one step of velocity
    expect(-body.velocity.y).toBeCloseTo(Math.sqrt(2 * GRAVITY * 5), 1);
  });

  it('a force equal to weight holds the body still', () => {
    const body = makeBody();
    for (let i = 0; i < 2400; i++) {
      body.addForce(new Vector3(0, MASS * GRAVITY, 0));
      body.step(PHYSICS_DT);
    }
    expect(body.position.length()).toBeLessThan(1e-9);
  });

  it('body-frame force follows the orientation', () => {
    const body = makeBody();
    body.gravityScale = 0;
    body.orientation.setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2); // rolled 90° right: body up → world +x
    body.addBodyForce(new Vector3(0, 1, 0));
    body.step(1);
    expect(body.velocity.x).toBeCloseTo(1 / MASS);
    expect(Math.abs(body.velocity.y)).toBeLessThan(1e-9);
  });

  it('constant torque gives ω = τ t / I', () => {
    const body = makeBody();
    for (let i = 0; i < 240; i++) {
      body.addBodyTorque(new Vector3(0, 0, 0.01));
      body.step(PHYSICS_DT);
    }
    expect(body.angularVelocity.z).toBeCloseTo(0.01 / body.inertia.z, 6);
  });

  it('spinning about one axis turns by ω t and keeps a unit quaternion', () => {
    const body = makeBody();
    body.gravityScale = 0;
    body.angularVelocity.set(0, Math.PI, 0); // half a turn per second about y
    for (let i = 0; i < 240; i++) body.step(PHYSICS_DT);
    const expected = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    expect(body.orientation.angleTo(expected)).toBeLessThan(1e-3);
    expect(body.orientation.length()).toBeCloseTo(1, 12);
  });

  it('interpolates between the last two states', () => {
    const body = makeBody();
    body.gravityScale = 0;
    body.velocity.set(PHYSICS_DT ** -1, 0, 0); // 1 m per step
    body.step(PHYSICS_DT);
    const p = new Vector3();
    body.interpolate(0.25, p, new Quaternion());
    expect(p.x).toBeCloseTo(0.25);
  });

  it('two runs with the same inputs are bit-for-bit equal', () => {
    const run = () => {
      const body = makeBody();
      for (let i = 0; i < 2400; i++) {
        applyScript(body, i);
        body.step(PHYSICS_DT);
      }
      return [...body.position.toArray(), ...body.orientation.toArray(), ...body.angularVelocity.toArray()];
    };
    expect(run()).toEqual(run());
  });

  it('the result does not depend on frame rate', () => {
    const TOTAL = 2400; // 10 s of physics
    const runAt = (frameDt: number) => {
      const clock = new FixedStepClock();
      const body = makeBody();
      let done = 0;
      while (done < TOTAL) {
        const { steps } = clock.advance(frameDt);
        for (let i = 0; i < steps && done < TOTAL; i++, done++) {
          applyScript(body, done);
          body.step(PHYSICS_DT);
        }
      }
      return [...body.position.toArray(), ...body.orientation.toArray()];
    };
    const reference = runAt(1 / 60);
    for (const fps of [15, 30, 144]) expect(runAt(1 / fps)).toEqual(reference);
  });
});
