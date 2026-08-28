/**
 * FSOC Track Lab - Core Type Definitions
 */

export type NavScreen = 
  | 'landing' 
  | 'dashboard' 
  | 'simulation' 
  | 'cameraview' 
  | 'world3d' 
  | 'scenarios' 
  | 'performance' 
  | 'logs' 
  | 'settings';

export type TrackingStatus = 'IDLE' | 'SEARCHING' | 'ACQUIRING' | 'LOCKED' | 'LOST';

export type TrajectoryType = 
  | 'Random' 
  | 'Linear Escape' 
  | 'Evasive Maneuvers' 
  | 'Orbital Pattern' 
  | 'Sinusoidal Drift';

export interface DisturbanceConfig {
  sensorNoise: boolean;
  vibration: boolean;
  atmosphericTurbulence: boolean;
  motionJitter: boolean;
  intensity: number; // 0 to 100
}

export interface SimulationConfig {
  id: string;
  name: string;
  targetCount: number; // 1, 2, 3, 5, 8
  designatedBeaconIndex: number; // 1-based index or -1 for auto
  targetSpeedMach: number; // e.g. 2.4
  trajectory: TrajectoryType;
  cameraFov: number; // degrees e.g. 20
  initialPosition: 'Default Center' | 'Offset Left (45°)' | 'Offset Right (45°)';
  panSpeedLimit: number; // deg/s e.g. 30
  tiltSpeedLimit: number; // deg/s e.g. 25
  disturbances: DisturbanceConfig;
  durationSec: number; // default 120
  timeStep: number; // default 0.016
}

export interface Target {
  id: number;
  x: number; // 3D world space meters
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  isBeacon: boolean;
  detected: boolean;
  range: number; // meters
  azimuth: number; // degrees
  elevation: number; // degrees
  apparentIntensity: number; // 0 to 1
  trail: { x: number; y: number; z: number }[];
}

export type TrackingAlgorithm = 'AI Centroid' | 'Kalman Predictive' | 'Deep Beacon';

export interface CameraGimbalState {
  pan: number; // current pan in degrees
  tilt: number; // current tilt in degrees
  zoom: number; // 1.0, 2.0, 4.0, 8.0
  panVelocity: number;
  tiltVelocity: number;
  fov: number;
  opticalFilter: boolean;
  autoTracking: boolean;
  algorithm: TrackingAlgorithm;
}

export interface SensorFrame {
  width: number;
  height: number;
  beaconPixelX: number;
  beaconPixelY: number;
  beaconPresent: boolean;
  beaconIntensity: number;
  noiseLevel: number;
  turbulenceOffsetX: number;
  turbulenceOffsetY: number;
  snr: number;
}

export interface DetectionResult {
  detected: boolean;
  measuredAz: number;
  measuredEl: number;
  confidence: number;
  snr: number;
  blobSize: number;
}

export interface KalmanState {
  x: number[];
  P: number[][];
  initialized: boolean;
  lastUpdateTime: number;
}

export interface PidState {
  integral: number;
  prevError: number;
  initialized: boolean;
}

export interface TrackingPipelineState {
  algorithm: TrackingAlgorithm;
  kalman: KalmanState;
  panPid: PidState;
  tiltPid: PidState;
  lastDetection: DetectionResult | null;
  consecutiveDropouts: number;
  lastMeasurementAz: number;
  lastMeasurementEl: number;
  lastEstimatedAz: number;
  lastEstimatedEl: number;
}

export interface TelemetryPoint {
  timeSec: number;
  formattedTime: string;
  fps: number;
  pan: number;
  tilt: number;
  panError: number;
  tiltError: number;
  totalError: number;
  azimuthError: number;
  elevationError: number;
  confidence: number;
  status: TrackingStatus;
  range: number;
  cpuLoad: number;
  gpuMem: number;
  groundTruthAz: number;
  groundTruthEl: number;
  measuredAz: number;
  measuredEl: number;
  estimatedAz: number;
  estimatedEl: number;
  kalmanActive: boolean;
  detectionSnr: number;
}

export interface LogEntry {
  id: string;
  time: string;
  event: string;
  data: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'metric';
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  lastRun: string;
  status: 'idle' | 'running' | 'completed';
  config: SimulationConfig;
}

export interface AppSettings {
  uiTheme: 'dark' | 'light';
  coordinateUnits: 'metric' | 'imperial' | 'nautical';
  reticleStyle: 'crosshair' | 'brackets' | 'circle';
  defaultDuration: number;
  timeStep: number;
  baseNoiseVariance: string;
  logDirPath: string;
  retentionPolicy: string;
  verboseTelemetry: boolean;
  pidKp: number;
  pidKi: number;
  pidKd: number;
}

export interface PerformanceStats {
  duration: string;
  acqTime: string;
  avgError: string;
  maxError: string;
  lockRetention: string;
  avgFps: string;
  procTime: string;
  history: TelemetryPoint[];
}
