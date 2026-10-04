import { RigidBody } from './body';
import { RateController, type Sticks } from './controller';
import type { DroneProfile } from './profiles';
import { Quad, type MotorInput } from './quad';
import { RATE_PRESETS, type Rates } from './rates';

/** One complete simulated drone: body + motors + flight controller. Call step() at 240 Hz. */
export class Drone {
  readonly body: RigidBody;
  readonly quad: Quad;
  readonly controller = new RateController();
  rates: Rates = RATE_PRESETS.freestyle;
  armed = false;

  private readonly motorInput: MotorInput = { throttle: 0, roll: 0, pitch: 0, yaw: 0, armed: false };

  constructor(readonly profile: DroneProfile) {
    this.body = new RigidBody(profile.mass, profile.size);
    this.quad = new Quad(profile);
  }

  step(sticks: Sticks, dt: number): void {
    const m = this.quad.motors;
    const mean = (m[0]! + m[1]! + m[2]! + m[3]!) / 4;
    this.controller.step(this.body, sticks, this.armed, this.rates, this.profile, mean, dt, this.motorInput);
    this.quad.step(this.body, this.motorInput, dt);
    this.body.step(dt);
  }

  /** Clears motion and controller state. The caller sets position and orientation. */
  reset(): void {
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.snapshot();
    this.quad.reset();
    this.controller.reset();
  }
}
