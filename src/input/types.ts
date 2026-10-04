import type { Sticks } from '../sim/controller';

export type { Sticks };

/** One-shot actions. Each flag is true for exactly one update after the button goes down. */
export interface Actions {
  armToggle: boolean;
  respawn: boolean;
  camera: boolean;
  pause: boolean;
}

/** Anything that can drive the sticks: keyboard, gamepad, later a radio. */
export interface InputSource {
  readonly kind: 'keyboard' | 'gamepad' | 'radio';
  /** Display name, e.g. the gamepad id. */
  readonly label: string;
  /** Advances by dt seconds and writes the current sticks and actions. Returns true if the user touched it. */
  update(dt: number, sticks: Sticks, actions: Actions): boolean;
}

export function emptyActions(): Actions {
  return { armToggle: false, respawn: false, camera: false, pause: false };
}

export function clearActions(a: Actions): void {
  a.armToggle = false;
  a.respawn = false;
  a.camera = false;
  a.pause = false;
}
