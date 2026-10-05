// Scripted pilots that fly the lesson demo clips with the real physics.
// Run: npm run clips  (writes content/clips/<id>.json)
import { PHYSICS_DT } from '../src/sim/constants';
import type { Sticks } from '../src/sim/controller';
import { Drone } from '../src/sim/drone';
import { FREESTYLE_5 } from '../src/sim/profiles';
import { Recorder, clipToJson, type ClipJson } from '../src/sim/recording';
import { Autopilot } from '../src/game/autopilot';
import { parseLesson } from '../src/game/lesson-schema';
import { collidersFrom, testFieldLayout } from '../src/world/test-field-layout';

interface DemoPilot {
  id: string;
  seconds: number;
  spawn: readonly [number, number, number];
  /** Called every physics step: write the sticks for time t. */
  fly(t: number, d: Drone, s: Sticks): void;
  /** Stop early once this returns true (checked every step). */
  finished?(t: number, d: Drone): boolean;
}

const smooth = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

/** Lesson 1: idle on the pad, firm push, settle into a hover, climb a bit, come down and land. */
const takeoffHover: DemoPilot = {
  id: 'takeoff-hover',
  seconds: 13.5,
  spawn: [2.5, 0, 2.5],
  fly(t, d, s) {
    const y = d.body.position.y;
    const vy = d.body.velocity.y;
    // A simple height-hold pilot: aim for a target height, with a little damping
    let target: number;
    if (t < 1)
      target = -1; // sit on the pad, motors idling
    else if (t < 4.5) target = 2.5;
    else if (t < 7) target = 4.5;
    else target = 0;
    if (target < 0) {
      s.throttle = 0;
    } else if (t < 1.5) {
      s.throttle = smooth(0, 0.6, (t - 1) / 0.15); // the firm push
    } else if (target === 0 && y < 0.25) {
      s.throttle = 0.08; // right above the pad: cut it
    } else {
      // Climb or sink at a speed proportional to the height error (max 1.5 m/s up, 1 m/s down)
      const hover = 0.388;
      const wantVy = Math.min(1.5, Math.max(-1, (target - y) * 1.2));
      s.throttle = Math.min(0.7, Math.max(0.15, hover + (wantVy - vy) * 0.12));
    }
    s.roll = s.pitch = s.yaw = 0;
  },
};

/** Lessons 2+: the autopilot flies the practice itself, after a second on the pad. */
const lessonFiles = import.meta.glob<unknown>('/content/lessons/*.json', { eager: true, import: 'default' });
const autopilotDemos: DemoPilot[] = Object.values(lessonFiles)
  .map(parseLesson)
  .filter((l) => l.id !== takeoffHover.id && l.id !== 'first-takeoff')
  .map((l) => {
    const pilot = new Autopilot(l.practice.objectives, { wait: 1 });
    let doneAt = -1;
    return {
      id: l.id,
      seconds: 60,
      spawn: l.spawn.position,
      fly: (_t, d, s) => pilot.fly(d, PHYSICS_DT, s),
      finished(t, d) {
        const settled = pilot.onPad ? d.ground.state === 'upright' : pilot.done;
        if (settled && doneAt < 0) doneAt = t;
        return doneAt >= 0 && t - doneAt > 1.5;
      },
    };
  });

export const PILOTS: DemoPilot[] = [takeoffHover, ...autopilotDemos];

export function flyDemo(p: DemoPilot): ClipJson {
  const d = new Drone(FREESTYLE_5);
  d.obstacles = collidersFrom(testFieldLayout());
  d.body.position.set(p.spawn[0], FREESTYLE_5.size.y / 2, p.spawn[2]);
  d.armed = true;
  const rec = new Recorder(p.seconds + 1);
  const s: Sticks = { throttle: 0, roll: 0, pitch: 0, yaw: 0 };
  for (let i = 0; i < p.seconds / PHYSICS_DT; i++) {
    if (p.finished?.(i * PHYSICS_DT, d)) break;
    p.fly(i * PHYSICS_DT, d, s);
    d.step(s, PHYSICS_DT);
    rec.record(d.body, s, d.quad.motors);
  }
  return clipToJson(rec.toClip());
}
