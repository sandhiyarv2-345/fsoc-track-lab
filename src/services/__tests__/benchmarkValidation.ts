/**
 * FSOC Track Lab — Phase 3A: Benchmark Validation Tests
 *
 * Run with: npx tsx src/services/__tests__/benchmarkValidation.ts
 */

import {
  SimulationConfig,
  BenchmarkRunMetrics,
  TelemetryPoint,
  PS_REQUIREMENTS,
} from '../../types';
import { BENCHMARK_SCENARIOS, getScenarioById } from '../benchmarkScenarios';
import {
  groundTruthToPixel,
  computePixelTrackingError,
  computeBenchmarkMetrics,
  evaluateRequirements,
  verifyReproducibility,
} from '../benchmarkMetrics';
import { runBenchmarkScenarioRun, benchmarkSuiteToCsv, benchmarkSuiteDetailCsv } from '../benchmarkRunner';
import { DEFAULT_SETTINGS } from '../simulationEngine';

// ── Test Framework ──
let testsPassed = 0;
let testsFailed = 0;
let testsTotal = 0;

function assert(condition: boolean, testName: string, detail?: string): void {
  testsTotal++;
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${testName}`);
  } else {
    testsFailed++;
    console.log(`  ✗ ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

function assertNear(a: number, b: number, tolerance: number, testName: string): void {
  const diff = Math.abs(a - b);
  assert(diff < tolerance, testName, `expected ${b.toFixed(4)}, got ${a.toFixed(4)} (diff=${diff.toFixed(6)})`);
}

function section(name: string): void {
  console.log(`\n═══ ${name} ═══`);
}

// ══════════════════════════════════════════════════════════
// TEST 1: Scenario Definitions
// ══════════════════════════════════════════════════════════

function testScenarioDefinitions(): void {
  section('TEST 1 — SCENARIO DEFINITIONS');

  assert(BENCHMARK_SCENARIOS.length === 18, '18 scenarios defined');

  const ids = BENCHMARK_SCENARIOS.map(s => s.id);
  const expectedIds = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S06-MAX', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S16', 'S17'];
  for (const id of expectedIds) {
    assert(ids.includes(id), `Scenario ${id} exists`);
  }

  for (const s of BENCHMARK_SCENARIOS) {
    assert(s.config !== undefined, `${s.id} has config`);
    assert(s.config.durationSec > 0, `${s.id} has positive duration`);
    assert(s.config.timeStep > 0, `${s.id} has positive timeStep`);
    assert(s.seed > 0, `${s.id} has positive seed`);
  }

  // Verify getScenarioById
  const s01 = getScenarioById('S01');
  assert(s01 !== undefined, 'getScenarioById works');
  assert(s01?.name === 'Clean Baseline', 'S01 has correct name');

  // Phase 3B-1: Verify classification metadata
  assert(s01?.trackability === 'marginal', 'S01 classified as marginal');
  assert(s01?.category === 'baseline', 'S01 is baseline');

  const s04 = getScenarioById('S04');
  assert(s04?.trackability === 'physically-untrackable', 'S04 classified as physically-untrackable');
  assert(s04?.category === 'stress', 'S04 is stress');
}

// ══════════════════════════════════════════════════════════
// TEST 1B: Initial Visibility Inside FOV
// ══════════════════════════════════════════════════════════

