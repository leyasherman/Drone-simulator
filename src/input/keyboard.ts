import type { Actions, InputSource, Sticks } from './types';

/** How the keyboard turns key presses into stick positions. */
export interface KeyboardFeel {
  /** Roll/pitch deflection while a key is held, 0..1. */
  maxTilt: number;
  /** Yaw deflection while a key is held, 0..1. */
  maxYaw: number;
  /** How fast a stick moves out while a key is held, per second. */
  rampOut: number;
  /** How fast it returns to centre on release, per second. */
  rampBack: number;
  /** Throttle change per second while W or S is held. Throttle stays where you leave it. */
  throttleRate: number;
}

/** Values from the research (the reference sim's keyboard). */
export const KEYBOARD_NORMAL: KeyboardFeel = {
  maxTilt: 0.6,
  maxYaw: 0.6,
  rampOut: 4,
  rampBack: 6,
  throttleRate: 0.9,
};

/** Softer: smaller, slower deflections, finer throttle. For beginners on a keyboard. */
export const KEYBOARD_GENTLE: KeyboardFeel = {
  maxTilt: 0.3,
  maxYaw: 0.4,
  rampOut: 2,
  rampBack: 6,
  throttleRate: 0.5,
};

const KEYS = {
  throttleUp: 'KeyW',
  throttleDown: 'KeyS',
  yawLeft: 'KeyA',
  yawRight: 'KeyD',
  pitchForward: 'ArrowUp',
  pitchBack: 'ArrowDown',
  rollLeft: 'ArrowLeft',
  rollRight: 'ArrowRight',
  arm: 'Space',
  respawn: 'KeyR',
  camera: 'KeyC',
  pause: 'Escape',
} as const;

const GAME_KEYS = new Set<string>(Object.values(KEYS));

/** Moves `current` toward `target` at `rateOut` (away from centre) or `rateBack` (toward centre). */
function ramp(current: number, target: number, rateOut: number, rateBack: number, dt: number): number {
  const towardCentre = Math.abs(target) < Math.abs(current) || Math.sign(target) !== Math.sign(current);
  const step = (towardCentre ? rateBack : rateOut) * dt;
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

export class KeyboardInput implements InputSource {
  readonly kind = 'keyboard';
  readonly label = 'Keyboard';
  feel: KeyboardFeel = KEYBOARD_NORMAL;

  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>(); // went down since the last update
  private touched = false;
  private throttle = 0;
  private roll = 0;
  private pitch = 0;
  private yaw = 0;

  keyDown(code: string): void {
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
    this.touched = true;
  }

  keyUp(code: string): void {
    this.down.delete(code);
  }

  /** Releases everything, e.g. when the window loses focus. */
  releaseAll(): void {
    this.down.clear();
  }

  /** Throttle is held between key presses; respawn or disarm can reset it. */
  setThrottle(value: number): void {
    this.throttle = Math.min(1, Math.max(0, value));
  }

  /** Wires the browser keyboard. Returns a function that unwires it. */
  attach(target: Window): () => void {
    const onDown = (e: KeyboardEvent) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.keyDown(e.code);
    };
    const onUp = (e: KeyboardEvent) => this.keyUp(e.code);
    const onBlur = () => this.releaseAll();
    target.addEventListener('keydown', onDown);
    target.addEventListener('keyup', onUp);
    target.addEventListener('blur', onBlur);
    return () => {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    };
  }

  update(dt: number, sticks: Sticks, actions: Actions): boolean {
    const f = this.feel;
    const axis = (neg: string, pos: string) => (this.down.has(pos) ? 1 : 0) - (this.down.has(neg) ? 1 : 0);

    this.throttle = Math.min(
      1,
      Math.max(0, this.throttle + axis(KEYS.throttleDown, KEYS.throttleUp) * f.throttleRate * dt),
    );
    this.roll = ramp(this.roll, axis(KEYS.rollLeft, KEYS.rollRight) * f.maxTilt, f.rampOut, f.rampBack, dt);
    // Arrow up = nose down = negative pitch
    this.pitch = ramp(
      this.pitch,
      axis(KEYS.pitchForward, KEYS.pitchBack) * f.maxTilt,
      f.rampOut,
      f.rampBack,
      dt,
    );
    this.yaw = ramp(this.yaw, axis(KEYS.yawLeft, KEYS.yawRight) * f.maxYaw, f.rampOut, f.rampBack, dt);

    sticks.throttle = this.throttle;
    sticks.roll = this.roll;
    sticks.pitch = this.pitch;
    sticks.yaw = this.yaw;

    actions.armToggle ||= this.pressed.has(KEYS.arm);
    actions.respawn ||= this.pressed.has(KEYS.respawn);
    actions.camera ||= this.pressed.has(KEYS.camera);
    actions.pause ||= this.pressed.has(KEYS.pause);
    this.pressed.clear();

    const touched = this.touched;
    this.touched = false;
    return touched;
  }
}
