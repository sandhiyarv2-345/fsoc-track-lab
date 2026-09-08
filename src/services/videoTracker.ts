/**
 * FSOC Track Lab — External Video Tracking Pipeline
 *
 * Processes real video frames from MP4 input through beacon detection
 * and tracking, producing coarse pointing commands and performance metrics.
 *
 * CRITICAL: This module does NOT access simulation ground truth
 * (target.x/y/z, target.azimuth/elevation, simulated beaconPixelX/Y).
 * The only beacon location source is real video pixels.
 */

import {
  VideoFrameData,
  VideoBeaconDetection,
  VideoTrackerTelemetry,
  VideoPerformanceLog,
  VideoPerformanceSummary,
  TrackingStatus,
} from '../types';
import { detectBeaconInVideoFrame, VideoBeaconDetectorConfig } from './videoBeaconDetector';

export interface VideoTrackerConfig {
  detectorConfig: Partial<VideoBeaconDetectorConfig>;
  lockThresholdPx: number;
  acquireThresholdPx: number;
  maxDropoutFrames: number;
  smoothingAlpha: number;
  /** Minimum consecutive valid detections before entering ACQUIRING */
  acquirePersistenceFrames: number;
  /** Minimum consecutive valid detections before entering LOCKED from ACQUIRING */
  lockPersistenceFrames: number;
  /** Maximum distance (px) from previous centroid to consider a blob as the same target */
  maxTrackingDistancePx: number;
  referenceCentroids?: Array<{ frameIndex: number; x: number; y: number }>;
}

interface VideoTrackerState {
  trackingState: TrackingStatus;
  smoothedCentroidX: number;
  smoothedCentroidY: number;
  consecutiveDropouts: number;
  lastDetection: VideoBeaconDetection | null;
  acquisitionTimeSec: number | null;
  lockFrameCount: number;
  totalFrameCount: number;
  reacquisitionTimes: number[];
  lastLostFrameIndex: number;
  frameStartTime: number;
  frameTimes: number[];
  log: VideoPerformanceLog[];
  /** Temporal tracking: previous frame's centroid for spatial consistency */
  prevCentroidX: number;
  prevCentroidY: number;
  /** Number of consecutive frames where a valid detection was found */
  consecutiveDetections: number;
  /** Number of consecutive frames in ACQUIRING state */
  consecutiveAcquiring: number;
  /** Whether the tracker has ever been initialized with a detection */
  trackerInitialized: boolean;
}

