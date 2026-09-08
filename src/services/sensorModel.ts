import { SensorFrame, SimulationConfig, Target, CameraGimbalState, SimulationNoise, AtmosphericCondition } from '../types';

// Sensor resolution: 640x480 pixels
const SENSOR_WIDTH = 640;
const SENSOR_HEIGHT = 480;

// Coordinate frames used throughout the pipeline:
//
// ABSOLUTE (world frame):
//   target.azimuth, target.elevation — target angle from origin (degrees)
//   camera.pan, camera.tilt — gimbal pointing direction (degrees)
//   groundTruthAz/El — same as target.azimuth/elevation
//   measuredAz/El (after conversion) — detector output + gimbal position
//   estimatedAz/El — Kalman filter state estimate of absolute target angle
//
// RELATIVE (gimbal-boresight frame):
//   relAz = target.azimuth - camera.pan  (offset from boresight center)
//   relEl = target.elevation - camera.tilt
//   pixel coordinates — derived from relAz/relEl via FOV projection
//   raw measuredAz/El from pixelToAngle() — relative to boresight

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ── Phase 2B: Atmospheric condition effects ──
//
// Each condition returns { contrastMultiplier, brightnessMultiplier, dropoutExtra }
// where contrast/brightness are applied to beacon intensity and dropoutExtra is
// additional dropout probability on top of existing atmospheric turbulence dropout.

interface AtmosphericEffect {
  contrastMultiplier: number;
  brightnessMultiplier: number;
  dropoutExtra: number;
}

function getAtmosphericEffect(
  condition: AtmosphericCondition,
  rangeKm: number,
  elapsedSec: number,
  intensity: number
): AtmosphericEffect {
  const base = intensity; // 0–1
  switch (condition) {
    case 'clear':
      return { contrastMultiplier: 1.0, brightnessMultiplier: 1.0, dropoutExtra: 0 };

    case 'haze':
      return {
        contrastMultiplier: 1.0 - base * 0.25 * Math.min(rangeKm / 2, 1),
        brightnessMultiplier: 1.0 - base * 0.15 * Math.min(rangeKm / 2, 1),
        dropoutExtra: base * 0.02,
      };

    case 'fog':
      return {
        contrastMultiplier: 1.0 - base * 0.5 * Math.min(rangeKm / 1.5, 1),
        brightnessMultiplier: 1.0 - base * 0.4 * Math.min(rangeKm / 1.5, 1),
        dropoutExtra: base * 0.08,
      };

    case 'rain': {
      // Rain: attenuation + time-varying opacity flicker
      const flicker = 1.0 + Math.sin(elapsedSec * 3.7) * 0.05 * base;
      return {
        contrastMultiplier: (1.0 - base * 0.2) * flicker,
        brightnessMultiplier: (1.0 - base * 0.25) * flicker,
        dropoutExtra: base * 0.04,
      };
    }

    case 'lowLight':
      return {
        contrastMultiplier: 1.0 - base * 0.15,
        brightnessMultiplier: 1.0 - base * 0.5,
        dropoutExtra: base * 0.03,
      };

    default:
      return { contrastMultiplier: 1.0, brightnessMultiplier: 1.0, dropoutExtra: 0 };
  }
}

// ── Phase 2B: Image noise types ──
//
// These modify the sensor-frame intensity statistics. They are modeled as
// effective changes to noiseLevel and beaconIntensity, not as pixel-level
// image manipulation (the sensor model is a single-beacon centroid model,
// not a full image pipeline).

interface ImageNoiseEffect {
  /** Additional noise added to beaconIntensity (can be negative for salt-pepper) */
  intensityOffset: number;
  /** Additional noise floor added to noiseLevel */
  noiseFloorAdd: number;
  /** SNR degradation factor (multiplier, 1.0 = no change) */
  snrDegradation: number;
}

function computeImageNoiseEffect(
  noiseTypes: Array<'saltPepper' | 'gaussian' | 'poisson'>,
  saltPepperProb: number,
  gaussianStdDevPx: number,
  poissonStrength: number,
  baseNoiseLevel: number,
  noise?: SimulationNoise
): ImageNoiseEffect {
  let intensityOffset = 0;
  let noiseFloorAdd = 0;
  let snrDegradation = 1.0;

  for (const nt of noiseTypes) {
    switch (nt) {
      case 'saltPepper': {
        // Salt & pepper: randomly corrupts ~probability of pixel observations.
        // Modeled as intermittent intensity drop/spike.
        const rand = noise ? noise.saltPepperRng() : Math.random();
        if (rand < saltPepperProb) {
          // Pepper (dark pixel): reduce intensity
          if (rand < saltPepperProb / 2) {
            intensityOffset -= 0.3;
          } else {
            // Salt (bright pixel): increase intensity
            intensityOffset += 0.2;
          }
          noiseFloorAdd += 0.05;
        }
        break;
      }

      case 'gaussian': {
        // Gaussian noise: additive intensity noise proportional to std dev
        // stdDevPx is in pixel-equivalent units; we scale to intensity domain
        const noiseRng = noise ? noise.blobNoiseRng : undefined;
        const sample = noiseRng ? noiseRng() : gaussianRandom();
        const scaledNoise = sample * (gaussianStdDevPx / 20) * 0.15;
        intensityOffset += scaledNoise;
        noiseFloorAdd += (gaussianStdDevPx / 20) * 0.08;
        snrDegradation *= Math.max(0.3, 1.0 - (gaussianStdDevPx / 20) * 0.4);
        break;
      }

      case 'poisson': {
        // Poisson noise: intensity-dependent shot noise
        // Modeled as sqrt(signal) scaled noise (Poisson variance = mean)
        const poissonRng = noise ? noise.poissonRng : undefined;
        const sample = poissonRng ? poissonRng() : gaussianRandom();
        // Poisson-like: noise magnitude scales with sqrt of intensity
        const shotNoise = sample * Math.sqrt(Math.abs(baseNoiseLevel + 0.1)) * poissonStrength * 0.1;
        intensityOffset += shotNoise;
        noiseFloorAdd += poissonStrength * 0.03;
        snrDegradation *= Math.max(0.5, 1.0 - poissonStrength * 0.08);
        break;
      }
    }
  }

  return { intensityOffset, noiseFloorAdd, snrDegradation };
}

