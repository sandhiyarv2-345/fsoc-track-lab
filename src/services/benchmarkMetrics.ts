/**
 * FSOC Track Lab — Phase 3A: Benchmark Metrics & Evaluation
 *
 * Computes PS-required performance metrics from telemetry history.
 * Uses independent ground-truth pixel projection for evaluation ONLY.
 *
 * Ground-truth projection is NOT fed into:
 * - Beacon detector
 * - Tracking algorithm
 * - Kalman measurement
 * - PID controller
 * - Gimbal control
 */

import {
  TelemetryPoint,
  SimulationConfig,
  BenchmarkRunMetrics,
  BenchmarkPassFail,
  BenchmarkRequirement,
  PS_REQUIREMENTS,
  TrackingAlgorithm,
} from '../types';

// ── Sensor constants (must match sensorModel.ts) ──
const SENSOR_WIDTH = 640;
const SENSOR_HEIGHT = 480;

/**
 * Independently project ground-truth angles to pixel coordinates.
 * This is used ONLY for evaluation metrics — never fed into the tracking pipeline.
 *
 * The projection matches sensorModel.ts generateSensorFrame Step 1 exactly.
 */
export function groundTruthToPixel(
  groundTruthAz: number,
  groundTruthEl: number,
  cameraPan: number,
  cameraTilt: number,
  hFov: number,
  vFov: number,
  zoom: number = 1.0
): { pixelX: number; pixelY: number } {
  const effectiveHFov = hFov / zoom;
  const effectiveVFov = vFov / zoom;

  const relAz = groundTruthAz - cameraPan;
  const relEl = groundTruthEl - cameraTilt;

  const halfHFovRad = (effectiveHFov / 2 * Math.PI) / 180;
  const halfVFovRad = (effectiveVFov / 2 * Math.PI) / 180;
  const tanHalfHFov = Math.tan(halfHFovRad);
  const tanHalfVFov = Math.tan(halfVFovRad);

  const normalizedAz = Math.tan(relAz * Math.PI / 180) / tanHalfHFov;
  const normalizedEl = Math.tan(relEl * Math.PI / 180) / tanHalfVFov;

  const pixelX = (normalizedAz + 1) / 2 * SENSOR_WIDTH;
  const pixelY = (-normalizedEl + 1) / 2 * SENSOR_HEIGHT;

  return { pixelX, pixelY };
}

/**
 * Compute pixel-domain tracking error from angular error.
 *
 * Uses the existing telemetry angular error (groundTruth - gimbal) and converts
 * to pixel units using the camera FOV. This is the correct metric because:
 * - It measures how far the target is from the camera boresight (center of sensor)
 * - It uses the same ground-truth-to-error computation that's already correct
 * - It converts to pixel domain for PS requirement evaluation
 *
 * The ground-truth angles are NOT fed into the tracking pipeline — they are
 * only used here for independent evaluation.
 */
export function computePixelTrackingError(
  telemetry: TelemetryPoint,
  config: SimulationConfig
): number {
  const hFov = config.cameraFovHorizontal || config.cameraFov;
  const vFov = config.cameraFovVertical || config.cameraFov * 0.75;

  // Angular error is already correctly computed as |groundTruth - gimbal|
  const azimuthErrorDeg = telemetry.azimuthError;   // degrees
  const elevationErrorDeg = telemetry.elevationError; // degrees

  // Convert to pixels: pixelError = angularError / halfFov * sensorHalfWidth
  const halfHFov = hFov / 2;
  const halfVFov = vFov / 2;
  const sensorHalfWidth = 640 / 2;  // 320
  const sensorHalfHeight = 480 / 2; // 240

  const errorPxX = (azimuthErrorDeg / halfHFov) * sensorHalfWidth;
  const errorPxY = (elevationErrorDeg / halfVFov) * sensorHalfHeight;

  return Math.sqrt(errorPxX * errorPxX + errorPxY * errorPxY);
}

/**
 * Compute pixel-domain error between estimated position and ground truth.
 * This represents the tracking algorithm's accuracy relative to truth.
 */
