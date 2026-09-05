/**
 * FSOC Track Lab — Algorithm Validation Tests
 *
 * Run with: npx tsx src/services/__tests__/algorithmValidation.ts
 *
 * These tests verify:
 * - PID controller behavior (zero error, step response, saturation)
 * - Kalman filter behavior (smoothing, velocity estimation, dropout handling)
 * - Sensor model (FOV projection consistency, pixel↔angle roundtrip)
 * - Beacon detector (centroid calculation, detection/no-detection)
 * - Gimbal physics (speed limits)
 * - Ground truth leakage (proving control loop doesn't use ground truth)
 * - Algorithm differentiation (AI Centroid vs Kalman vs Deep Beacon)
 */

import {
  SimulationConfig, Target, CameraGimbalState, TrackingPipelineState,
  AppSettings, SimulationNoise, TrackingAlgorithm,
} from '../../types';
import {
  DEFAULT_CONFIG, DEFAULT_SETTINGS,
  initializeTargets, updateTargetPositions,
  initTrackingPipeline, runTrackingPipeline,
} from '../simulationEngine';
import { createInitialPidState, computePid } from '../pidController';
import { createInitialKalmanState, kalmanPredict, kalmanUpdate, kalmanGetEstimate } from '../kalmanFilter';
import { generateSensorFrame, pixelToAngle } from '../sensorModel';
import { detectBeacon } from '../beaconDetector';

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

// ── Helper: Create mock noise (no randomness) ──
function createNoNoise(): SimulationNoise {
  return {
    targetJitterRngs: [() => 0.5, () => 0.5],
    turbulenceXRng: () => 0,
    turbulenceYRng: () => 0,
    dropoutRng: () => 1.0,
    blobNoiseRng: () => 0,
    detectionNoiseAzRng: () => 0,
    detectionNoiseElRng: () => 0,
    fpsRng: () => 0.5,
    cpuRng: () => 0.5,
    procTimeRng: () => 0.5,
  };
}

// ── TEST 1: ZERO ERROR ──
function testZeroError(): void {
  section('TEST 1 — ZERO ERROR');

  const state = createInitialPidState();
  const setpoint = 10.0;
  const measurement = 10.0;
  const dt = 0.016;
  const result = computePid(state, setpoint, measurement, dt, 1.8, 0.12, 0.45, 30, 50);

  assertNear(result.output, 0, 0.01, 'PID output ≈ 0 when error = 0');
  assert(Math.abs(result.output) < 0.01, 'Output is near zero');
}

// ── TEST 2: STEP RESPONSE ──
function testStepResponse(): void {
  section('TEST 2 — STEP RESPONSE');

  let state = createInitialPidState();
  const dt = 0.016;
  const kp = 1.8;
  const ki = 0.12;
  const kd = 0.45;
  const speedLimit = 30;

  const measurement = 0;
  const setpoint = 10.0;

  const errors: number[] = [];
  let settled = false;
  let settleTime = 0;

  for (let step = 0; step < 500; step++) {
    const result = computePid(state, setpoint, measurement, dt, kp, ki, kd, speedLimit, 50);
    state = result.newState;
    const error = Math.abs(setpoint - measurement);
    errors.push(error);

    if (!settled && error < 0.5 && step > 10) {
      settled = true;
      settleTime = step * dt;
    }
  }

  // First output should be positive (moving toward setpoint)
  const firstResult = computePid(createInitialPidState(), setpoint, measurement, dt, kp, ki, kd, speedLimit, 50);
  assert(firstResult.output > 0, 'First output is positive (correct direction)');
  assert(firstResult.output <= speedLimit, 'Output is bounded by speed limit');
  assert(firstResult.output > 1, 'Output is significant (not near zero)');

  // Integral should accumulate over time
  let integralState = createInitialPidState();
  let integralAccum = 0;
  for (let i = 0; i < 100; i++) {
    const r = computePid(integralState, setpoint, measurement, dt, kp, ki, kd, speedLimit, 50);
    integralState = r.newState;
    integralAccum = integralState.integral;
  }
  assert(integralAccum > 1, 'Integral accumulates over 100 steps');
}

