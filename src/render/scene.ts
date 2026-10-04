import * as THREE from 'three';

export interface SceneParts {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cube: THREE.Mesh;
}

/** Builds the placeholder scene: daylight sky, a ground grid and a spinning cube. */
export function createScene(aspect: number): SceneParts {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc4e8);

  const camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 500);
  camera.position.set(3, 2.5, 4);
  camera.lookAt(0, 0.5, 0);

  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5b6b85, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(5, 10, 3);
  scene.add(sun);

  const grid = new THREE.GridHelper(40, 40, 0x3d4f6e, 0x7d8fac);
  scene.add(grid);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 }),
  );
  cube.position.y = 0.5;
  scene.add(cube);

  return { scene, camera, cube };
}
