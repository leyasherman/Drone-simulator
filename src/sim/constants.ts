/** Physics step: 240 Hz. */
export const PHYSICS_DT = 1 / 240;
/** Most physics steps per rendered frame. 16 × 1/240 s = 1/15 s, so physics keeps real time down to 15 fps. */
export const MAX_STEPS_PER_FRAME = 16;
/** A frame longer than this (tab hidden, stall) drops the time instead of catching up. */
export const MAX_FRAME_GAP = 0.25;
/** m/s² */
export const GRAVITY = 9.81;

/** Motors slow down faster than they spin up: braking tau = spin-up tau × this. */
export const MOTOR_BRAKING_RATIO = 0.65;
/** Drag multipliers relative to the forward axis. A flat quad falling has far more drag than one flying edge-on. */
export const LATERAL_DRAG_MULTIPLIER = 1.15;
export const VERTICAL_DRAG_MULTIPLIER = 4;
/** 2 × air density at sea level, kg/m³ (for prop induced velocity). */
export const AIR_DENSITY_X2 = 2.45;
/** Thrust lost per unit of axial inflow relative to induced velocity, and the factor's limits. */
export const INFLOW_LOSS = 0.18;
export const INFLOW_MIN = 0.55;
export const INFLOW_MAX = 1.1;
