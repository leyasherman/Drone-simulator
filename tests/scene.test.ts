import { describe, expect, it } from 'vitest';
import { createScene } from '../src/render/scene';

describe('createScene', () => {
  it('builds a scene with the placeholder cube resting on the ground', () => {
    const { scene, camera, cube } = createScene(16 / 9);
    expect(scene.children).toContain(cube);
    expect(cube.position.y).toBe(0.5);
    expect(camera.aspect).toBeCloseTo(16 / 9);
  });
});
