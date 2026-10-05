import { Vector3 } from 'three';
import { makeBox, type BoxCollider } from '../sim/collision';

export type BoxLook = 'dark' | 'pale' | 'accent' | 'frame';

/** One box of the world. The same list feeds the renderer and the physics. */
export interface BoxSpec {
  center: Vector3;
  size: Vector3;
  yaw: number;
  look: BoxLook;
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const box = (
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  look: BoxLook,
  yaw = 0,
) => ({
  center: new Vector3(cx, cy, cz),
  size: new Vector3(sx, sy, sz),
  yaw,
  look,
});

/** Test field near the spawn (2.5, 0, 2.5); the drone faces -z. Seeded, so it is the same every time. */
export function testFieldLayout(): BoxSpec[] {
  const out: BoxSpec[] = [];

  // A simple gate 12 m ahead: 3 m wide, 2.4 m tall opening, posts and top bar 15 cm thick
  const gz = -10;
  out.push(box(2.5 - 1.575, 1.275, gz, 0.15, 2.55, 0.15, 'frame'));
  out.push(box(2.5 + 1.575, 1.275, gz, 0.15, 2.55, 0.15, 'frame'));
  out.push(box(2.5, 2.475, gz, 3.3, 0.15, 0.15, 'accent'));

  // A thin wall (10 cm) to the right, for crash testing
  out.push(box(12, 1.5, -6, 0.1, 3, 8, 'pale'));

  // Reference blocks at mid distance and a ring of pale buildings on the horizon
  const rand = seeded(7);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rand() * 0.2;
    const r = 35 + rand() * 30;
    const w = 4 + rand() * 6;
    const h = 1.5 + rand() * 4;
    const d = 3 + rand() * 6;
    out.push(box(Math.cos(a) * r, h / 2, Math.sin(a) * r, w, h, d, 'dark', rand() * Math.PI));
  }
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + rand() * 0.1;
    const r = 260 + rand() * 120;
    const w = 15 + rand() * 30;
    const h = 12 + rand() * 35;
    const d = 15 + rand() * 25;
    out.push(box(Math.cos(a) * r, h / 2, Math.sin(a) * r, w, h, d, 'pale', rand() * Math.PI));
  }
  return out;
}

export function collidersFrom(specs: readonly BoxSpec[]): BoxCollider[] {
  return specs.map((s) => makeBox(s.center, s.size, s.yaw));
}
