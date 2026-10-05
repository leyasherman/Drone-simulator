import './radio-overlay.css';
import type { Sticks } from '../input/types';

/** Gimbal well centres and travel in SVG units. */
const LEFT = { x: 70, y: 92 };
const RIGHT = { x: 170, y: 92 };
const TRAVEL = 24;

const SVG = `
<svg viewBox="0 0 240 170" aria-hidden="true">
  <g class="ro-line">
    <path d="M36 40 L30 8 M204 40 L210 8" />
    <rect x="10" y="36" width="220" height="124" rx="34" />
    <rect x="100" y="48" width="40" height="26" rx="5" />
    <rect x="${LEFT.x - 34}" y="${LEFT.y - 34}" width="68" height="68" rx="16" />
    <rect x="${RIGHT.x - 34}" y="${RIGHT.y - 34}" width="68" height="68" rx="16" />
    <path class="ro-cross" d="M${LEFT.x - 26} ${LEFT.y} H${LEFT.x + 26} M${LEFT.x} ${LEFT.y - 26} V${LEFT.y + 26}
      M${RIGHT.x - 26} ${RIGHT.y} H${RIGHT.x + 26} M${RIGHT.x} ${RIGHT.y - 26} V${RIGHT.y + 26}" />
    <circle cx="104" cy="140" r="6" /><circle cx="136" cy="140" r="6" />
    <path d="M114 100 H126 M114 108 H126 M114 116 H126" />
  </g>
  <line class="ro-stem" data-stem="left" x1="${LEFT.x}" y1="${LEFT.y}" x2="${LEFT.x}" y2="${LEFT.y}" />
  <line class="ro-stem" data-stem="right" x1="${RIGHT.x}" y1="${RIGHT.y}" x2="${RIGHT.x}" y2="${RIGHT.y}" />
  <circle class="ro-dot" data-dot="left" cx="${LEFT.x}" cy="${LEFT.y}" r="7" />
  <circle class="ro-dot" data-dot="right" cx="${RIGHT.x}" cy="${RIGHT.y}" r="7" />
</svg>`;

/** Stick positions in SVG units for Mode 2: left = throttle (up) + yaw, right = pitch + roll. */
export function stickDots(s: Sticks): { lx: number; ly: number; rx: number; ry: number } {
  return {
    lx: LEFT.x + s.yaw * TRAVEL,
    ly: LEFT.y - (s.throttle * 2 - 1) * TRAVEL, // throttle 0 at the bottom, 1 at the top
    rx: RIGHT.x + s.roll * TRAVEL,
    ry: RIGHT.y + s.pitch * TRAVEL, // pitch > 0 is stick pulled back = down
  };
}

/** Outline of a radio with live stick dots. Shown in lessons and during playback. */
export class RadioOverlay {
  private readonly root = document.createElement('div');
  private readonly dots: SVGCircleElement[];
  private readonly stems: SVGLineElement[];

  constructor(parent: HTMLElement) {
    this.root.className = 'radio-overlay';
    this.root.innerHTML = SVG;
    this.root.hidden = true;
    this.dots = [...this.root.querySelectorAll<SVGCircleElement>('[data-dot]')];
    this.stems = [...this.root.querySelectorAll<SVGLineElement>('[data-stem]')];
    parent.append(this.root);
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }

  update(s: Sticks): void {
    if (this.root.hidden) return;
    const d = stickDots(s);
    const set = (i: number, x: number, y: number) => {
      this.dots[i]!.setAttribute('cx', x.toFixed(1));
      this.dots[i]!.setAttribute('cy', y.toFixed(1));
      this.stems[i]!.setAttribute('x2', x.toFixed(1));
      this.stems[i]!.setAttribute('y2', y.toFixed(1));
    };
    set(0, d.lx, d.ly);
    set(1, d.rx, d.ry);
  }
}
