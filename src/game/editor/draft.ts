import type { Quaternion, Vector3 } from 'three';
import { z } from 'zod';
import { clipJsonSchema, type ClipJson } from '../../sim/recording';
import type { KeyValueStore } from '../progress';
import { lessonSchema, type Lesson, type Objective } from '../lesson-schema';

/**
 * A lesson being edited, plus the demo clips recorded for it. Plain data, so it can be saved, exported,
 * and later published. While editing it may be incomplete; validate() says what is missing.
 */
export interface Draft {
  lesson: Lesson;
  /** Demo clips recorded in the editor, by clip id. */
  clips: Record<string, ClipJson>;
  updatedAt: string;
}

const round = (v: number, step = 0.1) => Math.round(v / step) * step;
const r1 = (v: number) => Number(round(v).toFixed(1));

/** Lowercase-dashes id from a title: "Up & Over!" → "up-over". */
export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || 'my-lesson';
}

/** First free id like "gate-1", "gate-2"… */
export function uniqueId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 1; ; i++) if (!used.has(`${prefix}-${i}`)) return `${prefix}-${i}`;
}

/** Heading in degrees about the vertical: 0 = facing -z, positive turns left (the spawn's yaw convention). */
export function headingDeg(orientation: Quaternion): number {
  // Forward is -z in body axes
  const x = 2 * (orientation.x * orientation.z + orientation.w * orientation.y);
  const zz = 1 - 2 * (orientation.x * orientation.x + orientation.y * orientation.y);
  return (Math.atan2(x, zz) * 180) / Math.PI;
}

export function newDraft(now = new Date()): Draft {
  return {
    lesson: {
      id: 'my-lesson',
      title: 'My lesson',
      summary: 'Describe what the player learns in one line.',
      icon: 'forward',
      spawn: { position: [2.5, 0, 2.5], yaw: 0 },
      steps: [{ id: 'step-1', lines: [{ text: 'Say hello and explain the move.', pose: 'wave' }] }],
      practice: { instruction: 'Tell the player what to do.', objectives: [] },
    },
    clips: {},
    updatedAt: now.toISOString(),
  };
}

/** A gate `ahead` metres in front of the drone, facing it, at the drone's height. */
export function gateAhead(
  lesson: Lesson,
  position: Vector3,
  orientation: Quaternion,
  ahead = 3,
  size: [number, number] = [3, 2.4],
): Objective {
  const yaw = headingDeg(orientation);
  const rad = (yaw * Math.PI) / 180;
  // Forward (-z) turned by yaw about +y
  const fx = -Math.sin(rad);
  const fz = -Math.cos(rad);
  return {
    kind: 'gate',
    id: uniqueId(
      'gate',
      lesson.practice.objectives.map((o) => o.id),
    ),
    position: [
      r1(position.x + fx * ahead),
      r1(Math.max(position.y, size[1] / 2 + 0.3)),
      r1(position.z + fz * ahead),
    ],
    // Front face (+z) turned by the same yaw points back at the drone, so flying forward passes it
    rotation: [0, Math.round(yaw), 0],
    size,
  };
}

/** A landing pad on the ground under the drone. */
export function padBelow(lesson: Lesson, position: Vector3, radius = 1.5): Objective {
  return {
    kind: 'land',
    id: uniqueId(
      'pad',
      lesson.practice.objectives.map((o) => o.id),
    ),
    position: [r1(position.x), 0, r1(position.z)],
    radius,
  };
}

/** Spawn on the ground under the drone, facing where it faces. */
export function spawnHere(position: Vector3, orientation: Quaternion): Lesson['spawn'] {
  return { position: [r1(position.x), 0, r1(position.z)], yaw: Math.round(headingDeg(orientation)) };
}

/** Moves item i by dir (-1 up, +1 down) in place. */
export function move<T>(list: T[], i: number, dir: -1 | 1): void {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= list.length || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
}

/** Clip id for a step's demo. */
export function clipIdFor(lessonId: string, stepId: string): string {
  return slugify(`${lessonId}-${stepId}`);
}

export interface Validation {
  ok: boolean;
  errors: string[];
  lesson?: Lesson;
}

/** Checks the draft against the lesson schema, plus editor rules (demo clips exist). */
export function validate(d: Draft): Validation {
  const r = lessonSchema.safeParse(d.lesson);
  const errors: string[] = [];
  if (!r.success) {
    for (const issue of r.error.issues) {
      const where = issue.path.join('.') || 'lesson';
      // 'No objectives' gets its own plain message below
      if (where === 'practice.objectives' && issue.code === 'too_small') continue;
      errors.push(`${where}: ${issue.message}`);
    }
  }
  for (const s of d.lesson.steps) {
    if (s.demo && !d.clips[s.demo.clip]) errors.push(`steps.${s.id}: demo "${s.demo.clip}" is not recorded`);
  }
  if (d.lesson.practice.objectives.length === 0) errors.unshift('Add at least one gate or landing pad');
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], lesson: r.data };
}

// ---- Export / import: one file with the lesson and its clips ----

const exportSchema = z.object({
  format: z.literal('fpv-lesson'),
  version: z.literal(1),
  lesson: z.unknown(),
  clips: z.record(z.string(), clipJsonSchema).default({}),
});

export function exportDraft(d: Draft): string {
  return JSON.stringify({ format: 'fpv-lesson', version: 1, lesson: d.lesson, clips: d.clips });
}

/** Reads an exported file (or a bare lesson JSON from content/lessons). Throws with a readable message. */
export function importDraft(text: string, now = new Date()): Draft {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not JSON.');
  }
  const wrapped = exportSchema.safeParse(data);
  const lessonData = wrapped.success ? wrapped.data.lesson : data;
  const lesson = lessonSchema.safeParse(lessonData);
  if (!lesson.success) {
    const first = lesson.error.issues[0];
    throw new Error(
      `Not a lesson file: ${first?.path.join('.') || 'lesson'}: ${first?.message ?? 'invalid'}`,
    );
  }
  return {
    lesson: lesson.data,
    clips: wrapped.success ? wrapped.data.clips : {},
    updatedAt: now.toISOString(),
  };
}

// ---- Drafts kept in the browser ----

const STORE_KEY = 'fpv.editor.drafts.v1';

export class DraftStore {
  constructor(private readonly store: KeyValueStore) {}

  private readAll(): Record<string, Draft> {
    try {
      const raw = this.store.getItem(STORE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, Draft>) : {};
    } catch {
      return {};
    }
  }

  list(): Draft[] {
    return Object.values(this.readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Saves under the lesson id; returns false if the browser refused (storage full). */
  save(d: Draft, now = new Date()): boolean {
    const all = this.readAll();
    d.updatedAt = now.toISOString();
    all[d.lesson.id] = d;
    try {
      this.store.setItem(STORE_KEY, JSON.stringify(all));
      return true;
    } catch {
      return false;
    }
  }

  remove(id: string): void {
    const all = this.readAll();
    delete all[id];
    try {
      this.store.setItem(STORE_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
  }

  /** Renames a draft when its lesson id changes. */
  rename(oldId: string, d: Draft): void {
    if (oldId !== d.lesson.id) this.remove(oldId);
    this.save(d);
  }
}
