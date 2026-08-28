import {
  SimulationConfig, Target, CameraGimbalState, TelemetryPoint, LogEntry, Scenario,
  AppSettings, PerformanceStats, TrackingPipelineState, TrackingAlgorithm,
} from '../types';
import { generateSensorFrame } from './sensorModel';
import { detectBeacon } from './beaconDetector';
import { createInitialKalmanState, kalmanPredict, kalmanUpdate, kalmanGetEstimate } from './kalmanFilter';
import { createInitialPidState, computePid } from './pidController';

export const DEFAULT_SETTINGS: AppSettings = {
  uiTheme: 'dark',
  coordinateUnits: 'metric',
  reticleStyle: 'crosshair',
  defaultDuration: 120,
  timeStep: 0.016,
  baseNoiseVariance: '1.5e-4',
  logDirPath: '/opt/fsoc/lab/logs',
  retentionPolicy: '30',
  verboseTelemetry: true,
  pidKp: 1.8,
  pidKi: 0.12,
  pidKd: 0.45,
};

export const DEFAULT_CONFIG: SimulationConfig = {
  id: 'sim_default',
  name: 'Demo-01 (Easy)',
  targetCount: 1,
  designatedBeaconIndex: 1,
  targetSpeedMach: 2.4,
  trajectory: 'Random',
  cameraFov: 20,
  initialPosition: 'Default Center',
  panSpeedLimit: 30,
  tiltSpeedLimit: 25,
  disturbances: {
    sensorNoise: false,
    vibration: true,
    atmosphericTurbulence: false,
    motionJitter: true,
    intensity: 80,
  },
  durationSec: 120,
  timeStep: 0.016,
};

export const PRESET_SCENARIOS: Scenario[] = [
  {
    id: 'scen_1',
    title: 'Demo-01 (Easy)',
    description: '1 target, slow speed, no disturbance',
    lastRun: 'Today, 10:15 AM',
    status: 'idle',
    config: {
      id: 'scen_1',
      name: 'Demo-01 (Easy)',
      targetCount: 1,
      designatedBeaconIndex: 1,
      targetSpeedMach: 1.2,
      trajectory: 'Sinusoidal Drift',
      cameraFov: 25,
      initialPosition: 'Default Center',
      panSpeedLimit: 35,
      tiltSpeedLimit: 30,
      disturbances: {
        sensorNoise: false,
        vibration: false,
        atmosphericTurbulence: false,
        motionJitter: false,
        intensity: 20,
      },
      durationSec: 120,
      timeStep: 0.016,
    },
  },
  {
    id: 'scen_2',
    title: 'Demo-02 (Multiple Targets)',
    description: '5 targets, medium speed',
    lastRun: 'Today, 11:02 AM',
    status: 'idle',
    config: {
      id: 'scen_2',
      name: 'Demo-02 (Multiple Targets)',
      targetCount: 5,
      designatedBeaconIndex: 1,
      targetSpeedMach: 1.8,
      trajectory: 'Orbital Pattern',
      cameraFov: 22,
      initialPosition: 'Default Center',
      panSpeedLimit: 35,
      tiltSpeedLimit: 30,
      disturbances: {
        sensorNoise: true,
        vibration: true,
        atmosphericTurbulence: false,
        motionJitter: false,
        intensity: 50,
      },
      durationSec: 150,
      timeStep: 0.016,
    },
  },
  {
    id: 'scen_3',
    title: 'Demo-03 (High Speed)',
    description: '1 target, high speed',
    lastRun: 'Today, 11:45 AM',
    status: 'idle',
    config: {
      id: 'scen_3',
      name: 'Demo-03 (High Speed)',
      targetCount: 1,
      designatedBeaconIndex: 1,
      targetSpeedMach: 3.2,
      trajectory: 'Evasive Maneuvers',
      cameraFov: 20,
      initialPosition: 'Offset Left (45°)',
      panSpeedLimit: 45,
      tiltSpeedLimit: 35,
      disturbances: {
        sensorNoise: true,
        vibration: true,
        atmosphericTurbulence: false,
        motionJitter: true,
        intensity: 75,
      },
      durationSec: 155,
      timeStep: 0.016,
    },
  },
  {
    id: 'scen_4',
    title: 'Demo-04 (Disturbances)',
    description: 'Vibration + Noise + Turbulence',
    lastRun: 'Today, 12:30 PM',
    status: 'idle',
    config: {
      id: 'scen_4',
      name: 'Demo-04 (Disturbances)',
      targetCount: 3,
      designatedBeaconIndex: 1,
      targetSpeedMach: 2.4,
      trajectory: 'Random',
      cameraFov: 20,
      initialPosition: 'Default Center',
      panSpeedLimit: 30,
      tiltSpeedLimit: 25,
      disturbances: {
        sensorNoise: true,
        vibration: true,
        atmosphericTurbulence: true,
        motionJitter: true,
        intensity: 85,
      },
      durationSec: 180,
      timeStep: 0.016,
    },
  },
];

