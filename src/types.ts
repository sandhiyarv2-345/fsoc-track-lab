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
  | 'settings'
  | 'benchmark'
  | 'videoinput';

export type InputMode = 'simulation' | 'external-video';

export type TrackingStatus = 'IDLE' | 'SEARCHING' | 'ACQUIRING' | 'LOCKED' | 'LOST';

export type TrajectoryType =
  | 'Random'
  | 'Linear Escape'
  | 'Evasive Maneuvers'
  | 'Orbital Pattern'
  | 'Sinusoidal Drift'
  | 'Straight Line'
  | 'Circular'
  | 'Figure of 8';

export type AtmosphericCondition = 'clear' | 'haze' | 'fog' | 'rain' | 'lowLight';

export type ImageNoiseType = 'saltPepper' | 'gaussian' | 'poisson';

export type PlatformMotionType = 'linear' | 'circular' | 'random' | 'spiral' | 'figure8';

export interface DisturbanceConfig {
  // Legacy booleans (kept for backward compatibility)
  sensorNoise: boolean;
  vibration: boolean;
  atmosphericTurbulence: boolean;
  motionJitter: boolean;
  intensity: number; // 0 to 100

  // Phase 2B — Image noise
  imageNoiseTypes: ImageNoiseType[];
  saltPepperProbability: number;   // 0–1, default 0.10
  gaussianStdDevPx: number;        // 0–20, default 5
  poissonStrength: number;         // 0–10, default 1.0

  // Phase 2B — Camera motion jitter (pixel-domain)
  cameraJitterMaxPxPerFrame: number; // 0–20, default 0

  // Phase 2B — Atmospheric condition
  atmosphericCondition: AtmosphericCondition;

  // Phase 2B — Platform motion (pixel-domain, independent of vibration)
  platformMotionEnabled: boolean;
  platformMotionType: PlatformMotionType;
  platformMotionMaxPxPerFrame: number; // 0–20, default 0
}

