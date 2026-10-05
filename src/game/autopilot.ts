import { Vector3 } from 'three';
import type { Sticks } from '../sim/controller';
import type { Drone } from '../sim/drone';
import { makeGate } from '../sim/gates';
import type { Objective } from './lesson-schema';

/**
 * A simple pilot that flies a lesson's objectives using only the sticks (rate mode, like a player).
 * Used to make demo flights and to prove in tests that every lesson can be completed.
 * Heading is held at the spawn's (facing -z); it tilts to move, and holds height with the throttle.
 */

const G = 9.81;
const HOVER_STICK = 0.388;
const MAX_TILT = 0.45; // rad
const REACH = 1.0; // m: a waypoint counts as reached this close
const LAND_HOVER = 1.5; // m above a pad before descending

interface Waypoint {
  p: Vector3;
  land: boolean;
}

export interface AutopilotOptions {
  /** Cruise speed, m/s. */
  speed: number;
  /** Seconds to sit on the pad before taking off (demo pre-roll). */
  wait: number;
}

const tmpUp = new Vector3();
const tmpFwd = new Vector3();
const tmpTo = new Vector3();

export class Autopilot {
  private readonly route: Waypoint[] = [];
  private index = 0;
  private time = 0;
  private landed = false;
  readonly opts: AutopilotOptions;

  constructor(objectives: readonly Objective[], opts: Partial<AutopilotOptions> = {}) {
    this.opts = { speed: 4, wait: 0, ...opts };
    for (const o of objectives) {
      if (o.kind === 'gate') {
        // Line up 4 m in front of the opening, then fly 3 m through it
        const g = makeGate(o.position, o.rotation, o.size);
        this.route.push({ p: g.center.clone().addScaledVector(g.normal, 4), land: false });
        this.route.push({ p: g.center.clone().addScaledVector(g.normal, -3), land: false });
      } else {
        this.route.push({
          p: new Vector3(o.position[0], o.position[1] + LAND_HOVER, o.position[2]),
          land: false,
        });
        this.route.push({ p: new Vector3(...o.position), land: true });
      }
    }
  }

  get done(): boolean {
    return this.index >= this.route.length;
  }

  /** Writes sticks for this physics step. */
  fly(d: Drone, dt: number, s: Sticks): void {
    this.time += dt;
    s.roll = s.pitch = s.yaw = 0;
    const b = d.body;
    if (this.time < this.opts.wait || this.route.length === 0) {
      s.throttle = 0;
      return;
    }
    // After the last waypoint, keep holding it (hover after a gate, stay down after a landing)
    const wp = this.route[Math.min(this.index, this.route.length - 1)]!;
    tmpTo.copy(wp.p).sub(b.position);
    const horiz = Math.hypot(tmpTo.x, tmpTo.z);

    // Advance: through-points when close; landing points once settled on the pad
    if (!wp.land && !this.done && tmpTo.length() < REACH) this.index++;
    if (wp.land && d.ground.state === 'upright' && horiz < 0.6) {
      this.landed = true;
    } else if (wp.land) {
      this.landed = false;
    }

    // Horizontal: desired velocity toward the waypoint, slowing as it gets close
    const vMax = wp.land ? 1.5 : this.opts.speed;
    const want = Math.min(vMax, horiz * 0.8);
    const vx = horiz > 1e-3 ? (tmpTo.x / horiz) * want : 0;
    const vz = horiz > 1e-3 ? (tmpTo.z / horiz) * want : 0;
    const ax = (vx - b.velocity.x) * 1.6;
    const az = (vz - b.velocity.z) * 1.6;
    // Desired thrust direction (body up) for that acceleration, tilt limited
    let ux = ax / G;
    let uz = az / G;
    const tilt = Math.hypot(ux, uz);
    if (tilt > Math.tan(MAX_TILT)) {
      ux *= Math.tan(MAX_TILT) / tilt;
      uz *= Math.tan(MAX_TILT) / tilt;
    }
    const n = Math.hypot(ux, 1, uz);
    tmpUp.set(0, 1, 0).applyQuaternion(b.orientation);
    // Roll right tips the up vector toward +x; pitch up tips it toward +z (heading -z held)
    s.roll = clamp(3 * (ux / n - tmpUp.x), -0.6, 0.6);
    s.pitch = clamp(3 * (uz / n - tmpUp.z), -0.6, 0.6);

    // Heading hold: 0 = facing -z; positive yaw stick turns right
    tmpFwd.set(0, 0, -1).applyQuaternion(b.orientation);
    const heading = Math.atan2(-tmpFwd.x, -tmpFwd.z);
    s.yaw = clamp(2 * heading, -0.5, 0.5);

    // Vertical: climb or sink toward the waypoint height; cut the throttle right above a landing pad
    const groundY = d.profile.size.y / 2;
    if (wp.land && horiz < 0.6 && b.position.y - groundY < 0.3) {
      s.throttle = 0.08;
      return;
    }
    const targetY = wp.land && horiz < 0.6 ? groundY : Math.max(wp.p.y, groundY + 0.5);
    const wantVy = clamp((targetY - b.position.y) * 1.2, -1.2, 1.5);
    const tiltComp = Math.sqrt(1 / Math.max(0.5, tmpUp.y));
    s.throttle = clamp(HOVER_STICK * tiltComp + (wantVy - b.velocity.y) * 0.12, 0.15, 0.75);
  }

  /** True once the quad sits on the final landing pad (if the route ends with one). */
  get onPad(): boolean {
    return this.landed;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
