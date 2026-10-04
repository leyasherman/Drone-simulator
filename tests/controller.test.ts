import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Sticks } from '../src/sim/controller';
import { PHYSICS_DT } from '../src/sim/constants';
import { Drone } from '../src/sim/drone';
import { FREESTYLE_5 } from '../src/sim/profiles';
import { RATE_PRESETS, actualRate } from '../src/sim/rates';

const HOVER = 0.388;
const DEG = 180 / Math.PI;
const F = RATE_PRESETS.freestyle;

function sticks(throttle = HOVER, roll = 0, pitch = 0, yaw = 0): Sticks {
  return { throttle, roll, pitch, yaw };
}

/** An armed drone high in the air, motors already spun up to hover. */
function airborne(): Drone {
  const d = new Drone(FREESTYLE_5);
  d.armed = true;
  d.body.position.y = 50;
  for (let i = 0; i < 240; i++) d.step(sticks(), PHYSICS_DT);
  return d;
}

describe('actualRate', () => {
  it('gives max rate at full stick, zero at centre, and is symmetric', () => {
    expect(actualRate(1, F.roll)).toBeCloseTo(810);
    expect(actualRate(0, F.roll)).toBe(0);
    expect(actualRate(-0.5, F.roll)).toBeCloseTo(-actualRate(0.5, F.roll));
  });

  it('matches the research value for 20% yaw stick (35.3°/s)', () => {
    expect(actualRate(0.2, F.yaw)).toBeCloseTo(35.35, 1);
  });

  it('starts with the centre sensitivity as slope', () => {
    expect(actualRate(0.0001, F.roll) / 0.0001).toBeCloseTo(108, 0);
  });
});

describe('RateController', () => {
  it('full roll stick reaches ~800°/s, 63% in ~40 ms', () => {
    const d = airborne();
    const target = 810;
    let t63 = -1;
    for (let i = 1; i <= 120; i++) {
      d.step(sticks(HOVER, 1), PHYSICS_DT);
      const rate = -d.body.angularVelocity.z * DEG; // roll right is -z
      if (t63 < 0 && rate >= 0.632 * target) t63 = i * PHYSICS_DT * 1000;
    }
    const final = -d.body.angularVelocity.z * DEG;
    expect(final).toBeGreaterThan(target * 0.95);
    expect(final).toBeLessThan(target * 1.05);
    expect(t63).toBeGreaterThan(25);
    expect(t63).toBeLessThan(60);
  });

  it('20% yaw stick tracks its target without moving roll or pitch', () => {
    const d = airborne();
    for (let i = 0; i < 240; i++) d.step(sticks(HOVER, 0, 0, 0.2), PHYSICS_DT);
    const rate = -d.body.angularVelocity.y * DEG; // yaw right is -y
    expect(rate).toBeGreaterThan(35.35 * 0.95);
    expect(rate).toBeLessThan(35.35 * 1.05);
    expect(Math.abs(d.body.angularVelocity.x * DEG)).toBeLessThan(0.5);
    expect(Math.abs(d.body.angularVelocity.z * DEG)).toBeLessThan(0.5);
  });

  it('hovers 10 s with centred sticks: level, no sideways drift', () => {
    const d = airborne();
    const start = d.body.position.clone();
    for (let i = 0; i < 2400; i++) d.step(sticks(), PHYSICS_DT);
    const up = new Vector3(0, 1, 0).applyQuaternion(d.body.orientation);
    expect(Math.acos(Math.min(1, up.y)) * DEG).toBeLessThan(1);
    const drift = Math.hypot(d.body.position.x - start.x, d.body.position.z - start.z);
    expect(drift).toBeLessThan(0.05);
  });

  it('stops a knock: rates return to ~0 with centred sticks', () => {
    const d = airborne();
    d.body.angularVelocity.set(3, -2, 4); // a hard hit
    for (let i = 0; i < 120; i++) d.step(sticks(), PHYSICS_DT); // 0.5 s
    expect(d.body.angularVelocity.length() * DEG).toBeLessThan(3);
  });

  it('pitch stick back noses up', () => {
    const d = airborne();
    for (let i = 0; i < 48; i++) d.step(sticks(HOVER, 0, 0.5), PHYSICS_DT);
    expect(d.body.angularVelocity.x).toBeGreaterThan(0);
  });

  it('keeps roll authority at zero throttle (airmode)', () => {
    const d = airborne();
    for (let i = 0; i < 120; i++) d.step(sticks(0, 1), PHYSICS_DT);
    expect(-d.body.angularVelocity.z * DEG).toBeGreaterThan(600);
  });

  it('two runs with the same sticks are bit-for-bit equal', () => {
    const run = () => {
      const d = airborne();
      for (let i = 0; i < 1200; i++) {
        const t = i * PHYSICS_DT;
        d.step(sticks(0.5 + 0.2 * Math.sin(t), Math.sin(t * 3), Math.cos(t * 2) * 0.5, 0.3), PHYSICS_DT);
      }
      return [...d.body.position.toArray(), ...d.body.orientation.toArray()];
    };
    expect(run()).toEqual(run());
  });
});