// ── Phase 2B: Rain streak artifacts ──
//
// Produces sparse "streak" dropout events that simulate rain droplets
// crossing the sensor line of sight.

function computeRainStreakEffect(
  condition: AtmosphericCondition,
  intensity: number,
  elapsedSec: number,
  noise?: SimulationNoise
): { dropoutExtra: number } {
  if (condition !== 'rain') return { dropoutExtra: 0 };

  const rng = noise ? noise.rainStreakRng : undefined;
  const rand = rng ? rng() : Math.random();

  // Streaks are periodic events at ~2–5 Hz with random amplitude
  const streakEnvelope = Math.abs(Math.sin(elapsedSec * 4.1)) * Math.abs(Math.cos(elapsedSec * 2.3));
  const streakThreshold = streakEnvelope * intensity * 0.15;

  return {
    dropoutExtra: rand < streakThreshold ? streakThreshold : 0,
  };
}

export function generateSensorFrame(
  beacon: Target | undefined,
  camera: CameraGimbalState,
  config: SimulationConfig,
  elapsedSec: number,
  noise?: SimulationNoise,
  cameraJitterOffsetX?: number,
  cameraJitterOffsetY?: number,
  platformMotionOffsetX?: number,
  platformMotionOffsetY?: number
): SensorFrame {
  const hFov = (config.cameraFovHorizontal || config.cameraFov) / camera.zoom;
  const vFov = (config.cameraFovVertical || config.cameraFov * 0.75) / camera.zoom;
  const intensity = config.disturbances.intensity / 100;
  const disturb = config.disturbances;

  if (!beacon) {
    return {
      width: SENSOR_WIDTH,
      height: SENSOR_HEIGHT,
      beaconPixelX: SENSOR_WIDTH / 2,
      beaconPixelY: SENSOR_HEIGHT / 2,
      beaconPresent: false,
      beaconIntensity: 0,
      noiseLevel: 0,
      turbulenceOffsetX: 0,
      turbulenceOffsetY: 0,
      snr: 0,
      atmosphericContrast: 1.0,
      atmosphericBrightness: 1.0,
    };
  }

  // ── Step 1: Geometric projection ──
  const relAz = beacon.azimuth - camera.pan;
  const relEl = beacon.elevation - camera.tilt;

  const halfHFovRad = (hFov / 2 * Math.PI) / 180;
  const halfVFovRad = (vFov / 2 * Math.PI) / 180;
  const tanHalfHFov = Math.tan(halfHFovRad);
  const tanHalfVFov = Math.tan(halfVFovRad);
  const normalizedAz = Math.tan(relAz * Math.PI / 180) / tanHalfHFov;
  const normalizedEl = Math.tan(relEl * Math.PI / 180) / tanHalfVFov;

  let beaconPixelX = (normalizedAz + 1) / 2 * SENSOR_WIDTH;
  let beaconPixelY = (-normalizedEl + 1) / 2 * SENSOR_HEIGHT;

  const inFov = Math.abs(normalizedAz) <= 1.1 && Math.abs(normalizedEl) <= 1.1;

  // ── Step 2: Apply platform motion offset (pixel-domain) ──
  if (platformMotionOffsetX !== undefined) beaconPixelX += platformMotionOffsetX;
  if (platformMotionOffsetY !== undefined) beaconPixelY += platformMotionOffsetY;

  // ── Step 3: Apply camera jitter offset (pixel-domain) ──
  if (cameraJitterOffsetX !== undefined) beaconPixelX += cameraJitterOffsetX;
  if (cameraJitterOffsetY !== undefined) beaconPixelY += cameraJitterOffsetY;

  // ── Step 4: Vignetting and range attenuation ──
  const edgeDist = Math.sqrt(normalizedAz * normalizedAz + normalizedEl * normalizedEl);
  const vignettingFactor = clamp(1.0 - edgeDist * 0.3, 0.2, 1.0);

  const rangeKm = beacon.range / 1000;
  const atmosphericAttenuation = Math.exp(-0.1 * rangeKm);
  let baseIntensity = beacon.apparentIntensity * vignettingFactor * atmosphericAttenuation;

  // ── Step 5: Atmospheric turbulence scintillation (legacy) ──
  let scintillationIntensity = 1.0;
  if (disturb.atmosphericTurbulence) {
    scintillationIntensity = 1.0 + (Math.sin(elapsedSec * 12.7) * 0.3 + Math.sin(elapsedSec * 7.3) * 0.2) * intensity;
  }

  // ── Step 6: Atmospheric condition effects ──
  const atmCondition = disturb.atmosphericCondition || 'clear';
  const atmEffect = getAtmosphericEffect(atmCondition, rangeKm, elapsedSec, intensity);
  const rainStreak = computeRainStreakEffect(atmCondition, intensity, elapsedSec, noise);

  baseIntensity *= atmEffect.contrastMultiplier;
  const beaconIntensity = clamp(baseIntensity * scintillationIntensity * atmEffect.brightnessMultiplier, 0, 1);

  // ── Step 7: Noise level computation ──
  let noiseLevel = 0.02;
  if (disturb.sensorNoise) {
    noiseLevel = 0.02 + intensity * 0.15;
  }

  // Phase 2B: Apply image noise effects
  const noiseEffect = computeImageNoiseEffect(
    disturb.imageNoiseTypes || [],
    disturb.saltPepperProbability || 0.10,
    disturb.gaussianStdDevPx || 0,
    disturb.poissonStrength || 0,
    noiseLevel,
    noise
  );
  noiseLevel += noiseEffect.noiseFloorAdd;

  // ── Step 8: Turbulence pixel offsets (legacy atmosphericTurbulence) ──
  let turbulenceOffsetX = 0;
  let turbulenceOffsetY = 0;
  if (disturb.atmosphericTurbulence) {
    if (noise) {
      turbulenceOffsetX = (noise.turbulenceXRng() * 2.5 + Math.sin(elapsedSec * 5.1) * 1.5) * intensity;
      turbulenceOffsetY = (noise.turbulenceYRng() * 2.0 + Math.cos(elapsedSec * 4.3) * 1.2) * intensity;
    } else {
      turbulenceOffsetX = (gaussianRandom() * 2.5 + Math.sin(elapsedSec * 5.1) * 1.5) * intensity;
      turbulenceOffsetY = (gaussianRandom() * 2.0 + Math.cos(elapsedSec * 4.3) * 1.2) * intensity;
    }
  }

  // ── Step 9: SNR computation ──
  const effectiveIntensity = clamp(beaconIntensity + noiseEffect.intensityOffset, 0, 1);
  const signalPower = effectiveIntensity * effectiveIntensity * 1000;
  const noisePower = noiseLevel * noiseLevel * SENSOR_WIDTH * SENSOR_HEIGHT * 0.01;
  let snr = noisePower > 0 ? signalPower / noisePower : 100;
  snr *= noiseEffect.snrDegradation;

  // ── Step 10: Dropout probability ──
  const dropoutChance = disturb.atmosphericTurbulence
    ? intensity * 0.15 * (1 - vignettingFactor)
    : 0;
  const totalDropout = dropoutChance + atmEffect.dropoutExtra + rainStreak.dropoutExtra;

  const dropoutRand = noise ? noise.dropoutRng() : Math.random();
  const beaconPresent = inFov && effectiveIntensity > 0.05 && dropoutRand > totalDropout;

  return {
    width: SENSOR_WIDTH,
    height: SENSOR_HEIGHT,
    beaconPixelX: beaconPixelX + turbulenceOffsetX,
    beaconPixelY: beaconPixelY + turbulenceOffsetY,
    beaconPresent,
    beaconIntensity: effectiveIntensity,
    noiseLevel,
    turbulenceOffsetX,
    turbulenceOffsetY,
    snr,
    atmosphericContrast: atmEffect.contrastMultiplier,
    atmosphericBrightness: atmEffect.brightnessMultiplier,
  };
}

// Converts pixel coordinates to angle RELATIVE to the gimbal boresight.
// The caller must add camera.pan/camera.tilt to obtain absolute angles.
// When hFov and vFov are provided, they are used separately for X and Y.
// Otherwise effectiveFov is used for both (backward compatible).
export function pixelToAngle(
  pixelX: number,
  pixelY: number,
  effectiveFov: number,
  sensorWidth: number,
  sensorHeight: number,
  hFov?: number,
  vFov?: number
): { az: number; el: number } {
  const normalizedX = (pixelX / sensorWidth) * 2 - 1;
  const normalizedY = 1 - (pixelY / sensorHeight) * 2;

  const hHalfFovRad = ((hFov ?? effectiveFov) / 2) * Math.PI / 180;
  const vHalfFovRad = ((vFov ?? effectiveFov) / 2) * Math.PI / 180;
  const az = Math.atan(normalizedX * Math.tan(hHalfFovRad)) * 180 / Math.PI;
  const el = Math.atan(normalizedY * Math.tan(vHalfFovRad)) * 180 / Math.PI;

  return { az, el };
}
