import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { RigidBody } from '../src/sim/body';
import { collide, distanceDown, emptyReport, makeBox, sweepBox } from '../src/sim/collision';
import { PHYSICS_DT } from '../src/sim/constants';
import { Drone } from '../src/sim/drone';
import { FREESTYLE_5 as P } from '../src/sim/profiles';

const DEG = 180 / Math.PI;
const centred = { throttle: 0, roll: 0, pitch: 0, yaw: 0 };

function body(): RigidBody {
  return new RigidBody(P.mass, P.size);
}

describe('sweepBox', () => {
  const wall = makeBox(new Vector3(0, 0, 0), new Vector3(0.1, 2, 2));
  it('finds where a segment enters a box', () => {
    const t = sweepBox(new Vector3(-1, 0, 0), new Vector3(1, 0, 0), wall, 0);
    expect(t).toBeCloseTo(0.475);
  });
  it('misses when the segment passes beside it', () => {
    expect(sweepBox(new Vector3(-1, 5, 0), new Vector3(1, 5, 0), wall, 0)).toBe(-1);
  });
  it('ignores segments that start inside (already touching)', () => {
    expect(sweepBox(new Vector3(0, 0, 0), new Vector3(1, 0, 0), wall, 0)).toBe(-1);
  });
  it('respects box rotation', () => {
    const turned = makeBox(new Vector3(0, 0, 0), new Vector3(0.1, 2, 2), Math.PI / 2);
    // Turned 90°, the thin side faces z: a segment along x now crosses 2 m of box
    expect(sweepBox(new Vector3(-2, 0, 0), new Vector3(2, 0, 0), turned, 0)).toBeCloseTo(0.25);
  });
});

describe('collide', () => {
  it('does not pass through a 10 cm wall at 30 m/s', () => {
    const wall = makeBox(new Vector3(0, 5, 0), new Vector3(0.1, 10, 10));
    const b = body();
    b.gravityScale = 0;
    b.position.set(-2, 5, 0);
    b.snapshot();
    b.velocity.set(30, 0, 0);
    const report = emptyReport();
    let maxImpact = 0;
    for (let i = 0; i < 60; i++) {
      b.step(PHYSICS_DT);
      collide(b, P.size, [wall], report);
      maxImpact = Math.max(maxImpact, report.impactSpeed);
    }
    expect(b.position.x).toBeLessThan(0);
    expect(b.velocity.x).toBeLessThanOrEqual(0);
    expect(maxImpact).toBeGreaterThan(25);
  });

  it('rests on the ground for 10 s without jitter', () => {
    const b = body();
    b.position.set(0, P.size.y / 2 + 0.05, 0);
    const report = emptyReport();
    const heights: number[] = [];
    for (let i = 0; i < 2400; i++) {
      b.step(PHYSICS_DT);
      collide(b, P.size, [], report);
      if (i > 240) heights.push(b.position.y);
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1e-4);
    expect(b.velocity.length()).toBeLessThan(1e-3);
    expect(b.angularVelocity.length()).toBeLessThan(1e-3);
    expect(report.supported).toBe(true);
  });

  it('lands on top of a box', () => {
    const block = makeBox(new Vector3(0, 0.5, 0), new Vector3(2, 1, 2), 0.4);
    const b = body();
    b.position.set(0, 3, 0);
    const report = emptyReport();
    for (let i = 0; i < 1200; i++) {
      b.step(PHYSICS_DT);
      collide(b, P.size, [block], report);
    }
    expect(b.position.y).toBeCloseTo(1 + P.size.y / 2, 2);
    expect(report.supported).toBe(true);
  });

  it('reports a belly landing as belly-first', () => {
    const b = body();
    b.position.set(0, 2, 0);
    const report = emptyReport();
    let belly = false;
    for (let i = 0; i < 240 && !belly; i++) {
      b.step(PHYSICS_DT);
      collide(b, P.size, [], report);
      if (report.impactSpeed > 1) belly = report.impactBelly;
    }
    expect(belly).toBe(true);
  });
});

describe('distanceDown', () => {
  it('measures to the ground or to a box top, whichever is nearer', () => {
    const block = makeBox(new Vector3(0, 0.5, 0), new Vector3(2, 1, 2));
    expect(distanceDown(new Vector3(5, 0.3, 0), [block], 1)).toBeCloseTo(0.3);
    expect(distanceDown(new Vector3(0, 1.3, 0), [block], 1)).toBeCloseTo(0.3);
    expect(distanceDown(new Vector3(5, 3, 0), [block], 1)).toBe(Infinity);
  });
});

describe('Drone on the ground', () => {
  function settle(d: Drone, seconds: number, sticks = centred) {
    for (let i = 0; i < seconds * 240; i++) d.step(sticks, PHYSICS_DT);
  }

  it('resting upright: roll and pitch sticks do not flip it', () => {
    const d = new Drone(P);
    d.body.position.set(0, P.size.y / 2, 0);
    d.armed = true;
    settle(d, 0.5);
    expect(d.ground.state).toBe('upright');
    settle(d, 1, { throttle: 0, roll: 1, pitch: 1, yaw: 0 });
    const up = new Vector3(0, 1, 0).applyQuaternion(d.body.orientation);
    expect(Math.acos(Math.min(1, up.y)) * DEG).toBeLessThan(2);
  });

  it('upside down: turtled, controller off, no spin', () => {
    const d = new Drone(P);
    d.body.position.set(0, 0.5, 0);
    d.body.orientation.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI);
    d.armed = true;
    settle(d, 2);
    expect(d.ground.state).toBe('turtled');
    expect(d.ground.turtledTime).toBeGreaterThan(1);
    // Once turtled, sticks do nothing: no spin
    settle(d, 1, { throttle: 0.5, roll: 1, pitch: 0, yaw: 0 });
    expect(d.ground.state).toBe('turtled');
    expect(d.body.angularVelocity.length()).toBe(0);
  });

  it('standing on an edge, it tips over flat', () => {
    const d = new Drone(P);
    d.body.position.set(0, P.size.x / 2 + 0.01, 0);
    d.body.orientation.copy(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2 - 0.05));
    settle(d, 4);
    expect(['upright', 'turtled']).toContain(d.ground.state);
  });

  it('takes off from the ground with throttle', () => {
    const d = new Drone(P);
    d.body.position.set(0, P.size.y / 2, 0);
    d.armed = true;
    settle(d, 0.5);
    settle(d, 1.5, { throttle: 0.6, roll: 0, pitch: 0, yaw: 0 });
    expect(d.body.position.y).toBeGreaterThan(1);
    expect(d.ground.state).toBe('airborne');
  });
});
