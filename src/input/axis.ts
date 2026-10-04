/** Zeroes values inside the band and rescales the rest, so there is no jump at the band's edge. */
export function applyDeadband(v: number, band: number): number {
  const d = Math.min(Math.max(band, 0), 0.4);
  const m = Math.abs(v);
  return m <= d ? 0 : ((m - d) / (1 - d)) * Math.sign(v);
}

/** Calibration for one raw axis. Each side of the centre is scaled on its own. */
export interface AxisCalibration {
  min: number;
  center: number;
  max: number;
  invert: boolean;
}

/** Raw axis → -1..1 around its own centre, clamped, optionally inverted, with deadband. */
export function normalizeAxis(raw: number, c: AxisCalibration, deadband: number): number {
  const span = raw >= c.center ? c.max - c.center : c.center - c.min;
  let v = span > 1e-4 ? (raw - c.center) / span : 0;
  v = Math.min(1, Math.max(-1, v));
  if (c.invert) v = -v;
  return applyDeadband(v, deadband);
}
