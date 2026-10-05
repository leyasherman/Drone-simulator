import './prompts.css';

/**
 * On-screen prompts during flight: a persistent hint (how to arm, how to respawn) and short flash messages.
 * A flash takes the hint's place while it shows.
 */
export class Prompts {
  private readonly hint = document.createElement('div');
  private readonly flashEl = document.createElement('div');
  private flashUntil = 0;
  private hintText = '';

  constructor(parent: HTMLElement) {
    this.hint.className = 'prompt prompt-hint';
    this.flashEl.className = 'prompt prompt-flash';
    this.hint.hidden = this.flashEl.hidden = true;
    parent.append(this.hint, this.flashEl);
  }

  flash(text: string, now: number, ms = 2500): void {
    this.flashEl.textContent = text;
    this.flashEl.hidden = false;
    this.flashUntil = now + ms;
  }

  /** Call every frame with the hint to show ('' for none). */
  update(hint: string, now: number): void {
    if (!this.flashEl.hidden && now > this.flashUntil) this.flashEl.hidden = true;
    if (hint !== this.hintText) this.hint.textContent = this.hintText = hint;
    this.hint.hidden = !hint || !this.flashEl.hidden;
  }
}
