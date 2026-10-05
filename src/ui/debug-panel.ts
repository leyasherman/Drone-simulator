import './debug-panel.css';
import type { Sticks } from '../input/types';

export interface DebugInfo {
  sticks: Sticks;
  source: string;
  armed: boolean;
  lines: string[];
}

const CHANNELS = [
  { key: 'throttle', label: 'THR', centred: false },
  { key: 'yaw', label: 'YAW', centred: true },
  { key: 'pitch', label: 'PIT', centred: true },
  { key: 'roll', label: 'ROL', centred: true },
] as const;

/** Developer panel: channel bars and status text. Hidden by default; F3 toggles it. */
export class DebugPanel {
  private readonly root = document.createElement('div');
  private readonly fills: HTMLElement[] = [];
  private readonly values: HTMLElement[] = [];
  private readonly source = document.createElement('div');
  private readonly armed = document.createElement('div');
  private readonly info = document.createElement('div');

  constructor(parent: HTMLElement) {
    this.root.className = 'debug-panel';
    this.root.hidden = true;
    this.source.className = 'debug-source';
    this.armed.className = 'debug-armed';
    this.root.append(this.source, this.armed);
    for (const ch of CHANNELS) {
      const row = document.createElement('div');
      row.className = 'debug-row';
      const label = document.createElement('span');
      label.textContent = ch.label;
      const track = document.createElement('div');
      track.className = ch.centred ? 'debug-track centred' : 'debug-track';
      const fill = document.createElement('div');
      fill.className = 'debug-fill';
      track.append(fill);
      const value = document.createElement('span');
      value.className = 'debug-value';
      row.append(label, track, value);
      this.root.append(row);
      this.fills.push(fill);
      this.values.push(value);
    }
    this.info.className = 'debug-info';
    this.root.append(this.info);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }

  render(d: DebugInfo): void {
    if (this.root.hidden) return;
    this.source.textContent = d.source;
    this.armed.textContent = d.armed ? 'ARMED' : 'DISARMED';
    this.armed.classList.toggle('on', d.armed);
    CHANNELS.forEach((ch, i) => {
      const v = d.sticks[ch.key];
      const fill = this.fills[i]!;
      if (ch.centred) {
        const w = Math.abs(v) * 50;
        fill.style.left = `${v >= 0 ? 50 : 50 - w}%`;
        fill.style.width = `${w}%`;
      } else {
        fill.style.left = '0';
        fill.style.width = `${v * 100}%`;
      }
      this.values[i]!.textContent = `${v >= 0 ? ' ' : ''}${v.toFixed(2)}`;
    });
    this.info.innerHTML = d.lines.map((l) => `<div>${l}</div>`).join('');
  }
}
