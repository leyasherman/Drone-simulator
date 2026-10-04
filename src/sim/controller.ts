import { Vector3 } from 'three';
import type { RigidBody } from './body';
import * as C from './constants';
import type { DroneProfile } from './profiles';
import type { MotorInput } from './quad';
import { actualRate, type Rates } from './rates';

/** Stick positions. throttle 0..1; roll, pitch, yaw -1..1 (roll > 0 right, pitch > 0 nose up, yaw > 0 right). */
export interface Sticks {
  throttle: number;
  roll: number;
  pitch: number;
  yaw: number;
}

const DEG = Math.PI / 180;
const AXES = ['x', 'y', 'z'] as const;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Rate controller, like Betaflight in acro mode. Sticks set target rotation rates; the controller asks
 * for torque = inertia × (P + I + D + FF) and turns it into mixer commands.
 * Body axes: x pitch (nose up +), y yaw (left +), z roll (left +).
 */
export class RateController {
  /** Target body rates, rad/s. */
  readonly setpoint = new Vector3();
  /** Torque asked for, body axes, N·m. */
  readonly torque = new Vector3();

  private readonly integral = new Vector3();
  private readonly prevGyro = new Vector3();
  private readonly prevSetpoint = new Vector3();
  private readonly dFiltered = new Vector3();
  private readonly ffFiltered = new Vector3();
  private readonly error = new Vector3();
  private readonly limits = new Vector3();
  private hasPrev = false;

  reset(): void {
    this.integral.set(0, 0, 0);
    this.dFiltered.set(0, 0, 0);
    this.ffFiltered.set(0, 0, 0);
    this.setpoint.set(0, 0, 0);
    this.torque.set(0, 0, 0);
    this.hasPrev = false;
  }

  /**
   * Writes mixer commands into `out` (throttle and armed pass through).
   * `meanMotor` is the current average motor output, used to estimate how much torque the motors can make.
   */
  step(
    body: RigidBody,
    sticks: Sticks,
    armed: boolean,
    rates: Rates,
    p: DroneProfile,
    meanMotor: number,
    dt: number,
    out: MotorInput,
  ): void {
    out.throttle = sticks.throttle;
    out.armed = armed;
    out.roll = 0;
    out.pitch = 0;
    out.yaw = 0;
    if (!armed) {
      this.reset();
      return;
    }

    const gyro = body.angularVelocity;
    const I = body.inertia;
    this.setpoint.set(
      actualRate(sticks.pitch, rates.pitch) * DEG,
      -actualRate(sticks.yaw, rates.yaw) * DEG,
      -actualRate(sticks.roll, rates.roll) * DEG,
    );
    this.error.copy(this.setpoint).sub(gyro);

    // Torque per unit of mixer command right now. Thrust ∝ cmd², so its slope is 2·cmd.
    const maxThrust = p.mass * C.GRAVITY * p.thrustToWeight;
    const slope = 2 * clamp(meanMotor, C.MIN_AUTHORITY_CMD, 1);
    const authPitch = maxThrust * p.armZ * slope;
    const authYaw = maxThrust * p.yawArm * slope;
    const authRoll = maxThrust * p.armX * slope;
    this.limits.set(
      maxThrust * p.armZ * C.TORQUE_LIMIT_SHARE,
      maxThrust * p.yawArm * C.TORQUE_LIMIT_SHARE,
      maxThrust * p.armX * C.TORQUE_LIMIT_SHARE,
    );

    // Integral with leak, deadband, I-term relax and a cap
    const leak = Math.exp(-dt / C.RATE_I_LEAK_TIME);
    const relax = C.RATE_I_RELAX_DEG * DEG;
    const band = C.RATE_I_TRACK_BAND_DEG * DEG;
    const deadband = C.RATE_I_DEADBAND_DEG * DEG;
    for (const ax of AXES) {
      const sp = this.setpoint[ax];
      const g = gyro[ax];
      const e = this.error[ax];
      let integral = this.integral[ax] * leak;
      const tracking = Math.abs(sp) < relax && Math.abs(g) < relax && Math.abs(sp - g) < band;
      if (tracking && Math.abs(e) > deadband) integral += e * dt;
      const cap = (this.limits[ax] * C.RATE_I_AUTHORITY * C.RATE_TAU * C.RATE_I_TIME) / I[ax];
      this.integral[ax] = clamp(integral, -cap, cap);
    }

    // D on measured rate change (80 Hz low-pass), FF on setpoint change (12 ms smoothing)
    if (!this.hasPrev) {
      this.prevGyro.copy(gyro);
      this.prevSetpoint.copy(this.setpoint);
      this.hasPrev = true;
    }
    const kD = 1 - Math.exp(-2 * Math.PI * C.RATE_D_FILTER_HZ * dt);
    const kFF = 1 - Math.exp(-dt / C.RATE_FF_TAU);
    for (const ax of AXES) {
      const dGyro = (gyro[ax] - this.prevGyro[ax]) / dt;
      const dSet = (this.setpoint[ax] - this.prevSetpoint[ax]) / dt;
      this.dFiltered[ax] += (dGyro - this.dFiltered[ax]) * kD;
      this.ffFiltered[ax] += (dSet - this.ffFiltered[ax]) * kFF;
    }
    this.prevGyro.copy(gyro);
    this.prevSetpoint.copy(this.setpoint);

    for (const ax of AXES) {
      const P = this.error[ax] / C.RATE_TAU;
      const In = this.integral[ax] / (C.RATE_TAU * C.RATE_I_TIME);
      const D = -(ax === 'y' ? C.RATE_D_GAIN_YAW : C.RATE_D_GAIN) * this.dFiltered[ax];
      // Feedforward only helps P and never goes past it
      const FF = clamp(C.RATE_FF_GAIN * this.ffFiltered[ax], Math.min(0, P), Math.max(0, P));
      this.torque[ax] = clamp(I[ax] * (P + In + D + FF), -this.limits[ax], this.limits[ax]);
    }

    // Torque → mixer fractions (signs follow mixer.ts)
    out.pitch = clamp(this.torque.x / authPitch, -1, 1);
    out.yaw = clamp(-this.torque.y / authYaw, -1, 1);
    out.roll = clamp(-this.torque.z / authRoll, -1, 1);
  }
}
