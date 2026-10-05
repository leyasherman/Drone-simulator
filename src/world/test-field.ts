import * as THREE from 'three';
import { LANE, type BoxLook, type BoxSpec } from './test-field-layout';

/** Palette for the daylight look: cool blue-grey ground, pale sky, orange accents. */
const PALETTE = {
  skyTop: 0x2f86d6,
  skyHorizon: 0xcfe3f2,
  fog: 0xc7dcec,
  ground: 0x8794b3,
  gridMinor: 0x76839f,
  gridMajor: 0x5f6d8a,
  building: 0xb7c9da,
  buildingDark: 0x3f5675,
  accent: 0xff7a1a,
  cloud: 0xffffff,
};

export interface TestField {
  scene: THREE.Scene;
  /** Keeps the sun's shadow box centred on the drone. Call each frame. */
  follow(target: THREE.Vector3): void;
  /** Shadows are the most expensive effect; off on Low quality. */
  setShadows(on: boolean): void;
}

/** Ground texture: 1 m minor lines, 5 m major lines. One tile covers 5 m. */
function gridTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  g.fillStyle = hex(PALETTE.ground);
  g.fillRect(0, 0, size, size);
  g.strokeStyle = hex(PALETTE.gridMinor);
  g.lineWidth = 1.5;
  for (let i = 1; i < 5; i++) {
    const p = (i * size) / 5;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, size);
    g.moveTo(0, p);
    g.lineTo(size, p);
    g.stroke();
  }
  g.strokeStyle = hex(PALETTE.gridMajor);
  g.lineWidth = 3;
  g.strokeRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Big inverted sphere with a vertical gradient, so the sky tilts correctly when the drone rolls. */
function sky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1200, 32, 16);
  const top = new THREE.Color(PALETTE.skyTop);
  const horizon = new THREE.Color(PALETTE.skyHorizon);
  const colors: number[] = [];
  const pos = geo.attributes.position!;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = Math.max(0, pos.getY(i) / 1200);
    c.copy(horizon).lerp(top, Math.pow(h, 0.6));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  mesh.renderOrder = -1;
  return mesh;
}

/** A cloud: a few flattened low-poly puffs. Seeded so the field looks the same every time. */
function cloud(rand: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.cloud, emissive: 0xc9d6e4, flatShading: true });
  const puffs = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < puffs; i++) {
    const r = 6 + rand() * 7;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
    m.position.set((i - puffs / 2) * 7 + rand() * 4, rand() * 3, rand() * 8 - 4);
    m.scale.y = 0.55;
    group.add(m);
  }
  return group;
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Flat markings lying on the ground (lane, kerbs). Pulled toward the camera in the depth test, so they do not
 * flicker against the ground plane at a distance (z-fighting). Higher level = drawn over lower ones.
 */
const DECAL = (level: number) => ({
  polygonOffset: true,
  polygonOffsetFactor: -level,
  polygonOffsetUnits: -level,
});

/** Builds the scene for a layout from test-field-layout.ts. */
export function createTestField(layout: readonly BoxSpec[]): TestField {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.fog, 60, 480);
  scene.add(sky());

  // Light: soft sky fill plus a sun that casts shadows
  scene.add(new THREE.HemisphereLight(0xe4f1ff, 0x6a7896, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(30, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -30;
  sc.right = sc.top = 30;
  sc.near = 1;
  sc.far = 200;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // Ground
  const tex = gridTexture();
  const groundSize = 2000;
  tex.repeat.set(groundSize / 5, groundSize / 5);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Takeoff pad: dark square with an orange edge
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.004, 2),
    new THREE.MeshStandardMaterial({ color: PALETTE.buildingDark }),
  );
  pad.position.set(2.5, 0, 2.5); // top 2 mm above ground
  pad.receiveShadow = true;
  const padEdge = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.002, 2.2),
    new THREE.MeshStandardMaterial({ color: PALETTE.accent }),
  );
  padEdge.position.set(2.5, 0, 2.5); // orange rim, 1 mm above ground
  scene.add(pad, padEdge);

  // Lesson lane: a dark strip with striped kerbs, from behind the pad forward along -z
  const laneLen = LANE.zStart - LANE.zEnd;
  const laneZ = (LANE.zStart + LANE.zEnd) / 2;
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(LANE.halfWidth * 2, laneLen),
    new THREE.MeshStandardMaterial({ color: 0x46557a, roughness: 0.95, ...DECAL(1) }),
  );
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(LANE.x, 0.0005, laneZ);
  lane.receiveShadow = true;
  scene.add(lane);
  const kerbMat = [
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, ...DECAL(2) }),
    new THREE.MeshStandardMaterial({ color: PALETTE.accent, ...DECAL(2) }),
  ];
  const kerbGeo = new THREE.PlaneGeometry(0.35, 1.5);
  for (const side of [-1, 1]) {
    for (let i = 0; i < laneLen / 1.5; i++) {
      const k = new THREE.Mesh(kerbGeo, kerbMat[i % 2]!);
      k.rotation.x = -Math.PI / 2;
      k.position.set(LANE.x + side * (LANE.halfWidth - 0.175), 0.001, LANE.zStart - 0.75 - i * 1.5);
      scene.add(k);
    }
  }

  // World boxes (shared with physics)
  const looks: Record<BoxLook, THREE.Material> = {
    dark: new THREE.MeshStandardMaterial({ color: PALETTE.buildingDark, roughness: 0.8 }),
    pale: new THREE.MeshStandardMaterial({ color: PALETTE.building, roughness: 0.9 }),
    accent: new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.6 }),
    frame: new THREE.MeshStandardMaterial({ color: 0xe9eef5, roughness: 0.6 }),
  };
  for (const b of layout) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.size.x, b.size.y, b.size.z), looks[b.look]);
    mesh.position.copy(b.center);
    mesh.rotation.y = b.yaw;
    // Far buildings are too big for the shadow box; skip them
    mesh.castShadow = mesh.receiveShadow = b.center.length() < 150;
    scene.add(mesh);
  }

  const rand = seeded(11);
  for (let i = 0; i < 12; i++) {
    const c = cloud(rand);
    const a = rand() * Math.PI * 2;
    const r = 80 + rand() * 300;
    c.position.set(Math.cos(a) * r, 70 + rand() * 60, Math.sin(a) * r);
    c.rotation.y = rand() * Math.PI;
    scene.add(c);
  }

  return {
    scene,
    setShadows(on) {
      sun.castShadow = on;
    },
    follow(target) {
      sun.target.position.copy(target);
      sun.position.set(target.x + 30, target.y + 60, target.z + 20);
    },
  };
}
