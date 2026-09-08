/**
 * FSOC Track Lab — External Video Source
 *
 * Loads MP4 files via browser-native APIs, extracts frames as raw pixel data,
 * and feeds them into the beacon detection pipeline.
 *
 * No server uploads. No external dependencies. Pure client-side.
 */

import { VideoSourceState, VideoFrameData } from '../types';

export interface VideoSource {
  getState(): VideoSourceState;
  loadFile(file: File): Promise<void>;
  extractCurrentFrame(): VideoFrameData | null;
  seekToFrame(frameIndex: number): Promise<void>;
  play(onFrame: (frame: VideoFrameData) => void): void;
  pause(): void;
  reset(): void;
  destroy(): void;
}

const MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
];

function isSupportedVideo(file: File): boolean {
  if (MIME_TYPES.includes(file.type)) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ['mp4', 'webm', 'mov', 'avi'].includes(ext || '');
}

export function createVideoSource(): VideoSource {
  let videoEl: HTMLVideoElement | null = null;
  let canvasEl: HTMLCanvasElement | null = null;
  let canvasCtx: CanvasRenderingContext2D | null = null;
  let objectUrl: string | null = null;
  let animFrameId: number | null = null;
  let playing = false;
  let state: VideoSourceState = {
    status: 'idle',
    fileName: '',
    width: 0,
    height: 0,
    duration: 0,
    fps: 30,
    currentFrame: 0,
    totalFrames: 0,
    error: null,
  };

  function updateState(partial: Partial<VideoSourceState>) {
    state = { ...state, ...partial };
  }

  function cleanup() {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    playing = false;
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
      videoEl = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    canvasEl = null;
    canvasCtx = null;
  }

  async function loadFile(file: File): Promise<void> {
    cleanup();

    if (!isSupportedVideo(file)) {
      updateState({
        status: 'error',
        error: `Unsupported file type: ${file.name}. Supported: MP4, WebM, MOV.`,
      });
      throw new Error(state.error!);
    }

    updateState({ status: 'loading', fileName: file.name, error: null });

    try {
      objectUrl = URL.createObjectURL(file);

      videoEl = document.createElement('video');
      videoEl.preload = 'auto';
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.crossOrigin = 'anonymous';

      canvasEl = document.createElement('canvas');
      canvasCtx = canvasEl.getContext('2d', { willReadFrequently: true });

      await new Promise<void>((resolve, reject) => {
        if (!videoEl) { reject(new Error('Video element destroyed')); return; }

        const onLoaded = () => {
          videoEl!.removeEventListener('loadedmetadata', onLoaded);
          videoEl!.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          videoEl!.removeEventListener('loadedmetadata', onLoaded);
          videoEl!.removeEventListener('error', onError);
          reject(new Error('Failed to load video metadata'));
        };

        videoEl!.addEventListener('loadedmetadata', onLoaded);
        videoEl!.addEventListener('error', onError);
        videoEl!.src = objectUrl!;
      });

      if (!videoEl) throw new Error('Video element destroyed during load');

      const w = videoEl.videoWidth;
      const h = videoEl.videoHeight;
      const dur = videoEl.duration;

      if (w === 0 || h === 0) {
        throw new Error('Video has zero dimensions');
      }
      if (!isFinite(dur) || dur <= 0) {
        throw new Error('Video has invalid duration');
      }

      canvasEl.width = w;
      canvasEl.height = h;

      const fps = 30;
      const totalFrames = Math.floor(dur * fps);

      updateState({
        status: 'ready',
        width: w,
        height: h,
        duration: dur,
        fps,
        currentFrame: 0,
        totalFrames,
      });
    } catch (err) {
      cleanup();
      const msg = err instanceof Error ? err.message : String(err);
      updateState({ status: 'error', error: msg });
      throw err;
    }
  }

  function extractCurrentFrame(): VideoFrameData | null {
    if (!videoEl || !canvasEl || !canvasCtx) return null;
    if (videoEl.readyState < 2) return null;

    canvasCtx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
    const imageData = canvasCtx.getImageData(0, 0, canvasEl.width, canvasEl.height);

    return {
      width: canvasEl.width,
      height: canvasEl.height,
      pixels: imageData.data,
      timestampSec: videoEl.currentTime,
      frameIndex: state.currentFrame,
    };
  }

  async function seekToFrame(frameIndex: number): Promise<void> {
    if (!videoEl || state.status === 'idle' || state.status === 'loading') return;

    const targetTime = frameIndex / state.fps;
    const clampedTime = Math.max(0, Math.min(targetTime, state.duration - 0.001));

    videoEl.currentTime = clampedTime;

    await new Promise<void>((resolve) => {
      if (!videoEl) { resolve(); return; }
      const onSeeked = () => {
        videoEl!.removeEventListener('seeked', onSeeked);
        updateState({ currentFrame: frameIndex });
        resolve();
      };
      videoEl.addEventListener('seeked', onSeeked);
    });
  }

  function play(onFrame: (frame: VideoFrameData) => void) {
    if (!videoEl || state.status === 'error') return;

    playing = true;
    updateState({ status: 'playing' });
    videoEl.play().catch(() => {});

    let lastFrameTime = performance.now();
    let lastEmittedFrameIndex = -1;

    const tick = () => {
      if (!playing || !videoEl) return;

      const now = performance.now();
      const elapsed = now - lastFrameTime;
      const frameInterval = 1000 / state.fps;

      if (elapsed >= frameInterval) {
        const currentFrameIdx = Math.floor(videoEl.currentTime * state.fps);

        if (currentFrameIdx !== lastEmittedFrameIndex) {
          lastFrameTime = now;
          lastEmittedFrameIndex = currentFrameIdx;
          updateState({ currentFrame: currentFrameIdx });

          const frame = extractCurrentFrame();
          if (frame) {
            onFrame(frame);
          }
        }
      }

      if (videoEl.ended) {
        pause();
        return;
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
  }

  function pause() {
    playing = false;
    if (videoEl) videoEl.pause();
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    updateState({ status: 'paused' });
  }

  function reset() {
    pause();
    if (videoEl) {
      videoEl.currentTime = 0;
    }
    updateState({ currentFrame: 0, status: 'ready' });
  }

  function destroy() {
    cleanup();
    updateState({ status: 'idle' });
  }

  return {
    getState: () => ({ ...state }),
    loadFile,
    extractCurrentFrame,
    seekToFrame,
    play,
    pause,
    reset,
    destroy,
  };
}
