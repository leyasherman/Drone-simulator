/**
 * Betaflight 4.x throttle curve. `mid` is the pivot, `expo` flattens the curve around it.
 * Input and output are 0..1.
 */
export function throttleCurve(t: number, expo: number, mid: number): number {
  const d = t - mid;
  const span = d > 0 ? 1 - mid : mid;
  if (span === 0) return t;
  const u = d / span;
  return mid + d * (1 - expo + expo * u * u);
}
