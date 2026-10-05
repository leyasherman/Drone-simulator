import './menus.css';
import type { Settings } from '../game/settings';
import { mascotSvg } from './mascot';

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface MenuItem {
  id: string;
  label: string;
  hint?: string;
}

function menuButtons(items: readonly MenuItem[]): string {
  return items
    .map(
      (it, i) => `<button class="mn-btn ${i === 0 ? 'primary' : ''}" data-item="${it.id}">
        <span class="mn-num">0${i + 1}</span><span class="mn-label">${esc(it.label)}</span>
        ${it.hint ? `<span class="mn-hint">${esc(it.hint)}</span>` : ''}<i>↗</i></button>`,
    )
    .join('');
}

/** A full-screen overlay with a card. Base for the main and pause menus. */
class Overlay {
  protected readonly root = document.createElement('div');

  constructor(parent: HTMLElement, className: string) {
    this.root.className = `mn-overlay ${className}`;
    this.root.hidden = true;
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }
}

/** Start screen: title, a line about the game, the main choices, and the mascot. */
export type MainMenuItem = 'school' | 'free' | 'intro' | 'settings' | 'account' | 'editor';

export class MainMenu extends Overlay {
  private readonly player: HTMLButtonElement;

  /** `withAccount`: show the player chip and the Account item (only when a backend is configured). */
  constructor(parent: HTMLElement, onPick: (id: MainMenuItem) => void, withAccount = false) {
    super(parent, 'mn-main');
    this.root.innerHTML = `
      <div class="mn-card">
        <div class="mn-col">
          <button class="mn-player" data-item="account" hidden><i>✈</i><b data-nick></b><span data-xp></span></button>
          <div class="mn-kicker">Browser FPV simulator</div>
          <h1>Drone<br />Sim</h1>
          <p class="mn-tag">Learn to fly FPV one stick at a time, then go wherever you like.</p>
          <div class="mn-list">${menuButtons([
            { id: 'school', label: 'Flight School', hint: 'Start here' },
            { id: 'free', label: 'Free flight' },
            ...(withAccount ? [{ id: 'account', label: 'Account' }] : []),
            { id: 'intro', label: 'Controls' },
            { id: 'editor', label: 'Lesson editor' },
            { id: 'settings', label: 'Settings' },
          ])}</div>
        </div>
        <div class="mn-art">${mascotSvg('wave')}</div>
      </div>`;
    this.player = this.root.querySelector('.mn-player')!;
    this.root.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-item]')?.dataset.item;
      if (id) onPick(id as MainMenuItem);
    });
  }

  /** Shows who is flying: nickname, XP, guest or member. */
  setPlayer(nickname: string, xp: number, guest: boolean): void {
    this.player.hidden = !nickname;
    this.player.querySelector('[data-nick]')!.textContent = nickname;
    this.player.querySelector('[data-xp]')!.textContent = `${xp} XP${guest ? ' · guest' : ''}`;
  }
}

/** Esc during flight: the sim stops until Resume. */
export class PauseMenu extends Overlay {
  constructor(
    parent: HTMLElement,
    onPick: (id: 'resume' | 'respawn' | 'school' | 'settings' | 'menu') => void,
  ) {
    super(parent, 'mn-pause');
    this.root.innerHTML = `
      <div class="mn-card">
        <div class="mn-col">
          <h1>Holding<br />pattern.</h1>
          <p class="mn-tag">Take a breath. The drone will wait.</p>
          <div class="mn-list">${menuButtons([
            { id: 'resume', label: 'Resume', hint: 'Esc' },
            { id: 'respawn', label: 'Respawn' },
            { id: 'school', label: 'Flight School' },
            { id: 'settings', label: 'Settings' },
            { id: 'menu', label: 'Main menu' },
          ])}</div>
        </div>
        <div class="mn-art round">${mascotSvg('arms-crossed')}</div>
      </div>`;
    this.root.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-item]')?.dataset.item;
      if (id) onPick(id as 'resume' | 'respawn' | 'school' | 'settings' | 'menu');
    });
  }
}

type Choice<K extends keyof Settings> = { value: Settings[K]; label: string };

/** Settings card. Changes apply at once; Done closes it. */
export class SettingsPanel extends Overlay {
  private settings: Settings | null = null;

