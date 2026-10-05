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
import { RadioOverlay } from './ui/radio-overlay';
import { ClipPlayer, Recorder, clipDuration, clipToJson, type ClipJson } from './sim/recording';
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
const radio = new RadioOverlay(document.body);
const recBadge = document.createElement('div');
recBadge.className = 'rec-badge';
recBadge.hidden = true;
document.body.append(recBadge);

// Recording bench (stage 8): P starts recording, P again plays it back in a loop, P again returns to flying
type BenchMode = 'live' | 'recording' | 'playback';
let mode: BenchMode = 'live';
let player: ClipPlayer | null = null;
let lastClip: ClipJson | null = null;
let cameraBeforePlayback = view.mode;

function cycleBench(): void {
  if (mode === 'live') {
    flight.recorder = new Recorder(90);
    mode = 'recording';
  } else if (mode === 'recording') {
    const clip = flight.recorder!.toClip();
    flight.recorder = null;
    lastClip = clipToJson(clip);
    console.info(
      `Recorded ${lastClip.frames.length} frames (${clipDuration(clip).toFixed(1)} s). window.__sim.lastClip()`,
    );
    player = new ClipPlayer(clip, true);
    // Watch from behind by default, so the flight is easy to see; C switches to FPV
    cameraBeforePlayback = view.mode;
    if (view.mode !== 'chase') view.toggle();
    mode = 'playback';
  } else {
    player = null;
    if (view.mode !== cameraBeforePlayback) view.toggle();
    mode = 'live';
    flight.clock.reset(); // do not catch up the paused time
  }
  recBadge.hidden = mode === 'live';
  recBadge.classList.toggle('recording', mode === 'recording');
  if (mode === 'recording') recBadge.textContent = 'REC  ·  P to stop';
  radio.visible = mode !== 'live';
}

// Dev only: lets browser scripts (scripts/smoke.mjs) read the sim state
if (import.meta.env.DEV) {
  Object.assign(window, { __sim: { flight, input, view, lastClip: () => lastClip, bench: () => mode } });
}

// Developer keys: F3 debug panel, G keyboard feel, T gamepad throttle mode, P record/playback
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' && !e.repeat) cycleBench();
  // In playback the sim is paused, so the camera key is read here
  if (e.code === 'KeyC' && mode === 'playback') view.toggle();
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
const prevRenderPos = new THREE.Vector3();
let last = performance.now();
let fps = 60;

renderer.setAnimationLoop((now) => {
  const frameSeconds = (now - last) / 1000;
  last = now;
  fps += (1 / Math.max(frameSeconds, 1e-3) - fps) * 0.05;
  const dt = Math.min(frameSeconds, 0.1);
  let impact = 0;

  if (player) {
    // Playback: the sim is paused, the clip drives the drone, camera and radio
    const s = player.update(dt);
    const total = clipDuration(player.clip);
    recBadge.textContent = `PLAYBACK  ${player.time.toFixed(1)} / ${total.toFixed(1)} s  ·  C camera  ·  P to fly`;
    prevRenderPos.copy(renderPos);
    renderPos.copy(s.position);
    renderRot.copy(s.orientation);
    model.update(s.motors, dt);
    radio.update(s.sticks);
    hud.update(
      (renderPos.distanceTo(prevRenderPos) / Math.max(dt, 1e-3)) * 3.6,
      renderPos.y - flight.drone.profile.size.y / 2,
    );
    prompts.update('', now);
  } else {
    const e = flight.frame(frameSeconds);
    impact = e.impact;
    if (e.armBlocked) prompts.flash('Lower the throttle first', now, 1500);
    if (e.cameraToggle) view.toggle();
    if (e.pause) prompts.flash('Pause menu comes later', now, 1000);
    if (e.crashed) prompts.flash('Crash!', now, 1000);
    flight.drone.body.interpolate(flight.alpha, renderPos, renderRot);
    model.update(flight.drone.quad.motors, dt);
    radio.update(input.sticks);
    hud.update(flight.speedKmh, flight.altitude);
    prompts.update(currentHint(), now);
  }

  hud.markerVisible = view.mode === 'fpv';
  model.root.position.copy(renderPos);
  model.root.quaternion.copy(renderRot);
  view.update(renderPos, renderRot, dt);
  field.follow(renderPos);
  panel.render({
    sticks: input.sticks,
    source: `Input: ${input.active.label}`,
    armed: flight.drone.armed,
    lines: [
      `${fps.toFixed(0)} fps · ground: ${flight.drone.ground.state} · last impact ${impact.toFixed(1)} m/s`,
      `camera: ${view.mode} (C) · keyboard: ${input.keyboard.feel === KEYBOARD_GENTLE ? 'gentle' : 'normal'} (G)`,
      input.gamepad.connected
        ? `gamepad throttle: ${input.gamepad.options.throttleMode} (T)`
        : 'gamepad: press a button to connect',
      'Space arm · W/S throttle · A/D yaw · arrows pitch/roll · R respawn · P record · F3 hide',
    ],
  });
  renderer.render(field.scene, view.camera);
});
