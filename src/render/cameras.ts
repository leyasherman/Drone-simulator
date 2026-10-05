import * as THREE from 'three';
import { LAYER_DRONE_BODY, LAYER_PROPS } from '../world/drone-model';

export type CameraMode = 'fpv' | 'chase';

export interface FpvSettings {
  /** Vertical field of view, degrees. */
  fov: number;
  /** Camera tilt up from the frame, degrees. */
  uptilt: number;
}

export const DEFAULT_FPV: FpvSettings = { fov: 100, uptilt: 30 };

/** Camera position on the frame, body axes, m. */
const FPV_OFFSET = new THREE.Vector3(0, 0.055, -0.035);
const CHASE_BACK = 1.6;
const CHASE_UP = 0.6;

const tmpOffset = new THREE.Vector3();
const tmpTilt = new THREE.Quaternion();
const tmpForward = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);

/**
 * One perspective camera that can sit in the drone (FPV) or follow it (chase).
 * FPV hides the drone body layer; props stay visible, as on a real quad.
 */
export class FlightCamera {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'fpv';
  fpv: FpvSettings = { ...DEFAULT_FPV };
  private readonly chasePos = new THREE.Vector3();
  private chaseReady = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.fpv.fov, aspect, 0.01, 1500);
    this.applyMode();
  }

  toggle(): void {
    this.mode = this.mode === 'fpv' ? 'chase' : 'fpv';
    this.chaseReady = false;
    this.applyMode();
  }

  setMode(mode: CameraMode): void {
    if (mode !== this.mode) this.toggle();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Re-applies FOV and layers after a settings change. */
  refresh(): void {
    this.applyMode();
  }

  private applyMode(): void {
    const c = this.camera;
    c.layers.set(0);
    c.layers.enable(LAYER_PROPS);
    if (this.mode === 'chase') c.layers.enable(LAYER_DRONE_BODY);
    c.fov = this.mode === 'fpv' ? this.fpv.fov : 70;
    c.near = this.mode === 'fpv' ? 0.01 : 0.05;
    c.updateProjectionMatrix();
  }

  /** Places the camera for a drone pose (already interpolated for this frame). */
  update(position: THREE.Vector3, orientation: THREE.Quaternion, dt: number): void {
    const c = this.camera;
    if (this.mode === 'fpv') {
      c.position.copy(position).add(tmpOffset.copy(FPV_OFFSET).applyQuaternion(orientation));
      tmpTilt.setFromAxisAngle(X_AXIS, (this.fpv.uptilt * Math.PI) / 180);
      c.quaternion.copy(orientation).multiply(tmpTilt);
      return;
    }
    // Chase: behind the drone along its heading (yaw only), smoothed
    tmpForward.set(0, 0, -1).applyQuaternion(orientation);
    tmpForward.y = 0;
    if (tmpForward.lengthSq() < 1e-4) tmpForward.set(0, 0, -1);
    tmpForward.normalize();
    tmpTarget.copy(position).addScaledVector(tmpForward, -CHASE_BACK);
    tmpTarget.y += CHASE_UP;
    if (!this.chaseReady) {
      this.chasePos.copy(tmpTarget);
      this.chaseReady = true;
    } else {
      this.chasePos.lerp(tmpTarget, 1 - Math.exp(-dt * 6));
    }
    c.position.copy(this.chasePos);
    c.lookAt(position);
  }
}