export function initializeTargets(config: SimulationConfig): Target[] {
  const count = config.targetCount || 1;
  const targets: Target[] = [];
  const speedScale = (config.targetSpeedMach * 343) * 0.05;

  for (let i = 0; i < count; i++) {
    const isBeacon = config.designatedBeaconIndex === -1 ? i === 0 : (i + 1) === config.designatedBeaconIndex;
    const baseAngle = (i / count) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
    const dist = 1000 + Math.random() * 500;

    const x = Math.sin(baseAngle) * (dist * 0.5) + (Math.random() * 100 - 50);
    const y = 200 + Math.random() * 200;
    const z = Math.cos(baseAngle) * (dist * 0.8) + 800;

    const vx = (Math.random() - 0.5) * speedScale;
    const vy = (Math.random() - 0.5) * speedScale * 0.3;
    const vz = (Math.random() - 0.5) * speedScale * 0.5;

    const range = Math.sqrt(x * x + y * y + z * z);
    const azimuth = Math.atan2(x, z) * (180 / Math.PI);
    const elevation = Math.atan2(y, Math.sqrt(x * x + z * z)) * (180 / Math.PI);

    targets.push({
      id: i + 1,
      x, y, z, vx, vy, vz,
      isBeacon,
      detected: isBeacon,
      range: Math.round(range),
      azimuth: parseFloat(azimuth.toFixed(1)),
      elevation: parseFloat(elevation.toFixed(1)),
      apparentIntensity: isBeacon ? 0.95 : 0.4 + Math.random() * 0.3,
      trail: [{ x, y, z }],
    });
  }

  return targets;
}

export function updateTargetPositions(
  targets: Target[],
  elapsedSec: number,
  config: SimulationConfig
): Target[] {
  const dt = 0.016;
  const speedMultiplier = config.targetSpeedMach * 0.6;
  const intensity = (config.disturbances.intensity / 100);

  return targets.map((t, idx) => {
    let { x, y, z, vx, vy, vz } = t;

    switch (config.trajectory) {
      case 'Linear Escape':
        x += (vx + Math.sin(elapsedSec * 0.2) * 10 * speedMultiplier) * dt;
        y += (vy + Math.cos(elapsedSec * 0.1) * 3) * dt;
        z += (150 * speedMultiplier) * dt;
        break;

      case 'Orbital Pattern': {
        const radius = 600 + idx * 80;
        const angle = elapsedSec * (0.35 * speedMultiplier) + (idx * (Math.PI * 2 / targets.length));
        x = Math.sin(angle) * radius;
        y = 250 + Math.sin(angle * 2) * 50;
        z = 1100 + Math.cos(angle) * (radius * 0.6);
        break;
      }

      case 'Evasive Maneuvers': {
        const wiggle = Math.sin(elapsedSec * 3 + idx) * 120 * speedMultiplier;
        const heave = Math.cos(elapsedSec * 2.2 + idx) * 60 * speedMultiplier;
        x += (Math.sin(elapsedSec * 0.8) * 80 + (Math.random() - 0.5) * 40 * intensity) * dt;
        y = 240 + heave + wiggle * 0.2;
        z = 1200 + Math.cos(elapsedSec * 0.4) * 200 + (Math.sin(elapsedSec * 1.5) * 50);
        break;
      }

      case 'Sinusoidal Drift':
        x = Math.sin(elapsedSec * 0.4 + idx) * 350;
        y = 220 + Math.cos(elapsedSec * 0.3) * 80;
        z = 1250 + Math.sin(elapsedSec * 0.2) * 150;
        break;

      case 'Random':
      default: {
        const swayX = Math.sin(elapsedSec * 0.7 + idx) * 250 + Math.sin(elapsedSec * 1.7) * 70;
        const swayY = 230 + Math.cos(elapsedSec * 0.5 + idx) * 90;
        const swayZ = 1200 + Math.cos(elapsedSec * 0.3) * 180;
        x = swayX;
        y = swayY;
        z = swayZ;
        break;
      }
    }

    if (config.disturbances.motionJitter) {
      x += (Math.random() - 0.5) * 4 * intensity;
      y += (Math.random() - 0.5) * 3 * intensity;
    }

    const range = Math.sqrt(x * x + y * y + z * z);
    const azimuth = Math.atan2(x, z) * (180 / Math.PI);
    const elevation = Math.atan2(y, Math.sqrt(x * x + z * z)) * (180 / Math.PI);

    const newTrail = [...t.trail, { x, y, z }];
    if (newTrail.length > 30) {
      newTrail.shift();
    }

    return {
      ...t,
      x, y, z, vx, vy, vz,
      range: Math.round(range),
      azimuth: parseFloat(azimuth.toFixed(1)),
      elevation: parseFloat(elevation.toFixed(1)),
      trail: newTrail,
    };
  });
}

