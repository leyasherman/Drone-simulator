import * as THREE from 'three';

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

export function createTestField(): TestField {
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

  // Reference blocks at mid distance and a ring of pale buildings on the horizon
  const rand = seeded(7);
  const boxMat = new THREE.MeshStandardMaterial({ color: PALETTE.buildingDark, roughness: 0.8 });
  const paleMat = new THREE.MeshStandardMaterial({ color: PALETTE.building, roughness: 0.9 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rand() * 0.2;
    const r = 35 + rand() * 30;
    const w = 4 + rand() * 6;
    const h = 1.5 + rand() * 4;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3 + rand() * 6), boxMat);
    box.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    box.rotation.y = rand() * Math.PI;
    box.castShadow = box.receiveShadow = true;
    scene.add(box);
  }
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + rand() * 0.1;
    const r = 260 + rand() * 120;
    const w = 15 + rand() * 30;
    const h = 12 + rand() * 35;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, 15 + rand() * 25), paleMat);
    tower.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    tower.rotation.y = rand() * Math.PI;
    scene.add(tower);
  }

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
    follow(target) {
      sun.target.position.copy(target);
      sun.position.set(target.x + 30, target.y + 60, target.z + 20);
    },
  };
}
