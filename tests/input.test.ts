import { describe, expect, it } from 'vitest';
import { toggleArm } from '../src/input/arming';
import { applyDeadband, normalizeAxis } from '../src/input/axis';
import { DEFAULT_GAMEPAD_OPTIONS, mapStandardGamepad, type PadState } from '../src/input/gamepad';
import { InputManager } from '../src/input/input';
import { KEYBOARD_GENTLE, KEYBOARD_NORMAL, KeyboardInput } from '../src/input/keyboard';
import { emptyActions, type Sticks } from '../src/input/types';

const sticks = (): Sticks => ({ throttle: 0, roll: 0, pitch: 0, yaw: 0 });

describe('applyDeadband', () => {
  it('zeroes small values and has no jump at the edge', () => {
    expect(applyDeadband(0.02, 0.05)).toBe(0);
    expect(applyDeadband(0.0501, 0.05)).toBeLessThan(0.001);
    expect(applyDeadband(1, 0.05)).toBe(1);
    expect(applyDeadband(-1, 0.05)).toBe(-1);
  });
});

describe('normalizeAxis', () => {
  const cal = { min: -0.8, center: 0.1, max: 0.9, invert: false };
  it('scales each side of the centre separately', () => {
    expect(normalizeAxis(0.1, cal, 0)).toBe(0);
    expect(normalizeAxis(0.9, cal, 0)).toBe(1);
    expect(normalizeAxis(-0.8, cal, 0)).toBe(-1);
    expect(normalizeAxis(0.5, cal, 0)).toBeCloseTo(0.5);
  });
  it('clamps and inverts', () => {
    expect(normalizeAxis(5, cal, 0)).toBe(1);
    expect(normalizeAxis(0.9, { ...cal, invert: true }, 0)).toBe(-1);
  });
});

describe('mapStandardGamepad (Mode 2)', () => {
  const out = sticks();
  it('left stick up is full throttle, centre is zero (centerZero)', () => {
    mapStandardGamepad([0, -1, 0, 0], DEFAULT_GAMEPAD_OPTIONS, out);
    expect(out.throttle).toBe(1);
    mapStandardGamepad([0, 0, 0, 0], DEFAULT_GAMEPAD_OPTIONS, out);
    expect(out.throttle).toBe(0);
    mapStandardGamepad([0, 1, 0, 0], DEFAULT_GAMEPAD_OPTIONS, out);
    expect(out.throttle).toBe(0);
  });
  it('centre is half throttle in fullRange mode', () => {
    mapStandardGamepad([0, 0, 0, 0], { ...DEFAULT_GAMEPAD_OPTIONS, throttleMode: 'fullRange' }, out);
    expect(out.throttle).toBe(0.5);
  });
  it('right stick up is nose down, right is roll right; left stick right is yaw right', () => {
    mapStandardGamepad([1, 0, 1, -1], DEFAULT_GAMEPAD_OPTIONS, out);
    expect(out.yaw).toBe(1);
    expect(out.roll).toBe(1);
    expect(out.pitch).toBe(-1);
  });
});

describe('KeyboardInput', () => {
  function kb() {
    const k = new KeyboardInput();
    k.feel = KEYBOARD_NORMAL;
    return k;
  }
  const step = (k: KeyboardInput, seconds: number, s = sticks()) => {
    const a = emptyActions();
    for (let t = 0; t < seconds - 1e-9; t += 1 / 240) k.update(1 / 240, s, a);
    return s;
  };

  it('W raises throttle at 90%/s and it stays after release', () => {
    const k = kb();
    k.keyDown('KeyW');
    expect(step(k, 0.5).throttle).toBeCloseTo(0.45, 2);
    k.keyUp('KeyW');
    expect(step(k, 1).throttle).toBeCloseTo(0.45, 2);
  });

  it('S lowers throttle slower than W raises it (40%/s)', () => {
    const k = kb();
    k.setThrottle(0.5);
    k.keyDown('KeyS');
    expect(step(k, 0.25).throttle).toBeCloseTo(0.4, 2);
  });

  it('arrow ramps roll to 60% in 0.15 s and returns to centre at 6/s', () => {
    const k = kb();
    k.keyDown('ArrowRight');
    expect(step(k, 0.15).roll).toBeCloseTo(0.6, 2);
    k.keyUp('ArrowRight');
    expect(step(k, 0.05).roll).toBeCloseTo(0.3, 2);
    expect(step(k, 0.1).roll).toBe(0);
  });

  it('arrow up is nose down (negative pitch)', () => {
    const k = kb();
    k.keyDown('ArrowUp');
    expect(step(k, 0.5).pitch).toBeCloseTo(-0.6);
  });

  it('opposite keys cancel', () => {
    const k = kb();
    k.keyDown('KeyA');
    k.keyDown('KeyD');
    expect(step(k, 0.5).yaw).toBe(0);
  });

  it('gentle mode deflects less', () => {
    const k = new KeyboardInput();
    k.feel = KEYBOARD_GENTLE;
    k.keyDown('ArrowLeft');
    expect(step(k, 1).roll).toBeCloseTo(-0.3);
  });

  it('Space fires the arm action once per press', () => {
    const k = kb();
    const s = sticks();
    const a = emptyActions();
    k.keyDown('Space');
    k.update(0.01, s, a);
    expect(a.armToggle).toBe(true);
    const b = emptyActions();
    k.update(0.01, s, b); // still held
    expect(b.armToggle).toBe(false);
  });
});

describe('toggleArm', () => {
  it('arms only with throttle at or below 15%', () => {
    expect(toggleArm(false, 0.15)).toBe('armed');
    expect(toggleArm(false, 0.2)).toBe('blocked-throttle');
  });
  it('always allows disarming', () => {
    expect(toggleArm(true, 1)).toBe('disarmed');
  });
});

describe('InputManager', () => {
  it('switches to the gamepad when it is touched, and back to the keyboard on a key press', () => {
    let pad: PadState | null = { id: 'pad', axes: [0, 0, 0, 0], buttons: [] };
    const m = new InputManager(() => pad);
    m.update(0.01);
    expect(m.active.kind).toBe('keyboard');

    pad = { id: 'pad', axes: [0, -1, 0, 0], buttons: [] };
    m.update(0.01);
    expect(m.active.kind).toBe('gamepad');
    expect(m.sticks.throttle).toBe(1);

    m.keyboard.keyDown('KeyW');
    m.update(0.01);
    expect(m.active.kind).toBe('keyboard');
  });

  it('falls back to the keyboard when the gamepad disconnects', () => {
    let pad: PadState | null = { id: 'pad', axes: [0, -1, 0, 0], buttons: [] };
    const m = new InputManager(() => pad);
    m.update(0.01);
    m.update(0.01);
    pad = null;
    m.update(0.01);
    expect(m.active.kind).toBe('keyboard');
  });
});