export interface SimulationConfig {
  id: string;
  name: string;
  configSource?: 'preset' | 'custom';
  configDisplayName?: string;
  targetCount: number; // 1, 2, 3, 5, 8
  designatedBeaconIndex: number; // 1-based index or -1 for auto
  targetSpeedMach: number; // e.g. 2.4
  trajectory: TrajectoryType;
  cameraFov: number; // degrees e.g. 20 — HORIZONTAL FOV (kept for backward compatibility)
  cameraFovHorizontal: number; // PS: horizontal FOV, default 4°
  cameraFovVertical: number; // PS: vertical FOV, default 3°
  initialPosition: 'Default Center' | 'Offset Left (45°)' | 'Offset Right (45°)';
  panSpeedLimit: number; // deg/s PS default=5, range 5-10
  tiltSpeedLimit: number; // deg/s PS default=5, range 5-10
  disturbances: DisturbanceConfig;
  durationSec: number; // default 120
  timeStep: number; // default 0.016
  // PS Phase 2A additions
  targetSizePx: number; // PS: 5–20 px, default 10
  targetShape: 'square' | 'circle'; // PS: default 'square'
  initialTargetLocationMode: 'random' | 'user-defined'; // PS: default 'random'
  initialTargetAzimuth: number; // degrees, used when mode='user-defined'
  initialTargetElevation: number; // degrees, used when mode='user-defined'
  screenWidth: number; // PS: minimum 2000, logical virtual screen width
  screenHeight: number; // PS: minimum 2000, logical virtual screen height
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
  // Phase 2B — Atmospheric parameters (for telemetry/display)
  atmosphericContrast: number;
  atmosphericBrightness: number;
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

export interface KalmanConfig {
  processNoiseQScale: number;   // Multiplier for Q matrix (default 1.0)
  measurementNoiseRBase: number; // Base R value (default 0.5)
  initialCovarianceP: number;   // Diagonal value for initial P (default 100)
}

export interface EnhancedBeaconConfig {
  emaAlpha: number;  // EMA smoothing factor (default 0.35, range 0.1-0.9)
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
  deepBeaconSmoothedAz: number;
  deepBeaconSmoothedEl: number;
  deepBeaconInitialized: boolean;
  // Phase 3C: For feed-forward velocity estimation
  prevEstimatedAz?: number;
  prevEstimatedEl?: number;
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
  // Phase 3C: Velocity feed-forward gain (0 = disabled, typical 0.3-0.8)
  pidFeedForward: number;
  // Phase 3B-2: Kalman and Enhanced Beacon tuning
  kalmanConfig: KalmanConfig;
  enhancedBeaconConfig: EnhancedBeaconConfig;
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
  rmseErrorPx?: number;
  reacquisitionTime?: string;
  avgReacquisitionTime?: string;
  maxReacquisitionTime?: string;
}

export interface CompletedAlgorithmRun {
  algorithm: TrackingAlgorithm;
  config: SimulationConfig;
  configDisplayName: string;
  seed: number;
  telemetryHistory: TelemetryPoint[];
  stats: PerformanceStats;
  metrics: AlgorithmMetrics;
  timestamp: string;
}

export interface BenchmarkContext {
  result: BenchmarkResult | null;
  config: SimulationConfig | null;
  seed: number | null;
  timestamp: string | null;
  configSource: 'preset' | 'custom' | null;
  selectedPresetIndex: number | null;
  configDisplayName: string | null;
}

// ── Benchmark types ──

export interface BenchmarkConfig {
  simulationConfig: SimulationConfig;
  settings: AppSettings;
  seed: number;
  algorithms: TrackingAlgorithm[];
}

export interface AlgorithmResult {
  algorithm: TrackingAlgorithm;
  telemetryHistory: TelemetryPoint[];
  stats: PerformanceStats;
  metrics: AlgorithmMetrics;
}

export interface AlgorithmMetrics {
  avgTotalError: number;
  maxTotalError: number;
  lockRetentionPct: number;
  acquisitionTimeSec: number;
  avgConfidence: number;
  avgFps: number;
}

export interface BenchmarkComparison {
  results: AlgorithmResult[];
  scoringWeights: ScoringWeights;
  scoredResults: { algorithm: TrackingAlgorithm; score: number; breakdown: Record<string, number> }[];
  recommendation: TrackingAlgorithm;
  recommendationReason: string;
}

export interface ScoringWeights {
  avgError: number;
  maxError: number;
  lockRetention: number;
  acqTime: number;
  confidence: number;
}

export interface BenchmarkResult {
  config: BenchmarkConfig;
  comparison: BenchmarkComparison;
  timestamp: string;
}

// ── Per-noise-source RNG streams for deterministic benchmarks ──
//
// Each noise source gets its own RNG seeded from (masterSeed, sourceId, timestep).
// Different algorithms may consume different amounts from blobNoiseRng (because
// their search radii differ), but since each timestep's stream is freshly seeded,
// cross-timestep contamination is impossible and other streams are unaffected.

export interface SimulationNoise {
  /** One RNG per target for motion jitter */
  targetJitterRngs: Array<() => number>;
  /** Gaussian RNG for turbulence offset X */
  turbulenceXRng: () => number;
  /** Gaussian RNG for turbulence offset Y */
  turbulenceYRng: () => number;
  /** Uniform RNG for dropout decision */
  dropoutRng: () => number;
  /** Gaussian RNG for blob-finding pixel noise (consumed variable amounts) */
  blobNoiseRng: () => number;
  /** Gaussian RNG for detection centroid noise azimuth */
  detectionNoiseAzRng: () => number;
  /** Gaussian RNG for detection centroid noise elevation */
  detectionNoiseElRng: () => number;
  /** Uniform RNG for telemetry FPS */
  fpsRng: () => number;
  /** Uniform RNG for telemetry CPU load */
  cpuRng: () => number;
  /** Uniform RNG for performance summary procTime */
  procTimeRng: () => number;