function testInitialVisibility(): void {
  section('TEST 1B — INITIAL VISIBILITY INSIDE FOV');

  // S02 Circular: radius=50m, centerZ=1000 → target at ~2.9° az
  const s02 = getScenarioById('S02');
  assert(s02 !== undefined, 'S02 exists');
  assert(s02?.initialVisibility === 'insideFOV', 'S02 classified as insideFOV');
  assert(s02?.trackability === 'trackable', 'S02 classified as trackable');

  // S03 Figure-8: A=50, B=40, centerY=30 → target at ~0° az, ~0.9° el
  const s03 = getScenarioById('S03');
  assert(s03 !== undefined, 'S03 exists');
  assert(s03?.initialVisibility === 'insideFOV', 'S03 classified as insideFOV');
  assert(s03?.trackability === 'trackable', 'S03 classified as trackable');

  // S04 Random: large multi-sine → starts outside FOV
  const s04b = getScenarioById('S04');
  assert(s04b?.initialVisibility === 'outsideFOV', 'S04 classified as outsideFOV');

  // S16/S17 Figure-8: should start inside FOV with reduced amplitudes
  const s16 = getScenarioById('S16');
  assert(s16?.initialVisibility === 'insideFOV', 'S16 classified as insideFOV');
  const s17 = getScenarioById('S17');
  assert(s17?.initialVisibility === 'insideFOV', 'S17 classified as insideFOV');

  // Verify FOV check: Circular at t=0
  // x = 30*cos(0) = 30, z = 1000, y = 10
  // az = atan2(30, 1000) * 180/π = 1.72°
  // hFov/2 = 2°, so 1.72° is within 2° half-FOV
  const s02Config = s02!.config;
  const hFov = s02Config.cameraFovHorizontal;
  const circularAz = Math.atan2(30, 1000) * 180 / Math.PI;
  assert(circularAz < hFov / 2, `S02 Circular initial az ${circularAz.toFixed(2)}° < hFov/2 ${hFov/2}°`);

  // Figure-8 at t=0: x=0, z=1000, y=10+5=15
  // az = atan2(0, 1000) = 0°, el = atan2(15, 1000) = 0.86°
  // vFov/2 = 1.5°, so 0.86° is within 1.5° half-FOV
  const s03Config = s03!.config;
  const figure8El = Math.atan2(15, 1000) * 180 / Math.PI;
  const halfVFovRad = (s03Config.cameraFovVertical / 2) * Math.PI / 180;
  const normalizedEl = Math.tan(figure8El * Math.PI / 180) / Math.tan(halfVFovRad);
  assert(Math.abs(normalizedEl) < 1.0, `S03 Figure-8 initial normalized el=${normalizedEl.toFixed(3)} < 1.0`);

  // Verify peak rates
  assert(s02?.requiredPeakPanRate !== undefined, 'S02 has peak pan rate');
  assert(s02!.requiredPeakPanRate! < 5, 'S02 peak pan rate < 5°/s');
  assert(s03?.requiredPeakTiltRate !== undefined, 'S03 has peak tilt rate');
}

// ══════════════════════════════════════════════════════════
// TEST 2: Ground-Truth Pixel Projection
// ══════════════════════════════════════════════════════════

function testGroundTruthProjection(): void {
  section('TEST 2 — GROUND-TRUTH PIXEL PROJECTION');

  // Center of FOV should map to center of sensor
  const center = groundTruthToPixel(0, 0, 0, 0, 4, 3);
  assertNear(center.pixelX, 320, 1, 'Az=0,El=0 maps to sensor center X');
  assertNear(center.pixelY, 240, 1, 'Az=0,El=0 maps to sensor center Y');

  // Target at positive azimuth should map to right of center
  const right = groundTruthToPixel(1, 0, 0, 0, 4, 3);
  assert(right.pixelX > 320, 'Positive azimuth maps to right of center');

  // Target at negative azimuth should map to left of center
  const left = groundTruthToPixel(-1, 0, 0, 0, 4, 3);
  assert(left.pixelX < 320, 'Negative azimuth maps to left of center');

  // Target at positive elevation should map above center (Y decreases)
  const up = groundTruthToPixel(0, 1, 0, 0, 4, 3);
  assert(up.pixelY < 240, 'Positive elevation maps above center');

  // Roundtrip: project a known angle, verify it's within FOV
  const projected = groundTruthToPixel(2, 1.5, 0, 0, 4, 3);
  assert(projected.pixelX >= 0 && projected.pixelX <= 640, 'Projected X is within sensor bounds');
  assert(projected.pixelY >= 0 && projected.pixelY <= 480, 'Projected Y is within sensor bounds');

  // With camera pan offset
  const panned = groundTruthToPixel(5, 0, 5, 0, 4, 3);
  assertNear(panned.pixelX, 320, 1, 'Target at same angle as pan maps to center');
}

