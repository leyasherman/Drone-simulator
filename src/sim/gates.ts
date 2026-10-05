import { Euler, Matrix4, Vector3 } from 'three';

/** A gate's opening as a plane with axes. Build once with makeGate(), test every physics step. */
export interface Gate {
  readonly center: Vector3;
  readonly right: Vector3;
  readonly up: Vector3;
  /** Points out of the front face. */
  readonly normal: Vector3;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

const DEG = Math.PI / 180;

/** Gate at `position`, turned by Euler `rotationDeg` (XYZ, degrees), with an opening of `size` (w, h). */
export function makeGate(
  position: readonly [number, number, number],
  rotationDeg: readonly [number, number, number],
  size: readonly [number, number],
): Gate {
  const m = new Matrix4().makeRotationFromEuler(
    new Euler(rotationDeg[0] * DEG, rotationDeg[1] * DEG, rotationDeg[2] * DEG),
  );
  const right = new Vector3();
  const up = new Vector3();
  const normal = new Vector3();
  m.extractBasis(right, up, normal);
  return {
    center: new Vector3(...position),
    right,
    up,
    normal,
    halfWidth: size[0] / 2,
    halfHeight: size[1] / 2,
  };
}

const a = new Vector3();
const b = new Vector3();
const hit = new Vector3();

/**
 * True if the segment prev → curr passes through the gate's opening from the front side to the back.
 * Testing the segment (not just the point) means a fast quad cannot skip a gate between steps.
 */
export function crossedGate(g: Gate, prev: Vector3, curr: Vector3): boolean {
  a.copy(prev).sub(g.center);
  b.copy(curr).sub(g.center);
  const da = a.dot(g.normal);
  const db = b.dot(g.normal);
  if (da <= 0 || db > 0) return false; // must start in front and end behind (or on) the plane
  hit.copy(a).lerp(b, da / (da - db));
  return Math.abs(hit.dot(g.right)) <= g.halfWidth && Math.abs(hit.dot(g.up)) <= g.halfHeight;
}