  constructor(
    parent: HTMLElement,
    private readonly onChange: (s: Settings) => void,
    onDone: () => void,
  ) {
    super(parent, 'mn-settings');
    this.root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-done]')) onDone();
      const opt = el.closest<HTMLElement>('[data-key]');
      if (opt && this.settings && opt.dataset.value !== undefined) {
        const key = opt.dataset.key as keyof Settings;
        (this.settings as Record<string, unknown>)[key] = opt.dataset.value;
        this.changed();
      }
    });
    this.root.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      if (!this.settings || input.type !== 'range') return;
      (this.settings as Record<string, unknown>)[input.name] = Number(input.value);
      this.root.querySelector(`[data-out="${input.name}"]`)!.textContent = `${input.value}°`;
      this.onChange(this.settings);
    });
  }

  open(s: Settings): void {
    this.settings = { ...s };
    this.render();
    this.visible = true;
  }

  private changed(): void {
    this.render();
    this.onChange(this.settings!);
  }

  private segment<K extends keyof Settings>(key: K, choices: Choice<K>[]): string {
    const cur = this.settings![key];
    return `<div class="st-seg">${choices
      .map(
        (c) =>
          `<button data-key="${key}" data-value="${String(c.value)}" class="${c.value === cur ? 'on' : ''}">${esc(c.label)}</button>`,
      )
      .join('')}</div>`;
  }

  private slider(key: 'fov' | 'uptilt', min: number, max: number): string {
    const v = this.settings![key];
    return `<div class="st-range"><input type="range" name="${key}" min="${min}" max="${max}" step="1" value="${v}" />
      <output data-out="${key}">${v}°</output></div>`;
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="mn-card st-card">
        <h1>Settings</h1>
        <div class="st-grid"><section><h2>Controls</h2>
          <label>Keyboard feel</label>${this.segment('keyboardFeel', [
            { value: 'normal', label: 'Normal' },
            { value: 'gentle', label: 'Gentle (beginner)' },
          ])}
          <label>Gamepad throttle</label>${this.segment('gamepadThrottle', [
            { value: 'centerZero', label: 'Centre = 0%' },
            { value: 'fullRange', label: 'Centre = 50%' },
          ])}
          <label>Rates</label>${this.segment('rates', [
            { value: 'cinematic', label: 'Cinematic' },
            { value: 'freestyle', label: 'Freestyle' },
            { value: 'racing', label: 'Racing' },
          ])}
        </section>
        <div><section><h2>Camera</h2>
          <label>Field of view</label>${this.slider('fov', 60, 130)}
          <label>Camera tilt</label>${this.slider('uptilt', 0, 50)}
        </section>
        <section><h2>Graphics</h2>
          <label>Quality</label>${this.segment('quality', [
            { value: 'high', label: 'High' },
            { value: 'low', label: 'Low (faster)' },
          ])}
        </section></div></div>
        <button class="mn-btn primary st-done" data-done><span class="mn-label">Done</span><i>↗</i></button>
      </div>`;
  }
}

export interface IntroLine {
  text: string;
  keys?: string[];
}

/** First-visit intro: the instructor explains the controls, one line per click. */
export class Intro extends Overlay {
  private lines: IntroLine[] = [];
  private index = 0;
  private onDone: () => void = () => {};

  constructor(parent: HTMLElement) {
    super(parent, 'mn-intro');
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-skip]')) this.finish();
      else if ((e.target as HTMLElement).closest('.in-bubble')) this.next();
    });
    window.addEventListener('keydown', (e) => {
      if (this.visible && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
        e.preventDefault();
        this.next();
      }
    });
  }

  play(lines: IntroLine[], onDone: () => void): void {
    this.lines = lines;
    this.index = 0;
    this.onDone = onDone;
    this.visible = true;
    this.render();
  }

  private next(): void {
    if (this.index + 1 < this.lines.length) {
      this.index++;
      this.render();
    } else {
      this.finish();
    }
  }

  private finish(): void {
    this.visible = false;
    this.onDone();
  }

  private render(): void {
    const line = this.lines[this.index]!;
    const keys = line.keys?.map((k) => `<kbd>${esc(k)}</kbd>`).join('') ?? '';
    const last = this.index === this.lines.length - 1;
    this.root.innerHTML = `
      <button class="in-skip" data-skip>Skip intro</button>
      <div class="in-mascot">${mascotSvg(this.index === 0 ? 'wave' : last ? 'point' : 'think')}</div>
      <div class="in-bubble">
        <p>${esc(line.text)}</p>
        ${keys ? `<div class="in-keys">${keys}</div>` : ''}
        <div class="in-continue"><span>Click</span> or Enter ${last ? 'to finish' : 'to continue'} →
          <b>${this.index + 1} / ${this.lines.length}</b></div>
      </div>`;
  }
}
