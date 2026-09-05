import { SensorFrame, SimulationConfig, Target, CameraGimbalState, SimulationNoise } from '../types';

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

export function generateSensorFrame(
  beacon: Target | undefined,
  camera: CameraGimbalState,
  config: SimulationConfig,
  elapsedSec: number,
  noise?: SimulationNoise
): SensorFrame {
  const effectiveFov = config.cameraFov / camera.zoom;
  const intensity = config.disturbances.intensity / 100;

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
    };
  }

  const relAz = beacon.azimuth - camera.pan;
  const relEl = beacon.elevation - camera.tilt;

  const halfFov = effectiveFov / 2;
  const halfFovRad = (halfFov * Math.PI) / 180;
  const tanHalfFov = Math.tan(halfFovRad);
  const normalizedAz = Math.tan(relAz * Math.PI / 180) / tanHalfFov;
  const normalizedEl = Math.tan(relEl * Math.PI / 180) / tanHalfFov;

  const beaconPixelX = (normalizedAz + 1) / 2 * SENSOR_WIDTH;
  const beaconPixelY = (-normalizedEl + 1) / 2 * SENSOR_HEIGHT;

  const inFov = Math.abs(normalizedAz) <= 1.1 && Math.abs(normalizedEl) <= 1.1;

  const edgeDist = Math.sqrt(normalizedAz * normalizedAz + normalizedEl * normalizedEl);
  const vignettingFactor = clamp(1.0 - edgeDist * 0.3, 0.2, 1.0);

  const rangeKm = beacon.range / 1000;
  const atmosphericAttenuation = Math.exp(-0.1 * rangeKm);
  const baseIntensity = beacon.apparentIntensity * vignettingFactor * atmosphericAttenuation;

  let scintillationIntensity = 1.0;
  if (config.disturbances.atmosphericTurbulence) {
    scintillationIntensity = 1.0 + (Math.sin(elapsedSec * 12.7) * 0.3 + Math.sin(elapsedSec * 7.3) * 0.2) * intensity;
  }

  const beaconIntensity = clamp(baseIntensity * scintillationIntensity, 0, 1);

  let noiseLevel = 0.02;
  if (config.disturbances.sensorNoise) {
    noiseLevel = 0.02 + intensity * 0.15;
  }

  let turbulenceOffsetX = 0;
  let turbulenceOffsetY = 0;
  if (config.disturbances.atmosphericTurbulence) {
    if (noise) {
      turbulenceOffsetX = (noise.turbulenceXRng() * 2.5 + Math.sin(elapsedSec * 5.1) * 1.5) * intensity;
      turbulenceOffsetY = (noise.turbulenceYRng() * 2.0 + Math.cos(elapsedSec * 4.3) * 1.2) * intensity;
    } else {
      turbulenceOffsetX = (gaussianRandom() * 2.5 + Math.sin(elapsedSec * 5.1) * 1.5) * intensity;
      turbulenceOffsetY = (gaussianRandom() * 2.0 + Math.cos(elapsedSec * 4.3) * 1.2) * intensity;
    }
  }

  const signalPower = beaconIntensity * beaconIntensity * 1000;
  const noisePower = noiseLevel * noiseLevel * SENSOR_WIDTH * SENSOR_HEIGHT * 0.01;
  const snr = noisePower > 0 ? signalPower / noisePower : 100;

  const dropoutChance = config.disturbances.atmosphericTurbulence
    ? intensity * 0.15 * (1 - vignettingFactor)
    : 0;

  const dropoutRand = noise ? noise.dropoutRng() : Math.random();
  const beaconPresent = inFov && beaconIntensity > 0.05 && dropoutRand > dropoutChance;

  return {
    width: SENSOR_WIDTH,
    height: SENSOR_HEIGHT,
    beaconPixelX: beaconPixelX + turbulenceOffsetX,
    beaconPixelY: beaconPixelY + turbulenceOffsetY,
    beaconPresent,
    beaconIntensity,
    noiseLevel,
    turbulenceOffsetX,
    turbulenceOffsetY,
    snr,
  };
}

// Converts pixel coordinates to angle RELATIVE to the gimbal boresight.
// The caller must add camera.pan/camera.tilt to obtain absolute angles.
export function pixelToAngle(
  pixelX: number,
  pixelY: number,
  effectiveFov: number,
  sensorWidth: number,
  sensorHeight: number
): { az: number; el: number } {
  const normalizedX = (pixelX / sensorWidth) * 2 - 1;
  const normalizedY = 1 - (pixelY / sensorHeight) * 2;

  const halfFovRad = (effectiveFov / 2) * Math.PI / 180;
  const az = Math.atan(normalizedX * Math.tan(halfFovRad)) * 180 / Math.PI;
  const el = Math.atan(normalizedY * Math.tan(halfFovRad)) * 180 / Math.PI;

  return { az, el };
}
