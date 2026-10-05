import { Quaternion, Vector3 } from 'three';
import { GRAVITY } from './constants';

// Scratch objects so step() never allocates
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpInv = new Quaternion();
const tmpSpin = new Quaternion();

/** Diagonal inertia of a solid box, kg·m². Sizes are full lengths in metres. */
export function boxInertia(mass: number, size: Vector3, out = new Vector3()): Vector3 {
  const k = mass / 12;
  return out.set(
    k * (size.y * size.y + size.z * size.z),
    k * (size.x * size.x + size.z * size.z),
    k * (size.x * size.x + size.y * size.y),
  );
}

/**
 * Rigid body integrated with semi-implicit Euler.
 * Axes: x right, y up, z back (Three.js), so the nose points to -z.
 * Angular velocity is kept in the body frame, like a gyro reads it.
 * Forces and torques are accumulated, applied in step(), then cleared.
 */
export class RigidBody {
  readonly position = new Vector3();
  readonly velocity = new Vector3(); // world, m/s
  readonly orientation = new Quaternion(); // body → world
  readonly angularVelocity = new Vector3(); // body frame, rad/s
  readonly inertia = new Vector3(); // body-frame diagonal, kg·m²

  /** State before the last step, for render interpolation. */
  readonly prevPosition = new Vector3();
  readonly prevOrientation = new Quaternion();

  gravityScale = 1;

  private readonly force = new Vector3(); // world
  private readonly torque = new Vector3(); // body

  constructor(
    public mass: number,
    size: Vector3,
  ) {
    boxInertia(mass, size, this.inertia);
    this.snapshot();
  }

  addForce(worldForce: Vector3): void {
    this.force.add(worldForce);
  }

  /** Force given in body axes (e.g. thrust along body +y). */
  addBodyForce(bodyForce: Vector3): void {
    this.force.add(tmpA.copy(bodyForce).applyQuaternion(this.orientation));
  }

  addTorque(worldTorque: Vector3): void {
    tmpInv.copy(this.orientation).invert();
    this.torque.add(tmpA.copy(worldTorque).applyQuaternion(tmpInv));
  }

  addBodyTorque(bodyTorque: Vector3): void {
    this.torque.add(bodyTorque);
  }

  /** Copies the current state into prev*. step() does this itself; call it after teleporting the body. */
  snapshot(): void {
    this.prevPosition.copy(this.position);
    this.prevOrientation.copy(this.orientation);
  }

  step(dt: number): void {
    this.snapshot();

    // Linear: v += (F/m + g) dt, then x += v dt
    this.velocity.addScaledVector(this.force, dt / this.mass);
    this.velocity.y -= GRAVITY * this.gravityScale * dt;
    this.position.addScaledVector(this.velocity, dt);

    // Angular (Euler's equations): I dω/dt = τ - ω × Iω
    const w = this.angularVelocity;
    const I = this.inertia;
    const Iw = tmpA.set(I.x * w.x, I.y * w.y, I.z * w.z);
    const gyro = tmpB.crossVectors(w, Iw);
    w.x += ((this.torque.x - gyro.x) / I.x) * dt;
    w.y += ((this.torque.y - gyro.y) / I.y) * dt;
    w.z += ((this.torque.z - gyro.z) / I.z) * dt;

    // q += 0.5 · q ⊗ (0, ω_body) · dt, then normalise
    const q = this.orientation;
    tmpSpin.set(w.x * 0.5 * dt, w.y * 0.5 * dt, w.z * 0.5 * dt, 0);
    tmpSpin.premultiply(q); // q ⊗ ω
    q.set(q.x + tmpSpin.x, q.y + tmpSpin.y, q.z + tmpSpin.z, q.w + tmpSpin.w).normalize();

    this.force.set(0, 0, 0);
    this.torque.set(0, 0, 0);
  }

  /** Blends the last two states for rendering. alpha 0 = previous, 1 = current. */
  interpolate(alpha: number, outPosition: Vector3, outOrientation: Quaternion): void {
    outPosition.copy(this.prevPosition).lerp(this.position, alpha);
    outOrientation.copy(this.prevOrientation).slerp(this.orientation, alpha);
  }

  /**
   * Instant impulse `j` (world, N·s) at world offset `r` from the centre. Changes velocity and spin now,
   * not at the next step. Used by contact resolution.
   */
  applyImpulseAt(j: Vector3, r: Vector3): void {
    this.velocity.addScaledVector(j, 1 / this.mass);
    const dL = tmpA.crossVectors(r, j);
    tmpInv.copy(this.orientation).invert();
    dL.applyQuaternion(tmpInv);
    this.angularVelocity.x += dL.x / this.inertia.x;
    this.angularVelocity.y += dL.y / this.inertia.y;
    this.angularVelocity.z += dL.z / this.inertia.z;
  }

  /** Velocity of a point at world offset `r` from the centre. */
  pointVelocity(r: Vector3, out: Vector3): Vector3 {
    this.worldAngularVelocity(out);
    return out.cross(r).add(this.velocity);
  }

  /** World-space I⁻¹ · v. */
  invInertiaWorld(v: Vector3, out: Vector3): Vector3 {
    tmpInv.copy(this.orientation).invert();
    out.copy(v).applyQuaternion(tmpInv);
    out.set(out.x / this.inertia.x, out.y / this.inertia.y, out.z / this.inertia.z);
    return out.applyQuaternion(this.orientation);
  }

  /** Angular velocity in world axes. */
  worldAngularVelocity(out: Vector3): Vector3 {
    return out.copy(this.angularVelocity).applyQuaternion(this.orientation);
  }
}
