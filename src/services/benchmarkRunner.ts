/**
 * FSOC Track Lab — Deterministic Benchmark Runner
 *
 * Runs AI Centroid, Kalman Predictive, and Deep Beacon under identical
 * seeded conditions and produces a transparent, evidence-based comparison.
 *
 * Determinism contract:
 *   benchmarkRunner(seed, config, settings) is idempotent for a given seed.
 *   The same seed always produces the same target initialization, sensor noise,
 *   detection noise, and trajectory jitter — regardless of which algorithm is
 *   being evaluated.
 *
 *   Each noise source (turbulence, dropout, blob noise, detection noise,
 *   telemetry) gets its own independent RNG stream seeded from
 *   (masterSeed, sourceId, timestep). Different algorithms may consume
 *   different amounts from the blob-noise stream (because their search
 *   radii differ), but since each timestep's stream is freshly seeded,
 *   cross-timestep contamination is impossible and other streams are
 *   completely unaffected.
 */

import {
  BenchmarkConfig,
  BenchmarkResult,
  BenchmarkComparison,
  AlgorithmResult,
  AlgorithmMetrics,
  ScoringWeights,
  TrackingAlgorithm,
  SimulationConfig,
  AppSettings,
  Target,
  CameraGimbalState,
  TelemetryPoint,
  TrackingPipelineState,
  PerformanceStats,
  SimulationNoise,
} from '../types';
import {
  initializeTargets,
  updateTargetPositions,
  initTrackingPipeline,
  runTrackingPipeline,
  generatePerformanceSummary,
} from './simulationEngine';

// ── Deterministic PRNG: mulberry32 ──
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Gaussian RNG from any uniform source ──
function gaussianFromRng(rng: () => number): () => number {
  return () => {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };
}

// ── Per-noise-source RNG streams ──
//
// Each noise source gets its own RNG seeded from a hash of
// (masterSeed, sourceId, timestep). This means:
//   - Different sources at the same timestep are independent.
//   - Same source at same timestep produces identical values for all algorithms.
//   - Algorithm-specific consumption (blob noise) cannot corrupt other sources.

const SRC_TARGET_JITTER = 0x1000;
const SRC_TURBULENCE_X = 0x2000;
const SRC_TURBULENCE_Y = 0x2001;
const SRC_DROPOUT = 0x3000;
const SRC_BLOB_NOISE = 0x4000;
const SRC_DETECTION_NOISE_AZ = 0x5000;
const SRC_DETECTION_NOISE_EL = 0x5001;
const SRC_TELEMETRY_FPS = 0x6000;
const SRC_TELEMETRY_CPU = 0x6001;
const SRC_TELEMETRY_PROC = 0x6002;

