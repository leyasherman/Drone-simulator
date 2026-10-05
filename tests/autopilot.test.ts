import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/game/autopilot';
import { parseLesson } from '../src/game/lesson-schema';
import { LessonRunner } from '../src/game/lesson-runner';
import { PHYSICS_DT } from '../src/sim/constants';
import type { Sticks } from '../src/sim/controller';
import { Drone } from '../src/sim/drone';
import { FREESTYLE_5 } from '../src/sim/profiles';
import { collidersFrom, testFieldLayout } from '../src/world/test-field-layout';

const files = import.meta.glob<unknown>('/content/lessons/*.json', { eager: true, import: 'default' });
const lessons = Object.values(files).map(parseLesson);
const obstacles = collidersFrom(testFieldLayout());

describe('every lesson can be completed', () => {
  it.each(lessons.map((l) => [l.id, l] as const))(
    '%s: the autopilot finishes the practice',
    (_id, lesson) => {
      const runner = new LessonRunner(lesson);
      runner.startPractice();
      const d = new Drone(FREESTYLE_5);
      d.obstacles = obstacles;
      const [x, , z] = lesson.spawn.position;
      d.body.position.set(x, FREESTYLE_5.size.y / 2, z);
      d.armed = true;
      const pilot = new Autopilot(lesson.practice.objectives);
      const sticks: Sticks = { throttle: 0, roll: 0, pitch: 0, yaw: 0 };
      const prev = new Vector3();
      let crashes = 0;
      let t = 0;
      for (; t < 90 && runner.phase === 'practice'; t += PHYSICS_DT) {
        pilot.fly(d, PHYSICS_DT, sticks);
        prev.copy(d.body.position);
        d.step(sticks, PHYSICS_DT);
        if (d.contact.impactSpeed > 7) crashes++;
        runner.update(prev, d.body, d.ground.state, PHYSICS_DT);
      }
      expect({ phase: runner.phase, done: runner.practice.index, crashes }).toEqual({
        phase: 'complete',
        done: lesson.practice.objectives.length,
        crashes: 0,
      });
      expect(t).toBeLessThan(60);
    },
  );
});
