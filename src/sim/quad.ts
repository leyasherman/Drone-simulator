import { Quaternion, Vector3 } from 'three';
import type { RigidBody } from './body';
import {
  AIR_DENSITY_X2,
  GRAVITY,
  INFLOW_LOSS,
  INFLOW_MAX,
  INFLOW_MIN,
  LATERAL_DRAG_MULTIPLIER,
  MOTOR_BRAKING_RATIO,
  VERTICAL_DRAG_MULTIPLIER,
} from './constants';
import { MOTOR_SPIN, MOTOR_X, MOTOR_Z, mixQuadX } from './mixer';
import type { DroneProfile } from './profiles';
import { throttleCurve } from './throttle';

/** What drives the motors this step. Throttle is the raw stick 0..1; the rest are mixer fractions. */
export interface MotorInput {
  throttle: number;
  roll: number;
  pitch: number;
  yaw: number;
  armed: boolean;
}

const tmpForce = new Vector3();
const tmpTorque = new Vector3();
const tmpAir = new Vector3();
const tmpInv = new Quaternion();

/**
 * Drag impulse along one axis for quadratic drag F = -(c|v| + extra) v.
 * Implicit form: it can shrink the velocity but never reverse it, so it stays stable at any speed.
 */
export function dragImpulse(v: number, coefficient: number, extra: number, mass: number, dt: number): number {
  const k = (coefficient * Math.abs(v) + extra) * dt;
  return (-v * mass * k) / (mass + k);
}

/** Induced velocity of a prop making thrust T, m/s: v = sqrt(T / (2ρ π R²)). */
export function inducedVelocity(thrust: number, propRadius: number): number {
  return Math.sqrt(Math.max(0, thrust) / (AIR_DENSITY_X2 * Math.PI * propRadius * propRadius));
}

/** Thrust factor when air already flows through the prop (climbing or diving along the thrust axis). */
/** Ground effect reaches this many prop radii above a surface. */
export const GROUND_EFFECT_RADII = 9.45;
/** Up to this much extra thrust right at the surface. */
const GROUND_EFFECT_STRENGTH = 0.2;

/** Thrust factor near a surface; `agl` is the height of the props above it, m. */
export function groundEffect(agl: number, propRadius: number): number {
  const reach = GROUND_EFFECT_RADII * propRadius;
  if (!(agl < reach)) return 1;
  const k = 1 - Math.max(0, agl) / reach;
  return 1 + GROUND_EFFECT_STRENGTH * k * k;
}

export function inflowFactor(axial: number, induced: number): number {
  const f = 1 - (INFLOW_LOSS * axial) / Math.max(1, induced);
  return Math.min(INFLOW_MAX, Math.max(INFLOW_MIN, f));
}

/** Motors, thrust and drag for one quad. Applies forces to a RigidBody; owns no position. */
export class Quad {
  /** Current motor outputs 0..1 (lagged). */
  readonly motors = [0, 0, 0, 0];
  /** What the mixer asked for this step. */
  readonly targets = [0, 0, 0, 0];

  constructor(public profile: DroneProfile) {}

  reset(): void {
    this.motors.fill(0);
    this.targets.fill(0);
  }

  /** Max thrust of one motor at full command, N. */
  get maxMotorThrust(): number {
    const p = this.profile;
    return (p.mass * GRAVITY * p.thrustToWeight) / 4;
  }

  /** Run before body.step(dt). `agl`: distance from the body centre down to a surface (Infinity if far). */
  step(body: RigidBody, input: MotorInput, dt: number, agl = Infinity): void {
    const p = this.profile;

    // 1. Throttle stick → curve → idle floor → mixer targets
    if (input.armed) {
      const curved = throttleCurve(Math.min(1, Math.max(0, input.throttle)), p.throttleExpo, p.throttleMid);
      const throttle = p.airmode ? Math.max(p.idleThrottle, curved) : curved;
      mixQuadX(throttle, input.roll, input.pitch, input.yaw, p.airmode, this.targets);
    } else {
      this.targets.fill(0);
    }

    // 2. Motor lag (first order), faster when braking
    const tau = Math.max(0.001, p.motorResponseMs / 1000);
    for (let i = 0; i < 4; i++) {
      const m = this.motors[i]!;
      const target = this.targets[i]!;
      const t = target < m ? tau * MOTOR_BRAKING_RATIO : tau;
      this.motors[i] = m + (target - m) * (1 - Math.exp(-dt / t));
    }

    // 3. Thrust (∝ command², reduced by inflow) → body force and torques
    tmpInv.copy(body.orientation).invert();
    const air = tmpAir.copy(body.velocity).applyQuaternion(tmpInv);
    const w = body.angularVelocity;
    // Ground effect only works with the props facing the ground
    const upright = 1 - 2 * (body.orientation.x ** 2 + body.orientation.z ** 2); // body up · world up
    const ge = upright > 0.7 ? groundEffect(agl - p.size.y / 2, p.propRadius) : 1;
    const maxT = this.maxMotorThrust * ge;
    let total = 0;
    let tx = 0;
    let ty = 0;
    let tz = 0;
    let load = 0;
    for (let i = 0; i < 4; i++) {
      const m = this.motors[i]!;
      const x = MOTOR_X[i]! * p.armX;
      const z = MOTOR_Z[i]! * p.armZ;
      const raw = m * m * maxT;
      // Air moving up through this prop: body climb rate plus rotation at the prop (ω × r).y
      const axial = air.y + w.z * x - w.x * z;
      const thrust = raw * inflowFactor(axial, inducedVelocity(raw, p.propRadius));
      total += thrust;
      load += m;
      // r × F with r = (x, 0, z), F = (0, T, 0)
      tx += -z * thrust;
      tz += x * thrust;
      ty += -MOTOR_SPIN[i]! * p.yawArm * thrust;
    }
    load /= 4;
    body.addBodyForce(tmpForce.set(0, total, 0));
    body.addBodyTorque(tmpTorque.set(tx, ty, tz));

    // 4. Drag per body axis, applied as the force that gives the implicit impulse this step
    const rotor = p.rotorDrag * 4 * load;
    const c = p.dragCoefficient;
    tmpForce.set(
      dragImpulse(air.x, c * LATERAL_DRAG_MULTIPLIER, rotor, p.mass, dt) / dt,
      dragImpulse(air.y, c * VERTICAL_DRAG_MULTIPLIER, 0, p.mass, dt) / dt,
      dragImpulse(air.z, c, rotor, p.mass, dt) / dt,
    );
    body.addBodyForce(tmpForce);
  }
}