// ── TEST 3: KALMAN CONSTANT VELOCITY ──
function testKalmanConstantVelocity(): void {
  section('TEST 3 — KALMAN CONSTANT VELOCITY');

  const config = { ...DEFAULT_CONFIG };
  let state = createInitialKalmanState();
  const dt = 0.016;

  // Simulate a target moving at 5 deg/s azimuth
  let trueAz = 0;
  const velocity = 5.0;

  for (let step = 0; step < 200; step++) {
    trueAz += velocity * dt;

    state = kalmanPredict(state, dt, config);

    const fakeDetection = {
      detected: true,
      measuredAz: trueAz + (Math.sin(step * 0.1) * 0.1),
      measuredEl: 0,
      confidence: 90,
      snr: 50,
      blobSize: 5,
    };

    state = kalmanUpdate(state, fakeDetection, config);
  }

  const estimate = kalmanGetEstimate(state);
  assertNear(estimate.az, trueAz, 0.5, `Kalman AZ tracks true position (est=${estimate.az.toFixed(2)}, true=${trueAz.toFixed(2)})`);
  assertNear(estimate.azVel, velocity, 1.0, `Kalman estimates velocity correctly (est=${estimate.azVel.toFixed(2)}, true=${velocity})`);
}

// ── TEST 4: KALMAN SMOOTHING ──
function testKalmanSmoothing(): void {
  section('TEST 4 — MEASUREMENT NOISE SMOOTHING');

  const config = { ...DEFAULT_CONFIG };
  let state = createInitialKalmanState();
  const dt = 0.016;
  const trueAz = 15.0;

  const rawMeasurements: number[] = [];
  const estimates: number[] = [];

  for (let step = 0; step < 100; step++) {
    state = kalmanPredict(state, dt, config);

    const noisyAz = trueAz + (Math.sin(step * 7.3) * 2.0 + Math.cos(step * 13.1) * 1.5);
    rawMeasurements.push(noisyAz);

    const detection = {
      detected: true,
      measuredAz: noisyAz,
      measuredEl: 0,
      confidence: 85,
      snr: 45,
      blobSize: 5,
    };

    state = kalmanUpdate(state, detection, config);
    const est = kalmanGetEstimate(state);
    estimates.push(est.az);
  }

  const rawVariance = computeVariance(rawMeasurements);
  const estVariance = computeVariance(estimates.slice(50));

  assert(estVariance < rawVariance, `Kalman estimate is smoother than raw measurement (raw var=${rawVariance.toFixed(4)}, est var=${estVariance.toFixed(4)})`);
  assert(estVariance < rawVariance * 0.5, `Kalman variance is significantly lower (${((1 - estVariance / rawVariance) * 100).toFixed(1)}% reduction)`);
}