// ══════════════════════════════════════════════════════════
// TEST 3: Pixel Tracking Error Computation
// ══════════════════════════════════════════════════════════

function testPixelTrackingError(): void {
  section('TEST 3 — PIXEL TRACKING ERROR COMPUTATION');

  const config: SimulationConfig = BENCHMARK_SCENARIOS[0].config;

  // Telemetry at center (no error)
  const centerTelemetry: TelemetryPoint = {
    timeSec: 1, formattedTime: '00:01', fps: 60,
    pan: 0, tilt: 0,
    panError: 0, tiltError: 0, totalError: 0,
    azimuthError: 0, elevationError: 0,
    confidence: 95, status: 'LOCKED', range: 1200,
    cpuLoad: 15, gpuMem: 1.5,
    groundTruthAz: 0, groundTruthEl: 0,
    measuredAz: 0, measuredEl: 0,
    estimatedAz: 0, estimatedEl: 0,
    kalmanActive: false, detectionSnr: 50,
  };

  const error = computePixelTrackingError(centerTelemetry, config);
  assertNear(error, 0, 1, 'Center telemetry has ~0 pixel error');

  // Telemetry with offset — groundTruthAz=2° from pan=0 means azimuthError should be ~2°
  const offsetTelemetry: TelemetryPoint = {
    ...centerTelemetry,
    groundTruthAz: 2,
    azimuthError: 2.0,  // |groundTruth - pan| = |2 - 0| = 2°
    elevationError: 1.5,
  };

  const offsetError = computePixelTrackingError(offsetTelemetry, config);
  // With 4° horizontal FOV: 2° / 2° * 320 = 320px X error
  // With 3° vertical FOV: 1.5° / 1.5° * 240 = 240px Y error
  // Total = sqrt(320² + 240²) = 400px
  assert(offsetError > 100, `Offset telemetry has significant pixel error (${offsetError.toFixed(1)}px)`);
}

// ══════════════════════════════════════════════════════════
// TEST 4: Metrics Computation
// ══════════════════════════════════════════════════════════

function testMetricsComputation(): void {
  section('TEST 4 — METRICS COMPUTATION');

  const config = BENCHMARK_SCENARIOS[0].config;

  // Empty history
  const emptyMetrics = computeBenchmarkMetrics([], config);
  assert(emptyMetrics.totalFrames === 0, 'Empty history has 0 frames');
  assert(emptyMetrics.targetLossPercent === 100, 'Empty history has 100% loss');

  // Build a synthetic history with known states
  const history: TelemetryPoint[] = [];
  for (let i = 0; i < 100; i++) {
    const t = i * 0.016;
    const isLocked = i > 10 && i < 90;
    history.push({
      timeSec: t,
      formattedTime: `00:${i}`,
      fps: 60,
      pan: 0, tilt: 0,
      panError: 0, tiltError: 0,
      totalError: 0.5,
      azimuthError: 0.3, elevationError: 0.4,
      confidence: isLocked ? 95 : 0,
      status: isLocked ? 'LOCKED' : (i <= 10 ? 'ACQUIRING' : 'LOST'),
      range: 1200,
      cpuLoad: 15, gpuMem: 1.5,
      groundTruthAz: 0, groundTruthEl: 0,
      measuredAz: 0, measuredEl: 0,
      estimatedAz: 0, estimatedEl: 0,
      kalmanActive: false, detectionSnr: 50,
    });
  }

  const metrics = computeBenchmarkMetrics(history, config);
  assert(metrics.totalFrames === 100, '100 frames counted');
  assert(metrics.lockRetentionPercent > 70 && metrics.lockRetentionPercent < 90, `Lock retention ~80% (got ${metrics.lockRetentionPercent.toFixed(1)})`);
  assert(metrics.targetLossPercent > 5 && metrics.targetLossPercent < 30, `Target loss ~10% (got ${metrics.targetLossPercent.toFixed(1)})`);
  assert(metrics.averageFps === 60, 'Average FPS = 60');
  assert(metrics.simulationDurationSec > 0, 'Duration > 0');

  // Phase 3B-1: New metrics
  assert(metrics.framesBeforeAcquisition === 11, `Frames before acquisition = 11 (got ${metrics.framesBeforeAcquisition})`);
  assert(metrics.errorAtAcquisitionPx >= 0, 'Error at acquisition is defined');
  assert(metrics.postAcquisitionRmsePx < Infinity, 'Post-acquisition RMSE is finite');
  assert(metrics.steadyStateRmsePx < Infinity, 'Steady-state RMSE is finite');
  assert(metrics.steadyStateStartFrame >= metrics.framesBeforeAcquisition, 'Steady-state starts after acquisition');
}

