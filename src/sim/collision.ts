import { Quaternion, Vector3 } from 'three';
import type { RigidBody } from './body';

/** An oriented box obstacle. Build with makeBox(). */
export interface BoxCollider {
  readonly center: Vector3;
  readonly half: Vector3;
  readonly rotation: Quaternion;
  readonly inverse: Quaternion;
}

/** Box with full size `size`, turned by `yaw` radians about the vertical axis. */
export function makeBox(center: Vector3, size: Vector3, yaw = 0): BoxCollider {
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  return {
    center: center.clone(),
    half: size.clone().multiplyScalar(0.5),
    rotation,
    inverse: rotation.clone().invert(),
  };
}

/** What happened at the contacts this step. Filled by collide(). */
export interface ContactReport {
  touching: boolean;
  /** Touching something we can stand on (contact normal mostly up). */
  supported: boolean;
  /** Fastest approach speed into a surface this step, m/s. */
  impactSpeed: number;
  /** That impact was on the drone's underside. */
  impactBelly: boolean;
}

export function emptyReport(): ContactReport {
  return { touching: false, supported: false, impactSpeed: 0, impactBelly: false };
}

const FRICTION = 0.7;
const RESTITUTION = 0.1;
/** Below this approach speed contacts do not bounce, so a resting quad does not jitter. */
const BOUNCE_MIN_SPEED = 1;
const SOLVER_ITERATIONS = 4;
const MAX_CONTACTS = 24;
/** Steps shorter than this (12 m/s at 240 Hz) are safe for corner contacts alone. */
const SWEEP_MIN_STEP = 0.05;

interface Contact {
  r: Vector3; // from body centre to contact point, world
  n: Vector3; // surface normal, world, pointing out of the obstacle
  depth: number;
}

const contacts: Contact[] = Array.from({ length: MAX_CONTACTS }, () => ({
  r: new Vector3(),
  n: new Vector3(),
  depth: 0,
}));
const corner = new Vector3();
const local = new Vector3();
const correction = new Vector3();
const vp = new Vector3();
const tmp = new Vector3();
const tmp2 = new Vector3();
const tangent = new Vector3();
const impulse = new Vector3();
const up = new Vector3();
const segA = new Vector3();
const segB = new Vector3();
const rayFrom = new Vector3();
const sweepNormal = new Vector3();
const hitNormal = new Vector3();
const rayEnd = new Vector3();

/** Effective mass term 1/m + n·((I⁻¹(r×n))×r) for an impulse along n at r. */
function inverseMassAlong(body: RigidBody, r: Vector3, n: Vector3): number {
  tmp.crossVectors(r, n);
  body.invInertiaWorld(tmp, tmp2);
  tmp.crossVectors(tmp2, r);
  return 1 / body.mass + n.dot(tmp);
}

/** Pushes a point inside a box out through the nearest face. Returns false if the point is outside. */
function pointInBox(p: Vector3, b: BoxCollider, c: Contact, bodyPos: Vector3): boolean {
  local.copy(p).sub(b.center).applyQuaternion(b.inverse);
  const h = b.half;
  if (Math.abs(local.x) >= h.x || Math.abs(local.y) >= h.y || Math.abs(local.z) >= h.z) return false;
  const dx = h.x - Math.abs(local.x);
  const dy = h.y - Math.abs(local.y);
  const dz = h.z - Math.abs(local.z);
  if (dx <= dy && dx <= dz) {
    c.n.set(Math.sign(local.x) || 1, 0, 0);
    c.depth = dx;
  } else if (dy <= dz) {
    c.n.set(0, Math.sign(local.y) || 1, 0);
    c.depth = dy;
  } else {
    c.n.set(0, 0, Math.sign(local.z) || 1);
    c.depth = dz;
  }
  c.n.applyQuaternion(b.rotation);
  c.r.copy(p).sub(bodyPos);
  return true;
}

/**
 * Segment p0→p1 against a box grown by `radius` (slab test in box space).
 * Returns the fraction 0..1 where it enters, or -1 if it misses or starts inside.
 * If `normal` is given, it receives the world normal of the face that was hit.
 */