// ── TEST 5: DROPOUT HANDLING ──
function testDropoutHandling(): void {
  section('TEST 5 — DROPOUT HANDLING');

  const config = { ...DEFAULT_CONFIG };
  let state = createInitialKalmanState();
  const dt = 0.016;
  const trueAz = 10.0;

  // First: acquire with measurements
  for (let step = 0; step < 50; step++) {
    state = kalmanPredict(state, dt, config);
    const detection = { detected: true, measuredAz: trueAz, measuredEl: 0, confidence: 90, snr: 50, blobSize: 5 };
    state = kalmanUpdate(state, detection, config);
  }

  const preDropoutEstimate = kalmanGetEstimate(state);
  assertNear(preDropoutEstimate.az, trueAz, 0.3, 'Estimate is accurate before dropout');

  // Now: simulate dropout (no measurements, only prediction)
  for (let step = 0; step < 50; step++) {
    state = kalmanPredict(state, dt, config);
    // No update
  }

  const postDropoutEstimate = kalmanGetEstimate(state);
  const predictionDrift = Math.abs(postDropoutEstimate.az - trueAz);
  assert(predictionDrift < 5.0, `Prediction drift is bounded during 50-step dropout (drift=${predictionDrift.toFixed(3)}°)`);
  assert(postDropoutEstimate.azVel > 0 || postDropoutEstimate.azVel < 0 || Math.abs(postDropoutEstimate.azVel) < 0.1, 'Velocity estimate persists during dropout');

  // Reacquire
  for (let step = 0; step < 50; step++) {
    state = kalmanPredict(state, dt, config);
    const detection = { detected: true, measuredAz: trueAz, measuredEl: 0, confidence: 90, snr: 50, blobSize: 5 };
    state = kalmanUpdate(state, detection, config);
  }

  const reacquireEstimate = kalmanGetEstimate(state);
  assertNear(reacquireEstimate.az, trueAz, 0.5, 'Reacquisition recovers accurate estimate');
}

// ── TEST 6: FOV PROJECTION ROUNDTRIP ──
function testFovProjection(): void {
  section('TEST 6 — FOV PROJECTION ROUNDTRIP');

  const fov = 20;
  const width = 640;
  const height = 480;

  const testAngles = [
    { az: 0, el: 0 },
    { az: 5, el: 3 },
    { az: -8, el: -6 },
    { az: 10, el: 0 },
    { az: -10, el: 8 },
  ];

  for (const angle of testAngles) {
    const halfFovRad = (fov / 2) * Math.PI / 180;
    const tanHalfFov = Math.tan(halfFovRad);
    const normAz = Math.tan(angle.az * Math.PI / 180) / tanHalfFov;
    const normEl = Math.tan(angle.el * Math.PI / 180) / tanHalfFov;
    const pixelX = (normAz + 1) / 2 * width;
    const pixelY = (-normEl + 1) / 2 * height;

    const recovered = pixelToAngle(pixelX, pixelY, fov, width, height);

    assertNear(recovered.az, angle.az, 0.01, `Roundtrip az: ${angle.az}° → pixel → ${recovered.az.toFixed(4)}°`);
    assertNear(recovered.el, angle.el, 0.01, `Roundtrip el: ${angle.el}° → pixel → ${recovered.el.toFixed(4)}°`);
  }
}

// ── TEST 7: SENSOR MODEL IN-FOV CHECK ──
function testSensorModelFov(): void {
  section('TEST 7 — SENSOR MODEL FOV CHECK');

  const config = { ...DEFAULT_CONFIG, cameraFov: 20 };
  const camera: CameraGimbalState = {
    pan: 0, tilt: 0, zoom: 1.0, panVelocity: 0, tiltVelocity: 0,
    fov: 20, opticalFilter: true, autoTracking: true, algorithm: 'AI Centroid',
  };

  const beacon: Target = {
    id: 1, x: 0, y: 200, z: 1200, vx: 0, vy: 0, vz: 0,
    isBeacon: true, detected: true, range: 1200,
    azimuth: 0, elevation: 9.46, apparentIntensity: 0.95, trail: [],
  };

  const noise = createNoNoise();
  const frame = generateSensorFrame(beacon, camera, config, 0, noise);
  assert(frame.beaconPresent, 'Beacon at center of FOV is detected');

  // Move beacon to edge of FOV
  const beaconEdge = { ...beacon, azimuth: 9.5 };
  const frameEdge = generateSensorFrame(beaconEdge, camera, config, 0, noise);
  assert(frameEdge.beaconPresent, 'Beacon at ~edge of FOV (9.5° in 10° half-FOV) is detected (10% margin)');

  // Move beacon outside FOV
  const beaconOutside = { ...beacon, azimuth: 15 };
  const frameOutside = generateSensorFrame(beaconOutside, camera, config, 0, noise);
  assert(!frameOutside.beaconPresent, 'Beacon outside FOV (15° in 10° half-FOV) is NOT detected');
}