function streamSeed(masterSeed: number, sourceId: number, stepIndex: number): number {
  let h = masterSeed ^ (stepIndex * 0x9e3779b9);
  h = Math.imul(h ^ (sourceId >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

function createSimulationNoise(
  masterSeed: number,
  stepIndex: number,
  targetCount: number
): SimulationNoise {
  return {
    targetJitterRngs: Array.from({ length: targetCount }, (_, i) =>
      mulberry32(streamSeed(masterSeed, SRC_TARGET_JITTER + i, stepIndex))
    ),
    turbulenceXRng: gaussianFromRng(
      mulberry32(streamSeed(masterSeed, SRC_TURBULENCE_X, stepIndex))
    ),
    turbulenceYRng: gaussianFromRng(
      mulberry32(streamSeed(masterSeed, SRC_TURBULENCE_Y, stepIndex))
    ),
    dropoutRng: mulberry32(streamSeed(masterSeed, SRC_DROPOUT, stepIndex)),
    blobNoiseRng: gaussianFromRng(
      mulberry32(streamSeed(masterSeed, SRC_BLOB_NOISE, stepIndex))
    ),
    detectionNoiseAzRng: gaussianFromRng(
      mulberry32(streamSeed(masterSeed, SRC_DETECTION_NOISE_AZ, stepIndex))
    ),
    detectionNoiseElRng: gaussianFromRng(
      mulberry32(streamSeed(masterSeed, SRC_DETECTION_NOISE_EL, stepIndex))
    ),
    fpsRng: mulberry32(streamSeed(masterSeed, SRC_TELEMETRY_FPS, stepIndex)),
    cpuRng: mulberry32(streamSeed(masterSeed, SRC_TELEMETRY_CPU, stepIndex)),
    procTimeRng: mulberry32(streamSeed(masterSeed, SRC_TELEMETRY_PROC, stepIndex)),
  };
}

// ── Legacy Math.random()-based RNG (used only for initializeTargets) ──
let originalRandom: (() => number) | null = null;

function installSeededRng(seed: number): () => number {
  const rng = mulberry32(seed);
  if (originalRandom === null) {
    originalRandom = Math.random;
  }
  Math.random = rng;
  return rng;
}

function restoreRng(): void {
  if (originalRandom !== null) {
    Math.random = originalRandom;
    originalRandom = null;
  }
}

// ── Initial gimbal state (deterministic, no RNG) ──
function computeInitialPan(config: SimulationConfig): number {
  if (config.initialPosition === 'Offset Left (45°)') return -45;
  if (config.initialPosition === 'Offset Right (45°)') return 45;
  return 0;
}

function createInitialCamera(config: SimulationConfig): CameraGimbalState {
  return {
    pan: computeInitialPan(config),
    tilt: 0,
    zoom: 1.0,
    panVelocity: 0,
    tiltVelocity: 0,
    fov: config.cameraFov,
    opticalFilter: true,
    autoTracking: true,
    algorithm: 'AI Centroid',
  };
}

// ── Compute metrics from telemetry history ──
function computeMetrics(history: TelemetryPoint[]): AlgorithmMetrics {
  if (history.length === 0) {
    return {
      avgTotalError: Infinity,
      maxTotalError: Infinity,
      lockRetentionPct: 0,
      acquisitionTimeSec: Infinity,
      avgConfidence: 0,
      avgFps: 0,
    };
  }

  const errors = history.map((h) => h.totalError);
  const avgTotalError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const maxTotalError = Math.max(...errors);

  const lockedCount = history.filter((h) => h.status === 'LOCKED').length;
  const lockRetentionPct = (lockedCount / history.length) * 100;

  const firstLock = history.find((h) => h.status === 'LOCKED');
  const acquisitionTimeSec = firstLock ? firstLock.timeSec : Infinity;

  const confidences = history.map((h) => h.confidence);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  const fps = history.map((h) => h.fps);
  const avgFps = fps.reduce((a, b) => a + b, 0) / fps.length;

  return {
    avgTotalError,
    maxTotalError,
    lockRetentionPct,
    acquisitionTimeSec,
    avgConfidence,
    avgFps,
  };
}

// ── Headless single-algorithm simulation ──
//
// The algorithm-specific RNG (blob noise) is consumed only inside
// findBeaconBlob via noise.blobNoiseRng. Since each timestep creates
// a fresh blob-noise stream, the variable consumption amount cannot
// corrupt any other stream or any other timestep.
function runAlgorithmHeadless(
  algorithm: TrackingAlgorithm,
  baseTargets: Target[],
  config: SimulationConfig,
  settings: AppSettings,
  masterSeed: number
): AlgorithmResult {
  const camera = createInitialCamera(config);
  camera.algorithm = algorithm;
  const initialPan = camera.pan;
  const initialTilt = camera.tilt;

  let pipeline: TrackingPipelineState = initTrackingPipeline(algorithm, initialPan, initialTilt);
  let currentCamera = { ...camera };
  const telemetryHistory: TelemetryPoint[] = [];

  const durationSec = config.durationSec || 120;
  const dt = config.timeStep || 0.016;
  const stepCount = Math.ceil(durationSec / dt);

  // Deep-copy targets for this algorithm run
  let currentTargets: Target[] = baseTargets.map((t) => ({
    ...t,
    trail: [...t.trail],
  }));

  for (let step = 0; step < stepCount; step++) {
    const elapsedSec = step * dt;

    // Create fresh noise streams for this timestep — deterministic from (seed, step)
    const noise = createSimulationNoise(masterSeed, step, config.targetCount || 1);

    // Update target positions using per-target jitter RNGs
    currentTargets = updateTargetPositions(currentTargets, elapsedSec, config, noise);
    const beacon = currentTargets.find((tt) => tt.isBeacon) || currentTargets[0];

    // Run tracking pipeline with pre-seeded noise streams
    const result = runTrackingPipeline(
      pipeline,
      currentCamera,
      beacon,
      config,
      settings,
      elapsedSec,
      dt,
      noise
    );

    pipeline = result.pipeline;
    currentCamera = result.camera;
    telemetryHistory.push(result.telemetry);
  }

  // Use the last timestep's procTimeRng for the performance summary
  const lastStep = stepCount - 1;
  const lastNoise = createSimulationNoise(masterSeed, lastStep, config.targetCount || 1);
  const stats = generatePerformanceSummary(telemetryHistory, lastNoise.procTimeRng);
  const metrics = computeMetrics(telemetryHistory);

  return { algorithm, telemetryHistory, stats, metrics };
}

// ── Scoring ──

const NORMALIZATION = {
  avgErrorMax: 5,
  maxErrorMax: 10,
  acqTimeMax: 10,
};

const DEFAULT_WEIGHTS: ScoringWeights = {
  avgError: 0.30,
  maxError: 0.15,
  lockRetention: 0.25,
  acqTime: 0.15,
  confidence: 0.15,
};

function normalize(value: number, max: number): number {
  return Math.max(0, Math.min(1, 1 - value / max));
}

function scoreAlgorithm(
  metrics: AlgorithmMetrics,
  weights: ScoringWeights
): { score: number; breakdown: Record<string, number> } {
  const nAvgErr = normalize(metrics.avgTotalError, NORMALIZATION.avgErrorMax);
  const nMaxErr = normalize(metrics.maxTotalError, NORMALIZATION.maxErrorMax);
  const nLockRet = normalize(100 - metrics.lockRetentionPct, 100);
  const nAcqTime = normalize(metrics.acquisitionTimeSec, NORMALIZATION.acqTimeMax);
  const nConf = metrics.avgConfidence / 100;

  const breakdown: Record<string, number> = {
    avgError: nAvgErr * weights.avgError,
    maxError: nMaxErr * weights.maxError,
    lockRetention: nLockRet * weights.lockRetention,
    acqTime: nAcqTime * weights.acqTime,
    confidence: nConf * weights.confidence,
  };

  const score =
    breakdown.avgError +
    breakdown.maxError +
    breakdown.lockRetention +
    breakdown.acqTime +
    breakdown.confidence;

  return { score, breakdown };
}

function generateRecommendation(
  scoredResults: { algorithm: TrackingAlgorithm; score: number; breakdown: Record<string, number> }[],
  allResults: AlgorithmResult[]
): { recommendation: TrackingAlgorithm; reason: string } {
  const sorted = [...scoredResults].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const runnerUp = sorted[1];

  const allFailed = allResults.every(
    (r) => r.metrics.lockRetentionPct === 0 && r.metrics.acquisitionTimeSec === Infinity
  );

  const topScore = winner.score;
  const tiedAlgorithms = sorted
    .filter((r) => Math.abs(r.score - topScore) < 0.001)
    .map((r) => r.algorithm);

  const winnerResult = allResults.find((r) => r.algorithm === winner.algorithm);
  const winnerMetrics = winnerResult?.metrics;

  const evidenceParts: string[] = [];

  if (winnerMetrics) {
    evidenceParts.push(`avg error ${winnerMetrics.avgTotalError.toFixed(2)}°`);
    evidenceParts.push(`max error ${winnerMetrics.maxTotalError.toFixed(2)}°`);
    evidenceParts.push(`lock retention ${winnerMetrics.lockRetentionPct.toFixed(1)}%`);
    if (winnerMetrics.acquisitionTimeSec < Infinity) {
      evidenceParts.push(`acq time ${winnerMetrics.acquisitionTimeSec.toFixed(2)}s`);
    } else {
      evidenceParts.push('never achieved lock');
    }
    evidenceParts.push(`avg confidence ${winnerMetrics.avgConfidence.toFixed(1)}%`);
  }

  const margin = winner.score - (runnerUp?.score ?? 0);
  const marginPct = (margin * 100).toFixed(1);

  let reason: string;
  if (allFailed) {
    reason =
      `NO ALGORITHM ACHIEVED LOCK under this configuration. ` +
      `All three algorithms failed to acquire or maintain track. ` +
      `Consider adjusting FOV, reducing target speed, or lowering disturbance intensity. ` +
      `Scoring weights: avgErr=${DEFAULT_WEIGHTS.avgError}, ` +
      `maxErr=${DEFAULT_WEIGHTS.maxError}, ` +
      `lockRet=${DEFAULT_WEIGHTS.lockRetention}, ` +
      `acqTime=${DEFAULT_WEIGHTS.acqTime}, ` +
      `conf=${DEFAULT_WEIGHTS.confidence}.`;
  } else if (tiedAlgorithms.length > 1) {
    reason =
      `TIE between ${tiedAlgorithms.join(' and ')} ` +
      `at ${(winner.score * 100).toFixed(1)}/100. ` +
      `Top metrics: ${evidenceParts.join(', ')}. ` +
      `Scoring weights: avgErr=${DEFAULT_WEIGHTS.avgError}, ` +
      `maxErr=${DEFAULT_WEIGHTS.maxError}, ` +
      `lockRet=${DEFAULT_WEIGHTS.lockRetention}, ` +
      `acqTime=${DEFAULT_WEIGHTS.acqTime}, ` +
      `conf=${DEFAULT_WEIGHTS.confidence}.`;
  } else {
    reason =
      `${winner.algorithm} scored ${(winner.score * 100).toFixed(1)}/100 ` +
      `(+${marginPct}pts over ${runnerUp?.algorithm ?? 'N/A'}). ` +
      `Metrics: ${evidenceParts.join(', ')}. ` +
      `Scoring weights: avgErr=${DEFAULT_WEIGHTS.avgError}, ` +
      `maxErr=${DEFAULT_WEIGHTS.maxError}, ` +
      `lockRet=${DEFAULT_WEIGHTS.lockRetention}, ` +
      `acqTime=${DEFAULT_WEIGHTS.acqTime}, ` +
      `conf=${DEFAULT_WEIGHTS.confidence}.`;
  }

  return { recommendation: winner.algorithm, reason };
}

// ── Main entry point ──

export function runBenchmark(config: BenchmarkConfig): BenchmarkResult {
  const { simulationConfig, settings, seed, algorithms } = config;

  // Create the base target state deterministically from the seed.
  // initializeTargets uses Math.random(), so we temporarily install the
  // seeded PRNG. This is the ONLY Math.random()-based step; all subsequent
  // environment noise comes from per-source streams.
  installSeededRng(seed);
  const baseTargets = initializeTargets(simulationConfig);
  restoreRng();

  // Run each algorithm headlessly with identical environment
  const results: AlgorithmResult[] = [];
  for (const algorithm of algorithms) {
    const result = runAlgorithmHeadless(
      algorithm,
      baseTargets,
      simulationConfig,
      settings,
      seed
    );
    results.push(result);
  }

  // Score each algorithm
  const scoredResults = results.map((r) => ({
    algorithm: r.algorithm,
    ...scoreAlgorithm(r.metrics, DEFAULT_WEIGHTS),
  }));

  // Generate recommendation
  const { recommendation, reason } = generateRecommendation(scoredResults, results);

  const comparison: BenchmarkComparison = {
    results,
    scoringWeights: DEFAULT_WEIGHTS,
    scoredResults,
    recommendation,
    recommendationReason: reason,
  };

  return {
    config,
    comparison,
    timestamp: new Date().toISOString(),
  };
}

// ── CSV export helper ──

export function benchmarkToCsv(result: BenchmarkResult): string {
  const headers = [
    'Algorithm',
    'Avg Total Error (deg)',
    'Max Total Error (deg)',
    'Lock Retention (%)',
    'Acquisition Time (s)',
    'Avg Confidence (%)',
    'Avg FPS',
    'Score',
  ];

  const rows = result.comparison.scoredResults.map((sr) => {
    const algorithmResult = result.comparison.results.find(
      (r) => r.algorithm === sr.algorithm
    );
    const m = algorithmResult?.metrics;
    return [
      sr.algorithm,
      m ? m.avgTotalError.toFixed(3) : 'N/A',
      m ? m.maxTotalError.toFixed(3) : 'N/A',
      m ? m.lockRetentionPct.toFixed(1) : 'N/A',
      m && m.acquisitionTimeSec < Infinity ? m.acquisitionTimeSec.toFixed(2) : 'N/A',
      m ? m.avgConfidence.toFixed(1) : 'N/A',
      m ? m.avgFps.toFixed(1) : 'N/A',
      (sr.score * 100).toFixed(1),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
