import * as THREE from 'three';
import { Autopilot } from './game/autopilot';
import { allCourses, getLesson, nextLessonId } from './game/content';
import { FreeFlight } from './game/free-flight';
import { LessonSession } from './game/lesson-session';
import { Progress, browserStore } from './game/progress';
import { ProgressSync, supabaseBackend } from './net/progress-sync';
import { Account } from './net/account';
import { ensureSession, supabase } from './net/supabase';
import { AccountPanel } from './ui/account-panel';
import { loadSettings, saveSettings, type Settings } from './game/settings';
import { ARM_THROTTLE_LIMIT } from './input/arming';
import { InputManager } from './input/input';
import { KEYBOARD_GENTLE, KEYBOARD_NORMAL } from './input/keyboard';
import { FlightCamera } from './render/cameras';
import { FREESTYLE_5 } from './sim/profiles';
import { RATE_PRESETS } from './sim/rates';
import { ClipPlayer, Recorder, clipDuration, clipToJson, type ClipJson } from './sim/recording';
import { DebugPanel } from './ui/debug-panel';
import { Hud } from './ui/hud';
import { LessonList } from './ui/lesson-list';
import { LessonUi } from './ui/lesson-ui';
import { Intro, MainMenu, PauseMenu, SettingsPanel, type IntroLine } from './ui/menus';
import { Prompts } from './ui/prompts';
import { RadioOverlay } from './ui/radio-overlay';
import { DroneModel } from './world/drone-model';
import { ObjectiveVisuals } from './world/objective-visuals';
import { createTestField } from './world/test-field';
import { collidersFrom, testFieldLayout } from './world/test-field-layout';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Canvas #scene not found');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed in three r186
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
const store = browserStore();
const input = new InputManager();
input.keyboard.attach(window);
const flight = new FreeFlight(FREESTYLE_5, input, collidersFrom(layout));
const progress = new Progress(store);
// Progress lives in Supabase once signed in (silently, anonymously on the first visit); local copy otherwise
const sync = supabase ? new ProgressSync(progress, supabaseBackend(supabase)) : null;
const account = supabase ? new Account(supabase) : null;
void ensureSession().then(async (uid) => {
  if (!uid) return;
  await sync?.start();
  await account?.refresh();
  refreshPlayerChip();
});
const hud = new Hud(document.body);
const radio = new RadioOverlay(document.body);
const prompts = new Prompts(document.body);
const panel = new DebugPanel(document.body);
const recBadge = document.createElement('div');
recBadge.className = 'rec-badge';
recBadge.hidden = true;
document.body.append(recBadge);

// ---- Settings ----

let settings: Settings = loadSettings(store);

function applySettings(s: Settings): void {
  input.keyboard.feel = s.keyboardFeel === 'gentle' ? KEYBOARD_GENTLE : KEYBOARD_NORMAL;
  input.gamepad.options.throttleMode = s.gamepadThrottle;
  flight.drone.rates = RATE_PRESETS[s.rates];
  view.fpv.fov = s.fov;
  view.fpv.uptilt = s.uptilt;
  view.refresh();
  renderer.setPixelRatio(s.quality === 'low' ? 1 : Math.min(window.devicePixelRatio, 2));
  field.setShadows(s.quality === 'high');
  resize();
}
applySettings(settings);

function updateSettings(s: Settings): void {
  settings = s;
  applySettings(s);
  saveSettings(store, s);
}

// ---- Screens ----
// While any screen is open the sim is paused; input is still polled so keys pressed there are used up.

type Screen = 'none' | 'menu' | 'intro' | 'pause' | 'settings' | 'list' | 'account';
let screen: Screen = 'none';
/** Where Settings and the lesson list go back to. */
let settingsReturn: Screen = 'menu';
let listReturn: Screen = 'menu';

const INTRO: IntroLine[] = [
  {
    text: "Welcome to flight school! I'm your instructor. Let me show you the controls before you take off.",
  },
  {
    text: 'Throttle and turning are on the left: W and S for throttle, A and D to turn.',
    keys: ['W', 'S', 'A', 'D'],
  },
  {
    text: 'Tilt is on the right: the arrow keys lean the drone forward, back and to the sides. Leaning is how you move.',
    keys: ['↑', '↓', '←', '→'],
  },
  {
    text: "Space arms the motors. Keep the throttle all the way down first, or it won't arm.",
    keys: ['Space'],
  },
  {
    text: 'Crashed or upside down? R puts you back on the pad. C switches the camera, Esc opens the menu.',
    keys: ['R', 'C', 'Esc'],
  },
  {
    text: "Got a gamepad? Left stick is throttle and turn, right stick is tilt, A arms. Now pick Flight School and let's fly.",
    keys: ['Gamepad · Mode 2'],
  },
];