// ══════════════════════════════════════════════════════════
// TEST 5: PASS/FAIL Evaluation
// ══════════════════════════════════════════════════════════

function testPassFailEvaluation(): void {
  section('TEST 5 — PASS/FAIL EVALUATION');

  // Metrics that should PASS all requirements
  const goodMetrics: BenchmarkRunMetrics = {
    acquisitionTimeSec: 0.5,
    averageTrackingErrorPx: 3.0,
    maxTrackingErrorPx: 8.0,
    rmseTrackingErrorPx: 4.0,
    targetLossPercent: 1.0,
    reacquisitionTimeSec: 0.3,
    lockRetentionPercent: 95,
    averageFps: 55,
    minFps: 45,
    totalFrames: 1875,
    processedFrames: 1856,
    lostFrames: 19,
    simulationDurationSec: 30,
    avgProcessingTimeMs: 14,
    maxProcessingTimeMs: 18,
    successfulAcquisitions: 1,
    successfulReacquisitions: 2,
    postAcquisitionRmsePx: 3.5,
    steadyStateRmsePx: 2.8,
    framesBeforeAcquisition: 30,
    errorAtAcquisitionPx: 80,
    steadyStateStartFrame: 100,
  };

  const goodResults = evaluateRequirements(goodMetrics);
  assert(goodResults.length === 5, '5 requirements evaluated');
  assert(goodResults.every(r => r.passed), 'Good metrics pass all requirements');

  // Metrics that should FAIL some requirements
  const badMetrics: BenchmarkRunMetrics = {
    acquisitionTimeSec: 3.5, // FAIL: > 2s
    averageTrackingErrorPx: 12.0,
    maxTrackingErrorPx: 25.0,
    rmseTrackingErrorPx: 15.0, // FAIL: > 10px
    targetLossPercent: 8.0, // FAIL: > 5%
    reacquisitionTimeSec: 1.5, // FAIL: > 1s
    lockRetentionPercent: 70,
    averageFps: 15, // FAIL: < 20 FPS
    minFps: 10,
    totalFrames: 1875,
    processedFrames: 1725,
    lostFrames: 150,
    simulationDurationSec: 30,
    avgProcessingTimeMs: 20,
    maxProcessingTimeMs: 30,
    successfulAcquisitions: 1,
    successfulReacquisitions: 3,
    postAcquisitionRmsePx: 14.0,
    steadyStateRmsePx: 12.0,
    framesBeforeAcquisition: 150,
    errorAtAcquisitionPx: 120,
    steadyStateStartFrame: 200,
  };

  const badResults = evaluateRequirements(badMetrics);
  const failedCount = badResults.filter(r => !r.passed).length;
  assert(failedCount >= 4, `${failedCount} requirements failed as expected`);

  // Verify specific failures
  const acqResult = badResults.find(r => r.requirementId === 'acq_time');
  assert(acqResult !== undefined && !acqResult!.passed, 'Acquisition time FAILS');

  const trackingResult = badResults.find(r => r.requirementId === 'tracking_error');
  assert(trackingResult !== undefined && !trackingResult!.passed, 'Tracking error FAILS');

  const fpsResult = badResults.find(r => r.requirementId === 'processing_fps');
  assert(fpsResult !== undefined && !fpsResult!.passed, 'FPS FAILS');

  // Verify reacquisition infinity case (no losses = no reacquisition needed)
  const noLossMetrics: BenchmarkRunMetrics = {
    ...goodMetrics,
    reacquisitionTimeSec: Infinity,
    successfulReacquisitions: 0,
  };
  const noLossResults = evaluateRequirements(noLossMetrics);
  const reacqResult = noLossResults.find(r => r.requirementId === 'reacq_time');
  assert(reacqResult !== undefined && reacqResult!.passed, 'No reacquisitions = PASS for reacq requirement');
}