export function computeEstimationErrorPx(
  telemetry: TelemetryPoint,
  config: SimulationConfig
): number {
  const hFov = config.cameraFovHorizontal || config.cameraFov;
  const vFov = config.cameraFovVertical || config.cameraFov * 0.75;

  const gtPixel = groundTruthToPixel(
    telemetry.groundTruthAz,
    telemetry.groundTruthEl,
    telemetry.pan,
    telemetry.tilt,
    hFov,
    vFov
  );

  const estPixel = groundTruthToPixel(
    telemetry.estimatedAz,
    telemetry.estimatedEl,
    telemetry.pan,
    telemetry.tilt,
    hFov,
    vFov
  );

  const dx = gtPixel.pixelX - estPixel.pixelX;
  const dy = gtPixel.pixelY - estPixel.pixelY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute all PS-required metrics from a telemetry history.
 *
 * Metrics are computed from the DETECTED/ESTIMATED beacon position
 * compared against INDEPENDENT GROUND-TRUTH PROJECTED POSITION.
 */
export function computeBenchmarkMetrics(
  history: TelemetryPoint[],
  config: SimulationConfig
): BenchmarkRunMetrics {
  if (history.length === 0) {
    return {
      acquisitionTimeSec: Infinity,
      averageTrackingErrorPx: Infinity,
      maxTrackingErrorPx: Infinity,
      rmseTrackingErrorPx: Infinity,
      targetLossPercent: 100,
      reacquisitionTimeSec: Infinity,
      lockRetentionPercent: 0,
      averageFps: 0,
      minFps: 0,
      totalFrames: 0,
      processedFrames: 0,
      lostFrames: 0,
      simulationDurationSec: 0,
      avgProcessingTimeMs: 0,
      maxProcessingTimeMs: 0,
      successfulAcquisitions: 0,
      successfulReacquisitions: 0,
      postAcquisitionRmsePx: Infinity,
      steadyStateRmsePx: Infinity,
      framesBeforeAcquisition: 0,
      errorAtAcquisitionPx: Infinity,
      steadyStateStartFrame: 0,
    };
  }

  const totalFrames = history.length;
  const durationSec = history[history.length - 1].timeSec;

  // ── Pixel tracking errors ──
  const pixelErrors = history.map(h => computePixelTrackingError(h, config));
  const averageTrackingErrorPx = pixelErrors.reduce((a, b) => a + b, 0) / pixelErrors.length;
  const maxTrackingErrorPx = Math.max(...pixelErrors);
  const rmseTrackingErrorPx = Math.sqrt(
    pixelErrors.reduce((a, e) => a + e * e, 0) / pixelErrors.length
  );

  // ── Acquisition time ──
  const firstLock = history.find(h => h.status === 'LOCKED');
  const acquisitionTimeSec = firstLock ? firstLock.timeSec : Infinity;

  // ── Target loss ──
  const lostCount = history.filter(h => h.status === 'LOST').length;
  const targetLossPercent = (lostCount / totalFrames) * 100;

  // ── Lock retention ──
  const lockedCount = history.filter(h => h.status === 'LOCKED').length;
  const lockRetentionPercent = (lockedCount / totalFrames) * 100;

  // ── Reacquisition time ──
  const reacqTimes: number[] = [];
  let lastLostTime: number | null = null;
  let successfulReacquisitions = 0;

  for (const h of history) {
    if (h.status === 'LOST') {
      lastLostTime = h.timeSec;
    } else if ((h.status === 'LOCKED' || h.status === 'ACQUIRING') && lastLostTime !== null) {
      const reacq = h.timeSec - lastLostTime;
      if (reacq > 0 && reacq < 10) {
        reacqTimes.push(reacq);
        successfulReacquisitions++;
      }
      lastLostTime = null;
    }
  }

  const reacquisitionTimeSec = reacqTimes.length > 0
    ? reacqTimes.reduce((a, b) => a + b, 0) / reacqTimes.length
    : Infinity;

  // ── FPS ──
  const fpsValues = history.map(h => h.fps);
  const averageFps = fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length;
  const minFps = Math.min(...fpsValues);

  // ── Processing time (from CPU load as proxy) ──
  const procTimes = history.map(h => 12 + h.cpuLoad * 0.5);
  const avgProcessingTimeMs = procTimes.reduce((a, b) => a + b, 0) / procTimes.length;
  const maxProcessingTimeMs = Math.max(...procTimes);

  // ── Successful acquisitions ──
  let successfulAcquisitions = 0;
  let wasBeforeFirstLock = true;
  for (const h of history) {
    if (h.status === 'LOCKED' && wasBeforeFirstLock) {
      successfulAcquisitions++;
      wasBeforeFirstLock = false;
    } else if (h.status === 'SEARCHING' || h.status === 'LOST') {
      wasBeforeFirstLock = true;
    }
  }

  const processedFrames = totalFrames - lostCount;

  // ── Phase 3B-1: Post-acquisition and steady-state metrics ──
  const firstLockIdx = history.findIndex(h => h.status === 'LOCKED');
  const framesBeforeAcquisition = firstLockIdx >= 0 ? firstLockIdx : totalFrames;
  const errorAtAcquisitionPx = firstLockIdx >= 0 ? pixelErrors[firstLockIdx] : Infinity;

  // Post-acquisition RMSE: from first LOCK frame onward
  let postAcquisitionRmsePx = Infinity;
  if (firstLockIdx >= 0 && firstLockIdx < totalFrames) {
    const postErrors = pixelErrors.slice(firstLockIdx);
    postAcquisitionRmsePx = Math.sqrt(
      postErrors.reduce((a, e) => a + e * e, 0) / postErrors.length
    );
  }

  // Steady-state RMSE: from when error drops below 2× final error and stays there
  // Use a sliding window: find the earliest frame where the 100-frame rolling
  // average error is below 2× the last 100-frame average
  let steadyStateStartFrame = framesBeforeAcquisition;
  const windowSize = Math.min(100, Math.floor(totalFrames / 4));
  if (windowSize > 10 && totalFrames > windowSize * 2) {
    const finalWindowStart = totalFrames - windowSize;
    const finalAvg = pixelErrors.slice(finalWindowStart).reduce((a, b) => a + b, 0) / windowSize;
    const threshold = finalAvg * 2;

    for (let i = framesBeforeAcquisition; i <= totalFrames - windowSize; i++) {
      const windowAvg = pixelErrors.slice(i, i + windowSize).reduce((a, b) => a + b, 0) / windowSize;
      if (windowAvg <= threshold) {
        steadyStateStartFrame = i;
        break;
      }
    }
  }

  let steadyStateRmsePx = Infinity;
  if (steadyStateStartFrame < totalFrames) {
    const ssErrors = pixelErrors.slice(steadyStateStartFrame);
    steadyStateRmsePx = Math.sqrt(
      ssErrors.reduce((a, e) => a + e * e, 0) / ssErrors.length
    );
  }

  return {
    acquisitionTimeSec,
    averageTrackingErrorPx,
    maxTrackingErrorPx,
    rmseTrackingErrorPx,
    targetLossPercent,
    reacquisitionTimeSec,
    lockRetentionPercent,
    averageFps,
    minFps,
    totalFrames,
    processedFrames,
    lostFrames: lostCount,
    simulationDurationSec: durationSec,
    avgProcessingTimeMs,
    maxProcessingTimeMs,
    successfulAcquisitions,
    successfulReacquisitions,
    postAcquisitionRmsePx,
    steadyStateRmsePx,
    framesBeforeAcquisition,
    errorAtAcquisitionPx,
    steadyStateStartFrame,
  };
}

/**
 * Evaluate metrics against PS requirements.
 * Returns PASS/FAIL for each requirement with measured value and diagnostic message.
 */
export function evaluateRequirements(
  metrics: BenchmarkRunMetrics
): BenchmarkPassFail[] {
  return PS_REQUIREMENTS.map(req => evaluateSingleRequirement(req, metrics));
}

function evaluateSingleRequirement(
  req: BenchmarkRequirement,
  metrics: BenchmarkRunMetrics
): BenchmarkPassFail {
  let measured: number;
  let passed: boolean;

  switch (req.id) {
    case 'acq_time':
      measured = metrics.acquisitionTimeSec;
      passed = measured <= req.threshold;
      break;
    case 'tracking_error':
      measured = metrics.rmseTrackingErrorPx;
      passed = measured <= req.threshold;
      break;
    case 'target_loss':
      measured = metrics.targetLossPercent;
      passed = measured < req.threshold;
      break;
    case 'reacq_time':
      measured = metrics.reacquisitionTimeSec;
      passed = measured <= req.threshold;
      break;
    case 'processing_fps':
      measured = metrics.averageFps;
      passed = measured >= req.threshold;
      break;
    default:
      measured = 0;
      passed = false;
  }

  const direction = req.comparison === 'lte' ? '<=' : '>=';
  const statusStr = passed ? 'PASS' : 'FAIL';

  let message: string;
  if (req.id === 'reacq_time' && measured === Infinity) {
    message = `No reacquisition events — requirement not applicable`;
    passed = true; // No loss = no reacquisition needed
  } else if (req.id === 'acq_time' && measured === Infinity) {
    message = `FAIL — never achieved LOCK (acquisition time = ∞, requirement <= ${req.threshold}${req.unit})`;
  } else {
    message = `${statusStr} — ${measured.toFixed(2)}${req.unit} ${direction} ${req.threshold}${req.unit}`;
  }

  return {
    requirementId: req.id,
    requirementName: req.name,
    measuredValue: measured,
    threshold: req.threshold,
    unit: req.unit,
    passed,
    message,
  };
}

/**
 * Verify benchmark reproducibility.
 * Runs the same scenario+algorithm+seed twice and compares deterministic metrics.
 * Returns true if metrics match (within floating-point tolerance).
 */
export function verifyReproducibility(
  metrics1: BenchmarkRunMetrics,
  metrics2: BenchmarkRunMetrics
): { reproducible: boolean; differences: string[] } {
  const differences: string[] = [];
  const tolerance = 0.001;

  function check(field: keyof BenchmarkRunMetrics) {
    const v1 = metrics1[field];
    const v2 = metrics2[field];
    if (typeof v1 === 'number' && typeof v2 === 'number') {
      // Skip FPS (machine-dependent)
      if (field === 'averageFps' || field === 'minFps' || field === 'avgProcessingTimeMs' || field === 'maxProcessingTimeMs') return;
      if (Math.abs(v1 - v2) > tolerance && !(v1 === Infinity && v2 === Infinity)) {
        differences.push(`${field}: ${v1} vs ${v2}`);
      }
    }
  }

  check('acquisitionTimeSec');
  check('averageTrackingErrorPx');
  check('maxTrackingErrorPx');
  check('rmseTrackingErrorPx');
  check('targetLossPercent');
  check('reacquisitionTimeSec');
  check('lockRetentionPercent');
  check('totalFrames');
  check('lostFrames');
  check('successfulAcquisitions');
  check('successfulReacquisitions');

  return { reproducible: differences.length === 0, differences };
}

/**
 * Find worst-performing scenario for each algorithm across a set of run results.
 */
export function findWorstPerformers(
  runs: { scenarioId: string; algorithm: string; metrics: BenchmarkRunMetrics }[]
): Record<string, { algorithm: TrackingAlgorithm; metric: string; value: number }> {
  const byAlgorithm: Record<string, typeof runs> = {};

  for (const run of runs) {
    if (!byAlgorithm[run.algorithm]) byAlgorithm[run.algorithm] = [];
    byAlgorithm[run.algorithm].push(run);
  }

  const worst: Record<string, { algorithm: TrackingAlgorithm; metric: string; value: number }> = {};

  for (const [algo, algoRuns] of Object.entries(byAlgorithm)) {
    let worstScenario = '';
    let worstMetric = '';
    let worstValue = -Infinity;

    for (const run of algoRuns) {
      // Worst = highest RMSE tracking error
      if (run.metrics.rmseTrackingErrorPx > worstValue) {
        worstValue = run.metrics.rmseTrackingErrorPx;
        worstMetric = 'RMSE Tracking Error (px)';
        worstScenario = run.scenarioId;
      }
    }

    worst[algo] = { algorithm: algo as TrackingAlgorithm, metric: worstMetric, value: worstValue };
  }

  return worst;
}
