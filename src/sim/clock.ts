import { MAX_FRAME_GAP, MAX_STEPS_PER_FRAME, PHYSICS_DT } from './constants';

export interface ClockTick {
  /** Whole physics steps to run this frame. */
  steps: number;
  /** 0..1, how far rendering is between the previous and the current physics state. */
  alpha: number;
}

/**
 * Fixed-step clock ("fix your timestep"). Each frame adds real time to an accumulator,
 * runs as many whole steps as fit (capped), and carries the remainder.
 */
export class FixedStepClock {
  private accumulator = 0;
  private readonly tick: ClockTick = { steps: 0, alpha: 0 };

  reset(): void {
    this.accumulator = 0;
  }

  /** Returns a reused object; read it before the next call. */
  advance(frameSeconds: number): ClockTick {
    if (!Number.isFinite(frameSeconds) || frameSeconds > MAX_FRAME_GAP) {
      this.reset();
      this.tick.steps = 0;
      this.tick.alpha = 0;
      return this.tick;
    }
    this.accumulator += Math.min(Math.max(frameSeconds, 0), MAX_STEPS_PER_FRAME * PHYSICS_DT);
    // The epsilon stops float error from losing a step when time is an exact multiple of the step
    const steps = Math.min(MAX_STEPS_PER_FRAME, Math.floor((this.accumulator + 1e-9) / PHYSICS_DT));
    this.accumulator = Math.max(0, this.accumulator - steps * PHYSICS_DT);
    this.tick.steps = steps;
    this.tick.alpha = Math.min(1, this.accumulator / PHYSICS_DT);
    return this.tick;
  }
}
