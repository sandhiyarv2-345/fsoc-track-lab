import { SensorFrame, DetectionResult, TrackingAlgorithm } from '../types';
import { pixelToAngle } from './sensorModel';

// Coordinate frame: All measuredAz/measuredEl values produced by this module
// are RELATIVE to the gimbal boresight (not absolute world angles).
// The orchestrator (simulationEngine.runTrackingPipeline) is responsible for
// converting them to absolute angles by adding camera.pan/camera.tilt.

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

interface BlobRegion {
  centroidX: number;
  centroidY: number;
  totalIntensity: number;
  pixelCount: number;
  size: number;
}

function findBeaconBlob(
  frame: SensorFrame,
  threshold: number,
  searchRadius: number
): BlobRegion | null {
  if (!frame.beaconPresent) return null;

  const cx = frame.beaconPixelX;
  const cy = frame.beaconPixelY;
  const halfSearch = searchRadius;

  const startX = Math.max(0, Math.floor(cx - halfSearch));
  const endX = Math.min(frame.width - 1, Math.ceil(cx + halfSearch));
  const startY = Math.max(0, Math.floor(cy - halfSearch));
  const endY = Math.min(frame.height - 1, Math.ceil(cy + halfSearch));

  let sumX = 0;
  let sumY = 0;
  let totalIntensity = 0;
  let pixelCount = 0;
  let maxDist = 0;

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const distX = x - cx;
      const distY = y - cy;
      const dist = Math.sqrt(distX * distX + distY * distY);

      if (dist > searchRadius) continue;

      const noise = gaussianRandom() * frame.noiseLevel * 50;
      const pixelIntensity = frame.beaconIntensity * Math.exp(-dist * dist / (2 * searchRadius * searchRadius * 0.25));
      const noisyIntensity = pixelIntensity + noise;

      if (noisyIntensity > threshold) {
        sumX += x * noisyIntensity;
        sumY += y * noisyIntensity;
        totalIntensity += noisyIntensity;
        pixelCount++;
        maxDist = Math.max(maxDist, dist);
      }
    }
  }

  if (pixelCount < 3) return null;

  return {
    centroidX: sumX / totalIntensity,
    centroidY: sumY / totalIntensity,
    totalIntensity,
    pixelCount,
    size: maxDist,
  };
}

export function detectBeacon(
  frame: SensorFrame,
  algorithm: TrackingAlgorithm,
  effectiveFov: number,
  elapsedSec: number
): DetectionResult {
  if (!frame.beaconPresent || frame.beaconIntensity < 0.03) {
    return {
      detected: false,
      measuredAz: 0,
      measuredEl: 0,
      confidence: 0,
      snr: frame.snr,
      blobSize: 0,
    };
  }

  let threshold: number;
  let searchRadius: number;

  if (algorithm === 'Deep Beacon') {
    threshold = 0.08;
    searchRadius = 45;
  } else {
    threshold = 0.15;
    searchRadius = 30;
  }

  const blob = findBeaconBlob(frame, threshold, searchRadius);

  if (!blob) {
    return {
      detected: false,
      measuredAz: 0,
      measuredEl: 0,
      confidence: 0,
      snr: frame.snr,
      blobSize: 0,
    };
  }

  const detectionNoiseAz = gaussianRandom() * frame.noiseLevel * 2.5;
  const detectionNoiseEl = gaussianRandom() * frame.noiseLevel * 2.0;

  const measuredPixelX = blob.centroidX + detectionNoiseAz;
  const measuredPixelY = blob.centroidY + detectionNoiseEl;

  const { az, el } = pixelToAngle(
    measuredPixelX,
    measuredPixelY,
    effectiveFov,
    frame.width,
    frame.height
  );

  const normalizedDist = Math.sqrt(
    Math.pow((measuredPixelX / frame.width) * 2 - 1, 2) +
    Math.pow(1 - (measuredPixelY / frame.height) * 2, 2)
  );
  const edgeDegradation = clamp(1.0 - normalizedDist * 0.4, 0.3, 1.0);

  const snrFactor = clamp(frame.snr / 50, 0.2, 1.0);
  const intensityFactor = clamp(frame.beaconIntensity, 0.2, 1.0);
  const blobQuality = clamp(blob.pixelCount / (searchRadius * 0.5), 0.3, 1.0);

  let confidence: number;
  if (algorithm === 'Deep Beacon') {
    confidence = (snrFactor * 0.3 + intensityFactor * 0.3 + edgeDegradation * 0.2 + blobQuality * 0.2) * 100;
  } else {
    confidence = (snrFactor * 0.25 + intensityFactor * 0.35 + edgeDegradation * 0.25 + blobQuality * 0.15) * 100;
  }

  confidence = clamp(confidence, 0, 99.5);

  return {
    detected: true,
    measuredAz: az,
    measuredEl: el,
    confidence,
    snr: frame.snr,
    blobSize: blob.size,
  };
}