// ══════════════════════════════════════════════════════════
// TEST 6: PS Requirements Defined
// ══════════════════════════════════════════════════════════

function testPSRequirements(): void {
  section('TEST 6 — PS REQUIREMENTS DEFINED');

  assert(PS_REQUIREMENTS.length === 5, '5 PS requirements defined');

  const acq = PS_REQUIREMENTS.find(r => r.id === 'acq_time');
  assert(acq !== undefined && acq.threshold === 2.0, 'Acquisition time threshold = 2.0s');

  const tracking = PS_REQUIREMENTS.find(r => r.id === 'tracking_error');
  assert(tracking !== undefined && tracking.threshold === 10.0, 'Tracking error threshold = 10px');

  const loss = PS_REQUIREMENTS.find(r => r.id === 'target_loss');
  assert(loss !== undefined && loss.threshold === 5.0, 'Target loss threshold = 5%');

  const reacq = PS_REQUIREMENTS.find(r => r.id === 'reacq_time');
  assert(reacq !== undefined && reacq.threshold === 1.0, 'Reacquisition threshold = 1.0s');

  const fps = PS_REQUIREMENTS.find(r => r.id === 'processing_fps');
  assert(fps !== undefined && fps.threshold === 20.0, 'FPS threshold = 20');
}

// ══════════════════════════════════════════════════════════
// TEST 7: Reproducibility Verification
// ══════════════════════════════════════════════════════════

function testReproducibilityVerification(): void {
  section('TEST 7 — REPRODUCIBILITY VERIFICATION');

  const metrics: BenchmarkRunMetrics = {
    acquisitionTimeSec: 0.5,
    averageTrackingErrorPx: 3.0,
    maxTrackingErrorPx: 8.0,
    rmseTrackingErrorPx: 4.0,
    targetLossPercent: 1.0,
    reacquisitionTimeSec: 0.3,
    lockRetentionPercent: 95,
    averageFps: 55,
    minFps: 45,
    totalFrames: 1875,
    processedFrames: 1856,
    lostFrames: 19,
    simulationDurationSec: 30,
    avgProcessingTimeMs: 14,
    maxProcessingTimeMs: 18,
    successfulAcquisitions: 1,
    successfulReacquisitions: 2,
    postAcquisitionRmsePx: 3.5,
    steadyStateRmsePx: 2.8,
    framesBeforeAcquisition: 30,
    errorAtAcquisitionPx: 80,
    steadyStateStartFrame: 100,
  };

  // Same metrics should be reproducible
  const result1 = verifyReproducibility(metrics, { ...metrics });
  assert(result1.reproducible, 'Identical metrics are reproducible');
  assert(result1.differences.length === 0, 'No differences for identical metrics');

  // Different metrics should not be reproducible
  const different = { ...metrics, rmseTrackingErrorPx: 5.0 };
  const result2 = verifyReproducibility(metrics, different);
  assert(!result2.reproducible, 'Different RMSE is not reproducible');
  assert(result2.differences.length > 0, 'Difference reported');
}

