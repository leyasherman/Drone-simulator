import { Vector3 } from 'three';

/** Physical parameters of one drone type. Starting values come from the research; tune freely. */
export interface DroneProfile {
  id: string;
  name: string;
  /** kg */
  mass: number;
  /** Collision box, full size in metres (x width, y height, z length). */
  size: Vector3;
  /** Max total thrust divided by weight. */
  thrustToWeight: number;
  /** Motor spin-up time constant, ms. Braking is faster (MOTOR_BRAKING_RATIO). */
  motorResponseMs: number;
  /** Motor offset from centre along x and z, m (Quad-X, symmetric). */
  armX: number;
  armZ: number;
  /** Prop radius, m. */
  propRadius: number;
  /** Yaw reaction torque per newton of thrust, m. */
  yawArm: number;
  /** Quadratic drag coefficient along the forward axis, kg/m. */
  dragCoefficient: number;
  /** Extra horizontal drag from spinning props, scaled by mean motor output. */
  rotorDrag: number;
  airmode: boolean;
  /** Motor floor while armed with airmode, 0..1. */
  idleThrottle: number;
  throttleExpo: number;
  throttleMid: number;
}

export const FREESTYLE_5: DroneProfile = {
  id: 'freestyle',
  name: 'Freestyle 5"',
  mass: 0.65,
  size: new Vector3(0.302, 0.07, 0.302),
  thrustToWeight: 8,
  motorResponseMs: 18,
  armX: 0.087,
  armZ: 0.087,
  propRadius: 0.0635,
  yawArm: 0.016,
  dragCoefficient: 0.013,
  rotorDrag: 0.045,
  airmode: true,
  idleThrottle: 0.09,
  throttleExpo: 0.1,
  throttleMid: 0,
};
