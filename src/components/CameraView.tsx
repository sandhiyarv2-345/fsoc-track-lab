import React, { useRef, useEffect, useState } from 'react';
import { Target, CameraGimbalState, TelemetryPoint, SimulationConfig, AppSettings, NavScreen, TrackingAlgorithm, BenchmarkContext } from '../types';

interface CameraViewProps {
  targets: Target[];
  camera: CameraGimbalState;
  setCamera: React.Dispatch<React.SetStateAction<CameraGimbalState>>;
  telemetry: TelemetryPoint;
  config: SimulationConfig;
  settings: AppSettings;
  onSwitchView: (view: NavScreen) => void;
  onToggleSimRunning: () => void;
  isSimRunning: boolean;
  errorHistory: { pan: number; tilt: number; time: string }[];
  benchmarkContext?: BenchmarkContext;
}

export const CameraView: React.FC<CameraViewProps> = ({
  targets,
  camera,
  setCamera,
  telemetry,
  config,
  settings,
  onSwitchView,
  onToggleSimRunning,
  isSimRunning,
  errorHistory,
  benchmarkContext,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [opticalFilter, setOpticalFilter] = useState<boolean>(true);

  const beaconTarget = targets.find((t) => t.isBeacon) || targets[0];
  const effectiveHfov = ((config.cameraFovHorizontal || config.cameraFov) || 4) / zoomLevel;
  const effectiveVfov = ((config.cameraFovVertical || config.cameraFov * 0.75) || 3) / zoomLevel;

  const handleAlgorithmChange = (algo: TrackingAlgorithm) => {
    setCamera((prev) => ({ ...prev, algorithm: algo }));
  };

  const nudge = (dPan: number, dTilt: number) => {
    setCamera((prev) => ({
      ...prev,
      pan: parseFloat((prev.pan + dPan).toFixed(2)),
      tilt: parseFloat((prev.tilt + dTilt).toFixed(2)),
    }));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = (canvas.width = canvas.parentElement?.clientWidth || 800);
      const height = (canvas.height = canvas.parentElement?.clientHeight || 500);

      ctx.fillStyle = opticalFilter ? '#080d10' : '#0a0d14';
      ctx.fillRect(0, 0, width, height);

      // Sensor pixel noise
      const noiseCount = 120;
      ctx.fillStyle = opticalFilter ? 'rgba(66, 224, 156, 0.08)' : 'rgba(255, 182, 141, 0.08)';
      for (let i = 0; i < noiseCount; i++) {
        ctx.fillRect(Math.random() * width, Math.random() * height, 1.5, 1.5);
      }

      // Optical vignetting
      const grad = ctx.createRadialGradient(width / 2, height / 2, height * 0.25, width / 2, height / 2, width * 0.7);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(5, 7, 11, 0.7)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const fovH = effectiveHfov;
      const fovV = effectiveVfov;

      // ── Sensor Grid ──
      ctx.strokeStyle = opticalFilter ? 'rgba(66, 224, 156, 0.06)' : 'rgba(255, 182, 141, 0.06)';
      ctx.lineWidth = 0.5;
      const gridStep = Math.min(width, height) / 10;
      for (let x = cx % gridStep; x < width; x += gridStep) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = cy % gridStep; y < height; y += gridStep) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      // ── FOV Boundary Rectangle ──
      const fovW = width * 0.92;
      const fovHrect = height * 0.92 * (Math.tan(fovV * Math.PI / 360) / Math.tan(fovH * Math.PI / 360));
      ctx.strokeStyle = 'rgba(86, 67, 56, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(cx - fovW / 2, cy - fovHrect / 2, fovW, fovHrect);
      ctx.setLineDash([]);

      // ── Center Reticle ──
      ctx.strokeStyle = 'rgba(255, 182, 141, 0.6)';
      ctx.lineWidth = 1;

      // Outer circle
      ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI * 2); ctx.stroke();
      // Inner circle
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke();
      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - 65, cy); ctx.lineTo(cx - 12, cy);
      ctx.moveTo(cx + 12, cy); ctx.lineTo(cx + 65, cy);
      ctx.moveTo(cx, cy - 65); ctx.lineTo(cx, cy - 12);
      ctx.moveTo(cx, cy + 12); ctx.lineTo(cx, cy + 65);
      ctx.stroke();

      // ── Angular Tick Marks ──
      const tickR1 = 38;
      const tickR2 = 46;
      const tickR2L = 52;
      ctx.strokeStyle = 'rgba(255, 182, 141, 0.35)';
      ctx.lineWidth = 1;
      for (let deg = -90; deg <= 90; deg += 10) {
        const rad = (deg * Math.PI) / 180;
        const isMajor = deg % 30 === 0;
        const r1 = tickR1;
        const r2 = isMajor ? tickR2L : tickR2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(rad) * r1, cy - Math.cos(rad) * r1);
        ctx.lineTo(cx + Math.sin(rad) * r2, cy - Math.cos(rad) * r2);
        ctx.stroke();
        if (isMajor) {
          ctx.fillStyle = 'rgba(255, 182, 141, 0.3)';
          ctx.font = '8px JetBrains Mono';
          ctx.textAlign = 'center';
          ctx.fillText(`${deg}°`, cx + Math.sin(rad) * (tickR2L + 9), cy - Math.cos(rad) * (tickR2L + 9) + 3);
        }
      }
      ctx.textAlign = 'left';

      // Mil-dot tick marks (horizontal)
      for (let m = -50; m <= 50; m += 20) {
        if (m !== 0) {
          ctx.beginPath();
          ctx.moveTo(cx + m, cy - 4); ctx.lineTo(cx + m, cy + 4);
          ctx.moveTo(cx - 4, cy + m); ctx.lineTo(cx + 4, cy + m);
          ctx.stroke();
        }
      }

      // ── Project & Draw Targets ──
      targets.forEach((t) => {
        const dAz = t.azimuth - camera.pan;
        const dEl = t.elevation - camera.tilt;
        const halfHFovRad = (fovH / 2) * Math.PI / 180;
        const halfVFovRad = (fovV / 2) * Math.PI / 180;
        const tanHalfHFov = Math.tan(halfHFovRad);
        const tanHalfVFov = Math.tan(halfVFovRad);
        const normAz = Math.tan(dAz * Math.PI / 180) / tanHalfHFov;
        const normEl = Math.tan(dEl * Math.PI / 180) / tanHalfVFov;
        const px = cx + normAz * (width / 2);
        const py = cy - normEl * (height / 2);
        const isVisible = px >= 0 && px <= width && py >= 0 && py <= height;

        if (!isVisible) return;

        if (t.isBeacon) {
          // Optical bloom (1550nm laser sim)
          const glow = ctx.createRadialGradient(px, py, 2, px, py, 28);
          glow.addColorStop(0, '#ffffff');
          glow.addColorStop(0.3, '#ff8a3d');
          glow.addColorStop(0.7, 'rgba(255, 138, 61, 0.25)');
          glow.addColorStop(1, 'rgba(255, 138, 61, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(px, py, 28, 0, Math.PI * 2); ctx.fill();

          // Core spot
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();

          // AI centroid bounding box
          const boxSize = 52;
          ctx.strokeStyle = telemetry.status === 'LOCKED' ? '#42e09c' : '#ff8a3d';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px - boxSize / 2, py - boxSize / 2, boxSize, boxSize);

          // Corner accents
          const cLen = 8;
          ctx.lineWidth = 2.5;
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
            ctx.beginPath();
            ctx.moveTo(px + sx * boxSize / 2, py + sy * boxSize / 2 - sy * cLen);
            ctx.lineTo(px + sx * boxSize / 2, py + sy * boxSize / 2);
            ctx.lineTo(px + sx * boxSize / 2 - sx * cLen, py + sy * boxSize / 2);
            ctx.stroke();
          });

          // Lead vector to center
          ctx.strokeStyle = 'rgba(66, 224, 156, 0.4)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx, cy); ctx.stroke();
          ctx.setLineDash([]);

          // Labels
          ctx.fillStyle = telemetry.status === 'LOCKED' ? '#42e09c' : '#ff8a3d';
          ctx.font = '10px JetBrains Mono';
          ctx.fillText(`BEACON #${t.id} [${t.range}m]`, px - boxSize / 2, py - boxSize / 2 - 8);
          ctx.fillStyle = '#ddc1b3';
          ctx.font = '9px JetBrains Mono';
          ctx.fillText(`ERR: ${telemetry.totalError.toFixed(2)}° | CONF: ${telemetry.confidence.toFixed(1)}%`, px - boxSize / 2, py + boxSize / 2 + 14);

          // Angular offset labels near beacon
          if (Math.abs(dAz) > 0.5 || Math.abs(dEl) > 0.5) {
            ctx.fillStyle = 'rgba(255, 182, 141, 0.5)';
            ctx.font = '8px JetBrains Mono';
            const azLabel = dAz > 0 ? `+${dAz.toFixed(1)}° Az` : `${dAz.toFixed(1)}° Az`;
            const elLabel = dEl > 0 ? `+${dEl.toFixed(1)}° El` : `${dEl.toFixed(1)}° El`;
            ctx.fillText(azLabel, px + boxSize / 2 + 6, py - 4);
            ctx.fillText(elLabel, px + boxSize / 2 + 6, py + 8);
          }
        } else {
          // Distractor
          ctx.fillStyle = 'rgba(193, 199, 211, 0.6)';
          ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(193, 199, 211, 0.4)';
          ctx.strokeRect(px - 10, py - 10, 20, 20);
          ctx.fillStyle = '#8994a3';
          ctx.font = '8px JetBrains Mono';
          ctx.fillText(`T#${t.id}`, px + 12, py - 2);
        }
      });

      // ── Tracking Error Vector ──
      if (telemetry.totalError > 0.3) {
        const errAz = camera.pan - (beaconTarget?.azimuth ?? 0);
        const errEl = camera.tilt - (beaconTarget?.elevation ?? 0);
        const errPx = (errAz / (fovH / 2)) * (width / 2);
        const errPy = -(errEl / (fovV / 2)) * (height / 2);
        const errLen = Math.sqrt(errPx * errPx + errPy * errPy);
        if (errLen > 4) {
          ctx.strokeStyle = 'rgba(255, 180, 171, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + errPx, cy + errPy);
          ctx.stroke();
          ctx.setLineDash([]);
          // Error vector arrowhead
          const ux = errPx / errLen;
          const uy = errPy / errLen;
          const ax = cx + errPx;
          const ay = cy + errPy;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - ux * 8 + uy * 4, ay - uy * 8 - ux * 4);
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - ux * 8 - uy * 4, ay - uy * 8 + ux * 4);
          ctx.stroke();
          // Error magnitude label
          ctx.fillStyle = 'rgba(255, 180, 171, 0.6)';
          ctx.font = '9px JetBrains Mono';
          ctx.fillText(`Δ ${telemetry.totalError.toFixed(1)}°`, ax + 6, ay - 6);
        }
      }

      // ── Sensor Frame Corners ──
      const margin = 20;
      const bracketLen = 24;
      ctx.strokeStyle = 'rgba(86, 67, 56, 0.8)';
      ctx.lineWidth = 2;
      // TL
      ctx.beginPath(); ctx.moveTo(margin, margin + bracketLen); ctx.lineTo(margin, margin); ctx.lineTo(margin + bracketLen, margin); ctx.stroke();
      // TR
      ctx.beginPath(); ctx.moveTo(width - margin - bracketLen, margin); ctx.lineTo(width - margin, margin); ctx.lineTo(width - margin, margin + bracketLen); ctx.stroke();
      // BL
      ctx.beginPath(); ctx.moveTo(margin, height - margin - bracketLen); ctx.lineTo(margin, height - margin); ctx.lineTo(margin + bracketLen, height - margin); ctx.stroke();
      // BR
      ctx.beginPath(); ctx.moveTo(width - margin - bracketLen, height - margin); ctx.lineTo(width - margin, height - margin); ctx.lineTo(width - margin, height - margin - bracketLen); ctx.stroke();
    };

    render();
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [targets, camera, telemetry, config, zoomLevel, opticalFilter, effectiveHfov, effectiveVfov, beaconTarget]);

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden mt-14 md:mt-0 tech-grid-bg relative select-none pb-12">
      {/* Camera Sensor Feed & Controls */}
      <div className="flex-1 flex flex-col p-3 md:p-6 overflow-hidden">
        {/* Benchmark Run Indicator */}
        {benchmarkContext && benchmarkContext.config && (
          <div className="mb-3 p-3 bg-[#1d2022] border border-[#42e09c]/40 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#42e09c]">science</span>
              <div className="font-['JetBrains_Mono'] text-xs text-[#ddc1b3]">
                <span className="text-[#42e09c] font-bold">BENCHMARK RUN</span> {' | '}
                Config: <span className="font-mono">{benchmarkContext.configDisplayName || benchmarkContext.config.name}</span> {' | '}
                Seed: <span className="font-mono">{benchmarkContext.seed}</span> {' | '}
                Algorithm: <span className="text-[#ffb68d] font-bold">{camera.algorithm}</span>
              </div>
            </div>
            <span className="px-2 py-1 bg-[#42e09c]/20 border border-[#42e09c] rounded text-[#42e09c] font-['JetBrains_Mono'] text-[10px] uppercase">
              Live Verification
            </span>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <h1 className="font-['Hanken_Grotesk'] text-xl md:text-2xl text-[#e0e3e6] font-bold tracking-tight">
              CAMERA TRACKING VIEW
            </h1>
            <span className="px-2 py-0.5 rounded bg-[#323538] text-[#ffb68d] text-[10px] font-mono border border-[#564338]/40">
              OPTICAL FEED
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onSwitchView('world3d')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1d2022] hover:bg-[#272a2d] border border-[#564338] rounded text-[#ddc1b3] font-['JetBrains_Mono'] text-xs uppercase cursor-pointer">
              <span className="material-symbols-outlined text-sm">language</span>
              <span>3D World</span>
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ff8a3d]/20 border border-[#ff8a3d] rounded text-[#ff8a3d] font-['JetBrains_Mono'] text-xs uppercase font-bold">
              <span className="material-symbols-outlined text-sm">videocam</span>
              <span>Camera View</span>
            </button>
          </div>
        </div>

        {/* Sensor Feed Window */}
        <div className="relative flex-1 bg-[#0b0f11] border border-[#564338] rounded-lg overflow-hidden flex flex-col shadow-2xl min-h-[360px]">
          {/* Top HUD Overlay */}
          <div className="absolute top-3 left-4 right-4 z-20 flex justify-between items-start pointer-events-none font-['JetBrains_Mono']">
            <div className="flex items-center gap-3 bg-[#101416]/80 backdrop-blur-sm px-3 py-1.5 rounded border border-[#564338]/40">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ffb4ab] animate-rec shadow-[0_0_8px_#ffb4ab]"></span>
              <span className="text-xs text-[#ffb4ab] font-bold uppercase tracking-wider">REC</span>
              <span className="text-xs text-[#e0e3e6] font-mono">T+ {telemetry.formattedTime}:14.2</span>
            </div>
            <div className="flex items-center gap-2 bg-[#101416]/80 backdrop-blur-sm px-3 py-1.5 rounded border border-[#564338]/40 text-xs text-[#ddc1b3]">
              <span>FOV: {effectiveHfov.toFixed(1)}° × {effectiveVfov.toFixed(1)}°</span>
              <span className="text-[#564338]">|</span>
              <span className="text-[#42e09c]">1550nm IR FILTER ON</span>
            </div>
          </div>

          {/* Canvas */}
          <canvas ref={canvasRef} className="w-full h-full flex-1" />

          {/* Bottom: Tracking Error Chart */}
          <div className="h-20 bg-[#101416]/90 border-t border-[#564338]/50 p-2.5 flex items-center gap-4 z-20">
            <div className="flex flex-col min-w-[110px] pl-2 font-['JetBrains_Mono']">
              <span className="text-[9px] text-[#ddc1b3] uppercase">Tracking Error</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className={`text-base font-bold ${telemetry.totalError < 1.0 ? 'text-[#42e09c]' : 'text-[#ff8a3d]'}`}>
                  {telemetry.totalError.toFixed(2)}°
                </span>
                <span className="text-[10px] text-[#a58c7f]">RMS</span>
              </div>
            </div>
            <div className="flex-1 h-full relative overflow-hidden">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 300 50">
                <line x1="0" y1="25" x2="300" y2="25" stroke="#323538" strokeDasharray="2,2" strokeWidth="1" />
                <line x1="0" y1="12" x2="300" y2="12" stroke="#323538" strokeDasharray="2,2" strokeWidth="1" />
                <line x1="0" y1="38" x2="300" y2="38" stroke="#323538" strokeDasharray="2,2" strokeWidth="1" />
                <polyline fill="none" stroke="#42e09c" strokeWidth="1.5"
                  points={errorHistory.length > 0
                    ? errorHistory.map((pt, idx) => {
                        const x = (idx / Math.max(1, errorHistory.length - 1)) * 300;
                        const y = 25 - Math.max(-20, Math.min(20, pt.pan * 12));
                        return `${x},${y}`;
                      }).join(' ')
                    : '0,25 300,25'} />
                <polyline fill="none" stroke="#ffb68d" strokeWidth="1.5"
                  points={errorHistory.length > 0
                    ? errorHistory.map((pt, idx) => {
                        const x = (idx / Math.max(1, errorHistory.length - 1)) * 300;
                        const y = 25 - Math.max(-20, Math.min(20, pt.tilt * 12));
                        return `${x},${y}`;
                      }).join(' ')
                    : '0,25 300,25'} />
              </svg>
              <div className="absolute top-1 right-2 flex items-center gap-3 font-['JetBrains_Mono'] text-[9px]">
                <span className="text-[#42e09c] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#42e09c]"></span> Azimuth
                </span>
                <span className="text-[#ffb68d] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ffb68d]"></span> Elevation
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Algorithm & Sensor Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3 bg-[#1d2022] p-3 rounded-lg border border-[#564338]/40">
          <div className="flex items-center gap-2">
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase">ALGORITHM:</span>
            {(['AI Centroid', 'Kalman Predictive', 'Deep Beacon'] as const).map((algo) => (
              <button key={algo} onClick={() => handleAlgorithmChange(algo)}
                className={`px-2.5 py-1 rounded font-['JetBrains_Mono'] text-[10px] uppercase transition-all ${
                  camera.algorithm === algo ? 'bg-[#ff8a3d] text-[#682d00] font-bold' : 'bg-[#323538] text-[#ddc1b3] hover:bg-[#363a3c]'
                }`}>{algo}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase">ZOOM:</span>
            {[1, 2, 4, 8].map((z) => (
              <button key={z} onClick={() => setZoomLevel(z)}
                className={`px-2 py-1 rounded font-['JetBrains_Mono'] text-[10px] font-bold transition-all ${
                  zoomLevel === z ? 'bg-[#ffb68d] text-[#532200]' : 'bg-[#323538] text-[#ddc1b3] hover:bg-[#363a3c]'
                }`}>{z}x</button>
            ))}
          </div>
          <button onClick={() => setOpticalFilter(!opticalFilter)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded font-['JetBrains_Mono'] text-[10px] uppercase border transition-all ${
              opticalFilter ? 'bg-[#42e09c]/20 border-[#42e09c] text-[#42e09c]' : 'bg-[#323538] border-[#564338] text-[#ddc1b3]'
            }`}>
            <span className="material-symbols-outlined text-sm">filter_alt</span>
            1550nm Filter: {opticalFilter ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full md:w-80 bg-[#191c1e] border-t md:border-t-0 md:border-l border-[#564338]/40 p-4 md:p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Camera Status */}
        <div className="flex flex-col gap-3">
          <h2 className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] uppercase tracking-widest border-b border-[#564338]/40 pb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-[#ff8a3d]">settings_input_composite</span>
              CAMERA STATUS
            </span>
            <span className="text-[9px] text-[#42e09c]">SERVO ACTIVE</span>
          </h2>
          <div className="grid grid-cols-3 gap-2 text-center font-['JetBrains_Mono']">
            <div className="bg-[#101416] p-2 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f]">PAN</div>
              <div className="text-sm text-[#e0e3e6] font-bold mt-0.5">{camera.pan.toFixed(1)}°</div>
            </div>
            <div className="bg-[#101416] p-2 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f]">TILT</div>
              <div className="text-sm text-[#e0e3e6] font-bold mt-0.5">{camera.tilt.toFixed(1)}°</div>
            </div>
            <div className="bg-[#101416] p-2 rounded border border-[#564338]/30">
              <div className="text-[9px] text-[#a58c7f]">ZOOM</div>
              <div className="text-sm text-[#e0e3e6] font-bold mt-0.5">{zoomLevel}.0x</div>
            </div>
          </div>

          {/* Manual PTZ */}
          <div className="flex flex-col items-center gap-1 bg-[#101416] p-3 rounded border border-[#564338]/30 mt-1">
            <span className="font-['JetBrains_Mono'] text-[9px] text-[#a58c7f] uppercase mb-1">Manual PTZ Nudge</span>
            <button onClick={() => nudge(0, 1.0)}
              className="w-8 h-8 bg-[#323538] hover:bg-[#ff8a3d] hover:text-[#532200] rounded flex items-center justify-center text-xs transition-colors">
              <span className="material-symbols-outlined text-base">arrow_upward</span>
            </button>
            <div className="flex items-center gap-3">
              <button onClick={() => nudge(-1.0, 0)}
                className="w-8 h-8 bg-[#323538] hover:bg-[#ff8a3d] hover:text-[#532200] rounded flex items-center justify-center text-xs transition-colors">
                <span className="material-symbols-outlined text-base">arrow_back</span>
              </button>
              <button onClick={() => setCamera((prev) => ({ ...prev, pan: 0, tilt: 0 }))}
                className="w-8 h-8 bg-[#272a2d] hover:bg-[#363a3c] rounded flex items-center justify-center text-[10px] font-mono text-[#ddc1b3]"
                title="Center Gimbal">0,0</button>
              <button onClick={() => nudge(1.0, 0)}
                className="w-8 h-8 bg-[#323538] hover:bg-[#ff8a3d] hover:text-[#532200] rounded flex items-center justify-center text-xs transition-colors">
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            </div>
            <button onClick={() => nudge(0, -1.0)}
              className="w-8 h-8 bg-[#323538] hover:bg-[#ff8a3d] hover:text-[#532200] rounded flex items-center justify-center text-xs transition-colors">
              <span className="material-symbols-outlined text-base">arrow_downward</span>
            </button>
          </div>
        </div>

        {/* Tracking Status */}
        <div className="flex flex-col gap-3">
          <h2 className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] uppercase tracking-widest border-b border-[#564338]/40 pb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-[#ff8a3d]">track_changes</span>
            TRACKING STATUS
          </h2>
          <div className="p-4 bg-[#101416] rounded border border-[#564338]/30 flex flex-col items-center text-center">
            <div className={`font-['Hanken_Grotesk'] text-2xl font-bold tracking-widest uppercase mb-2 ${
              telemetry.status === 'LOCKED' ? 'text-[#42e09c] glow-secondary' : 'text-[#ff8a3d]'
            }`}>{telemetry.status}</div>
            <div className="w-full mt-2">
              <div className="flex justify-between font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] mb-1">
                <span>Confidence</span>
                <span className="text-[#e0e3e6] font-bold">{telemetry.confidence.toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-[#323538] rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-300 ${
                  telemetry.confidence > 80 ? 'bg-[#42e09c]' : telemetry.confidence > 50 ? 'bg-[#ff8a3d]' : 'bg-[#ffb4ab]'
                }`} style={{ width: `${telemetry.confidence}%` }}></div>
              </div>
            </div>
            <div className="w-full flex justify-between font-['JetBrains_Mono'] text-xs text-[#ddc1b3] mt-4 pt-3 border-t border-[#564338]/30">
              <span>Beacon Range:</span>
              <span className="text-[#e0e3e6] font-medium">{beaconTarget ? beaconTarget.range : 1250} m</span>
            </div>
            <div className="w-full flex justify-between font-['JetBrains_Mono'] text-xs text-[#ddc1b3] mt-1">
              <span>Disturbance Level:</span>
              <span className="text-[#ffb68d] font-medium">{config.disturbances.intensity}%</span>
            </div>
            <div className="w-full flex justify-between font-['JetBrains_Mono'] text-xs text-[#ddc1b3] mt-1">
              <span>Pan Error:</span>
              <span className="text-[#e0e3e6] font-medium">{telemetry.panError.toFixed(2)}°</span>
            </div>
            <div className="w-full flex justify-between font-['JetBrains_Mono'] text-xs text-[#ddc1b3] mt-1">
              <span>Tilt Error:</span>
              <span className="text-[#e0e3e6] font-medium">{telemetry.tiltError.toFixed(2)}°</span>
            </div>
          </div>
        </div>

        {/* Detection Pipeline Telemetry */}
        <div className="flex flex-col gap-3">
          <h2 className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] uppercase tracking-widest border-b border-[#564338]/40 pb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-[#ff8a3d]">sensors</span>
            DETECTION PIPELINE
          </h2>
          <div className="p-3 bg-[#101416] rounded border border-[#564338]/30 flex flex-col gap-2 font-['JetBrains_Mono'] text-[10px]">
            <div className="flex justify-between">
              <span className="text-[#a58c7f]">Algorithm</span>
              <span className="text-[#ff8a3d] font-bold">{camera.algorithm}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#a58c7f]">Ground Truth Az</span>
              <span className="text-[#ddc1b3]">{telemetry.groundTruthAz.toFixed(2)}°</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#a58c7f]">Ground Truth El</span>
              <span className="text-[#ddc1b3]">{telemetry.groundTruthEl.toFixed(2)}°</span>
            </div>
            <div className="border-t border-[#564338]/30 pt-2 mt-1"></div>
            <div className="flex justify-between">
              <span className="text-[#a58c7f]">Measured Az</span>
              <span className="text-[#42e09c]">{telemetry.measuredAz.toFixed(2)}°</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#a58c7f]">Measured El</span>
              <span className="text-[#42e09c]">{telemetry.measuredEl.toFixed(2)}°</span>
            </div>
            <div className="border-t border-[#564338]/30 pt-2 mt-1"></div>
            <div className="flex justify-between">
              <span className="text-[#a58c7f]">Estimated Az</span>
              <span className="text-[#ffb68d]">{telemetry.estimatedAz.toFixed(2)}°</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#a58c7f]">Estimated El</span>
              <span className="text-[#ffb68d]">{telemetry.estimatedEl.toFixed(2)}°</span>
            </div>
            <div className="border-t border-[#564338]/30 pt-2 mt-1"></div>
            <div className="flex justify-between">
              <span className="text-[#a58c7f]">Gimbal Pan</span>
              <span className="text-[#e0e3e6]">{camera.pan.toFixed(2)}°</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#a58c7f]">Gimbal Tilt</span>
              <span className="text-[#e0e3e6]">{camera.tilt.toFixed(2)}°</span>
            </div>
            <div className="border-t border-[#564338]/30 pt-2 mt-1"></div>
            <div className="flex justify-between">
              <span className="text-[#a58c7f]">Detection SNR</span>
              <span className="text-[#ddc1b3]">{telemetry.detectionSnr.toFixed(1)} dB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#a58c7f]">Kalman Active</span>
              <span className={telemetry.kalmanActive ? 'text-[#42e09c]' : 'text-[#8994a3]'}>
                {telemetry.kalmanActive ? 'YES' : 'NO'}
              </span>
            </div>
          </div>
        </div>

        {/* Pause/Resume */}
        <div className="mt-auto pt-4 flex flex-col gap-2">
          <button onClick={onToggleSimRunning}
            className={`w-full py-3 rounded font-['JetBrains_Mono'] text-xs uppercase font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              isSimRunning ? 'bg-[#ffb4ab] text-[#690005] hover:bg-[#ff8a3d]' : 'bg-[#ff8a3d] text-[#682d00] hover:bg-[#ffb68d]'
            }`}>
            <span className="material-symbols-outlined text-base">{isSimRunning ? 'pause' : 'play_arrow'}</span>
            {isSimRunning ? 'PAUSE SIMULATION' : 'RESUME SIMULATION'}
          </button>
        </div>
      </div>
    </div>
  );
};
