import * as THREE from 'three';
import { FreeFlight } from './game/free-flight';
import { ARM_THROTTLE_LIMIT } from './input/arming';
import { InputManager } from './input/input';
import { KEYBOARD_GENTLE, KEYBOARD_NORMAL } from './input/keyboard';
import { FlightCamera } from './render/cameras';
import { FREESTYLE_5 } from './sim/profiles';
import { DebugPanel } from './ui/debug-panel';
import { Hud } from './ui/hud';
import { Prompts } from './ui/prompts';
import { DroneModel } from './world/drone-model';
import { createTestField } from './world/test-field';
import { collidersFrom, testFieldLayout } from './world/test-field-layout';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Canvas #scene not found');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const layout = testFieldLayout();
const field = createTestField(layout);
const view = new FlightCamera(window.innerWidth / window.innerHeight);
const model = new DroneModel(FREESTYLE_5);
// Debug: ?cam=chase starts in the chase view
if (new URLSearchParams(location.search).get('cam') === 'chase') view.toggle();
field.scene.add(model.root);

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  view.setAspect(window.innerWidth / window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

const input = new InputManager();
input.keyboard.attach(window);
const flight = new FreeFlight(FREESTYLE_5, input, collidersFrom(layout));
const hud = new Hud(document.body);
const prompts = new Prompts(document.body);
const panel = new DebugPanel(document.body);
// Dev only: lets browser scripts (scripts/smoke.mjs) read the sim state
if (import.meta.env.DEV) Object.assign(window, { __sim: { flight, input, view } });

// Developer keys: F3 debug panel, G keyboard feel, T gamepad throttle mode
window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    e.preventDefault();
    panel.visible = !panel.visible;
  }
  if (e.code === 'KeyG') {
    input.keyboard.feel = input.keyboard.feel === KEYBOARD_GENTLE ? KEYBOARD_NORMAL : KEYBOARD_GENTLE;
  }
  if (e.code === 'KeyT') {
    const o = input.gamepad.options;
    o.throttleMode = o.throttleMode === 'centerZero' ? 'fullRange' : 'centerZero';
  }
});

/** The persistent hint for the current situation, or '' for none. */
function currentHint(): string {
  const pad = input.active.kind === 'gamepad';
  if (flight.respawnPrompt) return `Press ${pad ? 'B' : 'R'} to respawn`;
  if (flight.drone.armed) return '';
  return input.sticks.throttle > ARM_THROTTLE_LIMIT
    ? `Lower the throttle (${pad ? 'left stick down' : 'S'}) to arm`
    : `Press ${pad ? 'A' : 'Space'} to arm, then raise the throttle (${pad ? 'left stick' : 'hold W'})`;
}

const renderPos = new THREE.Vector3();
const renderRot = new THREE.Quaternion();
let last = performance.now();
let fps = 60;

renderer.setAnimationLoop((now) => {
  const frameSeconds = (now - last) / 1000;
  last = now;
  fps += (1 / Math.max(frameSeconds, 1e-3) - fps) * 0.05;

  const e = flight.frame(frameSeconds);
  if (e.armBlocked) prompts.flash('Lower the throttle first', now, 1500);
  if (e.cameraToggle) view.toggle();
  if (e.pause) prompts.flash('Pause menu comes later', now, 1000);
  if (e.crashed) prompts.flash('Crash!', now, 1000);

  const body = flight.drone.body;
  body.interpolate(flight.alpha, renderPos, renderRot);
  model.root.position.copy(renderPos);
  model.root.quaternion.copy(renderRot);
  model.update(flight.drone.quad.motors, Math.min(frameSeconds, 0.1));
  view.update(renderPos, renderRot, Math.min(frameSeconds, 0.1));
  field.follow(renderPos);

  hud.update(flight.speedKmh, flight.altitude);
  prompts.update(currentHint(), now);
  panel.render({
    sticks: input.sticks,
    source: `Input: ${input.active.label}`,
    armed: flight.drone.armed,
    lines: [
      `${fps.toFixed(0)} fps · ground: ${flight.drone.ground.state} · last impact ${e.impact.toFixed(1)} m/s`,
      `camera: ${view.mode} (C) · keyboard: ${input.keyboard.feel === KEYBOARD_GENTLE ? 'gentle' : 'normal'} (G)`,
      input.gamepad.connected
        ? `gamepad throttle: ${input.gamepad.options.throttleMode} (T)`
        : 'gamepad: press a button to connect',
      'Space arm · W/S throttle · A/D yaw · arrows pitch/roll · R respawn · F3 hide',
    ],
  });
  renderer.render(field.scene, view.camera);
});
