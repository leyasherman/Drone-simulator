import type { Vector3 } from 'three';
import type { RigidBody } from '../sim/body';
import type { GroundState } from '../sim/ground-state';
import type { Lesson, LessonStep } from './lesson-schema';
import { PracticeTracker, type PracticeEvents } from './practice';

/** Bonus XP for finishing a lesson (the server will cap it later, stage 12). */
export const LESSON_BONUS_XP = 30;

export type LessonPhase = 'briefing' | 'practice' | 'complete';

export interface LessonResult {
  flightXp: number;
  bonusXp: number;
  totalXp: number;
}

/**
 * Walks one lesson: briefing (instructor lines, step by step, with demos) → practice → complete.
 * No rendering or input here: the game calls advance() on click and update() every physics step.
 */
export class LessonRunner {
  phase: LessonPhase = 'briefing';
  stepIndex = 0;
  lineIndex = 0;
  readonly practice: PracticeTracker;

  constructor(readonly lesson: Lesson) {
    this.practice = new PracticeTracker(lesson.practice.objectives);
  }

  get step(): LessonStep {
    return this.lesson.steps[this.stepIndex]!;
  }

  get line() {
    return this.step.lines[this.lineIndex]!;
  }

  get stepCount(): number {
    return this.lesson.steps.length;
  }

  get result(): LessonResult {
    const flightXp = this.practice.xp;
    const bonusXp = this.phase === 'complete' ? LESSON_BONUS_XP : 0;
    return { flightXp, bonusXp, totalXp: flightXp + bonusXp };
  }

  /**
   * Next instructor line. Returns what changed so the game can swap the demo or start the practice:
   * 'line' (same step), 'step' (new step, new demo), 'practice' (briefing over: respawn and fly), or 'none'.
   */
  advance(): 'line' | 'step' | 'practice' | 'none' {
    if (this.phase !== 'briefing') return 'none';
    if (this.lineIndex + 1 < this.step.lines.length) {
      this.lineIndex++;
      return 'line';
    }
    if (this.stepIndex + 1 < this.lesson.steps.length) {
      this.stepIndex++;
      this.lineIndex = 0;
      return 'step';
    }
    this.startPractice();
    return 'practice';
  }

  /** Jumps straight to the practice (e.g. "skip" or "try again"). */
  startPractice(): void {
    this.phase = 'practice';
    this.practice.reset();
  }

  /** Back to the first line of the first step. */
  restart(): void {
    this.phase = 'briefing';
    this.stepIndex = 0;
    this.lineIndex = 0;
    this.practice.reset();
  }

  update(prev: Vector3, body: RigidBody, ground: GroundState, dt: number): PracticeEvents | null {
    if (this.phase !== 'practice') return null;
    const e = this.practice.update(prev, body, ground, dt);
    if (e.finished) this.phase = 'complete';
    return e;
  }
}
