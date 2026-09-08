/**
 * FSOC Track Lab — Real Image-Based Beacon Detector
 *
 * Processes actual video frame pixels (from MP4 input) to detect
 * a bright beacon spot. No simulation ground truth is used.
 *
 * Pipeline:
 *   Raw RGBA pixels → grayscale → brightness threshold → blob grouping
 *   → intensity-weighted centroid → confidence → VideoBeaconDetection
 */

import { VideoFrameData, VideoBeaconDetection } from '../types';

export interface VideoBeaconDetectorConfig {
  brightnessThreshold: number;
  minBlobPixels: number;
  maxBlobPixels: number;
  minIntensity: number;
  searchRegionX?: number;
  searchRegionY?: number;
  searchRegionW?: number;
  searchRegionH?: number;
}

const DEFAULT_CONFIG: VideoBeaconDetectorConfig = {
  brightnessThreshold: 0.55,
  minBlobPixels: 4,
  maxBlobPixels: 500,
  minIntensity: 0.3,
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Convert RGBA pixel data to single-channel grayscale (0-255).
 * Uses luminance weighting: 0.299R + 0.587G + 0.114B
 */
export function toGrayscale(pixels: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

/**
 * Apply adaptive brightness threshold to find candidate beacon pixels.
 * Returns a boolean mask where true = candidate pixel.
 */
export function thresholdBrightness(
  gray: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  searchRegion?: { x: number; y: number; w: number; h: number },
): boolean[] {
  const mask = Array<boolean>(width * height).fill(false);
  const threshVal = Math.floor(threshold * 255);

  const rx = searchRegion ? Math.max(0, Math.floor(searchRegion.x)) : 0;
  const ry = searchRegion ? Math.max(0, Math.floor(searchRegion.y)) : 0;
  const rw = searchRegion ? Math.min(width - rx, Math.ceil(searchRegion.w)) : width;
  const rh = searchRegion ? Math.min(height - ry, Math.ceil(searchRegion.h)) : height;

  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const idx = y * width + x;
      if (gray[idx] >= threshVal) {
        mask[idx] = true;
      }
    }
  }

  return mask;
}

interface Blob {
  pixels: Array<{ x: number; y: number; intensity: number }>;
  totalIntensity: number;
  meanX: number;
  meanY: number;
  size: number;
}

/**
 * Connected-component blob analysis on a boolean mask.
 * Groups adjacent bright pixels into blobs.
 */
export function findBlobs(
  mask: boolean[],
  gray: Uint8Array,
  width: number,
  height: number,
  minPixels: number,
  maxPixels: number,
): Blob[] {
  const visited = new Uint8Array(width * height);
  const blobs: Blob[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!mask[idx] || visited[idx]) continue;

      const blobPixels: Array<{ x: number; y: number; intensity: number }> = [];
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      visited[idx] = 1;

      while (queue.length > 0) {
        const pt = queue.shift()!;
        const pi = pt.y * width + pt.x;
        const intensity = gray[pi] / 255;
        blobPixels.push({ x: pt.x, y: pt.y, intensity });

        const neighbors = [
          { x: pt.x - 1, y: pt.y },
          { x: pt.x + 1, y: pt.y },
          { x: pt.x, y: pt.y - 1 },
          { x: pt.x, y: pt.y + 1 },
          { x: pt.x - 1, y: pt.y - 1 },
          { x: pt.x + 1, y: pt.y - 1 },
          { x: pt.x - 1, y: pt.y + 1 },
          { x: pt.x + 1, y: pt.y + 1 },
        ];

        for (const n of neighbors) {
          if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
          const ni = n.y * width + n.x;
          if (!mask[ni] || visited[ni]) continue;
          visited[ni] = 1;
          queue.push(n);
        }
      }

      if (blobPixels.length >= minPixels && blobPixels.length <= maxPixels) {
        let totalIntensity = 0;
        let sumX = 0;
        let sumY = 0;
        for (const p of blobPixels) {
          totalIntensity += p.intensity;
          sumX += p.x * p.intensity;
          sumY += p.y * p.intensity;
        }
        blobs.push({
          pixels: blobPixels,
          totalIntensity,
          meanX: sumX / totalIntensity,
          meanY: sumY / totalIntensity,
          size: blobPixels.length,
        });
      }
    }
  }

  return blobs;
}

/**
 * Compute signal-to-noise ratio for a blob region.
 * SNR = mean blob intensity / mean background intensity
 */
function computeSnr(
  blob: Blob,
  gray: Uint8Array,
  width: number,
  height: number,
): number {
  const cx = Math.round(blob.meanX);
  const cy = Math.round(blob.meanY);
  const margin = Math.max(blob.size, 20);

  let bgSum = 0;
  let bgCount = 0;

  for (let dy = -margin; dy <= margin; dy += 3) {
    for (let dx = -margin; dx <= margin; dx += 3) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < blob.size * 0.5 || dist > margin) continue;
      bgSum += gray[py * width + px];
      bgCount++;
    }
  }

  const bgMean = bgCount > 0 ? bgSum / bgCount / 255 : 0.1;
  const blobMean = blob.totalIntensity / blob.size;
  return bgMean > 0 ? blobMean / bgMean : 0;
}

/**
 * Main detection function. Processes a real video frame and returns
 * the detected beacon centroid. Uses NO simulation ground truth.
 */
export function detectBeaconInVideoFrame(
  frame: VideoFrameData,
  config: Partial<VideoBeaconDetectorConfig> = {},
): VideoBeaconDetection {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const gray = toGrayscale(frame.pixels, frame.width, frame.height);

  const mask = thresholdBrightness(gray, frame.width, frame.height, cfg.brightnessThreshold);

  const blobs = findBlobs(mask, gray, frame.width, frame.height, cfg.minBlobPixels, cfg.maxBlobPixels);

  if (blobs.length === 0) {
    return {
      detected: false,
      centroidX: 0,
      centroidY: 0,
      confidence: 0,
      blobSize: 0,
      pixelCount: 0,
      meanIntensity: 0,
      snr: 0,
    };
  }

  let bestBlob = blobs[0];
  for (let i = 1; i < blobs.length; i++) {
    if (blobs[i].totalIntensity > bestBlob.totalIntensity) {
      bestBlob = blobs[i];
    }
  }

  const snr = computeSnr(bestBlob, gray, frame.width, frame.height);

  const normalizedDist = Math.sqrt(
    Math.pow((bestBlob.meanX / frame.width) * 2 - 1, 2) +
    Math.pow((bestBlob.meanY / frame.height) * 2 - 1, 2),
  );
  const edgeDegradation = clamp(1.0 - normalizedDist * 0.4, 0.3, 1.0);

  const snrFactor = clamp(snr / 5, 0.1, 1.0);
  const sizeFactor = clamp(bestBlob.size / 20, 0.2, 1.0);
  const intensityFactor = clamp(bestBlob.totalIntensity / bestBlob.size, 0.1, 1.0);

  const confidence = clamp(
    (snrFactor * 0.35 + sizeFactor * 0.25 + intensityFactor * 0.2 + edgeDegradation * 0.2) * 100,
    0,
    99.5,
  );

  return {
    detected: true,
    centroidX: bestBlob.meanX,
    centroidY: bestBlob.meanY,
    confidence,
    blobSize: bestBlob.size,
    pixelCount: bestBlob.size,
    meanIntensity: bestBlob.totalIntensity / bestBlob.size,
    snr,
  };
}
