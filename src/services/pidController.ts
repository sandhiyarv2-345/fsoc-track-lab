import { PidState, AppSettings } from '../types';

// Coordinate frame: Both setpoint and measurement are ABSOLUTE angles (degrees).
// setpoint = estimated/detected absolute target angle.
// measurement = current gimbal position (pan or tilt).
// error = setpoint - measurement (positive error means gimbal must move in +direction).

export function createInitialPidState(): PidState {
  return {
    integral: 0,
    prevError: 0,
    initialized: false,
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function computePid(
  state: PidState,
  setpoint: number,
  measurement: number,
  dt: number,
  kp: number,
  ki: number,
  kd: number,
  speedLimit: number,
  antiWindupLimit: number
): { output: number; newState: PidState } {
  if (dt <= 0 || dt > 0.5) {
    return { output: 0, newState: state };
  }

  const error = setpoint - measurement;

  let newIntegral = state.integral + error * dt;
  newIntegral = clamp(newIntegral, -antiWindupLimit, antiWindupLimit);

  let derivative = 0;
  if (state.initialized && dt > 0) {
    derivative = (error - state.prevError) / dt;
  }

  const pTerm = kp * error;
  const iTerm = ki * newIntegral;
  const dTerm = kd * derivative;

  let output = pTerm + iTerm + dTerm;
  output = clamp(output, -speedLimit, speedLimit);

  if (ki > 0 && Math.abs(output) >= speedLimit * 0.99) {
    newIntegral = state.integral;
  }

  return {
    output,
    newState: {
      integral: newIntegral,
      prevError: error,
      initialized: true,
    },
  };
}

export function resetPid(state: PidState): PidState {
  return {
    integral: 0,
    prevError: 0,
    initialized: false,
  };
}
