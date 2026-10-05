import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import firstTakeoff from '../content/lessons/first-takeoff.json';
import { parseLesson, type Lesson } from '../src/game/lesson-schema';
import { LESSON_BONUS_XP, LessonRunner } from '../src/game/lesson-runner';
import { LAND_HOLD_S, PracticeTracker, XP_PER_GATE } from '../src/game/practice';
import { RigidBody } from '../src/sim/body';
import { PHYSICS_DT } from '../src/sim/constants';
import { Drone } from '../src/sim/drone';
import { crossedGate, makeGate } from '../src/sim/gates';
import { FREESTYLE_5 } from '../src/sim/profiles';

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

const MINI: unknown = {
  id: 'mini',
  title: 'Mini',
  summary: 'Two gates and a pad.',
  spawn: { position: [0, 0, 0] },
  steps: [
    { id: 'one', lines: [{ text: 'Hello.' }, { text: 'Watch this.', pose: 'point' }] },
    { id: 'two', lines: [{ text: 'Now you.' }], demo: { clip: 'some-clip' } },
  ],
  practice: {
    instruction: 'Fly through both gates, then land.',
    objectives: [
      { kind: 'gate', id: 'g1', position: [0, 2, -10], size: [3, 2] },
      { kind: 'gate', id: 'g2', position: [0, 2, -20], size: [3, 2] },
      { kind: 'land', id: 'pad', position: [0, 0, -25], radius: 1 },
    ],
  },
};

describe('lesson schema', () => {
  it('accepts a good lesson and fills defaults', () => {
    const l = parseLesson(MINI);
    expect(l.steps[0]!.lines[0]!.pose).toBe('wave');
    expect(l.steps[1]!.demo!.camera).toBe('fpv');
    const g = l.practice.objectives[0]!;
    expect(g.kind === 'gate' && g.rotation).toEqual([0, 0, 0]);
  });

  it('accepts the shipped lesson files', () => {
    expect(() => parseLesson(firstTakeoff)).not.toThrow();
  });

  it.each([
    ['bad id', { ...(MINI as object), id: 'Bad Id' }],
    ['no steps', { ...(MINI as object), steps: [] }],
    [
      'gate without size',
      {
        ...(MINI as object),
        practice: { instruction: 'x', objectives: [{ kind: 'gate', id: 'g', position: [0, 0, 0] }] },
      },
    ],
    [
      'duplicate objective ids',
      {
        ...(MINI as object),
        practice: {
          instruction: 'x',
          objectives: [
            { kind: 'land', id: 'a', position: [0, 0, 0], radius: 1 },
            { kind: 'land', id: 'a', position: [1, 0, 0], radius: 1 },
          ],
        },
      },
    ],
  ])('rejects %s', (_name, data) => {
    expect(() => parseLesson(data)).toThrow();
  });
});

describe('crossedGate', () => {
  const g = makeGate([0, 2, 0], [0, 0, 0], [3, 2]);
  it('counts front to back through the opening (heading -z)', () => {
    expect(crossedGate(g, v(0, 2, 1), v(0, 2, -1))).toBe(true);
  });
  it('does not count back to front', () => {
    expect(crossedGate(g, v(0, 2, -1), v(0, 2, 1))).toBe(false);
  });
  it('does not count outside the opening', () => {
    expect(crossedGate(g, v(2, 2, 1), v(2, 2, -1))).toBe(false);
    expect(crossedGate(g, v(0, 3.5, 1), v(0, 3.5, -1))).toBe(false);
  });
  it('catches a fast segment that jumps over the plane in one step', () => {
    expect(crossedGate(g, v(0, 2, 0.2), v(0, 2, -0.2))).toBe(true);
  });
  it('handles a flat ring you climb through (rotation 90° about x)', () => {
    const ring = makeGate([0, 4, 0], [90, 0, 0], [3, 3]);
    expect(crossedGate(ring, v(0, 3.9, 0), v(0, 4.1, 0))).toBe(true);
    expect(crossedGate(ring, v(0, 4.1, 0), v(0, 3.9, 0))).toBe(false);
  });
});

function bodyAt(p: Vector3): RigidBody {
  const b = new RigidBody(FREESTYLE_5.mass, FREESTYLE_5.size);
  b.position.copy(p);
  return b;
}

