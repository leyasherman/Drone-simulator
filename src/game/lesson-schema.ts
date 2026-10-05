import { z } from 'zod';

/**
 * Lesson format. A lesson is data: a spawn, a few briefing steps (instructor lines + a demo flight),
 * and a practice with objectives. Same shape is used by lesson files, the game and the lesson editor.
 * Positions are metres in world space; angles are degrees.
 */

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase-words-with-dashes');
const vec3 = z.tuple([z.number(), z.number(), z.number()]);

/** Mascot pose for a line. Only names; the art is ours. */
export const POSES = ['wave', 'think', 'point', 'arms-crossed'] as const;

/** Small diagram on the lesson card. */
export const ICONS = ['takeoff', 'forward', 'angle', 'line', 'height', 'climb', 'run', 'bank'] as const;

export const lineSchema = z.object({
  text: z.string().min(1).max(200),
  pose: z.enum(POSES).default('wave'),
});

export const demoSchema = z.object({
  /** Clip id: content/clips/<id>.json */
  clip: slug,
  camera: z.enum(['fpv', 'chase']).default('fpv'),
});

export const stepSchema = z.object({
  id: slug,
  lines: z.array(lineSchema).min(1),
  demo: demoSchema.optional(),
});

/**
 * A gate is passed by flying through its front face. Front = the gate's local +z side,
 * so with rotation [0, 0, 0] you fly through it heading -z (the spawn's forward direction).
 */
export const gateSchema = z.object({
  kind: z.literal('gate'),
  id: slug,
  position: vec3,
  rotation: vec3.default([0, 0, 0]),
  /** Opening width and height, m. */
  size: z.tuple([z.number().positive(), z.number().positive()]),
});

export const landSchema = z.object({
  kind: z.literal('land'),
  id: slug,
  position: vec3,
  radius: z.number().positive(),
});

export const objectiveSchema = z.discriminatedUnion('kind', [gateSchema, landSchema]);

export const lessonSchema = z
  .object({
    id: slug,
    title: z.string().min(1).max(60),
    /** One line shown on the lesson card. */
    summary: z.string().min(1).max(140),
    icon: z.enum(ICONS).default('takeoff'),
    spawn: z.object({ position: vec3, yaw: z.number().default(0) }),
    steps: z.array(stepSchema).min(1),
    practice: z.object({
      instruction: z.string().min(1).max(200),
      objectives: z.array(objectiveSchema).min(1).max(20),
    }),
  })
  .superRefine((l, ctx) => {
    const ids = l.practice.objectives.map((o) => o.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'objective ids must be unique' });
  });

export type Lesson = z.infer<typeof lessonSchema>;
export type LessonStep = z.infer<typeof stepSchema>;
export type Objective = z.infer<typeof objectiveSchema>;
export type GateObjective = z.infer<typeof gateSchema>;
export type LandObjective = z.infer<typeof landSchema>;

/** A course is an ordered list of lessons. */
export const courseSchema = z.object({
  id: slug,
  title: z.string().min(1).max(40),
  lessons: z.array(slug),
});
export const coursesSchema = z.array(courseSchema).min(1);
export type Course = z.infer<typeof courseSchema>;

/** Validates lesson data. Throws a ZodError with readable paths on bad data. */
export function parseLesson(data: unknown): Lesson {
  return lessonSchema.parse(data);
}
