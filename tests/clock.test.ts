import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../src/sim/clock';
import { MAX_STEPS_PER_FRAME, PHYSICS_DT } from '../src/sim/constants';

describe('FixedStepClock', () => {
  it('runs 4 steps for a 60 fps frame', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(1 / 60).steps).toBe(4);
  });

  it('carries the remainder and reports alpha in [0, 1)', () => {
    const clock = new FixedStepClock();
    const tick = clock.advance(PHYSICS_DT * 2.5);
    expect(tick.steps).toBe(2);
    expect(tick.alpha).toBeCloseTo(0.5, 6);
    expect(clock.advance(PHYSICS_DT * 0.5).steps).toBe(1);
  });

  it('caps steps per frame', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(0.2).steps).toBe(MAX_STEPS_PER_FRAME);
  });

  it('drops long gaps instead of catching up', () => {
    const clock = new FixedStepClock();
    clock.advance(PHYSICS_DT * 0.9);
    const tick = clock.advance(1);
    expect(tick.steps).toBe(0);
    expect(clock.advance(PHYSICS_DT * 0.5).steps).toBe(0); // the earlier remainder was dropped too
  });

  it('ignores NaN and negative frame times', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(Number.NaN).steps).toBe(0);
    expect(clock.advance(-1).steps).toBe(0);
  });
});
