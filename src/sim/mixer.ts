/**
 * Quad-X mixer. Motor order and positions (nose points to -z):
 *   0 front right (+x, -z)   1 front left (-x, -z)
 *   2 rear right  (+x, +z)   3 rear left  (-x, +z)
 * roll > 0 rolls right, pitch > 0 noses up, yaw > 0 yaws right. All commands are fractions of motor range.
 */
export const MOTOR_X = [1, -1, 1, -1] as const;
export const MOTOR_Z = [-1, -1, 1, 1] as const;
/** Prop spin direction; the yaw reaction torque is opposite to it. */
export const MOTOR_SPIN = [-1, 1, 1, -1] as const;

const ROLL = [-1, 1, -1, 1] as const;
const PITCH = [1, 1, -1, -1] as const;
const YAW = [-1, 1, 1, -1] as const;

/** Writes four motor commands in 0..1 into `out`. */
export function mixQuadX(
  throttle: number,
  roll: number,
  pitch: number,
  yaw: number,
  airmode: boolean,
  out: number[],
): void {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 4; i++) {
    const c = ROLL[i]! * roll + PITCH[i]! * pitch + YAW[i]! * yaw;
    out[i] = c;
    if (c < lo) lo = c;
    if (c > hi) hi = c;
  }
  const range = hi - lo;
  if (range > 1) {
    // Corrections alone need more than the full motor range: shrink them to fit
    for (let i = 0; i < 4; i++) out[i]! /= range;
    lo /= range;
    hi /= range;
  }
  // Airmode shifts throttle so every motor stays in range; without it, motors simply clip
  const t = airmode ? Math.min(Math.max(throttle, -lo), 1 - hi) : throttle;
  for (let i = 0; i < 4; i++) out[i] = Math.min(1, Math.max(0, t + out[i]!));
}