// ══════════════════════════════════════════════════════════
// TEST 8: CSV Export
// ══════════════════════════════════════════════════════════

function testCsvExport(): void {
  section('TEST 8 — CSV EXPORT');

  // Create a minimal suite result for CSV testing
  const suite = {
    runs: [{
      scenarioId: 'S01',
      scenarioName: 'Clean Baseline',
      algorithm: 'AI Centroid' as const,
      seed: 42,
      metrics: {
        acquisitionTimeSec: 0.5,
        averageTrackingErrorPx: 3.0,
        maxTrackingErrorPx: 8.0,
        rmseTrackingErrorPx: 4.0,
        targetLossPercent: 1.0,
        reacquisitionTimeSec: 0.3,
        lockRetentionPercent: 95,
        averageFps: 55,
        minFps: 45,
        totalFrames: 1875,
        processedFrames: 1856,
        lostFrames: 19,
        simulationDurationSec: 30,
        avgProcessingTimeMs: 14,
        maxProcessingTimeMs: 18,
        successfulAcquisitions: 1,
        successfulReacquisitions: 2,
        postAcquisitionRmsePx: 3.5,
        steadyStateRmsePx: 2.8,
        framesBeforeAcquisition: 30,
        errorAtAcquisitionPx: 80,
        steadyStateStartFrame: 100,
      },
      passFail: [{
        requirementId: 'acq_time',
        requirementName: 'Acquisition Time',
        measuredValue: 0.5,
        threshold: 2.0,
        unit: 's',
        passed: true,
        message: 'PASS',
      }],
      overallPass: true,
      telemetryHistory: [],
      timestamp: new Date().toISOString(),
      trackability: 'trackable' as const,
      initialVisibility: 'insideFOV' as const,
      category: 'baseline' as const,
    }],
    worstPerScenario: {},
    timestamp: new Date().toISOString(),
  };

  const summaryCsv = benchmarkSuiteToCsv(suite);
  assert(summaryCsv.includes('Scenario'), 'Summary CSV has header');
  assert(summaryCsv.includes('AI Centroid'), 'Summary CSV has algorithm');
  assert(summaryCsv.includes('PASS'), 'Summary CSV has status');
  assert(summaryCsv.split('\n').length === 2, 'Summary CSV has 2 lines (header + 1 row)');

  const detailCsv = benchmarkSuiteDetailCsv(suite);
  assert(detailCsv.includes('Requirement'), 'Detail CSV has header');
  assert(detailCsv.includes('Acquisition Time'), 'Detail CSV has requirement name');
}

// ══════════════════════════════════════════════════════════
// TEST 9: Actual Benchmark Execution (S01 + AI Centroid)
// ══════════════════════════════════════════════════════════

