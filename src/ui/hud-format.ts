/** Speed for the HUD: whole km/h, never "-0". */
export function formatSpeed(kmh: number): string {
  return String(Math.max(0, Math.round(kmh)));
}

/** Altitude for the HUD: metres with one decimal, clamped at 0, at most 9999.9. */
export function formatAltitude(m: number): string {
  return Math.min(9999.9, Math.max(0, m)).toFixed(1);
}