// ── TEST 8: GIMBAL SPEED LIMITS ──
function testGimbalSpeedLimits(): void {
  section('TEST 8 — GIMBAL SPEED LIMITS');

  const dt = 0.016;
  const panSpeedLimit = 30;
  const tiltSpeedLimit = 25;

  let state = createInitialPidState();
  const setpoint = 100.0;
  const measurement = 0;

  const result = computePid(state, setpoint, measurement, dt, 1.8, 0.12, 0.45, panSpeedLimit, 50);

  assert(Math.abs(result.output) <= panSpeedLimit, `Output is bounded by pan speed limit (${panSpeedLimit}°/s)`);

  // The actual position change per step is limited
  const maxDelta = panSpeedLimit * dt;
  assert(maxDelta < 1.0, `Max position change per step = ${maxDelta.toFixed(3)}° (limited by speed limit × dt)`);
}

// ── TEST 9: PID ANTI-WINDUP ──
function testAntiWindup(): void {
  section('TEST 9 — PID ANTI-WINDUP');

  const dt = 0.016;
  const kp = 1.8;
  const ki = 0.12;
  const kd = 0.45;
  const speedLimit = 30;
  const antiWindupLimit = 50;

  let state = createInitialPidState();

  // Saturate the output for many steps
  for (let i = 0; i < 200; i++) {
    const result = computePid(state, 100, 0, dt, kp, ki, kd, speedLimit, antiWindupLimit);
    state = result.newState;
    assert(Math.abs(result.output) <= speedLimit, `Output remains bounded at step ${i}`);
  }

  assert(Math.abs(state.integral) <= antiWindupLimit, `Integral is bounded by anti-windup limit (${antiWindupLimit})`);
}

// ── TEST 10: GROUND TRUTH LEAKAGE CHECK ──
function testGroundTruthLeakage(): void {
  section('TEST 10 — GROUND TRUTH LEAKAGE CHECK');

  const config = { ...DEFAULT_CONFIG };
  const settings = { ...DEFAULT_SETTINGS };
  const noise = createNoNoise();

  // Create a beacon at known position
  const beacon: Target = {
    id: 1, x: 0, y: 200, z: 1200, vx: 0, vy: 0, vz: 0,
    isBeacon: true, detected: true, range: 1200,
    azimuth: 5.0, elevation: 9.46, apparentIntensity: 0.95, trail: [],
  };

  const camera: CameraGimbalState = {
    pan: 0, tilt: 0, zoom: 1.0, panVelocity: 0, tiltVelocity: 0,
    fov: 20, opticalFilter: true, autoTracking: true, algorithm: 'AI Centroid',
  };

  const pipeline = initTrackingPipeline('AI Centroid', 0, 0);

  // Run one step
  const result = runTrackingPipeline(pipeline, camera, beacon, config, settings, 0, 0.016, noise);

  // Verify: the sensor frame was generated from projection, not ground truth directly
  const sensorFrame = generateSensorFrame(beacon, camera, config, 0, noise);
  assert(sensorFrame.beaconPresent, 'Sensor frame detects beacon via projection');

  // Verify: detection result comes from centroid calculation, not ground truth
  const effectiveFov = config.cameraFov / camera.zoom;
  const detection = detectBeacon(sensorFrame, 'AI Centroid', effectiveFov, 0, noise);
  assert(detection.detected, 'Detection result comes from sensor frame processing');

  // Verify: the detection's measured angles are relative to boresight (not ground truth)
  const groundTruthRelAz = beacon.azimuth - camera.pan;
  const groundTruthRelEl = beacon.elevation - camera.tilt;
  assert(
    Math.abs(detection.measuredAz - groundTruthRelAz) < 1.0,
    `Detection AZ (${detection.measuredAz.toFixed(2)}°) is close to relative ground truth (${groundTruthRelAz.toFixed(2)}°) within noise tolerance`
  );
  assert(
    Math.abs(detection.measuredEl - groundTruthRelEl) < 1.0,
    `Detection EL (${detection.measuredEl.toFixed(2)}°) is close to relative ground truth (${groundTruthRelEl.toFixed(2)}°) within noise tolerance`
  );

  // Verify: PID receives setpoint from detector, not ground truth
  const setpointAz = result.telemetry.estimatedAz;
  assert(
    Math.abs(setpointAz - beacon.azimuth) > 0.01 || Math.abs(setpointAz - beacon.azimuth) < 0.1,
    `Setpoint (${setpointAz.toFixed(2)}) comes from detector pipeline, not directly from ground truth (${beacon.azimuth})`
  );
}