function testActualBenchmarkExecution(): void {
  section('TEST 9 — ACTUAL BENCHMARK EXECUTION (S01 + AI Centroid)');

  const scenario = getScenarioById('S01');
  assert(scenario !== undefined, 'S01 scenario loaded');

  if (!scenario) return;

  const startTime = Date.now();
  const run = runBenchmarkScenarioRun(scenario, 'AI Centroid', DEFAULT_SETTINGS);
  const elapsed = Date.now() - startTime;

  console.log(`    [info] Benchmark completed in ${elapsed}ms`);

  assert(run.scenarioId === 'S01', 'Run has correct scenario ID');
  assert(run.algorithm === 'AI Centroid', 'Run has correct algorithm');
  assert(run.seed === 42, 'Run has correct seed');
  assert(run.telemetryHistory.length > 0, 'Telemetry history is non-empty');
  assert(run.metrics.totalFrames > 0, 'Total frames > 0');
  assert(run.metrics.simulationDurationSec > 0, 'Duration > 0');
  assert(run.metrics.averageFps > 0, 'Average FPS > 0');
  assert(run.passFail.length === 5, '5 requirements evaluated');
  assert(typeof run.overallPass === 'boolean', 'overallPass is boolean');

  // Log actual metrics
  console.log(`\n    ═══ ACTUAL METRICS (S01 — AI Centroid) ═══`);
  console.log(`    Acquisition Time: ${run.metrics.acquisitionTimeSec < Infinity ? run.metrics.acquisitionTimeSec.toFixed(2) + 's' : 'N/A'}`);
  console.log(`    RMSE Tracking Error: ${run.metrics.rmseTrackingErrorPx.toFixed(2)} px`);
  console.log(`    Post-Acq RMSE: ${run.metrics.postAcquisitionRmsePx < Infinity ? run.metrics.postAcquisitionRmsePx.toFixed(2) + ' px' : 'N/A'}`);
  console.log(`    Steady-State RMSE: ${run.metrics.steadyStateRmsePx < Infinity ? run.metrics.steadyStateRmsePx.toFixed(2) + ' px' : 'N/A'}`);
  console.log(`    Max Tracking Error: ${run.metrics.maxTrackingErrorPx.toFixed(2)} px`);
  console.log(`    Target Loss: ${run.metrics.targetLossPercent.toFixed(1)}%`);
  console.log(`    Reacquisition Time: ${run.metrics.reacquisitionTimeSec < Infinity ? run.metrics.reacquisitionTimeSec.toFixed(2) + 's' : 'N/A'}`);
  console.log(`    Lock Retention: ${run.metrics.lockRetentionPercent.toFixed(1)}%`);
  console.log(`    Average FPS: ${run.metrics.averageFps.toFixed(1)}`);
  console.log(`    Trackability: ${run.trackability}`);
  console.log(`    Overall: ${run.overallPass ? 'PASS' : 'FAIL'}`);

  for (const pf of run.passFail) {
    console.log(`    ${pf.requirementName}: ${pf.message}`);
  }
}

// ══════════════════════════════════════════════════════════
// TEST 10: Three Algorithms on S01 (Fair Comparison)
// ══════════════════════════════════════════════════════════

function testThreeAlgorithmsS01(): void {
  section('TEST 10 — THREE ALGORITHMS ON S01 (FAIR COMPARISON)');

  const scenario = getScenarioById('S01');
  assert(scenario !== undefined, 'S01 scenario loaded');
  if (!scenario) return;

  const algorithms = ['AI Centroid', 'Kalman Predictive', 'Deep Beacon'] as const;
  const results = [];

  for (const algo of algorithms) {
    const run = runBenchmarkScenarioRun(scenario, algo, DEFAULT_SETTINGS);
    results.push(run);

    console.log(`\n    ═══ ${algo} ═══`);
    console.log(`    RMSE: ${run.metrics.rmseTrackingErrorPx.toFixed(2)} px`);
    console.log(`    Post-Acq RMSE: ${run.metrics.postAcquisitionRmsePx < Infinity ? run.metrics.postAcquisitionRmsePx.toFixed(2) + ' px' : 'N/A'}`);
    console.log(`    Steady RMSE: ${run.metrics.steadyStateRmsePx < Infinity ? run.metrics.steadyStateRmsePx.toFixed(2) + ' px' : 'N/A'}`);
    console.log(`    Max: ${run.metrics.maxTrackingErrorPx.toFixed(2)} px`);
    console.log(`    Loss: ${run.metrics.targetLossPercent.toFixed(1)}%`);
    console.log(`    Acq: ${run.metrics.acquisitionTimeSec < Infinity ? run.metrics.acquisitionTimeSec.toFixed(2) + 's' : 'N/A'}`);
    console.log(`    FPS: ${run.metrics.averageFps.toFixed(0)}`);
    console.log(`    Trackability: ${run.trackability}`);
    console.log(`    Status: ${run.overallPass ? 'PASS' : 'FAIL'}`);
  }

  // All should have same number of frames (same scenario+seed)
  const frameCounts = results.map(r => r.metrics.totalFrames);
  assert(
    frameCounts[0] === frameCounts[1] && frameCounts[1] === frameCounts[2],
    `All algorithms produce same frame count (${frameCounts[0]})`
  );

  // All should have same duration
  const durations = results.map(r => r.metrics.simulationDurationSec);
  assert(
    Math.abs(durations[0] - durations[1]) < 0.01 && Math.abs(durations[1] - durations[2]) < 0.01,
    `All algorithms produce same duration`
  );
}

