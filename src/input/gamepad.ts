import { applyDeadband } from './axis';
import type { Actions, InputSource, Sticks } from './types';

/**
 * Self-centring gamepad sticks need a throttle choice:
 * - 'centerZero': centre is 0%, full up is 100%, the lower half does nothing (research default)
 * - 'fullRange': full down is 0%, centre is 50%, full up is 100%
 */
export type GamepadThrottleMode = 'centerZero' | 'fullRange';

export interface GamepadOptions {
  throttleMode: GamepadThrottleMode;
  deadband: number;
}

export const DEFAULT_GAMEPAD_OPTIONS: GamepadOptions = { throttleMode: 'centerZero', deadband: 0.05 };

/** Standard-mapping buttons (Xbox names). */
export const BUTTON = { a: 0, b: 1, y: 3, start: 9 } as const;

/**
 * Mode 2 on a standard gamepad: left stick throttle + yaw, right stick pitch + roll.
 * Standard axes read -1 when pushed up, so throttle flips and pitch does not
 * (right stick up = -1 = nose down, which matches pitch > 0 = nose up).
 */
export function mapStandardGamepad(axes: readonly number[], o: GamepadOptions, out: Sticks): void {
  const lx = axes[0] ?? 0;
  const ly = axes[1] ?? 0;
  const rx = axes[2] ?? 0;
  const ry = axes[3] ?? 0;
  const up = applyDeadband(-ly, o.deadband);
  out.throttle = o.throttleMode === 'centerZero' ? Math.max(0, up) : (up + 1) / 2;
  out.yaw = applyDeadband(lx, o.deadband);
  out.roll = applyDeadband(rx, o.deadband);
  out.pitch = applyDeadband(ry, o.deadband);
}

/** Minimal view of a browser Gamepad, so tests can pass plain objects. */
export interface PadState {
  id: string;
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
}

const ACTIVITY = 0.15;

export class GamepadInput implements InputSource {
  readonly kind = 'gamepad';
  options: GamepadOptions = { ...DEFAULT_GAMEPAD_OPTIONS };

  private prevButtons: boolean[] = [];
  private prevAxes: number[] = [];

  constructor(private readonly read: () => PadState | null) {}

  get label(): string {
    return this.read()?.id ?? 'Gamepad';
  }

  get connected(): boolean {
    return this.read() !== null;
  }

  update(_dt: number, sticks: Sticks, actions: Actions): boolean {
    const pad = this.read();
    if (!pad) return false;
    mapStandardGamepad(pad.axes, this.options, sticks);

    let touched = false;
    const edge = (i: number) => {
      const now = pad.buttons[i]?.pressed ?? false;
      const was = this.prevButtons[i] ?? false;
      return now && !was;
    };
    actions.armToggle ||= edge(BUTTON.a);
    actions.respawn ||= edge(BUTTON.b);
    actions.camera ||= edge(BUTTON.y);
    actions.pause ||= edge(BUTTON.start);

    for (let i = 0; i < pad.buttons.length; i++) {
      const now = pad.buttons[i]!.pressed;
      if (now && !this.prevButtons[i]) touched = true;
      this.prevButtons[i] = now;
    }
    for (let i = 0; i < pad.axes.length; i++) {
      const v = pad.axes[i]!;
      if (Math.abs(v - (this.prevAxes[i] ?? 0)) > ACTIVITY) {
        touched = true;
        this.prevAxes[i] = v;
      }
    }
    return touched;
  }
}

/** Browsers hide a gamepad until it is touched, and disconnect events are unreliable, so poll every frame. */
export function firstBrowserGamepad(): PadState | null {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) return p;
  return null;
}
