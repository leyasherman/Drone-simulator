/** Physics step: 240 Hz. */
export const PHYSICS_DT = 1 / 240;
/** Most physics steps per rendered frame. 16 × 1/240 s = 1/15 s, so physics keeps real time down to 15 fps. */
export const MAX_STEPS_PER_FRAME = 16;
/** A frame longer than this (tab hidden, stall) drops the time instead of catching up. */
export const MAX_FRAME_GAP = 0.25;
/** m/s² */
export const GRAVITY = 9.81;
