import { Vector3 } from 'three';
import type { RigidBody } from '../sim/body';
import { crossedGate, makeGate, type Gate } from '../sim/gates';
import type { GroundState } from '../sim/ground-state';
import type { Objective } from './lesson-schema';

/** Landing counts after being airborne, then resting upright inside the pad, slower than this, for this long. */
export const LAND_MAX_SPEED = 0.4; // m/s
export const LAND_HOLD_S = 0.6;
/** Flight XP per gate passed in a practice. */
export const XP_PER_GATE = 10;

export type ObjectiveStatus = 'done' | 'next' | 'waiting';

export interface PracticeEvents {
  /** Id of the objective completed this step, or null. */
  completed: string | null;
  xp: number;
  finished: boolean;
}

interface Tracked {
  def: Objective;
  gate: Gate | null;
  pad: Vector3 | null;
}

/**
 * Tracks a lesson practice: objectives must be done in order.
 * Call update() every physics step with the body's previous and current position.
 */
export class PracticeTracker {
  /** Index of the objective to do next; equals objectives.length when all are done. */
  index = 0;
  xp = 0;
  private readonly list: Tracked[];
  private wasAirborne = false;
  private landTime = 0;
  private readonly events: PracticeEvents = { completed: null, xp: 0, finished: false };

  constructor(objectives: readonly Objective[]) {
    this.list = objectives.map((def) => ({
      def,
      gate: def.kind === 'gate' ? makeGate(def.position, def.rotation, def.size) : null,
      pad: def.kind === 'land' ? new Vector3(...def.position) : null,
    }));
  }

  get finished(): boolean {
    return this.index >= this.list.length;
  }

  get current(): Objective | null {
    return this.list[this.index]?.def ?? null;
  }

  status(i: number): ObjectiveStatus {
    return i < this.index ? 'done' : i === this.index ? 'next' : 'waiting';
  }

  reset(): void {
    this.index = 0;
    this.xp = 0;
    this.wasAirborne = false;
    this.landTime = 0;
  }

  /** Call after a respawn: landing needs a fresh takeoff, done objectives stay done. */
  onRespawn(): void {
    this.wasAirborne = false;
    this.landTime = 0;
  }

  update(prev: Vector3, body: RigidBody, ground: GroundState, dt: number): PracticeEvents {
    const e = this.events;
    e.completed = null;
    e.xp = 0;
    e.finished = this.finished;
    const t = this.list[this.index];
    if (!t) return e;

    if (ground === 'airborne') this.wasAirborne = true;

    let done = false;
    if (t.gate) {
      done = crossedGate(t.gate, prev, body.position);
      if (done) e.xp = XP_PER_GATE;
    } else if (t.pad && t.def.kind === 'land') {
      const dx = body.position.x - t.pad.x;
      const dz = body.position.z - t.pad.z;
      const inside = dx * dx + dz * dz <= t.def.radius * t.def.radius;
      const settled = ground === 'upright' && body.velocity.length() < LAND_MAX_SPEED;
      this.landTime = this.wasAirborne && inside && settled ? this.landTime + dt : 0;
      done = this.landTime >= LAND_HOLD_S;
    }

    if (done) {
      e.completed = t.def.id;
      this.xp += e.xp;
      this.index++;
      // A gate is passed in the air, so a landing right after it counts; a landing needs a new takeoff
      this.wasAirborne = ground === 'airborne';
      this.landTime = 0;
      e.finished = this.finished;
    }
    return e;
  }
}