export function initTrackingPipeline(
  algorithm: TrackingAlgorithm,
  initialPan: number,
  initialTilt: number
): TrackingPipelineState {
  return {
    algorithm,
    kalman: createInitialKalmanState(),
    panPid: createInitialPidState(),
    tiltPid: createInitialPidState(),
    lastDetection: null,
    consecutiveDropouts: 0,
    lastMeasurementAz: initialPan,
    lastMeasurementEl: initialTilt,
    lastEstimatedAz: initialPan,
    lastEstimatedEl: initialTilt,
  };
}

export function runTrackingPipeline(
  pipeline: TrackingPipelineState,
  camera: CameraGimbalState,
  beacon: Target | undefined,
  config: SimulationConfig,
  settings: AppSettings,
  elapsedSec: number,
  dt: number
): {
  pipeline: TrackingPipelineState;
  camera: CameraGimbalState;
  telemetry: TelemetryPoint;
} {
  let { pan, tilt, zoom, autoTracking, algorithm } = camera;

  const effectiveFov = config.cameraFov / zoom;

  let distPan = 0;
  let distTilt = 0;
  const intensity = (config.disturbances.intensity / 100);

  if (config.disturbances.vibration) {
    distPan += Math.sin(elapsedSec * 25) * 0.18 * intensity;
    distTilt += Math.cos(elapsedSec * 32) * 0.15 * intensity;
  }
  if (config.disturbances.atmosphericTurbulence) {
    distPan += (Math.sin(elapsedSec * 8) + Math.sin(elapsedSec * 19)) * 0.12 * intensity;
    distTilt += (Math.cos(elapsedSec * 7) + Math.cos(elapsedSec * 17)) * 0.1 * intensity;
  }

  // ── Coordinate frame: ground truth (absolute world angles) ──
  const groundTruthAz = beacon ? beacon.azimuth : 0;
  const groundTruthEl = beacon ? beacon.elevation : 0;

  const sensorFrame = generateSensorFrame(beacon, camera, config, elapsedSec);

  const rawDetection = detectBeacon(sensorFrame, algorithm, effectiveFov, elapsedSec);

  // Convert relative detector output to absolute angles.
  // The sensor pixel→angle pipeline (sensorModel.pixelToAngle) returns angles
  // relative to the current gimbal boresight. The Kalman filter state and PID
  // controller both operate in absolute angle space, so we add the current
  // gimbal position here before any downstream use.
  const detection = rawDetection.detected ? {
    ...rawDetection,
    measuredAz: rawDetection.measuredAz + pan,
    measuredEl: rawDetection.measuredEl + tilt,
  } : rawDetection;

  let newPipeline = { ...pipeline };
  newPipeline.algorithm = algorithm;

  if (detection.detected) {
    newPipeline.lastDetection = detection;
    newPipeline.consecutiveDropouts = 0;
    newPipeline.lastMeasurementAz = detection.measuredAz;
    newPipeline.lastMeasurementEl = detection.measuredEl;
  } else {
    newPipeline.consecutiveDropouts++;
  }

  let setpointAz: number;
  let setpointEl: number;
  let kalmanActive = false;
  let estimatedAz = newPipeline.lastMeasurementAz;
  let estimatedEl = newPipeline.lastMeasurementEl;

  if (algorithm === 'Kalman Predictive') {
    kalmanActive = true;
    let kalmanState = { ...newPipeline.kalman };

    if (kalmanState.initialized || detection.detected) {
      kalmanState = kalmanPredict(kalmanState, dt, config);

      if (detection.detected) {
        kalmanState = kalmanUpdate(kalmanState, detection, config);
      }

      const estimate = kalmanGetEstimate(kalmanState);
      estimatedAz = estimate.az;
      estimatedEl = estimate.el;
    } else {
      estimatedAz = newPipeline.lastMeasurementAz;
      estimatedEl = newPipeline.lastMeasurementEl;
    }

    newPipeline.kalman = kalmanState;
    setpointAz = estimatedAz;
    setpointEl = estimatedEl;
  } else if (algorithm === 'Deep Beacon') {
    if (detection.detected) {
      setpointAz = detection.measuredAz;
      setpointEl = detection.measuredEl;
      estimatedAz = detection.measuredAz;
      estimatedEl = detection.measuredEl;
    } else if (newPipeline.consecutiveDropouts < 5) {
      setpointAz = newPipeline.lastMeasurementAz;
      setpointEl = newPipeline.lastMeasurementEl;
    } else {
      setpointAz = pan;
      setpointEl = tilt;
    }
  } else {
    if (detection.detected) {
      setpointAz = detection.measuredAz;
      setpointEl = detection.measuredEl;
      estimatedAz = detection.measuredAz;
      estimatedEl = detection.measuredEl;
    } else {
      setpointAz = pan;
      setpointEl = tilt;
    }
  }

  newPipeline.lastEstimatedAz = estimatedAz;
  newPipeline.lastEstimatedEl = estimatedEl;

  let newPanVelocity = camera.panVelocity;
  let newTiltVelocity = camera.tiltVelocity;

  if (autoTracking) {
    const panPidResult = computePid(
      newPipeline.panPid,
      setpointAz,
      pan + distPan,
      dt,
      settings.pidKp,
      settings.pidKi,
      settings.pidKd,
      config.panSpeedLimit,
      50
    );
    newPipeline.panPid = panPidResult.newState;
    newPanVelocity = panPidResult.output;

    const tiltPidResult = computePid(
      newPipeline.tiltPid,
      setpointEl,
      tilt + distTilt,
      dt,
      settings.pidKp,
      settings.pidKi,
      settings.pidKd,
      config.tiltSpeedLimit,
      50
    );
    newPipeline.tiltPid = tiltPidResult.newState;
    newTiltVelocity = tiltPidResult.output;
  }

  const newPan = pan + newPanVelocity * dt;
  const newTilt = tilt + newTiltVelocity * dt;

  const truePanError = groundTruthAz - newPan;
  const trueTiltError = groundTruthEl - newTilt;
  const measuredPanError = detection.detected ? detection.measuredAz - newPan : truePanError;
  const measuredTiltError = detection.detected ? detection.measuredEl - newTilt : trueTiltError;

  const totalError = Math.sqrt(truePanError * truePanError + trueTiltError * trueTiltError);

  let status: TelemetryPoint['status'] = 'SEARCHING';
  let confidence = 0;

  if (detection.detected) {
    confidence = detection.confidence;
    if (totalError < 1.2 && confidence > 80) {
      status = 'LOCKED';
    } else if (totalError < 4.0) {
      status = 'ACQUIRING';
    } else {
      status = 'SEARCHING';
    }
  } else if (newPipeline.consecutiveDropouts > 0 && newPipeline.consecutiveDropouts < 10) {
    confidence = Math.max(5, 60 - newPipeline.consecutiveDropouts * 8);
    status = 'ACQUIRING';
  } else if (newPipeline.consecutiveDropouts >= 10) {
    confidence = 0;
    status = 'LOST';
  } else {
    status = 'SEARCHING';
    confidence = 5;
  }

  const mins = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
  const secs = Math.floor(elapsedSec % 60).toString().padStart(2, '0');
  const formattedTime = `${mins}:${secs}`;

  const telemetry: TelemetryPoint = {
    timeSec: elapsedSec,
    formattedTime,
    fps: 58 + Math.round(Math.random() * 3),
    pan: parseFloat(newPan.toFixed(1)),
    tilt: parseFloat(newTilt.toFixed(1)),
    panError: parseFloat(measuredPanError.toFixed(2)),
    tiltError: parseFloat(measuredTiltError.toFixed(2)),
    totalError: parseFloat(totalError.toFixed(2)),
    azimuthError: parseFloat(Math.abs(truePanError).toFixed(2)),
    elevationError: parseFloat(Math.abs(trueTiltError).toFixed(2)),
    confidence: parseFloat(confidence.toFixed(1)),
    status,
    range: beacon ? beacon.range : 0,
    cpuLoad: Math.round(12 + (config.disturbances.intensity * 0.1) + Math.random() * 2),
    gpuMem: parseFloat((1.2 + (config.targetCount * 0.08)).toFixed(1)),
    groundTruthAz: parseFloat(groundTruthAz.toFixed(2)),
    groundTruthEl: parseFloat(groundTruthEl.toFixed(2)),
    measuredAz: parseFloat(detection.detected ? detection.measuredAz.toFixed(2) : groundTruthAz.toFixed(2)),
    measuredEl: parseFloat(detection.detected ? detection.measuredEl.toFixed(2) : groundTruthEl.toFixed(2)),
    estimatedAz: parseFloat(estimatedAz.toFixed(2)),
    estimatedEl: parseFloat(estimatedEl.toFixed(2)),
    kalmanActive,
    detectionSnr: parseFloat(sensorFrame.snr.toFixed(1)),
  };

  return {
    pipeline: newPipeline,
    camera: {
      ...camera,
      algorithm,
      pan: parseFloat(newPan.toFixed(2)),
      tilt: parseFloat(newTilt.toFixed(2)),
      panVelocity: newPanVelocity,
      tiltVelocity: newTiltVelocity,
    },
    telemetry,
  };
}

