import * as THREE from 'three';
import { MOTOR_SPIN, MOTOR_X, MOTOR_Z } from '../sim/mixer';
import type { DroneProfile } from '../sim/profiles';

/** Render layers: the body is hidden from the FPV camera (it sits inside it), props stay visible in both views. */
export const LAYER_DRONE_BODY = 1;
export const LAYER_PROPS = 2;

const COLORS = {
  frame: 0x2b3240,
  accent: 0xff7a1a,
  motor: 0x9aa3b2,
  prop: 0xf2f4f8,
  camera: 0x14171d,
};

/** Low-poly 5" freestyle quad, built from boxes and cylinders. Nose points to -z. */
export class DroneModel {
  readonly root = new THREE.Group();
  private readonly props: THREE.Object3D[] = [];
  private readonly propAngles = [0, 0, 0, 0];

  constructor(p: DroneProfile) {
    const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.1 });
    const frameMat = mat(COLORS.frame);
    const accentMat = mat(COLORS.accent);
    const motorMat = mat(COLORS.motor);
    const propMat = new THREE.MeshStandardMaterial({
      color: COLORS.prop,
      roughness: 0.4,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });

    const body = new THREE.Group();
    const add = (mesh: THREE.Mesh, parent: THREE.Object3D = body) => {
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Two crossing arms (X frame)
    const armLen = Math.hypot(p.armX, p.armZ) * 2 + 0.02;
    for (const sign of [1, -1]) {
      const arm = add(new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.006, armLen), frameMat));
      arm.rotation.y = (sign * Math.PI) / 4;
    }
    // Stack, battery on top, camera at the nose
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.026, 0.09), frameMat)).position.y = 0.016;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.075), accentMat)).position.set(0, 0.044, 0.01);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.02), mat(COLORS.camera))).position.set(
      0,
      0.03,
      -0.05,
    );
    // Antenna at the back
    const antenna = add(new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.07, 5), accentMat));
    antenna.position.set(0, 0.05, 0.055);
    antenna.rotation.x = -0.6;

    body.traverse((o) => o.layers.set(LAYER_DRONE_BODY));
    this.root.add(body);

    // Motors and props
    const blade = new THREE.BoxGeometry(p.propRadius * 2, 0.002, 0.012);
    for (let i = 0; i < 4; i++) {
      const x = MOTOR_X[i]! * p.armX;
      const z = MOTOR_Z[i]! * p.armZ;
      const motor = add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.018, 10), motorMat));
      motor.position.set(x, 0.012, z);
      motor.layers.set(LAYER_DRONE_BODY);

      const prop = new THREE.Group();
      prop.position.set(x, 0.024, z);
      for (let b = 0; b < 3; b++) {
        const m = new THREE.Mesh(blade, propMat);
        m.rotation.y = (b * Math.PI * 2) / 3;
        m.position.set(0, 0, 0);
        m.castShadow = true;
        prop.add(m);
      }
      prop.traverse((o) => o.layers.set(LAYER_PROPS));
      this.root.add(prop);
      this.props.push(prop);
    }
  }

  /** Spins props from motor outputs 0..1. Visual only, capped so blades stay readable. */
  update(motors: readonly number[], dt: number): void {
    for (let i = 0; i < 4; i++) {
      const speed = Math.min(40, 6 + motors[i]! * 60) * (motors[i]! > 0.005 ? 1 : 0);
      this.propAngles[i]! += speed * dt * MOTOR_SPIN[i]!;
      this.props[i]!.rotation.y = this.propAngles[i]!;
    }
  }
}
