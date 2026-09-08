import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  VideoSourceState,
  VideoTrackerTelemetry,
  VideoPerformanceSummary,
  NavScreen,
} from '../types';
import {
  createVideoSource,
  VideoSource,
} from '../services/videoSource';
import {
  createVideoTrackerState,
  processVideoFrame,
  computeVideoPerformanceSummary,
  videoPerformanceToCsv,
  VideoTrackerConfig,
} from '../services/videoTracker';

interface VideoInputViewProps {
  onSwitchView: (view: NavScreen) => void;
  onVideoTelemetryUpdate?: (telemetry: VideoTrackerTelemetry | null) => void;
}

export const VideoInputView: React.FC<VideoInputViewProps> = ({ onSwitchView, onVideoTelemetryUpdate }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoSourceRef = useRef<VideoSource | null>(null);
  const trackerConfigRef = useRef<VideoTrackerConfig>({
    detectorConfig: {},
    lockThresholdPx: 10,
    acquireThresholdPx: 30,
    maxDropoutFrames: 10,
    smoothingAlpha: 0.4,
    acquirePersistenceFrames: 3,
    lockPersistenceFrames: 5,
    maxTrackingDistancePx: 80,
  });

  const [videoState, setVideoState] = useState<VideoSourceState>({
    status: 'idle',
    fileName: '',
    width: 0,
    height: 0,
    duration: 0,
    fps: 30,
    currentFrame: 0,
    totalFrames: 0,
    error: null,
  });

  const [telemetry, setTelemetry] = useState<VideoTrackerTelemetry | null>(null);
  const [summary, setSummary] = useState<VideoPerformanceSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [threshold, setThreshold] = useState(0.55);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!videoSourceRef.current) {
      videoSourceRef.current = createVideoSource();
    }

    try {
      await videoSourceRef.current.loadFile(file);
      setVideoState(videoSourceRef.current.getState());
      setSummary(null);
      setTelemetry(null);
    } catch (err) {
      setVideoState(videoSourceRef.current.getState());
    }
  }, []);

  const handleStartProcessing = useCallback(() => {
    if (!videoSourceRef.current) return;

    const source = videoSourceRef.current;
    const state = source.getState();
    if (state.status !== 'ready' && state.status !== 'paused') return;

    trackerConfigRef.current.detectorConfig.brightnessThreshold = threshold;
    const trackerState = createVideoTrackerState();
    let currentTrackerState = trackerState;
    let frameCount = 0;

    setIsProcessing(true);
    setSummary(null);

    source.play((frame) => {
      frameCount++;
      const { telemetry: tel, trackerState: newState } = processVideoFrame(
        frame,
        currentTrackerState,
        trackerConfigRef.current,
        state.fps,
      );
      currentTrackerState = newState;
      setTelemetry(tel);
      setVideoState(source.getState());

      if (canvasRef.current) {
        drawVideoFrame(canvasRef.current, frame.pixels, frame.width, frame.height, tel);
      }
    });

    const checkEnd = setInterval(() => {
      const s = source.getState();
      if (s.status === 'paused' || s.status === 'ready') {
        clearInterval(checkEnd);
        source.pause();
        setIsProcessing(false);

        const finalSummary = computeVideoPerformanceSummary(
          currentTrackerState,
          s.fileName,
          s.fps,
          s.width,
          s.height,
        );
        setSummary(finalSummary);
      }
    }, 200);
  }, [threshold]);

  const handlePause = useCallback(() => {
    if (videoSourceRef.current) {
      videoSourceRef.current.pause();
      setVideoState(videoSourceRef.current.getState());
      setIsProcessing(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    if (videoSourceRef.current) {
      videoSourceRef.current.reset();
      setVideoState(videoSourceRef.current.getState());
      setTelemetry(null);
      setSummary(null);
      setIsProcessing(false);
    }
  }, []);

  const handleExportCsv = useCallback(() => {
    if (!summary) return;
    const csv = videoPerformanceToCsv(summary);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `FSOC_Video_${summary.sourceFileName.replace(/\.[^.]+$/, '')}_log.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [summary]);

  useEffect(() => {
    return () => {
      if (videoSourceRef.current) {
        videoSourceRef.current.destroy();
      }
    };
  }, []);

  // Report telemetry changes to parent (for BottomTelemetry)
  useEffect(() => {
    onVideoTelemetryUpdate?.(telemetry);
  }, [telemetry, onVideoTelemetryUpdate]);

  // Clear telemetry on reset
  useEffect(() => {
    if (!isProcessing && !videoState.fileName) {
      onVideoTelemetryUpdate?.(null);
    }
  }, [isProcessing, videoState.fileName, onVideoTelemetryUpdate]);

  const trackingState = telemetry?.trackingState || 'IDLE';
  const isLocked = trackingState === 'LOCKED';
  const isAcquiring = trackingState === 'ACQUIRING';
  const isLost = trackingState === 'LOST';

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto mt-14 md:mt-0 tech-grid-bg relative p-4 md:p-8 select-none pb-16">
      {/* Header */}
      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-[#564338]/40 pb-4 gap-4">
        <div>
          <h1 className="font-['Hanken_Grotesk'] text-2xl md:text-3xl text-[#e0e3e6] font-bold tracking-tight">
            EXTERNAL VIDEO INPUT
          </h1>
          <p className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] tracking-widest uppercase mt-1">
            Benchmark Performance-2 &bull; MP4 Processing
          </p>
        </div>
      </div>

      {/* File Selection */}
      <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#564338]/40">
          <span className="material-symbols-outlined text-[18px] text-[#ff8a3d]">videocam</span>
          <h2 className="font-['JetBrains_Mono'] text-xs text-[#ddc1b3] uppercase tracking-widest font-bold">
            VIDEO SOURCE
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto px-6 py-3 bg-[#323538] hover:bg-[#363a3c] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs uppercase rounded transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">upload_file</span>
              Select MP4 File
            </button>

            {videoState.fileName && (
              <div className="mt-3 font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] space-y-1">
                <div>File: <span className="text-[#e0e3e6] font-bold">{videoState.fileName}</span></div>
                <div>Resolution: <span className="text-[#42e09c]">{videoState.width}×{videoState.height}</span></div>
                <div>Duration: <span className="text-[#42e09c]">{videoState.duration.toFixed(2)}s</span></div>
                <div>Frames: <span className="text-[#42e09c]">{videoState.totalFrames}</span></div>
              </div>
            )}

            {videoState.error && (
              <div className="mt-3 p-2 bg-[#ffb4ab]/10 border border-[#ffb4ab]/30 rounded font-['JetBrains_Mono'] text-[10px] text-[#ffb4ab]">
                {videoState.error}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="font-['JetBrains_Mono'] text-[9px] text-[#a58c7f] uppercase">
                Brightness Threshold
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0.2"
                  max="0.9"
                  step="0.05"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="w-32"
                />
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#42e09c] font-bold w-10">
                  {threshold.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Processing Controls */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={isProcessing ? handlePause : handleStartProcessing}
          disabled={!videoState.fileName || videoState.status === 'loading'}
          className={`px-6 py-3 rounded font-['JetBrains_Mono'] text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
            !videoState.fileName || videoState.status === 'loading'
              ? 'bg-[#323538] text-[#a58c7f] border border-[#564338] cursor-not-allowed'
              : isProcessing
              ? 'bg-[#ffb4ab] text-[#690005] hover:bg-[#ff8a3d] cursor-pointer'
              : 'bg-[#ffb68d] hover:bg-[#ff8a3d] text-[#532200] shadow-[0_0_15px_rgba(255,182,141,0.25)] cursor-pointer'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {isProcessing ? 'pause' : 'play_arrow'}
          </span>
          {isProcessing ? 'PAUSE' : 'START PROCESSING'}
        </button>

        <button
          onClick={handleReset}
          disabled={!videoState.fileName}
          className="px-4 py-3 bg-[#323538] hover:bg-[#363a3c] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs uppercase rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          RESET
        </button>

        {summary && (
          <button
            onClick={handleExportCsv}
            className="px-4 py-3 bg-[#323538] hover:bg-[#363a3c] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs uppercase rounded transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">file_download</span>
            EXPORT CSV
          </button>
        )}
      </div>

      {/* Video Feed + Tracking Overlay */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Video Canvas */}
        <div className="lg:col-span-2">
          <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#564338]/40">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px] text-[#ff8a3d]">videocam</span>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase">Video Feed</span>
              </div>
              {isProcessing && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#ffb4ab] animate-pulse"></span>
                  <span className="font-['JetBrains_Mono'] text-[9px] text-[#ffb4ab] uppercase">Processing</span>
                </div>
              )}
            </div>
            <div className="relative bg-[#0b0f11] aspect-video">
              <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ imageRendering: 'pixelated' }}
              />
              {!videoState.fileName && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-[48px] text-[#564338] mb-3 block">videocam_off</span>
                    <p className="font-['JetBrains_Mono'] text-xs text-[#a58c7f]">
                      Select an MP4 file to begin
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tracking Status Panel */}
        <div className="flex flex-col gap-4">
          {/* Tracking State */}
          <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-4">
            <h3 className="font-['JetBrains_Mono'] text-[10px] text-[#ffb68d] uppercase tracking-widest font-bold mb-3">
              TRACKING STATUS
            </h3>
            <div className={`text-center py-3 rounded font-['Hanken_Grotesk'] text-xl font-bold tracking-widest uppercase mb-3 ${
              isLocked ? 'text-[#42e09c] bg-[#42e09c]/10 border border-[#42e09c]/30' :
              isAcquiring ? 'text-[#ff8a3d] bg-[#ff8a3d]/10 border border-[#ff8a3d]/30' :
              isLost ? 'text-[#ffb4ab] bg-[#ffb4ab]/10 border border-[#ffb4ab]/30' :
              'text-[#8994a3] bg-[#323538]/50 border border-[#564338]/30'
            }`}>
              {trackingState}
            </div>

            {telemetry && (
              <div className="space-y-2 font-['JetBrains_Mono'] text-[10px]">
                <div className="flex justify-between">
                  <span className="text-[#a58c7f]">Centroid X</span>
                  <span className="text-[#e0e3e6] font-bold">{telemetry.centroidX.toFixed(1)} px</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a58c7f]">Centroid Y</span>
                  <span className="text-[#e0e3e6] font-bold">{telemetry.centroidY.toFixed(1)} px</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a58c7f]">Boresight Offset</span>
                  <span className={`font-bold ${telemetry.boresightOffsetPx < 10 ? 'text-[#42e09c]' : 'text-[#ffb4ab]'}`}>
                    {telemetry.boresightOffsetPx.toFixed(1)} px
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a58c7f]">Confidence</span>
                  <span className="text-[#e0e3e6] font-bold">{telemetry.confidence.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a58c7f]">Frame</span>
                  <span className="text-[#e0e3e6]">{telemetry.frameIndex}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a58c7f]">Time</span>
                  <span className="text-[#e0e3e6]">{telemetry.formattedTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a58c7f]">Processing FPS</span>
                  <span className="text-[#42e09c] font-bold">{telemetry.fps.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a58c7f]">Proc Time</span>
                  <span className="text-[#e0e3e6]">{telemetry.processingTimeMs.toFixed(1)} ms</span>
                </div>
              </div>
            )}
          </div>

          {/* Pan/Tilt Commands */}
          {telemetry && (
            <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-4">
              <h3 className="font-['JetBrains_Mono'] text-[10px] text-[#ffb68d] uppercase tracking-widest font-bold mb-3">
                POINTING OUTPUT
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#101416] p-3 rounded border border-[#564338]/30 text-center">
                  <div className="text-[9px] text-[#a58c7f] uppercase">Pan Cmd</div>
                  <div className="text-lg text-[#e0e3e6] font-bold font-['JetBrains_Mono']">
                    {telemetry.panCommand.toFixed(2)}°
                  </div>
                </div>
                <div className="bg-[#101416] p-3 rounded border border-[#564338]/30 text-center">
                  <div className="text-[9px] text-[#a58c7f] uppercase">Tilt Cmd</div>
                  <div className="text-lg text-[#e0e3e6] font-bold font-['JetBrains_Mono']">
                    {telemetry.tiltCommand.toFixed(2)}°
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Performance Summary */}
      {summary && (
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#564338]/40">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#42e09c]">analytics</span>
              <h2 className="font-['JetBrains_Mono'] text-xs text-[#ddc1b3] uppercase tracking-widest font-bold">
                PERFORMANCE SUMMARY
              </h2>
            </div>
            <span className="px-2 py-1 bg-[#42e09c]/20 border border-[#42e09c] rounded text-[#42e09c] font-['JetBrains_Mono'] text-[9px] uppercase">
              Auto-Generated
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <div className="bg-[#101416] p-3 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f] uppercase">Source</div>
              <div className="text-[#e0e3e6] font-bold font-['JetBrains_Mono'] text-xs mt-1 truncate">{summary.sourceFileName}</div>
            </div>
            <div className="bg-[#101416] p-3 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f] uppercase">Resolution</div>
              <div className="text-[#e0e3e6] font-bold font-['JetBrains_Mono'] text-xs mt-1">{summary.sourceResolution}</div>
            </div>
            <div className="bg-[#101416] p-3 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f] uppercase">Frames</div>
              <div className="text-[#e0e3e6] font-bold font-['JetBrains_Mono'] text-xs mt-1">{summary.processedFrames}</div>
            </div>
            <div className="bg-[#101416] p-3 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f] uppercase">Acq Time</div>
              <div className="text-[#42e09c] font-bold font-['JetBrains_Mono'] text-xs mt-1">
                {summary.acquisitionTime !== null ? `${summary.acquisitionTime.toFixed(2)}s` : 'N/A'}
              </div>
            </div>
            <div className="bg-[#101416] p-3 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f] uppercase">Lock Retention</div>
              <div className="text-[#42e09c] font-bold font-['JetBrains_Mono'] text-xs mt-1">{summary.lockRetentionPct.toFixed(1)}%</div>
            </div>
            <div className="bg-[#101416] p-3 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f] uppercase">Avg Proc FPS</div>
              <div className="text-[#42e09c] font-bold font-['JetBrains_Mono'] text-xs mt-1">{summary.avgProcessingFps.toFixed(1)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-[#101416] p-3 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f] uppercase">Avg Boresight Offset</div>
              <div className="text-[#e0e3e6] font-bold font-['JetBrains_Mono'] text-xs mt-1">{summary.avgBoresightOffsetPx.toFixed(2)}</div>
            </div>
            <div className="bg-[#101416] p-3 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f] uppercase">Max Boresight Offset</div>
              <div className="text-[#ffb4ab] font-bold font-['JetBrains_Mono'] text-xs mt-1">{summary.maxBoresightOffsetPx.toFixed(2)}</div>
            </div>
            <div className="bg-[#101416] p-3 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f] uppercase">RMSE Boresight Offset</div>
              <div className="text-[#ffb68d] font-bold font-['JetBrains_Mono'] text-xs mt-1">{summary.rmseBoresightOffsetPx.toFixed(2)}</div>
            </div>
            <div className="bg-[#101416] p-3 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f] uppercase">Avg Reacq (s)</div>
              <div className="text-[#e0e3e6] font-bold font-['JetBrains_Mono'] text-xs mt-1">
                {summary.avgReacquisitionTime !== null ? summary.avgReacquisitionTime.toFixed(2) : 'N/A'}
              </div>
            </div>
            <div className="bg-[#101416] p-3 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f] uppercase">Max Reacq (s)</div>
              <div className="text-[#e0e3e6] font-bold font-['JetBrains_Mono'] text-xs mt-1">
                {summary.maxReacquisitionTime !== null ? summary.maxReacquisitionTime.toFixed(2) : 'N/A'}
              </div>
            </div>
            <div className="bg-[#101416] p-3 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f] uppercase">Avg Proc (ms)</div>
              <div className="text-[#e0e3e6] font-bold font-['JetBrains_Mono'] text-xs mt-1">{summary.avgProcessingTimeMs.toFixed(1)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function drawVideoFrame(
  canvas: HTMLCanvasElement,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  telemetry: VideoTrackerTelemetry,
) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
  ctx.putImageData(imageData, 0, 0);

  const cx = width / 2;
  const cy = height / 2;

  ctx.strokeStyle = 'rgba(255, 182, 141, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy);
  ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy);
  ctx.lineTo(cx + 30, cy);
  ctx.moveTo(cx, cy - 30);
  ctx.lineTo(cx, cy - 8);
  ctx.moveTo(cx, cy + 8);
  ctx.lineTo(cx, cy + 30);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.stroke();

  if (telemetry.detectedCentroidX > 0 || telemetry.detectedCentroidY > 0) {
    const dx = telemetry.centroidX;
    const dy = telemetry.centroidY;

    const isLocked = telemetry.trackingState === 'LOCKED';
    ctx.strokeStyle = isLocked ? '#42e09c' : '#ff8a3d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dx, dy, 12, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = isLocked ? '#42e09c' : '#ff8a3d';
    ctx.beginPath();
    ctx.arc(dx, dy, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(66, 224, 156, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.fillText(
      `OFS: ${telemetry.boresightOffsetPx.toFixed(1)}px`,
      dx + 16,
      dy - 4,
    );
  }
}
