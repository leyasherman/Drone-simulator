import { Vector3 } from 'three';
import type { RigidBody } from './body';

/**
 * Temporary ground for stage 4: a flat plane at y = 0, contact against the 8 corners of the body box.
 * Stage 5 replaces this with real box collisions, impacts and ground states.
 */
const corner = new Vector3();

export interface GroundContact {
  touching: boolean;
}

export function resolveFlatGround(body: RigidBody, size: Vector3, dt: number, out: GroundContact): void {
  let lowest = Infinity;
  for (let i = 0; i < 8; i++) {
    corner
      .set(
        i & 1 ? size.x / 2 : -size.x / 2,
        i & 2 ? size.y / 2 : -size.y / 2,
        i & 4 ? size.z / 2 : -size.z / 2,
      )
      .applyQuaternion(body.orientation);
    lowest = Math.min(lowest, body.position.y + corner.y);
  }
  out.touching = lowest <= 1e-4;
  if (lowest >= 0) return;

  body.position.y -= lowest;
  if (body.velocity.y < 0) body.velocity.y = 0;
  // Heavy friction and spin damping while in contact, so the quad settles instead of sliding forever
  const k = Math.exp(-dt * 8);
  body.velocity.x *= k;
  body.velocity.z *= k;
  body.angularVelocity.multiplyScalar(Math.exp(-dt * 20));
}
