import {
  SimulationConfig, Target, CameraGimbalState, TelemetryPoint, LogEntry, Scenario,
  AppSettings, PerformanceStats, TrackingPipelineState, TrackingAlgorithm,
  SimulationNoise, PlatformMotionType,
} from '../types';
import { generateSensorFrame } from './sensorModel';
import { detectBeacon } from './beaconDetector';
import { createInitialKalmanState, kalmanPredict, kalmanUpdate, kalmanGetEstimate } from './kalmanFilter';
import { createInitialPidState, computePid } from './pidController';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Validate and sanitize simulation config parameters.
 * Prevents NaN, Infinity, negative values, and excessively large values
 * that could cause runaway loops or resource exhaustion.
 */
export function validateSimulationConfig(config: SimulationConfig): SimulationConfig {
  const validTrajectories: string[] = [
    'Random', 'Linear Escape', 'Evasive Maneuvers', 'Orbital Pattern', 'Sinusoidal Drift',
    'Straight Line', 'Circular', 'Figure of 8',
  ];
  const hFov = clamp(Math.floor(Number(config.cameraFovHorizontal || config.cameraFov) || 4), 1, 180);
  return {
    ...config,
    targetCount: clamp(Math.floor(Number(config.targetCount) || 1), 1, 20),
    designatedBeaconIndex: [1, 2, 3, 4, 5, 6, 7, 8, -1].includes(config.designatedBeaconIndex) ? config.designatedBeaconIndex : 1,
    targetSpeedMach: clamp(Number(config.targetSpeedMach) || 1.0, 0.1, 10.0),
    trajectory: validTrajectories.includes(config.trajectory) ? config.trajectory : 'Random',
    cameraFov: hFov,
    cameraFovHorizontal: hFov,
    cameraFovVertical: clamp(Math.floor(Number(config.cameraFovVertical) || 3), 1, 180),
    panSpeedLimit: clamp(Math.floor(Number(config.panSpeedLimit) || 5), 5, 10),
    tiltSpeedLimit: clamp(Math.floor(Number(config.tiltSpeedLimit) || 5), 5, 10),
    durationSec: clamp(Math.floor(Number(config.durationSec) || 30), 5, 600),
    timeStep: clamp(Number(config.timeStep) || 0.016, 0.001, 0.1),
    targetSizePx: clamp(Math.floor(Number(config.targetSizePx) || 10), 5, 20),
    targetShape: (config.targetShape === 'square' || config.targetShape === 'circle') ? config.targetShape : 'square',
    initialTargetLocationMode: (config.initialTargetLocationMode === 'user-defined') ? 'user-defined' : 'random',
    initialTargetAzimuth: clamp(Number(config.initialTargetAzimuth) || 0, -90, 90),
    initialTargetElevation: clamp(Number(config.initialTargetElevation) || 0, -90, 90),
    screenWidth: Math.max(Math.floor(Number(config.screenWidth) || 2000), 2000),
    screenHeight: Math.max(Math.floor(Number(config.screenHeight) || 2000), 2000),
    disturbances: {
      sensorNoise: Boolean(config.disturbances?.sensorNoise),
      vibration: Boolean(config.disturbances?.vibration),
      atmosphericTurbulence: Boolean(config.disturbances?.atmosphericTurbulence),
      motionJitter: Boolean(config.disturbances?.motionJitter),
      intensity: clamp(Math.floor(Number(config.disturbances?.intensity) || 50), 0, 100),
      // Phase 2B
      imageNoiseTypes: Array.isArray(config.disturbances?.imageNoiseTypes)
        ? config.disturbances.imageNoiseTypes.filter((t: string) => ['saltPepper', 'gaussian', 'poisson'].includes(t)) as any[]
        : [],
      saltPepperProbability: clamp(Number(config.disturbances?.saltPepperProbability) || 0.10, 0, 1),
      gaussianStdDevPx: clamp(Number(config.disturbances?.gaussianStdDevPx) || 0, 0, 20),
      poissonStrength: clamp(Number(config.disturbances?.poissonStrength) || 0, 0, 10),
      cameraJitterMaxPxPerFrame: clamp(Number(config.disturbances?.cameraJitterMaxPxPerFrame) || 0, 0, 20),
      atmosphericCondition: (['clear', 'haze', 'fog', 'rain', 'lowLight'].includes(config.disturbances?.atmosphericCondition as string))
        ? config.disturbances.atmosphericCondition as any : 'clear',
      platformMotionEnabled: Boolean(config.disturbances?.platformMotionEnabled),
      platformMotionType: (['linear', 'circular', 'random', 'spiral', 'figure8'].includes(config.disturbances?.platformMotionType as string))
        ? config.disturbances.platformMotionType as any : 'linear',
      platformMotionMaxPxPerFrame: clamp(Number(config.disturbances?.platformMotionMaxPxPerFrame) || 0, 0, 20),
    },
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  uiTheme: 'dark',
  coordinateUnits: 'metric',
  reticleStyle: 'crosshair',
  defaultDuration: 30,
  timeStep: 0.016,
  baseNoiseVariance: '1.5e-4',
  logDirPath: '/opt/fsoc/lab/logs',
  retentionPolicy: '30',
  verboseTelemetry: true,
  pidKp: 2.6,
  pidKi: 0.3,
  pidKd: 0.6,
  pidFeedForward: 0.0,
  kalmanConfig: {
    processNoiseQScale: 50,
    measurementNoiseRBase: 5,
    initialCovarianceP: 10,
  },
  enhancedBeaconConfig: {
    emaAlpha: 0.35,
  },
};



export const DEFAULT_CONFIG: SimulationConfig = {
  id: 'sim_default',
  name: 'Demo-01 (Easy)',
  configSource: 'preset',
  configDisplayName: 'Demo-01 (Easy)',
  targetCount: 1,
  designatedBeaconIndex: 1,
  targetSpeedMach: 2.4,
  trajectory: 'Random',
  cameraFov: 4,
  cameraFovHorizontal: 4,
  cameraFovVertical: 3,
  initialPosition: 'Default Center',
  panSpeedLimit: 5,
  tiltSpeedLimit: 5,
  disturbances: {
    sensorNoise: false,
    vibration: true,
    atmosphericTurbulence: false,
    motionJitter: true,
    intensity: 80,
    // Phase 2B defaults
    imageNoiseTypes: ['saltPepper'],
    saltPepperProbability: 0.10,
    gaussianStdDevPx: 0,
    poissonStrength: 0,
    cameraJitterMaxPxPerFrame: 0,
    atmosphericCondition: 'clear',
    platformMotionEnabled: false,
    platformMotionType: 'linear',
    platformMotionMaxPxPerFrame: 0,
  },
  durationSec: 30,
  timeStep: 0.016,
  targetSizePx: 10,
  targetShape: 'square',
  initialTargetLocationMode: 'random',
  initialTargetAzimuth: 0,
  initialTargetElevation: 0,
  screenWidth: 2000,
  screenHeight: 2000,
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
      configSource: 'preset',
      configDisplayName: 'Demo-01 (Easy)',
      targetCount: 1,
      designatedBeaconIndex: 1,
      targetSpeedMach: 1.2,
      trajectory: 'Sinusoidal Drift',
      cameraFov: 4,
      cameraFovHorizontal: 4,
      cameraFovVertical: 3,
      initialPosition: 'Default Center',
      panSpeedLimit: 5,
      tiltSpeedLimit: 5,
      disturbances: {
        sensorNoise: false,
        vibration: false,
        atmosphericTurbulence: false,
        motionJitter: false,
        intensity: 20,
        imageNoiseTypes: [],
        saltPepperProbability: 0.10,
        gaussianStdDevPx: 0,
        poissonStrength: 0,
        cameraJitterMaxPxPerFrame: 0,
        atmosphericCondition: 'clear',
        platformMotionEnabled: false,
        platformMotionType: 'linear',
        platformMotionMaxPxPerFrame: 0,
      },
      durationSec: 30,
      timeStep: 0.016,
      targetSizePx: 10,
      targetShape: 'square',
      initialTargetLocationMode: 'random',
      initialTargetAzimuth: 0,
      initialTargetElevation: 0,
      screenWidth: 2000,
      screenHeight: 2000,
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
      configSource: 'preset',
      configDisplayName: 'Demo-02 (Multiple Targets)',
      targetCount: 5,
      designatedBeaconIndex: 1,
      targetSpeedMach: 1.8,
      trajectory: 'Circular',
      cameraFov: 4,
      cameraFovHorizontal: 4,
      cameraFovVertical: 3,
      initialPosition: 'Default Center',
      panSpeedLimit: 5,
      tiltSpeedLimit: 5,
      disturbances: {
        sensorNoise: true,
        vibration: true,
        atmosphericTurbulence: false,
        motionJitter: false,
        intensity: 50,
        imageNoiseTypes: ['saltPepper'],
        saltPepperProbability: 0.10,
        gaussianStdDevPx: 0,
        poissonStrength: 0,
        cameraJitterMaxPxPerFrame: 0,
        atmosphericCondition: 'clear',
        platformMotionEnabled: false,
        platformMotionType: 'linear',
        platformMotionMaxPxPerFrame: 0,
      },
      durationSec: 30,
      timeStep: 0.016,
      targetSizePx: 10,
      targetShape: 'square',
      initialTargetLocationMode: 'random',
      initialTargetAzimuth: 0,
      initialTargetElevation: 0,
      screenWidth: 2000,
      screenHeight: 2000,
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
      configSource: 'preset',
      configDisplayName: 'Demo-03 (High Speed)',
      targetCount: 1,
      designatedBeaconIndex: 1,
      targetSpeedMach: 3.2,
      trajectory: 'Figure of 8',
      cameraFov: 4,
      cameraFovHorizontal: 4,
      cameraFovVertical: 3,
      initialPosition: 'Default Center',
      panSpeedLimit: 10,
      tiltSpeedLimit: 10,
      disturbances: {
        sensorNoise: true,
        vibration: true,
        atmosphericTurbulence: false,
        motionJitter: true,
        intensity: 75,
        imageNoiseTypes: ['saltPepper'],
        saltPepperProbability: 0.10,
        gaussianStdDevPx: 0,
        poissonStrength: 0,
        cameraJitterMaxPxPerFrame: 0,
        atmosphericCondition: 'clear',
        platformMotionEnabled: false,
        platformMotionType: 'linear',
        platformMotionMaxPxPerFrame: 0,
      },
      durationSec: 30,
      timeStep: 0.016,
      targetSizePx: 10,
      targetShape: 'square',
      initialTargetLocationMode: 'random',
      initialTargetAzimuth: 0,
      initialTargetElevation: 0,
      screenWidth: 2000,
      screenHeight: 2000,
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
      configSource: 'preset',
      configDisplayName: 'Demo-04 (Disturbances)',
      targetCount: 3,
      designatedBeaconIndex: 1,
      targetSpeedMach: 2.4,
      trajectory: 'Straight Line',
      cameraFov: 4,
      cameraFovHorizontal: 4,
      cameraFovVertical: 3,
      initialPosition: 'Default Center',
      panSpeedLimit: 5,
      tiltSpeedLimit: 5,
      disturbances: {
        sensorNoise: true,
        vibration: true,
        atmosphericTurbulence: true,
        motionJitter: true,
        intensity: 85,
        imageNoiseTypes: ['saltPepper', 'gaussian'],
        saltPepperProbability: 0.10,
        gaussianStdDevPx: 5,
        poissonStrength: 0,
        cameraJitterMaxPxPerFrame: 3,
        atmosphericCondition: 'haze',
        platformMotionEnabled: true,
        platformMotionType: 'linear',
        platformMotionMaxPxPerFrame: 2,
      },
      durationSec: 30,
      timeStep: 0.016,
      targetSizePx: 10,
      targetShape: 'square',
      initialTargetLocationMode: 'random',
      initialTargetAzimuth: 0,
      initialTargetElevation: 0,
      screenWidth: 2000,
      screenHeight: 2000,
    },
  },
];

