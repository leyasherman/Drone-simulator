import * as THREE from 'three';
import { allCourses, getLesson, nextLessonId } from './game/content';
import { Progress } from './game/progress';
import { FreeFlight } from './game/free-flight';
import { LessonSession } from './game/lesson-session';
import { ARM_THROTTLE_LIMIT } from './input/arming';
import { InputManager } from './input/input';
import { KEYBOARD_GENTLE, KEYBOARD_NORMAL } from './input/keyboard';
import { FlightCamera } from './render/cameras';
import { FREESTYLE_5 } from './sim/profiles';
import { ClipPlayer, Recorder, clipDuration, clipToJson, type ClipJson } from './sim/recording';
import { DebugPanel } from './ui/debug-panel';
import { Hud } from './ui/hud';
import { LessonList } from './ui/lesson-list';
import { LessonUi } from './ui/lesson-ui';
import { Prompts } from './ui/prompts';
import { RadioOverlay } from './ui/radio-overlay';
import { DroneModel } from './world/drone-model';
import { ObjectiveVisuals } from './world/objective-visuals';
import { createTestField } from './world/test-field';
import { collidersFrom, testFieldLayout } from './world/test-field-layout';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Canvas #scene not found');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const params = new URLSearchParams(location.search);
const layout = testFieldLayout();
const field = createTestField(layout);
const view = new FlightCamera(window.innerWidth / window.innerHeight);
const model = new DroneModel(FREESTYLE_5);
const objectives = new ObjectiveVisuals();
field.scene.add(model.root, objectives.root);
// Debug: ?cam=chase starts in the chase view
if (params.get('cam') === 'chase') view.toggle();

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  view.setAspect(window.innerWidth / window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

const FREE_SPAWN = [2.5, 0, 2.5] as const;
const input = new InputManager();
input.keyboard.attach(window);
const flight = new FreeFlight(FREESTYLE_5, input, collidersFrom(layout));
const hud = new Hud(document.body);
const radio = new RadioOverlay(document.body);
const prompts = new Prompts(document.body);
const panel = new DebugPanel(document.body);
const recBadge = document.createElement('div');
recBadge.className = 'rec-badge';
recBadge.hidden = true;
document.body.append(recBadge);

// ---- Lessons ----

let lesson: LessonSession | null = null;
/** What the lesson UI currently shows, so it is rebuilt only when that changes. */
let lessonUiKey = '';
/** Set once a lesson's completion has been saved, so it is saved only once per run. */
let completionSaved = false;
const progress = new Progress();
const lessonUi = new LessonUi(document.body, {
  advance: () => lesson?.advance(),
  skip: () => lesson?.skipToPractice(),
  tryAgain: () => {
    completionSaved = false;
    lesson?.tryAgain();
  },
  lessons: () => openLessonList(lesson?.lesson.id),
  next: () => {
    const next = lesson && nextLessonId(lesson.lesson.id);
    if (next) startLesson(next);
  },
});
const lessonList = new LessonList(document.body, allCourses(), getLesson, progress, {
  start: (id) => startLesson(id),
  close: () => {
    lessonList.close();
    exitLesson();
  },
});

/** Shows the flight school screen; the sim keeps drawing behind it. */
function openLessonList(select?: string): void {
  if (lesson) exitLesson();
  if (bench !== 'live') cycleBenchTo('live');
  lessonList.open(select);
}

function startLesson(id: string): void {
  const l = getLesson(id);
  if (!l) return;
  if (bench !== 'live') cycleBenchTo('live');
  lessonList.close();
  completionSaved = false;
  lesson?.end();
  lesson = new LessonSession(l, flight);
  lesson.start();
  objectives.set(l.practice.objectives);
  lessonUi.visible = true;
  radio.visible = true;
  lessonUiKey = '';
}

function exitLesson(): void {
  lesson?.end();
  lesson = null;
  objectives.clear();
  lessonUi.visible = false;
  radio.visible = false;
  flight.setSpawn(FREE_SPAWN);
  flight.respawn();
  flight.clock.reset();
  view.setMode('fpv');
}

// ---- Recording bench (stage 8): P records, P plays back in a loop, P returns to flying ----

type BenchMode = 'live' | 'recording' | 'playback';
let bench: BenchMode = 'live';
let player: ClipPlayer | null = null;
let lastClip: ClipJson | null = null;
let cameraBeforePlayback = view.mode;

function cycleBenchTo(next: BenchMode): void {
  if (next === 'recording') {
    flight.recorder = new Recorder(90);
  } else if (next === 'playback') {
    const clip = flight.recorder!.toClip();
    flight.recorder = null;
    lastClip = clipToJson(clip);
    console.info(
      `Recorded ${lastClip.frames.length} frames (${clipDuration(clip).toFixed(1)} s). __sim.lastClip()`,
    );
    player = new ClipPlayer(clip, true);
    cameraBeforePlayback = view.mode;
    view.setMode('chase');
  } else {
    flight.recorder = null;
    player = null;
    view.setMode(cameraBeforePlayback);
    flight.clock.reset(); // do not catch up the paused time
  }
  bench = next;
  recBadge.hidden = bench === 'live';
  recBadge.classList.toggle('recording', bench === 'recording');
  if (bench === 'recording') recBadge.textContent = 'REC  ·  P to stop';
  radio.visible = bench !== 'live';
}

function cycleBench(): void {
  cycleBenchTo(bench === 'live' ? 'recording' : bench === 'recording' ? 'playback' : 'live');
}

// Dev only: lets browser scripts read the sim state
if (import.meta.env.DEV) {
  Object.assign(window, {
    __sim: {
      flight,
      input,
      view,
      lastClip: () => lastClip,
      bench: () => bench,
      lesson: () => lesson,
      startLesson,
      openLessonList,
      progress,
    },
  });
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  // L: flight school (until the main menu exists, stage 7b)
  if (e.code === 'KeyL' && !lesson && !lessonList.visible) openLessonList();
  if (e.code === 'KeyP' && !lesson && !lessonList.visible) cycleBench();
  // In playback the sim is paused, so the camera key is read here
  if (e.code === 'KeyC' && bench === 'playback') view.toggle();
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
  if (lessonList.visible) return '';
  if (flight.respawnPrompt) return `Press ${pad ? 'B' : 'R'} to respawn`;
  if (flight.drone.armed) return lesson || lessonList.visible ? '' : 'L: flight school';
  return input.sticks.throttle > ARM_THROTTLE_LIMIT
    ? `Lower the throttle (${pad ? 'left stick down' : 'S'}) to arm`
    : `Press ${pad ? 'A' : 'Space'} to arm, then raise the throttle (${pad ? 'left stick' : 'hold W'})`;
}

// ---- Frame loop ----

const renderPos = new THREE.Vector3();
const renderRot = new THREE.Quaternion();
const prevRenderPos = new THREE.Vector3();
let last = performance.now();
let fps = 60;
let impact = 0;

/** Draws the live sim drone and reacts to its frame events. */
function liveFrame(
  frameSeconds: number,
  now: number,
  dt: number,
  e: ReturnType<FreeFlight['frame']> | null,
): void {
  if (e) {
    impact = e.impact;
    if (e.armBlocked) prompts.flash('Lower the throttle first', now, 1500);
    if (e.cameraToggle) view.toggle();
    if (e.pause) prompts.flash('Pause menu comes later', now, 1000);
    if (e.crashed) prompts.flash('Crash!', now, 1000);
  }
  flight.drone.body.interpolate(flight.alpha, renderPos, renderRot);
  model.update(flight.drone.quad.motors, dt);
  radio.update(input.sticks);
  hud.update(flight.speedKmh, flight.altitude);
  void frameSeconds;
}

/** Draws a clip sample (bench playback or lesson demo). */
function clipFrame(s: ReturnType<ClipPlayer['update']>, dt: number): void {
  prevRenderPos.copy(renderPos);
  renderPos.copy(s.position);
  renderRot.copy(s.orientation);
  model.update(s.motors, dt);
  radio.update(s.sticks);
  hud.update(
    (renderPos.distanceTo(prevRenderPos) / Math.max(dt, 1e-3)) * 3.6,
    renderPos.y - FREESTYLE_5.size.y / 2,
  );
}

function lessonFrame(l: LessonSession, frameSeconds: number, now: number, dt: number): void {
  const e = l.frame(frameSeconds);
  const r = l.runner;
  if (l.phase === 'briefing') {
    if (l.demo) clipFrame(l.demo.sample, dt);
    view.setMode(l.demoCamera);
    hud.visible = false;
    const key = `b-${r.stepIndex}-${r.lineIndex}`;
    if (key !== lessonUiKey) {
      lessonUiKey = key;
      lessonUi.showBriefing({
        stepIndex: r.stepIndex,
        stepCount: r.stepCount,
        title: l.lesson.title,
        text: r.line.text,
        pose: r.line.pose,
      });
    }
    prompts.update('', now);
  } else {
    liveFrame(frameSeconds, now, dt, e);
    hud.visible = l.phase === 'practice';
    if (l.phase === 'practice' && lessonUiKey !== 'p') {
      lessonUiKey = 'p';
      view.setMode('fpv');
      lessonUi.showPractice({ title: l.lesson.title, instruction: l.lesson.practice.instruction });
    }
    if (l.phase === 'complete' && lessonUiKey !== 'c') {
      lessonUiKey = 'c';
      view.setMode('chase');
      if (!completionSaved) {
        completionSaved = true;
        progress.complete(l.lesson.id, r.result.totalXp);
      }
      lessonUi.showComplete({
        title: l.lesson.title,
        result: r.result,
        hasNext: nextLessonId(l.lesson.id) !== undefined,
      });
    }
    while (l.xpPops.length) lessonUi.xpPop(l.xpPops.shift()!);
    prompts.update(l.phase === 'practice' && flight.respawnPrompt ? currentHint() : '', now);
  }
  radio.visible = l.phase !== 'complete';
  objectives.update((i) => (l.phase === 'briefing' ? 'waiting' : r.practice.status(i)), dt);
}

renderer.setAnimationLoop((now) => {
  const frameSeconds = (now - last) / 1000;
  last = now;
  fps += (1 / Math.max(frameSeconds, 1e-3) - fps) * 0.05;
  const dt = Math.min(frameSeconds, 0.1);

  if (lesson) {
    lessonFrame(lesson, frameSeconds, now, dt);
  } else if (player) {
    clipFrame(player.update(dt), dt);
    recBadge.textContent = `PLAYBACK  ${player.time.toFixed(1)} / ${clipDuration(player.clip).toFixed(1)} s  ·  C camera  ·  P to fly`;
    prompts.update('', now);
  } else {
    hud.visible = true;
    liveFrame(frameSeconds, now, dt, flight.frame(frameSeconds));
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
      'L lesson · P record · R respawn · F3 hide',
    ],
  });
  renderer.render(field.scene, view.camera);
});

const startWith = params.get('lesson');
if (startWith) startLesson(startWith);
