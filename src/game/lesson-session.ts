import { ClipPlayer } from '../sim/recording';
import { getClip } from './content';
import type { FreeFlight } from './free-flight';
import type { Lesson } from './lesson-schema';
import { LessonRunner } from './lesson-runner';

/**
 * One lesson being played: briefing with demo flights, then practice in the real sim, then the result.
 * No DOM here; main.ts reads the state and draws it.
 */
export class LessonSession {
  readonly runner: LessonRunner;
  /** The demo playing during the briefing, or null. */
  demo: ClipPlayer | null = null;
  /** XP pops waiting to be shown. */
  readonly xpPops: number[] = [];

  constructor(
    readonly lesson: Lesson,
    private readonly flight: FreeFlight,
  ) {
    this.runner = new LessonRunner(lesson);
  }

  get phase() {
    return this.runner.phase;
  }

  get demoCamera(): 'fpv' | 'chase' {
    return this.runner.step.demo?.camera ?? 'fpv';
  }

  start(): void {
    this.runner.restart();
    this.loadDemo();
  }

  /** Click / Enter in the briefing. */
  advance(): void {
    const r = this.runner.advance();
    if (r === 'step') this.loadDemo();
    if (r === 'practice') this.beginPractice();
  }

  skipToPractice(): void {
    this.runner.startPractice();
    this.beginPractice();
  }

  /** "Try again" after completing: straight back into the practice. */
  tryAgain(): void {
    this.skipToPractice();
  }

  /** Leaves the lesson: unhooks from the flight. */
  end(): void {
    this.flight.afterStep = null;
    this.demo = null;
  }

  frame(frameSeconds: number) {
    if (this.phase === 'briefing') {
      this.demo?.update(Math.min(frameSeconds, 0.1));
      return null;
    }
    if (this.phase === 'complete') return null;
    const e = this.flight.frame(frameSeconds);
    if (e.respawned) {
      this.runner.practice.onRespawn();
      this.flight.drone.armed = true;
    }
    return e;
  }

  private loadDemo(): void {
    const demo = this.runner.step.demo;
    const clip = demo ? getClip(demo.clip) : undefined;
    this.demo = clip ? new ClipPlayer(clip, true) : null;
  }

  private beginPractice(): void {
    this.demo = null;
    const f = this.flight;
    f.setSpawn(this.lesson.spawn.position, this.lesson.spawn.yaw);
    f.respawn();
    f.clock.reset();
    // Armed and ready: in a lesson the player should only think about the sticks being taught
    f.drone.armed = true;
    f.afterStep = (dt) => {
      const e = this.runner.update(f.drone.body.prevPosition, f.drone.body, f.drone.ground.state, dt);
      if (e?.xp) this.xpPops.push(e.xp);
    };
  }
}