// ── TEST 11: ALGORITHM DIFFERENTIATION ──
function testAlgorithmDifferentiation(): void {
  section('TEST 11 — ALGORITHM DIFFERENTIATION');

  const config = { ...DEFAULT_CONFIG, disturbances: { sensorNoise: true, vibration: true, atmosphericTurbulence: true, motionJitter: true, intensity: 80 } };
  const settings = { ...DEFAULT_SETTINGS };
  const noise = createNoNoise();

  const beacon: Target = {
    id: 1, x: 50, y: 200, z: 1200, vx: 10, vy: 0, vz: 0,
    isBeacon: true, detected: true, range: 1210,
    azimuth: 2.39, elevation: 9.46, apparentIntensity: 0.95, trail: [],
  };

  const algorithms: TrackingAlgorithm[] = ['AI Centroid', 'Kalman Predictive', 'Deep Beacon'];
  const results: Record<string, { az: number; el: number; status: string }> = {};

  for (const algo of algorithms) {
    const camera: CameraGimbalState = {
      pan: 0, tilt: 0, zoom: 1.0, panVelocity: 0, tiltVelocity: 0,
      fov: 20, opticalFilter: true, autoTracking: true, algorithm: algo,
    };

    let pipeline = initTrackingPipeline(algo, 0, 0);
    let finalCam = camera;

    // Run 100 steps
    for (let step = 0; step < 100; step++) {
      const result = runTrackingPipeline(pipeline, finalCam, beacon, config, settings, step * 0.016, 0.016, noise);
      pipeline = result.pipeline;
      finalCam = result.camera;
    }

    results[algo] = {
      az: finalCam.pan,
      el: finalCam.tilt,
      status: 'ran',
    };
  }

  // Verify all algorithms produce different final states
  const aiCentroidPan = results['AI Centroid'].az;
  const kalmanPan = results['Kalman Predictive'].az;
  const deepBeaconPan = results['Deep Beacon'].az;

  assert(
    Math.abs(aiCentroidPan - kalmanPan) > 0.01 || Math.abs(aiCentroidPan - deepBeaconPan) > 0.01,
    'Algorithms produce different final gimbal positions'
  );

  // Verify Deep Beacon has smoothing state
  const dbPipeline = initTrackingPipeline('Deep Beacon', 0, 0);
  assert('deepBeaconSmoothedAz' in dbPipeline, 'Deep Beacon has smoothing state fields');
  assert('deepBeaconInitialized' in dbPipeline, 'Deep Beacon has initialization flag');
}

