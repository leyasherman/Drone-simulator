import type { ICONS } from '../game/lesson-schema';

export type LessonIcon = (typeof ICONS)[number];

/** A tiny top-down quad: four rotors on an X. Centred at (x, y). */
const quad = (x: number, y: number) => `
  <g transform="translate(${x} ${y})" class="li-quad">
    <path d="M-8 -8 L8 8 M8 -8 L-8 8" />
    <circle cx="-8" cy="-8" r="5" /><circle cx="8" cy="-8" r="5" /><circle cx="-8" cy="8" r="5" /><circle cx="8" cy="8" r="5" />
    <rect x="-3.5" y="-3.5" width="7" height="7" rx="2" class="li-core" />
  </g>`;

const arrow = (d: string) => `<path d="${d}" class="li-arrow" marker-end="url(#li-head)" />`;

/** Simple diagrams of the move each lesson teaches. Our own drawings. */
const BODY: Record<LessonIcon, string> = {
  takeoff: `${quad(50, 44)}<ellipse cx="50" cy="66" rx="18" ry="4" class="li-ground" />${arrow('M50 30 V12')}`,
  forward: `${quad(36, 40)}${arrow('M54 40 H86')}`,
  angle: `<g transform="rotate(-18 40 42)">${quad(40, 42)}</g>${arrow('M56 36 Q72 28 88 34')}`,
  line: `<path d="M50 70 V10" class="li-dash" />${quad(50, 40)}${arrow('M50 26 V8')}`,
  height: `<path d="M18 20 H86" class="li-dash" /><path d="M18 20 V60" class="li-dash" />${quad(40, 26)}${arrow('M58 26 H86')}`,
  climb: `${quad(32, 54)}<path d="M48 54 H62 Q70 54 70 46 V28 Q70 22 78 22 H88" class="li-arrow" marker-end="url(#li-head)" />`,
  run: `${quad(28, 54)}<path d="M28 40 V30 Q28 22 36 22 H70" class="li-arrow" marker-end="url(#li-head)" /><rect x="72" y="14" width="10" height="16" rx="2" class="li-flag" />`,
  bank: `${quad(34, 50)}<path d="M50 50 Q78 50 80 24" class="li-arrow" marker-end="url(#li-head)" />`,
};

export function lessonIconSvg(icon: LessonIcon): string {
  return `
<svg viewBox="0 0 100 80" class="lesson-icon" aria-hidden="true">
  <defs><marker id="li-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 Z" class="li-head" /></marker></defs>
  ${BODY[icon]}
</svg>`;
}
