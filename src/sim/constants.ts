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

// Rate controller (starting values from the research)
/** Time constant for closing rate error, s. */
export const RATE_TAU = 0.02;
export const RATE_D_GAIN = 0.35;
export const RATE_D_GAIN_YAW = 0.5;
/** Low-pass on the gyro derivative, Hz. */
export const RATE_D_FILTER_HZ = 80;
export const RATE_FF_GAIN = 0.35;
/** Smoothing of stick speed for feedforward, s. */
export const RATE_FF_TAU = 0.012;
/** Integral time, s. */
export const RATE_I_TIME = 0.35;
/** The integral may use at most this share of the torque limit. */
export const RATE_I_AUTHORITY = 0.3;
export const RATE_I_DEADBAND_DEG = 1.5;
/** The integral leaks away with this time constant, s. */
export const RATE_I_LEAK_TIME = 1.75;
/** The integral only grows while setpoint and gyro are below this rate (stops bounce-back after flips), °/s. */
export const RATE_I_RELAX_DEG = 200;
/** ...and within this band of each other, °/s. */
export const RATE_I_TRACK_BAND_DEG = 30;
/** Mean motor command is floored at this when estimating control authority. */
export const MIN_AUTHORITY_CMD = 0.2;
/** Requested torque is capped at this share of what full thrust across the arm could give. */
export const TORQUE_LIMIT_SHARE = 0.5;
