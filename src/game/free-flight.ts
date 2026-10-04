import { Quaternion, Vector3 } from 'three';
import { toggleArm } from '../input/arming';
import type { InputManager } from '../input/input';
import { FixedStepClock } from '../sim/clock';
import { PHYSICS_DT } from '../sim/constants';
import { Drone } from '../sim/drone';
import { resolveFlatGround, type GroundContact } from '../sim/flat-ground';
import type { DroneProfile } from '../sim/profiles';

/** Things that happened during a frame, for the UI and camera to react to. */
export interface FrameEvents {
  armBlocked: boolean;
  cameraToggle: boolean;
  pause: boolean;
  respawned: boolean;
}

/**
 * Free flight: one drone, input, the fixed-step clock and the ground.
 * Knows nothing about rendering; main.ts draws from `drone.body` and `alpha`.
 */
export class FreeFlight {
  readonly drone: Drone;
  readonly clock = new FixedStepClock();
  readonly spawnPosition = new Vector3();
  readonly spawnOrientation = new Quaternion();
  readonly contact: GroundContact = { touching: false };
  readonly events: FrameEvents = { armBlocked: false, cameraToggle: false, pause: false, respawned: false };
  /** Blend factor between the last two physics states, for rendering. */
  alpha = 0;
  /** Seconds since the last respawn. */
  flightTime = 0;

  constructor(
    profile: DroneProfile,
    readonly input: InputManager,
  ) {
    this.drone = new Drone(profile);
    // Centre of a 5 m grid tile, so no grid line runs right under the camera
    this.spawnPosition.set(2.5, profile.size.y / 2, 2.5);
    this.respawn();
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
    e.armBlocked = e.cameraToggle = e.pause = e.respawned = false;
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
    resolveFlatGround(d.body, d.profile.size, PHYSICS_DT, this.contact);
    this.flightTime += PHYSICS_DT;
  }

  /** km/h */
  get speedKmh(): number {
    return this.drone.body.velocity.length() * 3.6;
  }

  /** Height of the body centre above the ground, m. */
  get altitude(): number {
    return Math.max(0, this.drone.body.position.y - this.drone.profile.size.y / 2);
  }
}
