import { Vector3 } from 'three';
import type { RigidBody } from './body';
import type { ContactReport } from './collision';

/** How the quad sits when it has come to rest on something. */
export type GroundState = 'airborne' | 'upright' | 'tipped' | 'turtled';

/** Resting means slower than this... */
const REST_SPEED = 1.2; // m/s
const REST_SPIN = 2; // rad/s
/** ...for this long. */
const REST_DWELL = 0.12; // s
/** Body up · world up above this is upright, below -this is upside down. */
const UPRIGHT_DOT = 0.7;

const up = new Vector3();

/** Tracks whether the quad is resting, and which way up. */
export class GroundTracker {
  state: GroundState = 'airborne';
  /** Seconds spent turtled (upside down at rest). */
  turtledTime = 0;
  private restTime = 0;

  reset(): void {
    this.state = 'airborne';
    this.turtledTime = 0;
    this.restTime = 0;
  }

  update(body: RigidBody, contact: ContactReport, dt: number): GroundState {
    const resting =
      contact.touching && body.velocity.length() < REST_SPEED && body.angularVelocity.length() < REST_SPIN;
    this.restTime = resting ? this.restTime + dt : 0;

    if (this.restTime < REST_DWELL) {
      this.state = 'airborne';
    } else {
      const dot = up.set(0, 1, 0).applyQuaternion(body.orientation).y;
      this.state = dot > UPRIGHT_DOT ? 'upright' : dot < -UPRIGHT_DOT ? 'turtled' : 'tipped';
    }
    this.turtledTime = this.state === 'turtled' ? this.turtledTime + dt : 0;
    return this.state;
  }
}
