import { KalmanState, DetectionResult, SimulationConfig, KalmanConfig } from '../types';

// Coordinate frame: The state vector x = [az, azVel, el, elVel] represents
// ABSOLUTE target angles in world frame (degrees and deg/s).
// The measurement z = [measuredAz, measuredEl] must also be absolute.
// H maps absolute state to absolute measurement: z = H*x + noise.
// The orchestrator converts relative detector output to absolute before
// calling kalmanUpdate.

export function createInitialKalmanState(config?: KalmanConfig): KalmanState {
  const p = config?.initialCovarianceP ?? 100;
  return {
    x: [0, 0, 0, 0],
    P: [
      [p, 0, 0, 0],
      [0, p, 0, 0],
      [0, 0, p, 0],
      [0, 0, 0, p],
    ],
    initialized: false,
    lastUpdateTime: 0,
  };
}

function matMul4x4(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function matMul4x1(A: number[][], B: number[]): number[] {
  const result = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      sum += A[i][k] * B[k];
    }
    result[i] = sum;
  }
  return result;
}

function matTranspose2x4(A: number[][]): number[][] {
  const result: number[][] = [[0, 0], [0, 0], [0, 0], [0, 0]];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      result[i][j] = A[j][i];
    }
  }
  return result;
}

function matMul2x4_4x4(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function matMul2x4_4x1(A: number[][], B: number[]): number[] {
  const result = [0, 0];
  for (let i = 0; i < 2; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      sum += A[i][k] * B[k];
    }
    result[i] = sum;
  }
  return result;
}

function matMul2x2(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [[0, 0], [0, 0]];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      let sum = 0;
      for (let k = 0; k < 2; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function matAdd4x4(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result[i][j] = A[i][j] + B[i][j];
    }
  }
  return result;
}

function matSub2x2(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [[0, 0], [0, 0]];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      result[i][j] = A[i][j] - B[i][j];
    }
  }
  return result;
}

function inv2x2(A: number[][]): number[][] {
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  if (Math.abs(det) < 1e-10) {
    return [[0, 0], [0, 0]];
  }
  const invDet = 1.0 / det;
  return [
    [A[1][1] * invDet, -A[0][1] * invDet],
    [-A[1][0] * invDet, A[0][0] * invDet],
  ];
}

function matMul4x2_2x2(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [[0, 0], [0, 0], [0, 0], [0, 0]];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      let sum = 0;
      for (let k = 0; k < 2; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function matMul2x2_4x2(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 2; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function matMul4x2_4x2(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [[0, 0], [0, 0], [0, 0], [0, 0]];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function matMul2x4_4x2(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [[0, 0], [0, 0]];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function matMul4x2_4x1(A: number[][], B: number[]): number[] {
  const result = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    let sum = 0;
    for (let k = 0; k < 2; k++) {
      sum += A[i][k] * B[k];
    }
    result[i] = sum;
  }
  return result;
}

function matMul4x2_2x4(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 2; k++) {
        sum += A[i][k] * B[k][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

export function kalmanPredict(
  state: KalmanState,
  dt: number,
  config: SimulationConfig,
  kalmanConfig?: KalmanConfig
): KalmanState {
  const intensity = config.disturbances.intensity / 100;
  const qScale = kalmanConfig?.processNoiseQScale ?? 1.0;

  const F: number[][] = [
    [1, dt, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, dt],
    [0, 0, 0, 1],
  ];

  const q = (0.5 + intensity * 2.0) * qScale;
  const Q: number[][] = [
    [dt * dt * dt * q / 3, dt * dt * q / 2, 0, 0],
    [dt * dt * q / 2, dt * q, 0, 0],
    [0, 0, dt * dt * dt * q / 3, dt * dt * q / 2],
    [0, 0, dt * dt * q / 2, dt * q],
  ];

  const newX = matMul4x1(F, state.x);
  const FP = matMul4x4(F, state.P);
  const Ft = [
    [F[0][0], F[1][0], F[2][0], F[3][0]],
    [F[0][1], F[1][1], F[2][1], F[3][1]],
    [F[0][2], F[1][2], F[2][2], F[3][2]],
    [F[0][3], F[1][3], F[2][3], F[3][3]],
  ];
  const newP = matAdd4x4(matMul4x4(FP, Ft), Q);

  return {
    ...state,
    x: newX,
    P: newP,
    lastUpdateTime: state.lastUpdateTime + dt,
  };
}

export function kalmanUpdate(
  state: KalmanState,
  measurement: DetectionResult,
  config: SimulationConfig,
  kalmanConfig?: KalmanConfig
): KalmanState {
  if (!measurement.detected) return state;

  const H: number[][] = [
    [1, 0, 0, 0],
    [0, 0, 1, 0],
  ];

  const confidenceFactor = Math.max(0.1, measurement.confidence / 100);
  const rBase = kalmanConfig?.measurementNoiseRBase ?? 0.5;
  const baseNoise = rBase + (1 - confidenceFactor) * 5.0;
  const R: number[][] = [
    [baseNoise, 0],
    [0, baseNoise],
  ];

  const z = [measurement.measuredAz, measurement.measuredEl];

  const Hx = matMul2x4_4x1(H, state.x);
  const y = [z[0] - Hx[0], z[1] - Hx[1]];

  const PHt = matMul4x2_4x2(state.P, matTranspose2x4(H));
  const HPHt = matMul2x4_4x2(H, PHt);
  const S = matAdd2x2(HPHt, R);
  const Sinv = inv2x2(S);
  const K = matMul4x2_2x2(PHt, Sinv);

  const Ky = matMul4x2_4x1(K, y);
  const newX = [
    state.x[0] + Ky[0],
    state.x[1] + Ky[1],
    state.x[2] + Ky[2],
    state.x[3] + Ky[3],
  ];

  const KH = matMul4x2_2x4(K, H);
  const I4 = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const IKH = [
    [I4[0][0] - KH[0][0], I4[0][1] - KH[0][1], I4[0][2] - KH[0][2], I4[0][3] - KH[0][3]],
    [I4[1][0] - KH[1][0], I4[1][1] - KH[1][1], I4[1][2] - KH[1][2], I4[1][3] - KH[1][3]],
    [I4[2][0] - KH[2][0], I4[2][1] - KH[2][1], I4[2][2] - KH[2][2], I4[2][3] - KH[2][3]],
    [I4[3][0] - KH[3][0], I4[3][1] - KH[3][1], I4[3][2] - KH[3][2], I4[3][3] - KH[3][3]],
  ];
  const newP = matMul4x4(IKH, state.P);

  return {
    ...state,
    x: newX,
    P: newP,
    initialized: true,
    lastUpdateTime: state.lastUpdateTime,
  };
}

function matAdd2x2(A: number[][], B: number[][]): number[][] {
  return [
    [A[0][0] + B[0][0], A[0][1] + B[0][1]],
    [A[1][0] + B[1][0], A[1][1] + B[1][1]],
  ];
}

function matMul2x1(A: number[][], B: number[]): number[] {
  return [
    A[0][0] * B[0] + A[0][1] * B[1],
    A[1][0] * B[0] + A[1][1] * B[1],
  ];
}

export function kalmanGetEstimate(state: KalmanState): { az: number; el: number; azVel: number; elVel: number } {
  return {
    az: state.x[0],
    el: state.x[2],
    azVel: state.x[1],
    elVel: state.x[3],
  };
}
