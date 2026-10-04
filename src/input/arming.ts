/** Arming is refused unless throttle is at or below this. */
export const ARM_THROTTLE_LIMIT = 0.15;

export type ArmResult = 'armed' | 'disarmed' | 'blocked-throttle';

/** Handles an arm toggle. Disarming is always allowed; arming needs low throttle. */
export function toggleArm(armed: boolean, throttle: number): ArmResult {
  if (armed) return 'disarmed';
  return throttle <= ARM_THROTTLE_LIMIT ? 'armed' : 'blocked-throttle';
}
