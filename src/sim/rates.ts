/** One axis of Betaflight "Actual" rates. Rates in °/s. */
export interface RateAxis {
  center: number;
  max: number;
  expo: number;
}

export interface Rates {
  roll: RateAxis;
  pitch: RateAxis;
  yaw: RateAxis;
}

/** Betaflight Actual rates: stick -1..1 → °/s. Center sets the slope at centre stick, max the rate at full stick. */
export function actualRate(stick: number, r: RateAxis): number {
  const x = Math.min(1, Math.max(-1, stick));
  const curve = Math.abs(x) * (x ** 5 * r.expo + x * (1 - r.expo));
  return x * r.center + Math.max(0, r.max - r.center) * curve;
}

export const RATE_PRESETS = {
  cinematic: {
    roll: { center: 65, max: 430, expo: 0.1 },
    pitch: { center: 60, max: 400, expo: 0.1 },
    yaw: { center: 60, max: 350, expo: 0.1 },
  },
  freestyle: {
    roll: { center: 108, max: 810, expo: 0.15 },
    pitch: { center: 100, max: 750, expo: 0.15 },
    yaw: { center: 90, max: 600, expo: 0.15 },
  },
  racing: {
    roll: { center: 150, max: 1030, expo: 0.05 },
    pitch: { center: 140, max: 950, expo: 0.05 },
    yaw: { center: 120, max: 800, expo: 0.05 },
  },
} satisfies Record<string, Rates>;

export type RatePresetId = keyof typeof RATE_PRESETS;
