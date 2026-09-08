/**
 * FSOC Track Lab — Phase 3B-1: PS Benchmark Scenarios (Corrected)
 *
 * 18 standardized scenarios for evaluating algorithm performance
 * against official ISRO/Department of Space PS requirements.
 *
 * Phase 3B-1 changes:
 * - Circular/Figure-8 trajectories start inside FOV (reduced radii)
 * - Random trajectory classified as physically-untrackable
 * - Scenario metadata: trackability, initialVisibility, peak rates
 * - Categories: baseline vs stress
 */

import { BenchmarkScenario, SimulationConfig, DisturbanceConfig } from '../types';

// ── Base PS-compliant disturbance (clean) ──
function cleanDisturbance(): DisturbanceConfig {
  return {
    sensorNoise: false,
    vibration: false,
    atmosphericTurbulence: false,
    motionJitter: false,
    intensity: 20,
    imageNoiseTypes: [],
    saltPepperProbability: 0,
    gaussianStdDevPx: 0,
    poissonStrength: 0,
    cameraJitterMaxPxPerFrame: 0,
    atmosphericCondition: 'clear',
    platformMotionEnabled: false,
    platformMotionType: 'linear',
    platformMotionMaxPxPerFrame: 0,
  };
}

// ── Base PS-compliant config ──
function baseConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    id: 'bench_base',
    name: 'Benchmark Base',
    configSource: 'preset',
    configDisplayName: 'Benchmark',
    targetCount: 1,
    designatedBeaconIndex: 1,
    targetSpeedMach: 2.4,
    trajectory: 'Straight Line',
    cameraFov: 4,
    cameraFovHorizontal: 4,
    cameraFovVertical: 3,
    initialPosition: 'Default Center',
    panSpeedLimit: 5,
    tiltSpeedLimit: 5,
    disturbances: cleanDisturbance(),
    durationSec: 30,
    timeStep: 0.016,
    targetSizePx: 10,
    targetShape: 'square',
    // PS: target starts near boresight so camera can acquire and track
    initialTargetLocationMode: 'user-defined',
    initialTargetAzimuth: 0.5,
    initialTargetElevation: 0.3,
    screenWidth: 2000,
    screenHeight: 2000,
    ...overrides,
  };
}

// ── Scenario factory helpers ──

function scenario(
  id: string,
  name: string,
  description: string,
  durationSec: number,
  seed: number,
  configOverrides: Partial<SimulationConfig>,
  disturbanceOverrides: Partial<DisturbanceConfig> = {},
  meta: Partial<Pick<BenchmarkScenario, 'initialVisibility' | 'trackability' | 'requiredPeakPanRate' | 'requiredPeakTiltRate' | 'category'>> = {}
): BenchmarkScenario {
  const config = baseConfig({
    ...configOverrides,
    disturbances: {
      ...cleanDisturbance(),
      ...disturbanceOverrides,
    },
  });
  return {
    id, name, description, durationSec, seed, config,
    initialVisibility: meta.initialVisibility ?? 'insideFOV',
    trackability: meta.trackability ?? 'trackable',
    requiredPeakPanRate: meta.requiredPeakPanRate ?? 6.3,
    requiredPeakTiltRate: meta.requiredPeakTiltRate ?? 6.3,
    category: meta.category ?? 'baseline',
  };
}

// ═══════════════════════════════════════════════════════════
// 18 BENCHMARK SCENARIOS (Phase 3B-1 corrected)
// ═══════════════════════════════════════════════════════════