describe('PracticeTracker', () => {
  const lesson = parseLesson(MINI) as Lesson;

  it('needs objectives in order and gives XP per gate', () => {
    const t = new PracticeTracker(lesson.practice.objectives);
    // Through gate 2 first: does not count
    let e = t.update(v(0, 2, -19), bodyAt(v(0, 2, -21)), 'airborne', PHYSICS_DT);
    expect(e.completed).toBeNull();
    e = t.update(v(0, 2, -9), bodyAt(v(0, 2, -11)), 'airborne', PHYSICS_DT);
    expect(e.completed).toBe('g1');
    expect(e.xp).toBe(XP_PER_GATE);
    e = t.update(v(0, 2, -19), bodyAt(v(0, 2, -21)), 'airborne', PHYSICS_DT);
    expect(e.completed).toBe('g2');
    expect(t.xp).toBe(2 * XP_PER_GATE);
    expect(t.status(0)).toBe('done');
    expect(t.status(2)).toBe('next');
  });

  it('landing needs a takeoff first, the pad, upright, slow, held for 0.6 s', () => {
    const t = new PracticeTracker([{ kind: 'land', id: 'pad', position: [0, 0, 0], radius: 1 }]);
    const onPad = bodyAt(v(0.5, 0.035, 0));
    // Sitting on the pad from the start does not count
    for (let i = 0; i < 240; i++) t.update(onPad.position, onPad, 'upright', PHYSICS_DT);
    expect(t.finished).toBe(false);
    // Fly, then land outside the pad: no
    t.update(onPad.position, onPad, 'airborne', PHYSICS_DT);
    const off = bodyAt(v(3, 0.035, 0));
    for (let i = 0; i < 240; i++) t.update(off.position, off, 'upright', PHYSICS_DT);
    expect(t.finished).toBe(false);
    // Land on the pad: done after LAND_HOLD_S
    let steps = 0;
    while (!t.finished && steps < 1000) {
      t.update(onPad.position, onPad, 'upright', PHYSICS_DT);
      steps++;
    }
    expect(steps * PHYSICS_DT).toBeCloseTo(LAND_HOLD_S, 1);
  });

  it('does not count a landing that is still sliding', () => {
    const t = new PracticeTracker([{ kind: 'land', id: 'pad', position: [0, 0, 0], radius: 1 }]);
    const b = bodyAt(v(0, 0.035, 0));
    t.update(b.position, b, 'airborne', PHYSICS_DT);
    b.velocity.set(1, 0, 0);
    for (let i = 0; i < 480; i++) t.update(b.position, b, 'upright', PHYSICS_DT);
    expect(t.finished).toBe(false);
  });
});

describe('LessonRunner', () => {
  it('walks lines, then steps, then the practice, then completes', () => {
    const r = new LessonRunner(parseLesson(MINI));
    expect(r.line.text).toBe('Hello.');
    expect(r.advance()).toBe('line');
    expect(r.advance()).toBe('step');
    expect(r.stepIndex).toBe(1);
    expect(r.advance()).toBe('practice');
    expect(r.phase).toBe('practice');
    expect(r.advance()).toBe('none');

    r.update(v(0, 2, -9), bodyAt(v(0, 2, -11)), 'airborne', PHYSICS_DT);
    r.update(v(0, 2, -19), bodyAt(v(0, 2, -21)), 'airborne', PHYSICS_DT);
    const pad = bodyAt(v(0, 0.035, -25));
    for (let i = 0; i < 200 && r.phase === 'practice'; i++)
      r.update(pad.position, pad, 'upright', PHYSICS_DT);
    expect(r.phase).toBe('complete');
    expect(r.result).toEqual({
      flightXp: 2 * XP_PER_GATE,
      bonusXp: LESSON_BONUS_XP,
      totalXp: 2 * XP_PER_GATE + LESSON_BONUS_XP,
    });
  });

  it('restart goes back to the first line and clears progress', () => {
    const r = new LessonRunner(parseLesson(MINI));
    r.startPractice();
    r.update(v(0, 2, -9), bodyAt(v(0, 2, -11)), 'airborne', PHYSICS_DT);
    r.restart();
    expect(r.phase).toBe('briefing');
    expect(r.stepIndex).toBe(0);
    expect(r.practice.index).toBe(0);
    expect(r.result.totalXp).toBe(0);
  });
});

describe('lesson 1 with real physics', () => {
  it('a scripted pilot climbs through the ring and lands on the pad', () => {
    const lesson = parseLesson(firstTakeoff);
    const r = new LessonRunner(lesson);
    r.startPractice();
    const d = new Drone(FREESTYLE_5);
    d.body.position.set(...lesson.spawn.position).setY(FREESTYLE_5.size.y / 2);
    d.armed = true;
    const prev = new Vector3();
    const sticks = { throttle: 0, roll: 0, pitch: 0, yaw: 0 };
    let climbed = false;
    for (let i = 0; i < 240 * 20 && r.phase === 'practice'; i++) {
      const y = d.body.position.y;
      if (y > 5.5) climbed = true;
      // Climb past the ring, sink slowly just under hover, cut the throttle right above the pad
      sticks.throttle = !climbed ? 0.55 : y < 0.4 ? 0.1 : d.body.velocity.y < -1 ? 0.42 : 0.36;
      prev.copy(d.body.position);
      d.step(sticks, PHYSICS_DT);
      r.update(prev, d.body, d.ground.state, PHYSICS_DT);
    }
    expect(r.practice.status(0)).toBe('done');
    expect(r.phase).toBe('complete');
  });
});