export function sweepBox(p0: Vector3, p1: Vector3, b: BoxCollider, radius: number, normal?: Vector3): number {
  segA.copy(p0).sub(b.center).applyQuaternion(b.inverse);
  segB.copy(p1).sub(b.center).applyQuaternion(b.inverse).sub(segA); // direction
  if (
    Math.abs(segA.x) <= b.half.x + radius &&
    Math.abs(segA.y) <= b.half.y + radius &&
    Math.abs(segA.z) <= b.half.z + radius
  ) {
    return -1; // already touching: corner contacts handle it
  }
  let tMin = 0;
  let tMax = 1;
  let hitAxis: 'x' | 'y' | 'z' = 'x';
  let hitSign = 1;
  for (const ax of ['x', 'y', 'z'] as const) {
    const h = b.half[ax] + radius;
    const o = segA[ax];
    const d = segB[ax];
    if (Math.abs(d) < 1e-12) {
      if (o < -h || o > h) return -1;
      continue;
    }
    let t1 = (-h - o) / d;
    let t2 = (h - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tMin) {
      tMin = t1;
      hitAxis = ax;
      hitSign = d > 0 ? -1 : 1; // the face we enter faces against the motion
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }
  if (normal) {
    normal.set(0, 0, 0);
    normal[hitAxis] = hitSign;
    normal.applyQuaternion(b.rotation);
  }
  return tMin;
}

/**
 * Collides a box-shaped body with the ground (y = 0) and the obstacles. Run after body.step().
 * 1. Sweep: when moving fast, check the whole step against obstacles grown by the body's bounding radius.
 *    On a hit, stop at the surface and bounce off it here (corners could already be past a thin wall).
 * 2. Contacts: each corner of the body box inside the ground or a box becomes a contact.
 * 3. Push the body out, then solve impulses (bounce + friction) a few times.
 */
export function collide(
  body: RigidBody,
  size: Vector3,
  boxes: readonly BoxCollider[],
  report: ContactReport,
): void {
  report.touching = false;
  report.supported = false;
  report.impactSpeed = 0;
  report.impactBelly = false;

  // 1. Continuous check, only when the step is long enough to skip through something
  if (body.position.distanceToSquared(body.prevPosition) > SWEEP_MIN_STEP * SWEEP_MIN_STEP) {
    const radius = Math.hypot(size.x, size.y, size.z) / 2;
    let firstHit = 1;
    for (const b of boxes) {
      const t = sweepBox(body.prevPosition, body.position, b, radius, sweepNormal);
      if (t >= 0 && t < firstHit) {
        firstHit = t;
        hitNormal.copy(sweepNormal);
      }
    }
    if (firstHit < 1) {
      body.position.lerpVectors(body.prevPosition, body.position, Math.max(0, firstHit - 1e-3));
      const vn = body.velocity.dot(hitNormal);
      if (vn < 0) {
        report.touching = true;
        report.impactSpeed = -vn;
        report.impactBelly = up.set(0, 1, 0).applyQuaternion(body.orientation).dot(hitNormal) > 0.7;
        // Bounce off the face and lose most of the sliding speed (centre impulse; no spin)
        tangent
          .copy(body.velocity)
          .addScaledVector(hitNormal, -vn)
          .multiplyScalar(1 - FRICTION);
        body.velocity.copy(tangent).addScaledVector(hitNormal, -RESTITUTION * vn);
      }
    }
  }

  // 2. Corner contacts
  let count = 0;
  for (let i = 0; i < 8 && count < MAX_CONTACTS; i++) {
    corner
      .set(
        i & 1 ? size.x / 2 : -size.x / 2,
        i & 2 ? size.y / 2 : -size.y / 2,
        i & 4 ? size.z / 2 : -size.z / 2,
      )
      .applyQuaternion(body.orientation)
      .add(body.position);
    if (corner.y < 0) {
      const c = contacts[count++]!;
      c.n.set(0, 1, 0);
      c.depth = -corner.y;
      c.r.copy(corner).sub(body.position);
    }
    for (const b of boxes) {
      if (count >= MAX_CONTACTS) break;
      if (pointInBox(corner, b, contacts[count]!, body.position)) count++;
    }
  }
  if (count === 0) return;
  report.touching = true;

  // 3a. Positional correction: move out along each normal by whatever depth is left
  correction.set(0, 0, 0);
  for (let i = 0; i < count; i++) {
    const c = contacts[i]!;
    const left = c.depth - correction.dot(c.n);
    if (left > 0) correction.addScaledVector(c.n, left);
    if (c.n.y > 0.5) report.supported = true;
  }
  body.position.add(correction);

  // Impact speed (before the solver changes velocities), and whether it hit belly-first
  up.set(0, 1, 0).applyQuaternion(body.orientation);
  for (let i = 0; i < count; i++) {
    const c = contacts[i]!;
    const approach = -body.pointVelocity(c.r, vp).dot(c.n);
    if (approach > report.impactSpeed) {
      report.impactSpeed = approach;
      report.impactBelly = up.dot(c.n) > 0.7;
    }
  }

  // 3b. Impulses: normal (with a little bounce on hard hits) then Coulomb friction
  for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
    for (let i = 0; i < count; i++) {
      const c = contacts[i]!;
      body.pointVelocity(c.r, vp);
      const vn = vp.dot(c.n);
      if (vn >= 0) continue;
      const e = -vn > BOUNCE_MIN_SPEED && iter === 0 ? RESTITUTION : 0;
      const jn = (-(1 + e) * vn) / inverseMassAlong(body, c.r, c.n);
      body.applyImpulseAt(impulse.copy(c.n).multiplyScalar(jn), c.r);

      body.pointVelocity(c.r, vp);
      tangent.copy(vp).addScaledVector(c.n, -vp.dot(c.n));
      const vt = tangent.length();
      if (vt < 1e-6) continue;
      tangent.divideScalar(vt);
      const jt = Math.min(vt / inverseMassAlong(body, c.r, tangent), FRICTION * jn);
      body.applyImpulseAt(impulse.copy(tangent).multiplyScalar(-jt), c.r);
    }
  }
}

/**
 * Distance straight down from `from` to the ground or the top of an obstacle, up to `maxDistance`.
 * Returns Infinity if nothing is that close. Used for ground effect.
 */
export function distanceDown(from: Vector3, boxes: readonly BoxCollider[], maxDistance: number): number {
  let best = from.y >= 0 && from.y <= maxDistance ? from.y : Infinity;
  rayFrom.copy(from);
  rayEnd.set(from.x, from.y - maxDistance, from.z);
  for (const b of boxes) {
    const t = sweepBox(rayFrom, rayEnd, b, 0);
    if (t >= 0) best = Math.min(best, t * maxDistance);
  }
  return best;
}
