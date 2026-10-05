import './mascot.css';
import type { POSES } from '../game/lesson-schema';

export type Pose = (typeof POSES)[number];

/**
 * Placeholder instructor (our own character, not the original's): a round flight-school bot with a wide visor,
 * a headset and a tiny prop on top. Final art can replace this SVG later (D-004).
 */
const ARMS: Record<Pose, string> = {
  // right arm raised and waving, left on hip
  wave: `<path d="M64 150 Q40 175 52 205" /><path d="M136 150 Q168 120 172 82" /><circle cx="173" cy="76" r="11" class="m-hand"/>`,
  // hand at the chin, other arm across the body
  think: `<path d="M64 150 Q52 185 90 196" /><path d="M136 150 Q150 135 120 118" /><circle cx="116" cy="114" r="10" class="m-hand"/>`,
  // pointing forward-up toward the bubble
  point: `<path d="M64 150 Q40 175 52 205" /><path d="M136 150 Q175 140 196 120" /><circle cx="200" cy="117" r="10" class="m-hand"/>`,
  'arms-crossed': `<path d="M64 150 Q70 190 130 182" /><path d="M136 150 Q130 190 70 182" />`,
};

export function mascotSvg(pose: Pose): string {
  return `
<svg viewBox="0 0 220 360" class="mascot" aria-hidden="true">
  <g class="m-prop"><rect x="78" y="10" width="64" height="7" rx="3.5"/><rect x="106" y="14" width="8" height="18" rx="3"/></g>
  <ellipse cx="110" cy="80" rx="52" ry="50" class="m-head"/>
  <rect x="70" y="62" width="80" height="34" rx="17" class="m-visor"/>
  <circle cx="95" cy="79" r="6" class="m-eye"/><circle cx="125" cy="79" r="6" class="m-eye"/>
  <path d="M58 70 Q56 104 82 112" class="m-headset"/><circle cx="58" cy="72" r="9" class="m-ear"/><circle cx="162" cy="72" r="9" class="m-ear"/>
  <circle cx="84" cy="113" r="4" class="m-mic"/>
  <path d="M60 140 Q110 120 160 140 L168 250 Q110 268 52 250 Z" class="m-body"/>
  <path d="M86 132 L110 160 L134 132" class="m-collar"/>
  <rect x="96" y="176" width="28" height="20" rx="5" class="m-badge"/>
  <g class="m-arms">${ARMS[pose]}</g>
  <path d="M82 258 L78 330 M138 258 L142 330" class="m-legs"/>
  <rect x="58" y="326" width="40" height="16" rx="8" class="m-shoe"/><rect x="122" y="326" width="40" height="16" rx="8" class="m-shoe"/>
</svg>`;
}
