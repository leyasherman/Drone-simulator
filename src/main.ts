import * as THREE from 'three';
import { toggleArm } from './input/arming';
import { InputManager } from './input/input';
import { KEYBOARD_GENTLE, KEYBOARD_NORMAL } from './input/keyboard';
import { createScene } from './render/scene';
import { DebugPanel } from './ui/debug-panel';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Canvas #scene not found');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const { scene, camera, cube } = createScene(window.innerWidth / window.innerHeight);

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Input test bench (stage 3): channel bars, arming, source switching
const input = new InputManager();
input.keyboard.attach(window);
const panel = new DebugPanel(document.body);
let armed = false;

// Debug-only toggles: G keyboard feel, T gamepad throttle mode
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyG') {
    input.keyboard.feel = input.keyboard.feel === KEYBOARD_GENTLE ? KEYBOARD_NORMAL : KEYBOARD_GENTLE;
  }
  if (e.code === 'KeyT') {
    const o = input.gamepad.options;
    o.throttleMode = o.throttleMode === 'centerZero' ? 'fullRange' : 'centerZero';
  }
});

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.update(dt);

  const a = input.actions;
  if (a.armToggle) {
    const result = toggleArm(armed, input.sticks.throttle);
    if (result === 'blocked-throttle') panel.flash('Arming blocked: lower the throttle first', now);
    else armed = result === 'armed';
  }
  if (a.respawn) panel.flash('Respawn', now, 800);
  if (a.camera) panel.flash('Camera', now, 800);
  if (a.pause) panel.flash('Pause', now, 800);

  // Cube mirrors the sticks so the axes are easy to read
  const s = input.sticks;
  cube.rotation.set(-s.pitch * 0.6, cube.rotation.y - s.yaw * dt * 3, -s.roll * 0.6);
  cube.position.y = 0.5 + s.throttle * 2;

  const gamepadLine = input.gamepad.connected
    ? `gamepad throttle: ${input.gamepad.options.throttleMode} (T)`
    : 'gamepad: press a button to connect';
  panel.render(
    {
      sticks: s,
      source: `Input: ${input.active.label}`,
      armed,
      lines: [
        `keyboard feel: ${input.keyboard.feel === KEYBOARD_GENTLE ? 'gentle' : 'normal'} (G)`,
        gamepadLine,
        'W/S throttle · A/D yaw · arrows pitch/roll',
        'Space arm · R respawn · C camera · Esc pause',
        'Pad: A arm · B respawn · Y camera · Start pause',
      ],
    },
    now,
  );
  renderer.render(scene, camera);
});