const DEFAULT_TRACKER_CONFIG: VideoTrackerConfig = {
  detectorConfig: {},
  lockThresholdPx: 10,
  acquireThresholdPx: 30,
  maxDropoutFrames: 10,
  smoothingAlpha: 0.4,
  acquirePersistenceFrames: 3,
  lockPersistenceFrames: 5,
  maxTrackingDistancePx: 80,
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Create a fresh tracker state.
 */
export function createVideoTrackerState(): VideoTrackerState {
  return {
    trackingState: 'SEARCHING',
    smoothedCentroidX: 0,
    smoothedCentroidY: 0,
    consecutiveDropouts: 0,
    lastDetection: null,
    acquisitionTimeSec: null,
    lockFrameCount: 0,
    totalFrameCount: 0,
    reacquisitionTimes: [],
    lastLostFrameIndex: -1,
    frameStartTime: 0,
    frameTimes: [],
    log: [],
    prevCentroidX: 0,
    prevCentroidY: 0,
    consecutiveDetections: 0,
    consecutiveAcquiring: 0,
    trackerInitialized: false,
  };
}

/**
 * Select the best blob for tracking using spatial/temporal consistency.
 * Prefers blobs closest to the previous tracked position.
 */
function selectBestBlobForTracking(
  detections: VideoBeaconDetection[],
  prevX: number,
  prevY: number,
  maxDistance: number,
  initialized: boolean,
): VideoBeaconDetection | null {
  if (detections.length === 0) return null;
  if (detections.length === 1) return detections[0];

  if (!initialized) {
    // First detection: pick highest confidence
    return detections.reduce((best, d) => d.confidence > best.confidence ? d : best, detections[0]);
  }

  // Subsequent frames: pick blob closest to previous centroid
  let bestMatch: VideoBeaconDetection | null = null;
  let bestDist = Infinity;

  for (const d of detections) {
    const dist = Math.sqrt(
      (d.centroidX - prevX) * (d.centroidX - prevX) +
      (d.centroidY - prevY) * (d.centroidY - prevY)
    );
    if (dist < maxDistance && dist < bestDist) {
      bestDist = dist;
      bestMatch = d;
    }
  }

  // If no blob within maxTrackingDistance, fall back to highest confidence
  if (!bestMatch) {
    return detections.reduce((best, d) => d.confidence > best.confidence ? d : best, detections[0]);
  }

  return bestMatch;
}

/**
 * Process a single video frame through the tracking pipeline.
 * Returns updated telemetry and tracker state.
 * Does NOT use any simulation ground truth.
 */
export function processVideoFrame(
  frame: VideoFrameData,
  trackerState: VideoTrackerState,
  config: Partial<VideoTrackerConfig> = {},
  fps: number = 30,
): {
  telemetry: VideoTrackerTelemetry;
  trackerState: VideoTrackerState;
} {
  const cfg = { ...DEFAULT_TRACKER_CONFIG, ...config };
  const dt = 1 / fps;
  const frameIndex = frame.frameIndex;
  const timeSec = frame.timestampSec;

  const state = { ...trackerState };
  state.totalFrameCount++;

  const procStart = performance.now();

  // Run detection — get all candidate blobs
  const detection = detectBeaconInVideoFrame(frame, cfg.detectorConfig);

  const MIN_CONFIDENCE_FOR_DETECT = 10;

  let detectedX = 0;
  let detectedY = 0;
  let boresightOffsetPx = 0;
  let confidence = 0;
  let isValidDetection = false;

  if (detection.detected && detection.confidence >= MIN_CONFIDENCE_FOR_DETECT) {
    // Apply temporal tracking: select best blob based on proximity to previous centroid
    const trackedDetection = selectBestBlobForTracking(
      [detection],
      state.prevCentroidX,
      state.prevCentroidY,
      cfg.maxTrackingDistancePx,
      state.trackerInitialized,
    );

    if (trackedDetection) {
      detectedX = trackedDetection.centroidX;
      detectedY = trackedDetection.centroidY;
      confidence = trackedDetection.confidence;
      isValidDetection = true;

      // EMA smoothing
      if (state.trackerInitialized) {
        state.smoothedCentroidX = cfg.smoothingAlpha * detectedX + (1 - cfg.smoothingAlpha) * state.smoothedCentroidX;
        state.smoothedCentroidY = cfg.smoothingAlpha * detectedY + (1 - cfg.smoothingAlpha) * state.smoothedCentroidY;
      } else {
        state.smoothedCentroidX = detectedX;
        state.smoothedCentroidY = detectedY;
        state.trackerInitialized = true;
      }

      state.prevCentroidX = detectedX;
      state.prevCentroidY = detectedY;
      state.consecutiveDropouts = 0;
      state.consecutiveDetections++;
      state.lastDetection = trackedDetection;
    }
  }

  if (!isValidDetection) {
    state.consecutiveDropouts++;
    state.consecutiveDetections = 0;
    detectedX = state.smoothedCentroidX;
    detectedY = state.smoothedCentroidY;
  }

  const cx = state.smoothedCentroidX;
  const cy = state.smoothedCentroidY;
  const frameCenterX = frame.width / 2;
  const frameCenterY = frame.height / 2;
  boresightOffsetPx = Math.sqrt(
    (cx - frameCenterX) * (cx - frameCenterX) +
    (cy - frameCenterY) * (cy - frameCenterY),
  );

  // ── State machine: acquisition based on detection persistence, NOT center proximity ──
  // A detected beacon with valid centroid + sufficient confidence + persistence
  // should enter ACQUIRING and then LOCKED.
  let newState: TrackingStatus = 'SEARCHING';

  if (isValidDetection) {
    if (state.trackingState === 'LOCKED') {
      // Already locked: stay locked as long as detection persists
      newState = 'LOCKED';
      state.consecutiveAcquiring = 0;
    } else if (state.consecutiveDetections >= cfg.lockPersistenceFrames) {
      // Enough consecutive detections: go directly to LOCKED
      newState = 'LOCKED';
      state.consecutiveAcquiring = 0;
    } else if (state.consecutiveDetections >= cfg.acquirePersistenceFrames) {
      // Enough detections to start acquiring
      newState = 'ACQUIRING';
      state.consecutiveAcquiring++;
    } else {
      // Not enough persistence yet: stay searching but track the detection
      newState = 'SEARCHING';
      state.consecutiveAcquiring = 0;
    }
  } else if (state.consecutiveDropouts > 0 && state.consecutiveDropouts < cfg.maxDropoutFrames) {
    newState = 'ACQUIRING';
    confidence = Math.max(5, 60 - state.consecutiveDropouts * 8);
    state.consecutiveAcquiring++;
  } else if (state.consecutiveDropouts >= cfg.maxDropoutFrames) {
    newState = 'LOST';
    state.consecutiveAcquiring = 0;
  } else {
    newState = 'SEARCHING';
    state.consecutiveAcquiring = 0;
  }

  // Track acquisition time
  if (newState === 'LOCKED' && state.trackingState !== 'LOCKED') {
    if (state.acquisitionTimeSec === null) {
      state.acquisitionTimeSec = timeSec;
    } else if (state.lastLostFrameIndex >= 0) {
      const reacqTime = timeSec - (state.lastLostFrameIndex / fps);
      if (reacqTime > 0 && reacqTime < 10) {
        state.reacquisitionTimes.push(reacqTime);
      }
    }
  }

  if (newState === 'LOST' && state.trackingState !== 'LOST') {
    state.lastLostFrameIndex = frameIndex;
  }

  if (newState === 'LOCKED') {
    state.lockFrameCount++;
  }

  state.trackingState = newState;

  // Pointing command from centroid offset (does NOT move physical camera in MP4 mode)
  const panCommand = clamp((cx - frameCenterX) / (frame.width / 2) * 5, -5, 5);
  const tiltCommand = clamp(-(cy - frameCenterY) / (frame.height / 2) * 5, -5, 5);

  const procEnd = performance.now();
  const processingTimeMs = procEnd - procStart;

  state.frameTimes.push(processingTimeMs);
  if (state.frameTimes.length > 60) state.frameTimes.shift();

  const mins = Math.floor(timeSec / 60).toString().padStart(2, '0');
  const secs = Math.floor(timeSec % 60).toString().padStart(2, '0');
  const formattedTime = `${mins}:${secs}`;

  const telemetry: VideoTrackerTelemetry = {
    timeSec,
    formattedTime,
    frameIndex,
    centroidX: cx,
    centroidY: cy,
    detectedCentroidX: detectedX,
    detectedCentroidY: detectedY,
    trackingState: newState,
    confidence,
    boresightOffsetPx,
    panCommand,
    tiltCommand,
    fps: state.frameTimes.length > 0
      ? 1000 / (state.frameTimes.reduce((a, b) => a + b, 0) / state.frameTimes.length)
      : 0,
    processingTimeMs,
  };

  const logEntry: VideoPerformanceLog = {
    frameIndex,
    timeSec,
    centroidX: cx,
    centroidY: cy,
    detected: isValidDetection,
    confidence,
    boresightOffsetPx,
    trackingState: newState,
    panCommand,
    tiltCommand,
    processingTimeMs,
  };
  state.log.push(logEntry);

  return { telemetry, trackerState: state };
}

/**
 * Compute the reference centroid error for a given frame.
 * Returns null if no reference is available.
 */
export function getReferenceCentroidError(
  frameIndex: number,
  detectedX: number,
  detectedY: number,
  referenceCentroids?: Array<{ frameIndex: number; x: number; y: number }>,
): number | null {
  if (!referenceCentroids || referenceCentroids.length === 0) return null;

  let closest = referenceCentroids[0];
  let minDist = Math.abs(frameIndex - closest.frameIndex);

  for (let i = 1; i < referenceCentroids.length; i++) {
    const dist = Math.abs(frameIndex - referenceCentroids[i].frameIndex);
    if (dist < minDist) {
      minDist = dist;
      closest = referenceCentroids[i];
    }
  }

  if (minDist > 5) return null;

  return Math.sqrt(
    (detectedX - closest.x) * (detectedX - closest.x) +
    (detectedY - closest.y) * (detectedY - closest.y),
  );
}

/**
 * Compute final performance summary from tracker state.
 */
export function computeVideoPerformanceSummary(
  trackerState: VideoTrackerState,
  sourceFileName: string,
  sourceFps: number,
  sourceWidth: number,
  sourceHeight: number,
): VideoPerformanceSummary {
  const { log, acquisitionTimeSec, reacquisitionTimes, lockFrameCount, totalFrameCount } = trackerState;

  const centroidErrors = log.map((l) => l.boresightOffsetPx).filter((e) => e > 0);
  const avgCentroidError = centroidErrors.length > 0
    ? centroidErrors.reduce((a, b) => a + b, 0) / centroidErrors.length
    : 0;
  const maxCentroidError = centroidErrors.length > 0
    ? Math.max(...centroidErrors)
    : 0;

  const squaredErrors = centroidErrors.map((e) => e * e);
  const rmse = squaredErrors.length > 0
    ? Math.sqrt(squaredErrors.reduce((a, b) => a + b, 0) / squaredErrors.length)
    : 0;

  const lockRetentionPct = totalFrameCount > 0
    ? (lockFrameCount / totalFrameCount) * 100
    : 0;

  const avgReacquisitionTime = reacquisitionTimes.length > 0
    ? reacquisitionTimes.reduce((a, b) => a + b, 0) / reacquisitionTimes.length
    : null;
  const maxReacquisitionTime = reacquisitionTimes.length > 0
    ? Math.max(...reacquisitionTimes)
    : null;

  const avgProcessingTimeMs = trackerState.frameTimes.length > 0
    ? trackerState.frameTimes.reduce((a, b) => a + b, 0) / trackerState.frameTimes.length
    : 0;
  const avgProcessingFps = avgProcessingTimeMs > 0 ? 1000 / avgProcessingTimeMs : 0;

  return {
    sourceFileName,
    sourceFps,
    sourceResolution: `${sourceWidth}x${sourceHeight}`,
    totalFrames: totalFrameCount,
    processedFrames: totalFrameCount,
    acquisitionTime: acquisitionTimeSec,
    avgReacquisitionTime,
    maxReacquisitionTime,
    lockRetentionPct,
    avgBoresightOffsetPx: avgCentroidError,
    maxBoresightOffsetPx: maxCentroidError,
    rmseBoresightOffsetPx: rmse,
    avgProcessingFps,
    avgProcessingTimeMs,
    log,
  };
}

/**
 * Export video performance log as CSV string.
 */
export function videoPerformanceToCsv(summary: VideoPerformanceSummary): string {
  const headers = [
    'Frame',
    'Time(s)',
    'CentroidX(px)',
    'CentroidY(px)',
    'Detected',
    'Confidence(%)',
    'BoresightOffset(px)',
    'TrackingState',
    'PanCommand(deg)',
    'TiltCommand(deg)',
    'ProcTime(ms)',
  ];

  const rows = summary.log.map((l) => [
    String(l.frameIndex),
    l.timeSec.toFixed(3),
    l.centroidX.toFixed(2),
    l.centroidY.toFixed(2),
    l.detected ? '1' : '0',
    l.confidence.toFixed(1),
    l.boresightOffsetPx.toFixed(2),
    l.trackingState,
    l.panCommand.toFixed(3),
    l.tiltCommand.toFixed(3),
    l.processingTimeMs.toFixed(2),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