export const BENCHMARK_SCENARIOS: BenchmarkScenario[] = [
  // ── BASELINE / NOMINAL ──

  // ── S01: Clean Baseline ──
  scenario(
    'S01', 'Clean Baseline',
    'Straight Line, clear atmosphere, no disturbances, default PS camera',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    {},
    { trackability: 'marginal', requiredPeakPanRate: 6.3, requiredPeakTiltRate: 6.3, category: 'baseline' }
  ),

  // ── S02: Circular Motion ──
  // Phase 3B-1: radius=50m, centerZ=1000 → target starts at ~2.9° az, within 4° hFOV
  scenario(
    'S02', 'Circular Motion',
    'Circular target trajectory (r=30m), clear atmosphere, no disturbances',
    30, 42,
    { trajectory: 'Circular', targetSpeedMach: 0.5 },
    {},
    { trackability: 'trackable', requiredPeakPanRate: 0.5, requiredPeakTiltRate: 0.1, category: 'baseline' }
  ),

  // ── S03: Figure-8 ──
  // Phase 3B-1: A=30, B=40, centerY=10 → target starts at ~0° az, ~0.86° el, within FOV
  scenario(
    'S03', 'Figure-8',
    'Figure-8 target trajectory (A=30, B=40), clear atmosphere, no disturbances',
    30, 42,
    { trajectory: 'Figure of 8', targetSpeedMach: 0.5 },
    {},
    { trackability: 'trackable', requiredPeakPanRate: 0.7, requiredPeakTiltRate: 0.1, category: 'baseline' }
  ),

  // ── S04: Random Target ──
  // Phase 3B-1: Large multi-sine amplitudes → angular rates >5°/s, classified as stress
  scenario(
    'S04', 'Random Target',
    'Random (deterministic multi-sine) trajectory — physically untrackable at 5°/s',
    30, 42,
    { trajectory: 'Random', targetSpeedMach: 0.5 },
    {},
    { initialVisibility: 'outsideFOV', trackability: 'physically-untrackable', requiredPeakPanRate: 18.8, requiredPeakTiltRate: 6.3, category: 'stress' }
  ),

  // ── S05: Salt & Pepper Noise ──
  scenario(
    'S05', 'Salt & Pepper',
    'Straight Line with 10% salt-and-pepper noise',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    { imageNoiseTypes: ['saltPepper'], saltPepperProbability: 0.10, sensorNoise: true, intensity: 50 },
    { trackability: 'marginal', category: 'baseline' }
  ),

  // ── S06: Gaussian Noise ──
  scenario(
    'S06', 'Gaussian Noise',
    'Straight Line with Gaussian noise (stdDev=10px)',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    { imageNoiseTypes: ['gaussian'], gaussianStdDevPx: 10, sensorNoise: true, intensity: 50 },
    { trackability: 'marginal', category: 'baseline' }
  ),

  // ── S06-MAX: Gaussian Noise MAX ──
  scenario(
    'S06-MAX', 'Gaussian Noise MAX',
    'Straight Line with max Gaussian noise (stdDev=20px)',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    { imageNoiseTypes: ['gaussian'], gaussianStdDevPx: 20, sensorNoise: true, intensity: 80 },
    { trackability: 'marginal', category: 'baseline' }
  ),

  // ── S07: Poisson Noise ──
  scenario(
    'S07', 'Poisson Noise',
    'Straight Line with Poisson noise (strength=5)',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    { imageNoiseTypes: ['poisson'], poissonStrength: 5, sensorNoise: true, intensity: 50 },
    { trackability: 'marginal', category: 'baseline' }
  ),

  // ── S08: Atmospheric Haze ──
  scenario(
    'S08', 'Atmospheric Haze',
    'Moving target through haze atmosphere',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    { atmosphericCondition: 'haze', intensity: 70 },
    { trackability: 'marginal', category: 'baseline' }
  ),

  // ── S09: Atmospheric Fog ──
  scenario(
    'S09', 'Atmospheric Fog',
    'Moving target through fog atmosphere',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    { atmosphericCondition: 'fog', intensity: 70 },
    { trackability: 'marginal', category: 'baseline' }
  ),

  // ── S10: Atmospheric Rain ──
  scenario(
    'S10', 'Atmospheric Rain',
    'Moving target through rain atmosphere',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    { atmosphericCondition: 'rain', intensity: 70 },
    { trackability: 'marginal', category: 'baseline' }
  ),

  // ── S11: Low Light ──
  scenario(
    'S11', 'Low Light',
    'Moving target in low-light conditions',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    { atmosphericCondition: 'lowLight', intensity: 70 },
    { trackability: 'marginal', category: 'baseline' }
  ),

  // ── S12: Camera Jitter ──
  scenario(
    'S12', 'Camera Jitter',
    'Moving target with representative camera jitter (5px)',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    { cameraJitterMaxPxPerFrame: 5, intensity: 50 },
    { trackability: 'marginal', category: 'baseline' }
  ),

  // ── S13: Max Camera Jitter ──
  scenario(
    'S13', 'Max Camera Jitter',
    'Moving target with maximum camera jitter (20px)',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    { cameraJitterMaxPxPerFrame: 20, intensity: 80 },
    { trackability: 'marginal', category: 'baseline' }
  ),

  // ── S14: Platform Linear ──
  scenario(
    'S14', 'Platform Linear',
    'Moving target with linear platform motion (5px)',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    { platformMotionEnabled: true, platformMotionType: 'linear', platformMotionMaxPxPerFrame: 5, intensity: 50 },
    { trackability: 'marginal', category: 'baseline' }
  ),

  // ── S15: Platform Max ──
  scenario(
    'S15', 'Platform Max',
    'Moving target with max linear platform motion (20px)',
    30, 42,
    { trajectory: 'Straight Line', targetSpeedMach: 0.5 },
    { platformMotionEnabled: true, platformMotionType: 'linear', platformMotionMaxPxPerFrame: 20, intensity: 80 },
    { trackability: 'marginal', category: 'baseline' }
  ),

  // ── STRESS / LIMIT ──

  // ── S16: Combined Stress ──
  // Phase 3B-1: Figure-8 with reduced amplitudes (A=30, B=40) → starts inside FOV
  scenario(
    'S16', 'Combined Stress',
    'Figure-8 (A=30, B=40) with haze, Gaussian noise, jitter, platform motion, vibration',
    30, 42,
    { trajectory: 'Figure of 8', targetSpeedMach: 0.5 },
    {
      atmosphericCondition: 'haze',
      imageNoiseTypes: ['gaussian'],
      gaussianStdDevPx: 5,
      cameraJitterMaxPxPerFrame: 5,
      platformMotionEnabled: true,
      platformMotionType: 'circular',
      platformMotionMaxPxPerFrame: 5,
      vibration: true,
      sensorNoise: true,
      intensity: 60,
    },
    { trackability: 'marginal', category: 'stress' }
  ),

  // ── S17: Maximum Stress ──
  // Phase 3B-1: Figure-8 with reduced amplitudes (A=30, B=40) → starts inside FOV
  scenario(
    'S17', 'Maximum Stress',
    'PS maximum disturbances: noise=20px, jitter=20px, motion=20px, strong fog, Figure-8 (A=30, B=40)',
    30, 42,
    { trajectory: 'Figure of 8', targetSpeedMach: 0.5 },
    {
      atmosphericCondition: 'fog',
      imageNoiseTypes: ['gaussian', 'saltPepper'],
      gaussianStdDevPx: 20,
      saltPepperProbability: 0.15,
      cameraJitterMaxPxPerFrame: 20,
      platformMotionEnabled: true,
      platformMotionType: 'circular',
      platformMotionMaxPxPerFrame: 20,
      vibration: true,
      sensorNoise: true,
      intensity: 100,
    },
    { trackability: 'marginal', category: 'stress' }
  ),
];

export function getScenarioById(id: string): BenchmarkScenario | undefined {
  return BENCHMARK_SCENARIOS.find(s => s.id === id);
}
