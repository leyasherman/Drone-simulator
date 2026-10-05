import './hud.css';
import { formatAltitude, formatSpeed } from './hud-format';

/** Horizon marker: a ring with wings, fixed at the screen centre (it shows where the camera points). */
const MARKER_SVG = `
<svg viewBox="0 0 80 20" width="80" height="20" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M4 10 H28 M52 10 H76 M28 6 V14 M52 6 V14" />
    <circle cx="40" cy="10" r="7" />
    <circle cx="40" cy="10" r="2.5" />
  </g>
</svg>`;

/** Flight HUD: speed and altitude top right, horizon marker in the centre. HTML over the canvas. */
export class Hud {
  private readonly root = document.createElement('div');
  private readonly speed: HTMLElement;
  private readonly altitude: HTMLElement;
  private readonly marker: HTMLElement;
  private lastSpeed = '';
  private lastAltitude = '';

  constructor(parent: HTMLElement) {
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-readouts">
        <div class="hud-readout">
          <div class="hud-label">Speed</div>
          <div class="hud-value"><span data-speed>0</span><span class="hud-unit">km/h</span></div>
        </div>
        <div class="hud-divider"></div>
        <div class="hud-readout">
          <div class="hud-label">Altitude</div>
          <div class="hud-value"><span data-altitude>0.0</span><span class="hud-unit">m</span></div>
        </div>
      </div>
      <div class="hud-marker">${MARKER_SVG}</div>`;
    this.speed = this.root.querySelector('[data-speed]')!;
    this.altitude = this.root.querySelector('[data-altitude]')!;
    this.marker = this.root.querySelector('.hud-marker')!;
    parent.append(this.root);
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }

  /** The horizon marker only makes sense from the drone's own camera. */
  set markerVisible(v: boolean) {
    this.marker.hidden = !v;
  }

  /** Writes the DOM only when the shown text changes. */
  update(speedKmh: number, altitudeM: number): void {
    const s = formatSpeed(speedKmh);
    const a = formatAltitude(altitudeM);
    if (s !== this.lastSpeed) this.speed.textContent = this.lastSpeed = s;
    if (a !== this.lastAltitude) this.altitude.textContent = this.lastAltitude = a;
  }
}
