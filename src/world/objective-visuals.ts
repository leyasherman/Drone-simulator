import * as THREE from 'three';
import type { Objective } from '../game/lesson-schema';
import type { ObjectiveStatus } from '../game/practice';

const DEG = Math.PI / 180;
const COLORS: Record<ObjectiveStatus, number> = {
  next: 0xd9f24a, // lime: fly here
  done: 0x4cc483, // green: passed
  waiting: 0xffffff,
};
const BAR = 0.12; // frame thickness, m

interface Visual {
  root: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  fill: THREE.MeshBasicMaterial;
}

/** Visual-only markers for lesson objectives (no collision): gate frames and landing rings. */
export class ObjectiveVisuals {
  readonly root = new THREE.Group();
  private visuals: Visual[] = [];
  private time = 0;

  set(objectives: readonly Objective[]): void {
    this.clear();
    for (const o of objectives) {
      const v = o.kind === 'gate' ? gateVisual(o.size) : padVisual(o.radius);
      v.root.position.set(...o.position);
      if (o.kind === 'gate')
        v.root.rotation.set(o.rotation[0] * DEG, o.rotation[1] * DEG, o.rotation[2] * DEG);
      this.root.add(v.root);
      this.visuals.push(v);
    }
  }

  clear(): void {
    for (const v of this.visuals) {
      this.root.remove(v.root);
      v.root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const m of v.materials) m.dispose();
      v.fill.dispose();
    }
    this.visuals = [];
  }

  /** Colours each objective by status; the next one pulses. */
  update(status: (i: number) => ObjectiveStatus, dt: number): void {
    this.time += dt;
    const pulse = 0.35 + 0.25 * Math.sin(this.time * 5);
    this.visuals.forEach((v, i) => {
      const s = status(i);
      for (const m of v.materials) {
        m.color.setHex(COLORS[s]);
        m.emissive.setHex(COLORS[s]);
        m.emissiveIntensity = s === 'next' ? pulse : 0.15;
        m.opacity = s === 'done' ? 0.45 : 1;
      }
      v.fill.color.setHex(COLORS[s]);
      v.fill.opacity = s === 'next' ? 0.12 : 0.04;
    });
  }
}

function frameMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: true });
}

function gateVisual(size: readonly [number, number]): Visual {
  const [w, h] = size;
  const root = new THREE.Group();
  const mat = frameMaterial();
  const bar = (sx: number, sy: number, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, BAR), mat);
    m.position.set(x, y, 0);
    m.castShadow = true;
    root.add(m);
  };
  bar(w + 2 * BAR, BAR, 0, h / 2 + BAR / 2);
  bar(w + 2 * BAR, BAR, 0, -h / 2 - BAR / 2);
  bar(BAR, h, -w / 2 - BAR / 2, 0);
  bar(BAR, h, w / 2 + BAR / 2, 0);
  const fill = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), fill));
  return { root, materials: [mat], fill };
}

function padVisual(radius: number): Visual {
  const root = new THREE.Group();
  const mat = frameMaterial();
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.12, radius, 48), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  root.add(ring);
  const fill = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.12, 48), fill);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.01;
  root.add(disc);
  return { root, materials: [mat], fill };
}
