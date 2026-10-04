import { GamepadInput, firstBrowserGamepad } from './gamepad';
import { KeyboardInput } from './keyboard';
import { clearActions, emptyActions, type Actions, type InputSource, type Sticks } from './types';

/**
 * Owns all input sources and picks the active one: whichever the player touched last.
 * Call update() once per physics step (or per frame) before reading sticks and actions.
 */
export class InputManager {
  readonly keyboard = new KeyboardInput();
  readonly gamepad: GamepadInput;
  readonly sticks: Sticks = { throttle: 0, roll: 0, pitch: 0, yaw: 0 };
  readonly actions: Actions = emptyActions();
  active: InputSource;

  private readonly scratchSticks: Sticks = { throttle: 0, roll: 0, pitch: 0, yaw: 0 };
  private readonly scratchActions: Actions = emptyActions();

  constructor(readGamepad = firstBrowserGamepad) {
    this.gamepad = new GamepadInput(readGamepad);
    this.active = this.keyboard;
  }

  update(dt: number): void {
    clearActions(this.actions);
    for (const source of [this.keyboard, this.gamepad] as const) {
      const isActive = source === this.active;
      // Inactive sources still update (keyboard ramps, button edges) but only the active one drives
      const s = isActive ? this.sticks : this.scratchSticks;
      const a = isActive ? this.actions : this.scratchActions;
      clearActions(this.scratchActions);
      const touched = source.update(dt, s, a);
      if (touched && !isActive) {
        this.active = source;
        Object.assign(this.sticks, this.scratchSticks);
        Object.assign(this.actions, this.scratchActions);
      }
    }
    if (this.active === this.gamepad && !this.gamepad.connected) this.active = this.keyboard;
  }
}