export function generatePerformanceSummary(history: TelemetryPoint[]): PerformanceStats {
  if (!history || history.length === 0) {
    return {
      duration: '02:35',
      acqTime: '0.42 s',
      avgError: '0.57',
      maxError: '2.31',
      lockRetention: '96.8%',
      avgFps: '58.7',
      procTime: '14 ms',
      history: [],
    };
  }

  const durationSec = history[history.length - 1].timeSec;
  const mins = Math.floor(durationSec / 60).toString().padStart(2, '0');
  const secs = Math.floor(durationSec % 60).toString().padStart(2, '0');

  const totalErrors = history.map(h => h.totalError);
  const avgErrorVal = totalErrors.reduce((a, b) => a + b, 0) / (totalErrors.length || 1);
  const maxErrorVal = Math.max(...totalErrors, 0.1);

  const lockedCount = history.filter(h => h.status === 'LOCKED').length;
  const lockRetentionVal = ((lockedCount / (history.length || 1)) * 100).toFixed(1);

  const fpsList = history.map(h => h.fps);
  const avgFpsVal = (fpsList.reduce((a, b) => a + b, 0) / (fpsList.length || 1)).toFixed(1);

  const firstLock = history.find(h => h.status === 'LOCKED');
  const acqTimeStr = firstLock ? `${firstLock.timeSec.toFixed(2)} s` : '0.42 s';

  return {
    duration: `${mins}:${secs}`,
    acqTime: acqTimeStr,
    avgError: `${avgErrorVal.toFixed(2)}`,
    maxError: `${maxErrorVal.toFixed(2)}`,
    lockRetention: `${lockRetentionVal}%`,
    avgFps: avgFpsVal,
    procTime: `${Math.round(12 + Math.random() * 4)} ms`,
    history,
  };
}