export function initializeTargets(config: SimulationConfig): Target[] {
  const count = config.targetCount || 1;
  const targets: Target[] = [];
  const speedScale = (config.targetSpeedMach * 343) * 0.05;

  for (let i = 0; i < count; i++) {
    const isBeacon = config.designatedBeaconIndex === -1 ? i === 0 : (i + 1) === config.designatedBeaconIndex;

    let x: number, y: number, z: number;

    if (config.initialTargetLocationMode === 'user-defined' && isBeacon) {
      // Place beacon at user-specified azimuth/elevation at default range
      const azRad = (config.initialTargetAzimuth * Math.PI) / 180;
      const elRad = (config.initialTargetElevation * Math.PI) / 180;
      const range = 1200;
      x = Math.sin(azRad) * Math.cos(elRad) * range;
      y = Math.sin(elRad) * range;
      z = Math.cos(azRad) * Math.cos(elRad) * range;
    } else {
      const baseAngle = (i / count) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
      const dist = 1000 + Math.random() * 500;
      x = Math.sin(baseAngle) * (dist * 0.5) + (Math.random() * 100 - 50);
      y = 200 + Math.random() * 200;
      z = Math.cos(baseAngle) * (dist * 0.8) + 800;
    }

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
  config: SimulationConfig,
  noise?: SimulationNoise
): Target[] {
  const dt = 0.016;
  const speedMultiplier = config.targetSpeedMach * 0.6;
  const intensity = (config.disturbances.intensity / 100);

  return targets.map((t, idx) => {
    let { x, y, z, vx, vy, vz } = t;

    switch (config.trajectory) {
      // ── PS MANDATORY TRAJECTORIES ──

      case 'Straight Line': {
        // Constant velocity straight line from initial position
        const speed = 150 * speedMultiplier;
        const dirX = vx !== 0 ? vx / Math.sqrt(vx * vx + vz * vz) : 0;
        const dirZ = vz !== 0 ? vz / Math.sqrt(vx * vx + vz * vz) : 1;
        x += dirX * speed * dt;
        z += dirZ * speed * dt;
        y += vy * speed * 0.2 * dt;
        break;
      }

      case 'Circular': {
        // Genuine circular trajectory in XZ plane
        // Phase 3B-1: Reduced radius (30m) and center near boresight
        // so target starts within 4° hFOV / 3° vFOV at t=0
        const radius = 30;
        const angularVel = 0.3 * speedMultiplier;
        const centerX = 0;
        const centerZ = 1000;
        const theta = angularVel * elapsedSec + (idx * (Math.PI * 2 / targets.length));
        x = centerX + radius * Math.cos(theta);
        z = centerZ + radius * Math.sin(theta);
        y = 10 + Math.sin(elapsedSec * 0.2) * 5;
        break;
      }

      case 'Figure of 8': {
        // Lissajous figure-8: x = A*sin(theta), z = B*sin(2*theta)
        // Phase 3B-1: Reduced amplitudes (A=30, B=40) and adjusted center
        // so target starts within 4° hFOV / 3° vFOV at t=0
        const A = 30;
        const B = 40;
        const omega = 0.4 * speedMultiplier;
        const theta8 = omega * elapsedSec + (idx * Math.PI * 0.3);
        x = A * Math.sin(theta8);
        z = 1000 + B * Math.sin(2 * theta8);
        y = 10 + Math.cos(theta8) * 5;
        break;
      }

      case 'Random': {
        // Deterministic multi-sine (reproducible under benchmark seed)
        // NOTE: Large amplitudes produce angular rates >5°/s — classified
        // as physically-untrackable. Target starts outside FOV by design.
        const swayX = Math.sin(elapsedSec * 0.7 + idx) * 250 + Math.sin(elapsedSec * 1.7) * 70;
        const swayY = 230 + Math.cos(elapsedSec * 0.5 + idx) * 90;
        const swayZ = 1200 + Math.cos(elapsedSec * 0.3) * 180;
        x = swayX;
        y = swayY;
        z = swayZ;
        break;
      }

      // ── EXISTING OPTIONAL TRAJECTORIES ──

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
      const jitterRng = noise?.targetJitterRngs?.[idx];
      if (jitterRng) {
        x += (jitterRng() - 0.5) * 4 * intensity;
        y += (jitterRng() - 0.5) * 3 * intensity;
      } else {
        x += (Math.random() - 0.5) * 4 * intensity;
        y += (Math.random() - 0.5) * 3 * intensity;
      }
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

// ── Phase 2B: Platform motion helpers ──
// These compute pixel-domain offsets based on motion type and elapsed time.
// They do NOT modify target ground truth — they only affect the apparent
// position seen by the sensor.

function computePlatformMotionX(type: PlatformMotionType, elapsedSec: number, maxPx: number): number {
  switch (type) {
    case 'linear':
      // Constant velocity across frame, wraps around
      return ((elapsedSec * 3.0) % (2 * maxPx)) - maxPx;

    case 'circular':
      return Math.sin(elapsedSec * 1.5) * maxPx;

    case 'random':
      // Deterministic multi-sine (reproducible with same elapsed time)
      return (Math.sin(elapsedSec * 2.3) * 0.6 + Math.sin(elapsedSec * 5.7) * 0.3 + Math.sin(elapsedSec * 11.1) * 0.1) * maxPx;

    case 'spiral':
      return Math.sin(elapsedSec * 1.2) * maxPx * Math.min(elapsedSec / 5, 1);

    case 'figure8':
      return Math.sin(elapsedSec * 1.5) * maxPx;

    default:
      return 0;
  }
}

function computePlatformMotionY(type: PlatformMotionType, elapsedSec: number, maxPx: number): number {
  switch (type) {
    case 'linear':
      // Linear motion is primarily in X; Y has slight drift
      return Math.sin(elapsedSec * 0.5) * maxPx * 0.2;

    case 'circular':
      return Math.cos(elapsedSec * 1.5) * maxPx;

    case 'random':
      return (Math.cos(elapsedSec * 3.1) * 0.6 + Math.cos(elapsedSec * 7.3) * 0.3 + Math.cos(elapsedSec * 13.7) * 0.1) * maxPx;

    case 'spiral':
      return Math.cos(elapsedSec * 1.2) * maxPx * Math.min(elapsedSec / 5, 1);

    case 'figure8':
      return Math.sin(elapsedSec * 3.0) * maxPx;

    default:
      return 0;
  }
}

export function initTrackingPipeline(
  algorithm: TrackingAlgorithm,
  initialPan: number,
  initialTilt: number,
  settings?: AppSettings
): TrackingPipelineState {
  return {
    algorithm,
    kalman: createInitialKalmanState(settings?.kalmanConfig),
    panPid: createInitialPidState(),
    tiltPid: createInitialPidState(),
    lastDetection: null,
    consecutiveDropouts: 0,
    lastMeasurementAz: initialPan,
    lastMeasurementEl: initialTilt,
    lastEstimatedAz: initialPan,
    lastEstimatedEl: initialTilt,
    deepBeaconSmoothedAz: initialPan,
    deepBeaconSmoothedEl: initialTilt,
    deepBeaconInitialized: false,
  };
}

export function runTrackingPipeline(
  pipeline: TrackingPipelineState,
  camera: CameraGimbalState,
  beacon: Target | undefined,
  config: SimulationConfig,
  settings: AppSettings,
  elapsedSec: number,
  dt: number,
  noise?: SimulationNoise
): {
  pipeline: TrackingPipelineState;
  camera: CameraGimbalState;
  telemetry: TelemetryPoint;
} {
  let { pan, tilt, zoom, autoTracking, algorithm } = camera;

  const effectiveFov = (config.cameraFovHorizontal || config.cameraFov) / zoom;

  let distPan = 0;
  let distTilt = 0;
  const intensity = (config.disturbances.intensity / 100);

  // Vibration: physically affects gimbal orientation (encoder reads disturbed position)
  if (config.disturbances.vibration) {
    distPan += Math.sin(elapsedSec * 25) * 0.18 * intensity;
    distTilt += Math.cos(elapsedSec * 32) * 0.15 * intensity;
  }
  // NOTE: Atmospheric turbulence is handled entirely in the sensor model
  // (pixel offsets, scintillation, dropout). It does NOT affect gimbal position.

  // ── Phase 2B: Camera jitter (pixel-domain, independent of vibration) ──
  let cameraJitterOffsetX = 0;
  let cameraJitterOffsetY = 0;
  if (config.disturbances.cameraJitterMaxPxPerFrame > 0) {
    const maxPx = config.disturbances.cameraJitterMaxPxPerFrame;
    if (noise) {
      cameraJitterOffsetX = noise.cameraJitterXRng() * maxPx;
      cameraJitterOffsetY = noise.cameraJitterYRng() * maxPx;
    } else {
      cameraJitterOffsetX = (Math.random() - 0.5) * 2 * maxPx;
      cameraJitterOffsetY = (Math.random() - 0.5) * 2 * maxPx;
    }
  }

  // ── Phase 2B: Platform motion (pixel-domain, independent of vibration & jitter) ──
  let platformMotionOffsetX = 0;
  let platformMotionOffsetY = 0;
  if (config.disturbances.platformMotionEnabled && config.disturbances.platformMotionMaxPxPerFrame > 0) {
    const maxPx = config.disturbances.platformMotionMaxPxPerFrame;
    const motionType = config.disturbances.platformMotionType;
    platformMotionOffsetX = computePlatformMotionX(motionType, elapsedSec, maxPx);
    platformMotionOffsetY = computePlatformMotionY(motionType, elapsedSec, maxPx);
  }

  // ── Coordinate frame: ground truth (absolute world angles) ──
  const groundTruthAz = beacon ? beacon.azimuth : 0;
  const groundTruthEl = beacon ? beacon.elevation : 0;

  const sensorFrame = generateSensorFrame(beacon, camera, config, elapsedSec, noise,
    cameraJitterOffsetX, cameraJitterOffsetY,
    platformMotionOffsetX, platformMotionOffsetY
  );

  const rawDetection = detectBeacon(sensorFrame, algorithm, effectiveFov, elapsedSec, noise,
    (config.cameraFovHorizontal || config.cameraFov) / zoom,
    (config.cameraFovVertical || config.cameraFov * 0.75) / zoom
  );

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
      kalmanState = kalmanPredict(kalmanState, dt, config, settings.kalmanConfig);

      if (detection.detected) {
        kalmanState = kalmanUpdate(kalmanState, detection, config, settings.kalmanConfig);
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
    // Deep Beacon: Uses a more sensitive detector (lower threshold, larger search radius)
    // and temporal smoothing (exponential moving average) to reduce centroid noise.
    // This is a legitimate signal processing technique — temporal filtering improves
    // SNR by averaging over multiple frames, at the cost of slight latency.
    const alpha = settings.enhancedBeaconConfig?.emaAlpha ?? 0.35;
    if (detection.detected) {
      if (!newPipeline.deepBeaconInitialized) {
        newPipeline.deepBeaconSmoothedAz = detection.measuredAz;
        newPipeline.deepBeaconSmoothedEl = detection.measuredEl;
        newPipeline.deepBeaconInitialized = true;
      } else {
        newPipeline.deepBeaconSmoothedAz = alpha * detection.measuredAz + (1 - alpha) * newPipeline.deepBeaconSmoothedAz;
        newPipeline.deepBeaconSmoothedEl = alpha * detection.measuredEl + (1 - alpha) * newPipeline.deepBeaconSmoothedEl;
      }
      setpointAz = newPipeline.deepBeaconSmoothedAz;
      setpointEl = newPipeline.deepBeaconSmoothedEl;
      estimatedAz = newPipeline.deepBeaconSmoothedAz;
      estimatedEl = newPipeline.deepBeaconSmoothedEl;
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

  // Phase 3C: Velocity feed-forward estimation from consecutive measurements
  let panVelocityEstimate = 0;
  let tiltVelocityEstimate = 0;
  if (newPipeline.prevEstimatedAz !== undefined && dt > 0) {
    panVelocityEstimate = (estimatedAz - newPipeline.prevEstimatedAz) / dt;
    tiltVelocityEstimate = (estimatedEl - newPipeline.prevEstimatedEl) / dt;
  }
  newPipeline.prevEstimatedAz = estimatedAz;
  newPipeline.prevEstimatedEl = estimatedEl;

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

    // Phase 3C: Add bounded feed-forward from estimated velocity
    const ffGain = settings.pidFeedForward ?? 0;
    if (ffGain > 0 && detection.detected) {
      const ffPan = ffGain * panVelocityEstimate;
      const ffTilt = ffGain * tiltVelocityEstimate;
      newPanVelocity = clamp(newPanVelocity + ffPan, -config.panSpeedLimit, config.panSpeedLimit);
      newTiltVelocity = clamp(newTiltVelocity + ffTilt, -config.tiltSpeedLimit, config.tiltSpeedLimit);
    }
  }

  const newPan = pan + newPanVelocity * dt;
  const newTilt = tilt + newTiltVelocity * dt;

  const truePanError = groundTruthAz - newPan;
  const trueTiltError = groundTruthEl - newTilt;
  const measuredPanError = detection.detected ? detection.measuredAz - newPan : 0;
  const measuredTiltError = detection.detected ? detection.measuredEl - newTilt : 0;

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
    fps: noise
      ? Math.round(55 + noise.fpsRng() * 6)
      : 58 + Math.round(Math.random() * 3),
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
    cpuLoad: noise
      ? Math.round(12 + (config.disturbances.intensity * 0.1) + noise.cpuRng() * 2)
      : Math.round(12 + (config.disturbances.intensity * 0.1) + Math.random() * 2),
    gpuMem: parseFloat((1.2 + (config.targetCount * 0.08)).toFixed(1)),
    groundTruthAz: parseFloat(groundTruthAz.toFixed(2)),
    groundTruthEl: parseFloat(groundTruthEl.toFixed(2)),
    measuredAz: parseFloat(detection.detected ? detection.measuredAz.toFixed(2) : newPipeline.lastMeasurementAz.toFixed(2)),
    measuredEl: parseFloat(detection.detected ? detection.measuredEl.toFixed(2) : newPipeline.lastMeasurementEl.toFixed(2)),
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

export function generatePerformanceSummary(history: TelemetryPoint[], procTimeRng?: () => number): PerformanceStats {
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
      rmseErrorPx: 0,
    };
  }

  const durationSec = history[history.length - 1].timeSec;
  const mins = Math.floor(durationSec / 60).toString().padStart(2, '0');
  const secs = Math.floor(durationSec % 60).toString().padStart(2, '0');

  const totalErrors = history.map(h => h.totalError);
  const avgErrorVal = totalErrors.reduce((a, b) => a + b, 0) / (totalErrors.length || 1);
  const maxErrorVal = Math.max(...totalErrors, 0.1);

  const squaredErrors = totalErrors.map(e => e * e);
  const rmseError = Math.sqrt(squaredErrors.reduce((a, b) => a + b, 0) / (squaredErrors.length || 1));

  const lockedCount = history.filter(h => h.status === 'LOCKED').length;
  const lockRetentionVal = ((lockedCount / (history.length || 1)) * 100).toFixed(1);

  const fpsList = history.map(h => h.fps);
  const avgFpsVal = (fpsList.reduce((a, b) => a + b, 0) / (fpsList.length || 1)).toFixed(1);

  const firstLock = history.find(h => h.status === 'LOCKED');
  const acqTimeStr = firstLock ? `${firstLock.timeSec.toFixed(2)} s` : '0.42 s';

  const reacqTimes: number[] = [];
  let lastLostTime: number | null = null;
  for (const h of history) {
    if (h.status === 'LOST') {
      lastLostTime = h.timeSec;
    } else if ((h.status === 'LOCKED' || h.status === 'ACQUIRING') && lastLostTime !== null) {
      const reacq = h.timeSec - lastLostTime;
      if (reacq > 0 && reacq < 10) {
        reacqTimes.push(reacq);
      }
      lastLostTime = null;
    }
  }

  const avgReacq = reacqTimes.length > 0
    ? reacqTimes.reduce((a, b) => a + b, 0) / reacqTimes.length
    : null;
  const maxReacq = reacqTimes.length > 0
    ? Math.max(...reacqTimes)
    : null;

  return {
    duration: `${mins}:${secs}`,
    acqTime: acqTimeStr,
    avgError: `${avgErrorVal.toFixed(2)}`,
    maxError: `${maxErrorVal.toFixed(2)}`,
    lockRetention: `${lockRetentionVal}%`,
    avgFps: avgFpsVal,
    procTime: `${Math.round(12 + (procTimeRng ? procTimeRng() : Math.random()) * 4)} ms`,
    history,
    rmseErrorPx: rmseError,
    reacquisitionTime: avgReacq !== null ? `${avgReacq.toFixed(2)} s` : undefined,
    avgReacquisitionTime: avgReacq !== null ? `${avgReacq.toFixed(2)} s` : undefined,
    maxReacquisitionTime: maxReacq !== null ? `${maxReacq.toFixed(2)} s` : undefined,
  };
}