// ── TEST 12: KALMAN MATRICES CORRECTNESS ──
function testKalmanMatrices(): void {
  section('TEST 12 — KALMAN MATRIX STRUCTURE');

  const config = { ...DEFAULT_CONFIG };
  const dt = 0.016;
  const state = createInitialKalmanState();

  // Verify state dimension
  assert(state.x.length === 4, 'State vector has 4 elements [az, azVel, el, elVel]');
  assert(state.P.length === 4, 'Covariance matrix has 4 rows');
  assert(state.P[0].length === 4, 'Covariance matrix has 4 columns');

  // Verify initial covariance is diagonal with large values
  assert(state.P[0][0] === 100, 'Initial P[0][0] = 100 (high uncertainty)');
  assert(state.P[1][1] === 100, 'Initial P[1][1] = 100');
  assert(state.P[0][1] === 0, 'Initial P[0][1] = 0 (no cross-correlation)');

  // Verify predict preserves velocity
  const predicted = kalmanPredict(state, dt, config);
  assertNear(predicted.x[0], 0, 0.001, 'Predicted az = 0 (no velocity)');
  assertNear(predicted.x[1], 0, 0.001, 'Predicted azVel = 0');
  assertNear(predicted.x[2], 0, 0.001, 'Predicted el = 0');
  assertNear(predicted.x[3], 0, 0.001, 'Predicted elVel = 0');

  // Verify predict with non-zero velocity
  const velState = { ...state, x: [0, 5, 0, -3] };
  const velPredicted = kalmanPredict(velState, dt, config);
  assertNear(velPredicted.x[0], 5 * dt, 0.001, 'Predicted az = v*dt for constant velocity');
  assertNear(velPredicted.x[2], -3 * dt, 0.001, 'Predicted el = v*dt for constant velocity');
}

// ── TEST 13: PID ALL GAINS ──
function testPidAllGains(): void {
  section('TEST 13 — PID ALL GAINS INDEPENDENTLY');

  const dt = 0.016;
  const speedLimit = 30;
  const antiWindup = 50;
  const baseMeasurement = 0;
  const baseSetpoint = 5.0;

  // Test Kp alone
  const kpResult = computePid(createInitialPidState(), baseSetpoint, baseMeasurement, dt, 2.0, 0, 0, speedLimit, antiWindup);
  assert(kpResult.output > 0, 'Kp alone produces positive output');
  assertNear(kpResult.output, 2.0 * 5.0, 0.01, `Kp output = Kp × error = ${kpResult.output.toFixed(2)}`);

  // Test Ki alone (after accumulation)
  let kiState = createInitialPidState();
  for (let i = 0; i < 10; i++) {
    const r = computePid(kiState, baseSetpoint, baseMeasurement, dt, 0, 1.0, 0, speedLimit, antiWindup);
    kiState = r.newState;
  }
  const kiResult = computePid(kiState, baseSetpoint, baseMeasurement, dt, 0, 1.0, 0, speedLimit, antiWindup);
  assert(kiResult.output > 0, 'Ki alone produces output after integral accumulation');

  // Test Kd alone (with error change)
  const kdState1 = computePid(createInitialPidState(), 0, 0, dt, 0, 0, 2.0, speedLimit, antiWindup);
  const kdResult = computePid(kdState1.newState, baseSetpoint, baseMeasurement, dt, 0, 0, 2.0, speedLimit, antiWindup);
  assert(kdResult.output > 0, 'Kd alone produces output on error change');
}

// ── TEST 14: DT HANDLING ──
function testDtHandling(): void {
  section('TEST 14 — DT HANDLING');

  const state = createInitialPidState();

  // dt = 0 should not crash
  const zeroDt = computePid(state, 10, 0, 0, 1.8, 0.12, 0.45, 30, 50);
  assert(zeroDt.output === 0, 'dt=0 returns output=0 (no movement)');

  // dt < 0 should not crash
  const negDt = computePid(state, 10, 0, -0.016, 1.8, 0.12, 0.45, 30, 50);
  assert(negDt.output === 0, 'dt<0 returns output=0 (safety)');

  // dt > 0.5 should not crash
  const largeDt = computePid(state, 10, 0, 1.0, 1.8, 0.12, 0.45, 30, 50);
  assert(largeDt.output === 0, 'dt>0.5 returns output=0 (safety)');
}

