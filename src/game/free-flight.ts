import { Quaternion, Vector3 } from 'three';
import { toggleArm } from '../input/arming';
import type { InputManager } from '../input/input';
import { FixedStepClock } from '../sim/clock';
import type { BoxCollider } from '../sim/collision';
import { PHYSICS_DT } from '../sim/constants';
import { Drone } from '../sim/drone';
import type { DroneProfile } from '../sim/profiles';
import type { Recorder } from '../sim/recording';

/** Impact speeds into a surface, m/s. Values from the research prototype; tune by feel. */
export const IMPACT_LIGHT = 0.5;
export const IMPACT_HARD = 3;
export const CRASH_SPEED = 7;
/** A firm landing on the belly is not a crash below this. */
export const CRASH_SPEED_BELLY = 11;
/** Upside down at rest: show the respawn prompt after this, respawn by itself after that. */
export const TURTLE_PROMPT_S = 3;
export const TURTLE_AUTO_RESPAWN_S = 20;

/** Things that happened during a frame, for the UI, camera and sound to react to. */
export interface FrameEvents {
  armBlocked: boolean;
  cameraToggle: boolean;
  pause: boolean;
  respawned: boolean;
  /** Strongest impact this frame, m/s (0 if none above IMPACT_LIGHT). */
  impact: number;
  crashed: boolean;
}

/**
 * Free flight: one drone, input, the fixed-step clock and the world's obstacles.
 * Knows nothing about rendering; main.ts draws from `drone.body` and `alpha`.
 */
export class FreeFlight {
  readonly drone: Drone;
  readonly clock = new FixedStepClock();
  readonly spawnPosition = new Vector3();
  readonly spawnOrientation = new Quaternion();
  readonly events: FrameEvents = {
    armBlocked: false,
    cameraToggle: false,
    pause: false,
    respawned: false,
    impact: 0,
    crashed: false,
  };
  /** Blend factor between the last two physics states, for rendering. */
  alpha = 0;
  /** Seconds since the last respawn. */
  flightTime = 0;
  /** When set, every physics step is recorded into it. */
  recorder: Recorder | null = null;

  constructor(
    profile: DroneProfile,
    readonly input: InputManager,
    obstacles: readonly BoxCollider[] = [],
  ) {
    this.drone = new Drone(profile);
    this.drone.obstacles = obstacles;
    // Centre of a 5 m grid tile, so no grid line runs right under the camera
    this.spawnPosition.set(2.5, profile.size.y / 2, 2.5);
    this.respawn();
  }

  /** True while the quad lies upside down long enough that the player should respawn. */
  get respawnPrompt(): boolean {
    return this.drone.ground.turtledTime >= TURTLE_PROMPT_S;
  }

  respawn(): void {
    const d = this.drone;
    d.body.position.copy(this.spawnPosition);
    d.body.orientation.copy(this.spawnOrientation);
    d.reset();
    d.armed = false;
    this.input.keyboard.setThrottle(0);
    this.flightTime = 0;
  }

  /** Advances by one rendered frame of `frameSeconds`. */
  frame(frameSeconds: number): FrameEvents {
    const e = this.events;
    e.armBlocked = e.cameraToggle = e.pause = e.respawned = e.crashed = false;
    e.impact = 0;
    const tick = this.clock.advance(frameSeconds);
    for (let i = 0; i < tick.steps; i++) this.step(e);
    this.alpha = tick.alpha;
    return e;
  }

  private step(e: FrameEvents): void {
    const input = this.input;
    const d = this.drone;
    input.update(PHYSICS_DT);
    const a = input.actions;
    if (a.armToggle) {
      const r = toggleArm(d.armed, input.sticks.throttle);
      if (r === 'blocked-throttle') e.armBlocked = true;
      else d.armed = r === 'armed';
    }
    if (a.respawn) {
      this.respawn();
      e.respawned = true;
    }
    e.cameraToggle ||= a.camera;
    e.pause ||= a.pause;

    d.step(input.sticks, PHYSICS_DT);
    this.flightTime += PHYSICS_DT;
    this.recorder?.record(d.body, input.sticks, d.quad.motors);

    const c = d.contact;
    if (c.impactSpeed > IMPACT_LIGHT) e.impact = Math.max(e.impact, c.impactSpeed);
    if (c.impactSpeed > (c.impactBelly ? CRASH_SPEED_BELLY : CRASH_SPEED)) e.crashed = true;

    if (d.ground.turtledTime >= TURTLE_AUTO_RESPAWN_S) {
      this.respawn();
      e.respawned = true;
    }
  }

  /** km/h */
  get speedKmh(): number {
    return this.drone.body.velocity.length() * 3.6;
  }

  /** Height of the body's underside above y = 0, m. */
  get altitude(): number {
    return Math.max(0, this.drone.body.position.y - this.drone.profile.size.y / 2);
  }
}