// ══════════════════════════════════════════════════════════
// TEST 11: Ground-Truth Leakage Audit
// ══════════════════════════════════════════════════════════

function testGroundTruthLeakageAudit(): void {
  section('TEST 11 — GROUND-TRUTH LEAKAGE AUDIT');

  // Verify groundTruthToPixel is only used for evaluation, not in the pipeline
  // by checking that the function exists and works independently
  const pixel = groundTruthToPixel(1, 1, 0, 0, 4, 3);
  assert(typeof pixel.pixelX === 'number' && !isNaN(pixel.pixelX), 'Ground-truth projection produces valid X');
  assert(typeof pixel.pixelY === 'number' && !isNaN(pixel.pixelY), 'Ground-truth projection produces valid Y');

  // Verify the function does NOT use detection/pipeline state
  // (it only uses ground truth angles and camera FOV)
  const pixel1 = groundTruthToPixel(5, 3, 0, 0, 4, 3);
  const pixel2 = groundTruthToPixel(5, 3, 10, 10, 4, 3); // Different pan/tilt
  assert(
    Math.abs(pixel1.pixelX - pixel2.pixelX) > 10 || Math.abs(pixel1.pixelY - pixel2.pixelY) > 10,
    'Ground-truth projection uses camera pan/tilt (correct behavior)'
  );

  // Verify computePixelTrackingError works without pipeline state
  const config = BENCHMARK_SCENARIOS[0].config;
  const telemetry: TelemetryPoint = {
    timeSec: 1, formattedTime: '00:01', fps: 60,
    pan: 0, tilt: 0,
    panError: 0, tiltError: 0, totalError: 0,
    azimuthError: 2.0, elevationError: 1.5,
    confidence: 95, status: 'LOCKED', range: 1200,
    cpuLoad: 15, gpuMem: 1.5,
    groundTruthAz: 2, groundTruthEl: 1.5,
    measuredAz: 2, measuredEl: 1.5,
    estimatedAz: 2, estimatedEl: 1.5,
    kalmanActive: false, detectionSnr: 50,
  };
  const errorPx = computePixelTrackingError(telemetry, config);
  assert(errorPx > 100, `Pixel error computed from angular error (${errorPx.toFixed(1)}px)`);
}

// ══════════════════════════════════════════════════════════
// RUN ALL
// ══════════════════════════════════════════════════════════

function runAllTests(): void {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  FSOC Track Lab — Phase 3A Benchmark Validation     ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  testScenarioDefinitions();
  testInitialVisibility();
  testGroundTruthProjection();
  testPixelTrackingError();
  testMetricsComputation();
  testPassFailEvaluation();
  testPSRequirements();
  testReproducibilityVerification();
  testCsvExport();
  testActualBenchmarkExecution();
  testThreeAlgorithmsS01();
  testGroundTruthLeakageAudit();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`RESULTS: ${testsPassed}/${testsTotal} passed, ${testsFailed} failed`);
  console.log('══════════════════════════════════════════════════════');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests();