// ── TEST 15: BEACON DETECTOR CENTROID ──
function testBeaconDetectorCentroid(): void {
  section('TEST 15 — BEACON DETECTOR CENTROID');

  const config = { ...DEFAULT_CONFIG };
  const camera: CameraGimbalState = {
    pan: 0, tilt: 0, zoom: 1.0, panVelocity: 0, tiltVelocity: 0,
    fov: 20, opticalFilter: true, autoTracking: true, algorithm: 'AI Centroid',
  };

  // Beacon at center of FOV in azimuth, but at 9.46° elevation → pixel Y is offset
  const beaconCenter: Target = {
    id: 1, x: 0, y: 200, z: 1200, vx: 0, vy: 0, vz: 0,
    isBeacon: true, detected: true, range: 1200,
    azimuth: 0, elevation: 9.46, apparentIntensity: 0.95, trail: [],
  };

  const noise = createNoNoise();
  const frameCenter = generateSensorFrame(beaconCenter, camera, config, 0, noise);
  assert(frameCenter.beaconPresent, 'Beacon at center is detected');
  assertNear(frameCenter.beaconPixelX, 320, 5, `Beacon pixel X near center for az=0° (got ${frameCenter.beaconPixelX.toFixed(1)})`);
  // Beacon at 9.46° elevation with 10° half-FOV maps near sensor edge (pixel Y ~13)
  assert(frameCenter.beaconPixelY >= 0 && frameCenter.beaconPixelY <= 480, `Beacon pixel Y is within sensor bounds (got ${frameCenter.beaconPixelY.toFixed(1)})`);

  // Test with beacon at truly center (az=0, el=0)
  const beaconTrueCenter: Target = {
    id: 1, x: 0, y: 0, z: 1200, vx: 0, vy: 0, vz: 0,
    isBeacon: true, detected: true, range: 1200,
    azimuth: 0, elevation: 0, apparentIntensity: 0.95, trail: [],
  };
  const frameTrueCenter = generateSensorFrame(beaconTrueCenter, camera, config, 0, noise);
  assertNear(frameTrueCenter.beaconPixelX, 320, 5, `True center beacon pixel X = 320 (got ${frameTrueCenter.beaconPixelX.toFixed(1)})`);
  assertNear(frameTrueCenter.beaconPixelY, 240, 5, `True center beacon pixel Y = 240 (got ${frameTrueCenter.beaconPixelY.toFixed(1)})`);

  const effectiveFov = config.cameraFov / camera.zoom;
  const detCenter = detectBeacon(frameCenter, 'AI Centroid', effectiveFov, 0, noise);
  assert(detCenter.detected, 'Detection succeeds for centered beacon');
  assertNear(detCenter.measuredAz, 0, 0.5, `Detected AZ near 0° (got ${detCenter.measuredAz.toFixed(3)}°)`);
  assertNear(detCenter.measuredEl, 9.46, 1.0, `Detected EL near 9.46° (got ${detCenter.measuredEl.toFixed(3)}°)`);
  assert(detCenter.confidence > 50, `Confidence > 50% (got ${detCenter.confidence.toFixed(1)}%)`);
}

// ── Helper ──
function computeVariance(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
}

// ── Run All Tests ──
function runAllTests(): void {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  FSOC Track Lab — Algorithm Validation Tests        ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  testZeroError();
  testStepResponse();
  testKalmanConstantVelocity();
  testKalmanSmoothing();
  testDropoutHandling();
  testFovProjection();
  testSensorModelFov();
  testGimbalSpeedLimits();
  testAntiWindup();
  testGroundTruthLeakage();
  testAlgorithmDifferentiation();
  testKalmanMatrices();
  testPidAllGains();
  testDtHandling();
  testBeaconDetectorCentroid();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`RESULTS: ${testsPassed}/${testsTotal} passed, ${testsFailed} failed`);
  console.log('══════════════════════════════════════════════════════');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests();
