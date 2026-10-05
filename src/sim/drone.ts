import { Vector3 } from 'three';
import { RigidBody } from './body';
import { collide, distanceDown, emptyReport, type BoxCollider, type ContactReport } from './collision';
import { RateController, type Sticks } from './controller';
import { GroundTracker } from './ground-state';
import type { DroneProfile } from './profiles';
import { GROUND_EFFECT_RADII, Quad, type MotorInput } from './quad';
import { RATE_PRESETS, type Rates } from './rates';

const NO_OBSTACLES: readonly BoxCollider[] = [];
/** Torque per kg that tips an edge-standing quad flat, N·m/kg. */
const TIP_TORQUE = 0.25;

/**
 * One complete simulated drone: flight controller → motors → body → collisions. Call step() at 240 Hz.
 * Ground rules (from the research): resting upright allows only yaw; tipped cuts thrust;
 * upside down switches the controller off and stops the spin.
 */
export class Drone {
  readonly body: RigidBody;
  readonly quad: Quad;
  readonly controller = new RateController();
  readonly ground = new GroundTracker();
  readonly contact: ContactReport = emptyReport();
  rates: Rates = RATE_PRESETS.freestyle;
  armed = false;
  /** Obstacles to collide with (the ground plane y = 0 is always there). */
  obstacles: readonly BoxCollider[] = NO_OBSTACLES;

  private readonly motorInput: MotorInput = { throttle: 0, roll: 0, pitch: 0, yaw: 0, armed: false };
  private readonly sticks: Sticks = { throttle: 0, roll: 0, pitch: 0, yaw: 0 };
  private readonly spin = new Vector3();
  private readonly up = new Vector3();
  private readonly flat = new Vector3();

  constructor(readonly profile: DroneProfile) {
    this.body = new RigidBody(profile.mass, profile.size);
    this.quad = new Quad(profile);
  }

  step(input: Sticks, dt: number): void {
    const state = this.ground.state;
    const s = this.sticks;
    s.throttle = input.throttle;
    s.yaw = input.yaw;
    // Resting upright: roll and pitch sticks do nothing, so it cannot flip on the pad
    s.roll = state === 'upright' ? 0 : input.roll;
    s.pitch = state === 'upright' ? 0 : input.pitch;
    const flying = this.armed && state !== 'tipped' && state !== 'turtled';

    const m = this.quad.motors;
    const mean = (m[0]! + m[1]! + m[2]! + m[3]!) / 4;
    this.controller.step(this.body, s, flying, this.rates, this.profile, mean, dt, this.motorInput);
    const agl = distanceDown(
      this.body.position,
      this.obstacles,
      GROUND_EFFECT_RADII * this.profile.propRadius + 0.1,
    );
    this.quad.step(this.body, this.motorInput, dt, agl);
    this.body.step(dt);
    collide(this.body, this.profile.size, this.obstacles, this.contact);

    const after = this.ground.update(this.body, this.contact, dt);
    if (after === 'upright' && this.armed) {
      // Keep yaw, drop roll and pitch spin
      this.spin.copy(this.body.angularVelocity);
      this.body.angularVelocity.set(0, this.spin.y, 0);
    }
    if (after === 'turtled') this.body.angularVelocity.set(0, 0, 0);
    if (after === 'tipped') {
      // Lying on an edge: a small torque drops it flat, onto whichever face is nearer
      this.up.set(0, 1, 0).applyQuaternion(this.body.orientation);
      this.flat.set(0, this.up.y >= 0 ? 1 : -1, 0);
      this.spin.crossVectors(this.up, this.flat).multiplyScalar(TIP_TORQUE * this.profile.mass);
      this.body.addTorque(this.spin);
    }
  }

  /** Clears motion and controller state. The caller sets position and orientation. */
  reset(): void {
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.snapshot();
    this.quad.reset();
    this.controller.reset();
    this.ground.reset();
  }
}
