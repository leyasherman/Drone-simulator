import { Quaternion, Vector3 } from 'three';
import { z } from 'zod';
import type { RigidBody } from './body';
import type { Sticks } from './controller';
import { PHYSICS_DT } from './constants';

/**
 * Flight recording: poses, sticks and motors sampled at a fixed rate.
 * One frame = 16 floats: t, px, py, pz, qx, qy, qz, qw, throttle, roll, pitch, yaw, m0, m1, m2, m3.
 * Used for lesson demo flights now, and for replays and ghosts later.
 */
export const FRAME_SIZE = 16;
export const RECORD_HZ = 60;

export interface Clip {
  rate: number;
  /** frameCount × FRAME_SIZE values, oldest first, time starting at 0. */
  frames: Float32Array;
}

export function frameCount(clip: Clip): number {
  return clip.frames.length / FRAME_SIZE;
}

export function clipDuration(clip: Clip): number {
  const n = frameCount(clip);
  return n === 0 ? 0 : clip.frames[(n - 1) * FRAME_SIZE]!;
}

/**
 * Records into a preallocated ring buffer that keeps the last `seconds`.
 * Call record() every physics step; it keeps every (240 / RECORD_HZ)th step.
 */
export class Recorder {
  private readonly buffer: Float32Array;
  private readonly capacity: number;
  private readonly every: number;
  private stepCount = 0;
  private written = 0; // total frames ever written
  private time = 0;

  constructor(seconds = 90, rate = RECORD_HZ) {
    this.capacity = Math.ceil(seconds * rate);
    this.buffer = new Float32Array(this.capacity * FRAME_SIZE);
    this.every = Math.max(1, Math.round(1 / (rate * PHYSICS_DT)));
  }

  get frames(): number {
    return Math.min(this.written, this.capacity);
  }

  clear(): void {
    this.stepCount = 0;
    this.written = 0;
    this.time = 0;
  }

  record(body: RigidBody, sticks: Sticks, motors: readonly number[]): void {
    const keep = this.stepCount % this.every === 0;
    this.stepCount++;
    if (keep) {
      const o = (this.written % this.capacity) * FRAME_SIZE;
      const b = this.buffer;
      const p = body.position;
      const q = body.orientation;
      b[o] = this.time;
      b[o + 1] = p.x;
      b[o + 2] = p.y;
      b[o + 3] = p.z;
      b[o + 4] = q.x;
      b[o + 5] = q.y;
      b[o + 6] = q.z;
      b[o + 7] = q.w;
      b[o + 8] = sticks.throttle;
      b[o + 9] = sticks.roll;
      b[o + 10] = sticks.pitch;
      b[o + 11] = sticks.yaw;
      b[o + 12] = motors[0]!;
      b[o + 13] = motors[1]!;
      b[o + 14] = motors[2]!;
      b[o + 15] = motors[3]!;
      this.written++;
    }
    this.time += PHYSICS_DT;
  }

  /** Copies the buffered frames out, oldest first, with time shifted to start at 0. */
  toClip(): Clip {
    const n = this.frames;
    const out = new Float32Array(n * FRAME_SIZE);
    const first = this.written - n;
    for (let i = 0; i < n; i++) {
      const src = ((first + i) % this.capacity) * FRAME_SIZE;
      out.set(this.buffer.subarray(src, src + FRAME_SIZE), i * FRAME_SIZE);
    }
    const t0 = n > 0 ? out[0]! : 0;
    for (let i = 0; i < n; i++) out[i * FRAME_SIZE]! -= t0;
    return { rate: RECORD_HZ, frames: out };
  }
}

/** What a clip says at one moment. */
export interface PoseSample {
  position: Vector3;
  orientation: Quaternion;
  sticks: Sticks;
  motors: number[];
}

export function emptySample(): PoseSample {
  return {
    position: new Vector3(),
    orientation: new Quaternion(),
    sticks: { throttle: 0, roll: 0, pitch: 0, yaw: 0 },
    motors: [0, 0, 0, 0],
  };
}

const qa = new Quaternion();
const qb = new Quaternion();

/** Samples a clip at time t (clamped to its length): binary search, lerp everything, slerp rotation. */
export function sampleClip(clip: Clip, t: number, out: PoseSample): PoseSample {
  const f = clip.frames;
  const n = frameCount(clip);
  if (n === 0) return out;
  let lo = 0;
  let hi = n - 1;
  if (t <= f[0]!) hi = 0;
  else if (t >= f[(n - 1) * FRAME_SIZE]!) lo = hi = n - 1;
  else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (f[mid * FRAME_SIZE]! <= t) lo = mid;
      else hi = mid;
    }
  }
  const a = lo * FRAME_SIZE;
  const b = hi * FRAME_SIZE;
  const span = f[b]! - f[a]!;
  const k = span > 0 ? (t - f[a]!) / span : 0;
  const lerp = (i: number) => f[a + i]! + (f[b + i]! - f[a + i]!) * k;

  out.position.set(lerp(1), lerp(2), lerp(3));
  qa.set(f[a + 4]!, f[a + 5]!, f[a + 6]!, f[a + 7]!);
  qb.set(f[b + 4]!, f[b + 5]!, f[b + 6]!, f[b + 7]!);
  out.orientation.copy(qa).slerp(qb, k);
  out.sticks.throttle = lerp(8);
  out.sticks.roll = lerp(9);
  out.sticks.pitch = lerp(10);
  out.sticks.yaw = lerp(11);
  for (let i = 0; i < 4; i++) out.motors[i] = lerp(12 + i);
  return out;
}

/** Plays a clip forward in time, optionally looping. */
export class ClipPlayer {
  time = 0;
  readonly sample = emptySample();

  constructor(
    readonly clip: Clip,
    public loop = true,
  ) {
    sampleClip(clip, 0, this.sample);
  }

  get finished(): boolean {
    return !this.loop && this.time >= clipDuration(this.clip);
  }

  update(dt: number): PoseSample {
    const d = clipDuration(this.clip);
    this.time += dt;
    if (this.loop && d > 0 && this.time > d) this.time %= d;
    return sampleClip(this.clip, Math.min(this.time, d), this.sample);
  }
}

// ---- JSON format, for lesson files ----

/** Decimal places per field in JSON: 1/10 mm for position, 1e-5 for rotation, 1e-4 for sticks and motors. */
const DECIMALS = [4, 4, 4, 4, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4];

export const clipJsonSchema = z.object({
  format: z.literal(1),
  rate: z.number().positive(),
  frames: z.array(z.array(z.number()).length(FRAME_SIZE)),
});
export type ClipJson = z.infer<typeof clipJsonSchema>;

export function clipToJson(clip: Clip): ClipJson {
  const frames: number[][] = [];
  for (let i = 0; i < frameCount(clip); i++) {
    const row: number[] = [];
    for (let j = 0; j < FRAME_SIZE; j++) {
      const p = 10 ** DECIMALS[j]!;
      row.push(Math.round(clip.frames[i * FRAME_SIZE + j]! * p) / p);
    }
    frames.push(row);
  }
  return { format: 1, rate: clip.rate, frames };
}

/** Validates and loads a clip. Throws a ZodError on bad data. */
export function clipFromJson(data: unknown): Clip {
  const json = clipJsonSchema.parse(data);
  const out = new Float32Array(json.frames.length * FRAME_SIZE);
  json.frames.forEach((row, i) => out.set(row, i * FRAME_SIZE));
  return { rate: json.rate, frames: out };
}
