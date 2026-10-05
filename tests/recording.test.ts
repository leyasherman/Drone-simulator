import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Sticks } from '../src/sim/controller';
import { PHYSICS_DT } from '../src/sim/constants';
import { Drone } from '../src/sim/drone';
import { FREESTYLE_5 } from '../src/sim/profiles';
import {
  ClipPlayer,
  Recorder,
  clipDuration,
  clipFromJson,
  clipToJson,
  emptySample,
  frameCount,
  sampleClip,
} from '../src/sim/recording';

/** Flies a lively 5 s path and returns the true 240 Hz positions alongside a 60 Hz recording. */
function flyAndRecord() {
  const d = new Drone(FREESTYLE_5);
  d.armed = true;
  d.body.position.set(0, 100, 0); // high enough never to touch the ground
  const rec = new Recorder(90);
  const truth: { t: number; p: Vector3 }[] = [];
  const s: Sticks = { throttle: 0.5, roll: 0, pitch: 0, yaw: 0 };
  for (let i = 0; i < 240 * 5; i++) {
    const t = i * PHYSICS_DT;
    s.roll = 0.4 * Math.sin(t * 2);
    s.pitch = 0.3 * Math.cos(t * 3); // centred: rate mode keeps turning on any held stick
    s.yaw = 0.2;
    // Record the state at the start of the step, then advance (same order the game uses)
    rec.record(d.body, s, d.quad.motors);
    truth.push({ t, p: d.body.position.clone() });
    d.step(s, PHYSICS_DT);
  }
  return { rec, truth };
}

describe('Recorder', () => {
  it('keeps every 4th physics step (60 Hz)', () => {
    const { rec } = flyAndRecord();
    expect(rec.frames).toBe(300);
    const clip = rec.toClip();
    expect(clipDuration(clip)).toBeCloseTo(299 / 60, 4);
  });

  it('ring buffer keeps only the last N seconds, in order, time from 0', () => {
    const d = new Drone(FREESTYLE_5);
    const rec = new Recorder(1); // 60 frames
    const s: Sticks = { throttle: 0, roll: 0, pitch: 0, yaw: 0 };
    for (let i = 0; i < 240 * 3; i++) {
      d.body.position.x = i; // marks each step
      rec.record(d.body, s, d.quad.motors);
    }
    const clip = rec.toClip();
    expect(frameCount(clip)).toBe(60);
    expect(clip.frames[0]).toBe(0); // time starts at 0
    expect(clip.frames[1]).toBe(240 * 3 - 60 * 4); // first kept step of the last second
    for (let i = 1; i < 60; i++) expect(clip.frames[i * 16 + 1]! - clip.frames[(i - 1) * 16 + 1]!).toBe(4);
  });
});

describe('sampleClip', () => {
  it('stays within 1 mm of the true 240 Hz path between 60 Hz frames', () => {
    const { rec, truth } = flyAndRecord();
    const clip = rec.toClip();
    const out = emptySample();
    let worst = 0;
    for (const { t, p } of truth) {
      if (t > clipDuration(clip)) break;
      sampleClip(clip, t, out);
      worst = Math.max(worst, out.position.distanceTo(p));
    }
    expect(worst).toBeLessThan(0.001);
  });

  it('clamps outside the clip and interpolates sticks', () => {
    const { rec } = flyAndRecord();
    const clip = rec.toClip();
    const a = emptySample();
    const b = emptySample();
    sampleClip(clip, -5, a);
    sampleClip(clip, 0, b);
    expect(a.position.equals(b.position)).toBe(true);
    sampleClip(clip, 1e6, a);
    sampleClip(clip, clipDuration(clip), b);
    expect(a.position.equals(b.position)).toBe(true);
    sampleClip(clip, 1 / 120, a); // half way between frames 0 and 1
    const s0 = clip.frames[9]!;
    const s1 = clip.frames[16 + 9]!;
    expect(a.sticks.roll).toBeCloseTo((s0 + s1) / 2, 5);
  });
});

describe('ClipPlayer', () => {
  it('loops when asked and stops at the end otherwise', () => {
    const { rec } = flyAndRecord();
    const clip = rec.toClip();
    const looping = new ClipPlayer(clip, true);
    looping.update(clipDuration(clip) + 1);
    expect(looping.time).toBeLessThan(1.01);
    const once = new ClipPlayer(clip, false);
    once.update(clipDuration(clip) + 1);
    expect(once.finished).toBe(true);
  });
});

describe('clip JSON', () => {
  it('round-trips within 0.1 mm', () => {
    const { rec } = flyAndRecord();
    const clip = rec.toClip();
    const back = clipFromJson(JSON.parse(JSON.stringify(clipToJson(clip))));
    expect(frameCount(back)).toBe(frameCount(clip));
    let worst = 0;
    for (let i = 0; i < clip.frames.length; i++) {
      if (i % 16 >= 1 && i % 16 <= 3) worst = Math.max(worst, Math.abs(back.frames[i]! - clip.frames[i]!));
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it('rejects malformed data', () => {
    expect(() => clipFromJson({ format: 1, rate: 60, frames: [[1, 2, 3]] })).toThrow();
    expect(() => clipFromJson({ format: 2, rate: 60, frames: [] })).toThrow();
    expect(() => clipFromJson('nope')).toThrow();
  });
});