  // Phase 2B — Additional noise RNGs
  /** Uniform RNG for salt-and-pepper noise probability */
  saltPepperRng: () => number;
  /** Gaussian RNG for Poisson-style intensity noise */
  poissonRng: () => number;
  /** Gaussian RNG for camera jitter offset X (pixels) */
  cameraJitterXRng: () => number;
  /** Gaussian RNG for camera jitter offset Y (pixels) */
  cameraJitterYRng: () => number;
  /** Uniform RNG for rain streak artifacts */
  rainStreakRng: () => number;
}

// ── Phase 3A: Benchmark Scenario & Evaluation Types ──

export interface BenchmarkScenario {
  id: string;
  name: string;
  description: string;
  durationSec: number;
  seed: number;
  config: SimulationConfig;
  // Phase 3B-1: Classification metadata
  initialVisibility?: 'insideFOV' | 'outsideFOV';
  trackability?: 'trackable' | 'marginal' | 'physically-untrackable';
  requiredPeakPanRate?: number;   // deg/s
  requiredPeakTiltRate?: number;  // deg/s
  category?: 'baseline' | 'stress';
}

export interface BenchmarkRequirement {
  id: string;
  name: string;
  description: string;
  threshold: number;
  unit: string;
  comparison: 'lte' | 'gte';
}

export const PS_REQUIREMENTS: BenchmarkRequirement[] = [
  { id: 'acq_time', name: 'Acquisition Time', description: 'Time to first LOCK', threshold: 2.0, unit: 's', comparison: 'lte' },
  { id: 'tracking_error', name: 'Tracking Error (RMSE)', description: 'RMSE pixel tracking error', threshold: 10.0, unit: 'px', comparison: 'lte' },
  { id: 'target_loss', name: 'Target Loss', description: 'Percentage of frames with LOST status', threshold: 5.0, unit: '%', comparison: 'lte' },
  { id: 'reacq_time', name: 'Re-acquisition Time', description: 'Time from LOST back to LOCKED', threshold: 1.0, unit: 's', comparison: 'lte' },
  { id: 'processing_fps', name: 'Processing Speed', description: 'Average frames per second', threshold: 20.0, unit: 'FPS', comparison: 'gte' },
];

export interface BenchmarkRunMetrics {
  acquisitionTimeSec: number;
  averageTrackingErrorPx: number;
  maxTrackingErrorPx: number;
  rmseTrackingErrorPx: number;
  targetLossPercent: number;
  reacquisitionTimeSec: number;
  lockRetentionPercent: number;
  averageFps: number;
  minFps: number;
  totalFrames: number;
  processedFrames: number;
  lostFrames: number;
  simulationDurationSec: number;
  avgProcessingTimeMs: number;
  maxProcessingTimeMs: number;
  successfulAcquisitions: number;
  successfulReacquisitions: number;
  // Phase 3B-1: Diagnostic metrics
  postAcquisitionRmsePx: number;
  steadyStateRmsePx: number;
  framesBeforeAcquisition: number;
  errorAtAcquisitionPx: number;
  steadyStateStartFrame: number;
}

export interface BenchmarkPassFail {
  requirementId: string;
  requirementName: string;
  measuredValue: number;
  threshold: number;
  unit: string;
  passed: boolean;
  message: string;
}

export interface BenchmarkRunResult {
  scenarioId: string;
  scenarioName: string;
  algorithm: TrackingAlgorithm;
  seed: number;
  metrics: BenchmarkRunMetrics;
  passFail: BenchmarkPassFail[];
  overallPass: boolean;
  telemetryHistory: TelemetryPoint[];
  timestamp: string;
  // Phase 3B-1: Scenario classification
  trackability?: 'trackable' | 'marginal' | 'physically-untrackable';
  initialVisibility?: 'insideFOV' | 'outsideFOV';
  category?: 'baseline' | 'stress';
}

export interface BenchmarkSuiteResult {
  runs: BenchmarkRunResult[];
  worstPerScenario: Record<string, { algorithm: TrackingAlgorithm; metric: string; value: number }>;
  timestamp: string;
}

// ── External Video Mode types ──

export interface VideoFrameData {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  timestampSec: number;
  frameIndex: number;
}

export interface VideoSourceState {
  status: 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';
  fileName: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  currentFrame: number;
  totalFrames: number;
  error: string | null;
}

export interface VideoBeaconDetection {
  detected: boolean;
  centroidX: number;
  centroidY: number;
  confidence: number;
  blobSize: number;
  pixelCount: number;
  meanIntensity: number;
  snr: number;
}

export interface VideoTrackerTelemetry {
  timeSec: number;
  formattedTime: string;
  frameIndex: number;
  centroidX: number;
  centroidY: number;
  detectedCentroidX: number;
  detectedCentroidY: number;
  trackingState: TrackingStatus;
  confidence: number;
  boresightOffsetPx: number;
  panCommand: number;
  tiltCommand: number;
  fps: number;
  processingTimeMs: number;
}

export interface VideoPerformanceLog {
  frameIndex: number;
  timeSec: number;
  centroidX: number;
  centroidY: number;
  detected: boolean;
  confidence: number;
  boresightOffsetPx: number;
  trackingState: string;
  panCommand: number;
  tiltCommand: number;
  processingTimeMs: number;
}

export interface VideoPerformanceSummary {
  sourceFileName: string;
  sourceFps: number;
  sourceResolution: string;
  totalFrames: number;
  processedFrames: number;
  acquisitionTime: number | null;
  avgReacquisitionTime: number | null;
  maxReacquisitionTime: number | null;
  lockRetentionPct: number;
  avgBoresightOffsetPx: number;
  maxBoresightOffsetPx: number;
  rmseBoresightOffsetPx: number;
  avgProcessingFps: number;
  avgProcessingTimeMs: number;
  log: VideoPerformanceLog[];
}