const mainMenu = new MainMenu(
  document.body,
  (id) => {
    if (id === 'school') openLessonList('menu');
    if (id === 'free') startFreeFlight();
    if (id === 'intro') playIntro();
    if (id === 'settings') openSettings('menu');
    if (id === 'account' && accountPanel) {
      show('account');
      void accountPanel.open();
    }
  },
  account !== null,
);

/** Updates the player chip on the main menu from the account state. */
function refreshPlayerChip(): void {
  if (!account) return;
  const s = account.state;
  mainMenu.setPlayer(s.nickname, progress.totalXp, s.anonymous);
}

const accountPanel = account
  ? new AccountPanel(document.body, account, {
      done: () => showMainMenu(),
      // A different account (or a new guest after sign-out): load its progress
      sessionChanged: async () => {
        progress.replace({ completed: {}, totalXp: 0 });
        await ensureSession();
        await sync?.start();
      },
      updated: () => refreshPlayerChip(),
    })
  : null;
const pauseMenu = new PauseMenu(document.body, (id) => {
  if (id === 'resume') resume();
  if (id === 'respawn') {
    if (lesson) lesson.respawn();
    else flight.respawn();
    resume();
  }
  if (id === 'school') openLessonList('pause');
  if (id === 'settings') openSettings('pause');
  if (id === 'menu') showMainMenu();
});
const settingsPanel = new SettingsPanel(document.body, updateSettings, () => show(settingsReturn));
const intro = new Intro(document.body);

/** Shows one screen (or none) and hides the others. */
function show(s: Screen): void {
  screen = s;
  mainMenu.visible = s === 'menu';
  pauseMenu.visible = s === 'pause';
  settingsPanel.visible = s === 'settings';
  if (accountPanel) accountPanel.visible = s === 'account';
  if (s === 'menu') refreshPlayerChip();
  if (s !== 'intro') intro.visible = false;
  if (s !== 'list') lessonList.close();
  // Flight UI only while flying
  const flying = s === 'none';
  hud.visible = flying && (!lesson || lesson.phase === 'practice');
  lessonUi.visible = flying && lesson !== null;
  if (flying) {
    input.keyboard.flush();
    flight.clock.reset(); // do not catch up the paused time
  }
}

function showMainMenu(): void {
  if (lesson) exitLesson();
  if (bench !== 'live') cycleBenchTo('live');
  flight.setSpawn(FREE_SPAWN);
  flight.respawn();
  view.setMode('chase');
  show('menu');
}

function playIntro(): void {
  show('intro');
  intro.play(INTRO, () => {
    updateSettings({ ...settings, introSeen: true });
    showMainMenu();
  });
}

function openSettings(from: Screen): void {
  settingsReturn = from;
  settingsPanel.open(settings);
  show('settings');
}

function pause(): void {
  if (screen === 'none') show('pause');
}

function resume(): void {
  show('none');
}

function startFreeFlight(): void {
  if (lesson) exitLesson();
  flight.setSpawn(FREE_SPAWN);
  flight.respawn();
  view.setMode('fpv');
  show('none');
}

// ---- Lessons ----

let lesson: LessonSession | null = null;
/** What the lesson UI currently shows, so it is rebuilt only when that changes. */
let lessonUiKey = '';
/** Set once a lesson's completion has been saved, so it is saved only once per run. */
let completionSaved = false;
const lessonUi = new LessonUi(document.body, {
  advance: () => lesson?.advance(),
  skip: () => lesson?.skipToPractice(),
  tryAgain: () => {
    completionSaved = false;
    lesson?.tryAgain();
  },
  lessons: () => openLessonList('menu', lesson?.lesson.id),
  next: () => {
    const next = lesson && nextLessonId(lesson.lesson.id);
    if (next) startLesson(next);
  },
});
const lessonList = new LessonList(document.body, allCourses(), getLesson, progress, {
  start: (id) => startLesson(id),
  close: () =>
    listReturn === 'pause' ? show('pause') : listReturn === 'none' ? startFreeFlight() : showMainMenu(),
});

/** Shows the flight school screen. `from` is where closing it goes back to. */
function openLessonList(from: Screen, select?: string): void {
  if (lesson) exitLesson();
  if (bench !== 'live') cycleBenchTo('live');
  listReturn = from === 'pause' ? 'none' : from;
  show('list');
  lessonList.open(select);
}

function startLesson(id: string): void {
  const l = getLesson(id);
  if (!l) return;
  if (bench !== 'live') cycleBenchTo('live');
  completionSaved = false;
  lesson?.end();
  lesson = new LessonSession(l, flight);
  lesson.start();
  objectives.set(l.practice.objectives);
  radio.visible = true;
  lessonUiKey = '';
  show('none');
}

function exitLesson(): void {
  lesson?.end();
  lesson = null;
  objectives.clear();
  lessonUi.visible = false;
  radio.visible = false;
  flight.setSpawn(FREE_SPAWN);
  flight.respawn();
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
    flight.clock.reset();
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
      progress,
      sync,
      supabase,
      lastClip: () => lastClip,
      bench: () => bench,
      lesson: () => lesson,
      screen: () => screen,
      settings: () => settings,
      startLesson,
      openLessonList,
      startFreeFlight,
      Autopilot,
    },
  });
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Escape') {
    if (screen === 'none') pause();
    else if (screen === 'pause') resume();
    else if (screen === 'settings') show(settingsReturn);
    else if (screen === 'account') showMainMenu();
    // The lesson list and the intro handle Esc themselves
  }
  if (screen !== 'none') return;
  // Shortcuts while flying: L flight school, P record / playback (free flight only)
  if (e.code === 'KeyL' && !lesson) openLessonList('none');
  if (e.code === 'KeyP' && !lesson) cycleBench();
  if (e.code === 'KeyC' && bench === 'playback') view.toggle(); // the sim is paused in playback
  if (e.code === 'F3') {
    e.preventDefault();
    panel.visible = !panel.visible;
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

// ---- Frame loop ----

const renderPos = new THREE.Vector3();
const renderRot = new THREE.Quaternion();
const prevRenderPos = new THREE.Vector3();
let last = performance.now();
let fps = 60;
let impact = 0;

/** Draws the live sim drone and reacts to its frame events. */
function liveFrame(now: number, dt: number, e: ReturnType<FreeFlight['frame']> | null): void {
  if (e) {
    impact = e.impact;
    if (e.armBlocked) prompts.flash('Lower the throttle first', now, 1500);
    if (e.cameraToggle) view.toggle();
    if (e.pause) pause(); // gamepad Start
    if (e.crashed) prompts.flash('Crash!', now, 1000);
  }
  flight.drone.body.interpolate(flight.alpha, renderPos, renderRot);
  model.update(flight.drone.quad.motors, dt);
  radio.update(input.sticks);
  hud.update(flight.speedKmh, flight.altitude);
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
    liveFrame(now, dt, e);
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
        if (sync) void sync.complete(l.lesson.id, r.result.flightXp, r.result.totalXp);
        else progress.complete(l.lesson.id, r.result.totalXp);
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

  if (screen !== 'none') {
    // Paused behind a screen. Gamepad Start toggles the pause menu.
    input.update(dt);
    if (input.actions.pause && screen === 'pause') resume();
    prompts.update('', now);
  } else if (lesson) {
    lessonFrame(lesson, frameSeconds, now, dt);
  } else if (player) {
    clipFrame(player.update(dt), dt);
    recBadge.textContent = `PLAYBACK  ${player.time.toFixed(1)} / ${clipDuration(player.clip).toFixed(1)} s  ·  C camera  ·  P to fly`;
    prompts.update('', now);
  } else {
    liveFrame(now, dt, flight.frame(frameSeconds));
    prompts.update(currentHint(), now);
  }

  if (screen !== 'none' && !player) {
    // Keep the drone drawn where it is
    flight.drone.body.interpolate(1, renderPos, renderRot);
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
      `screen: ${screen} · camera: ${view.mode} (C)`,
      input.gamepad.connected ? `gamepad: ${input.gamepad.label}` : 'gamepad: press a button to connect',
      'Esc menu · L lessons · P record · R respawn · F3 hide',
    ],
  });
  renderer.render(field.scene, view.camera);
});

// Start: ?lesson=<id> jumps straight in; a first visit gets the intro; otherwise the main menu
const startWith = params.get('lesson');
if (startWith && getLesson(startWith)) startLesson(startWith);
else if (params.has('free')) startFreeFlight();
else if (!settings.introSeen) playIntro();
else showMainMenu();
