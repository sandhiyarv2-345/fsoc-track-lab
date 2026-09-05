import React, { useRef, useEffect, useState } from 'react';
import { Target, CameraGimbalState, TelemetryPoint, SimulationConfig, NavScreen } from '../types';

interface World3DViewProps {
  targets: Target[];
  camera: CameraGimbalState;
  telemetry: TelemetryPoint;
  config: SimulationConfig;
  onSwitchView: (view: NavScreen) => void;
  isSimRunning: boolean;
}

export const World3DView: React.FC<World3DViewProps> = ({
  targets,
  camera,
  telemetry,
  config,
  onSwitchView,
  isSimRunning,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [orbitAngleX, setOrbitAngleX] = useState(-15);
  const [orbitAngleY, setOrbitAngleY] = useState(0);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [showTrails, setShowTrails] = useState(true);
  const [showWireframe, setShowWireframe] = useState(true);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const beaconTarget = targets.find((t) => t.isBeacon) || targets[0];

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    setOrbitAngleY((prev) => prev + dx * 0.4);
    setOrbitAngleX((prev) => Math.max(-60, Math.min(30, prev + dy * 0.4)));
  };

  const handleMouseUp = () => { isDragging.current = false; };

  const handleWheel = (e: React.WheelEvent) => {
    setZoomScale((prev) => Math.max(0.5, Math.min(2.5, prev - e.deltaY * 0.001)));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = (canvas.width = canvas.parentElement?.clientWidth || 800);
      const height = (canvas.height = canvas.parentElement?.clientHeight || 600);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2 + 80;
      const radX = (orbitAngleX * Math.PI) / 180;
      const radY = (orbitAngleY * Math.PI) / 180;

      const project = (x: number, y: number, z: number) => {
        const cosY = Math.cos(radY);
        const sinY = Math.sin(radY);
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const cosX = Math.cos(radX);
        const sinX = Math.sin(radX);
        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        const fovDepth = 900 * zoomScale;
        const depth = z2 + 1300;
        if (depth <= 10) return { px: cx, py: cy, scale: 0, visible: false };
        const scale = fovDepth / depth;
        return { px: cx + x1 * scale, py: cy - y2 * scale, scale, visible: true };
      };

      // 1. Perspective Grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#26303B';
      const gridSize = 1600;
      const step = 200;
      for (let gx = -gridSize; gx <= gridSize; gx += step) {
        const p1 = project(gx, 0, -gridSize * 0.2);
        const p2 = project(gx, 0, gridSize * 1.5);
        if (p1.visible && p2.visible) {
          ctx.beginPath(); ctx.moveTo(p1.px, p1.py); ctx.lineTo(p2.px, p2.py); ctx.stroke();
        }
      }
      for (let gz = -gridSize * 0.2; gz <= gridSize * 1.5; gz += step) {
        const p1 = project(-gridSize, 0, gz);
        const p2 = project(gridSize, 0, gz);
        if (p1.visible && p2.visible) {
          ctx.beginPath(); ctx.moveTo(p1.px, p1.py); ctx.lineTo(p2.px, p2.py); ctx.stroke();
        }
      }

      // 2. GIMBAL at origin (0, 0, 0) → tower top at (0, 100, 0)
      const groundScreen = project(0, 0, 0);
      const turretScreen = project(0, 100, 0);

      if (groundScreen.visible && turretScreen.visible) {
        // ── Gimbal Base Plate ──
        ctx.fillStyle = '#1A222C';
        ctx.strokeStyle = '#26303B';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(groundScreen.px, groundScreen.py, 36 * groundScreen.scale, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Base tick marks (compass reference)
        ctx.strokeStyle = '#3A4858';
        ctx.lineWidth = 1.5;
        for (let a = 0; a < 360; a += 45) {
          const r1 = 38 * groundScreen.scale;
          const r2 = 46 * groundScreen.scale;
          const ar = (a * Math.PI) / 180;
          const tx1 = Math.sin(ar) * r1;
          const tz1 = Math.cos(ar) * r1;
          const tx2 = Math.sin(ar) * r2;
          const tz2 = Math.cos(ar) * r2;
          const sp1 = project(tx1, 0, tz1);
          const sp2 = project(tx2, 0, tz2);
          if (sp1.visible && sp2.visible) {
            ctx.beginPath(); ctx.moveTo(sp1.px, sp1.py); ctx.lineTo(sp2.px, sp2.py); ctx.stroke();
          }
        }

        // ── Gimbal Tower ──
        ctx.fillStyle = '#0B1017';
        const tw = 28 * turretScreen.scale;
        ctx.fillRect(turretScreen.px - tw / 2, turretScreen.py, tw, groundScreen.py - turretScreen.py);
        ctx.strokeStyle = '#26303B'; ctx.lineWidth = 2;
        ctx.strokeRect(turretScreen.px - tw / 2, turretScreen.py, tw, groundScreen.py - turretScreen.py);

        // Tower center line
        ctx.strokeStyle = '#3A4858'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(turretScreen.px, turretScreen.py + 6 * turretScreen.scale);
        ctx.lineTo(turretScreen.px, groundScreen.py - 4 * groundScreen.scale);
        ctx.stroke();

        // ── Turret Head (rotates with pan/tilt) ──
        const panRad = (camera.pan * Math.PI) / 180;
        const tiltRad = (camera.tilt * Math.PI) / 180;

        // Turret head: flattened ellipsoid projected from pan/tilt
        const cosP = Math.cos(panRad);
        const sinP = Math.sin(panRad);
        const cosT = Math.cos(tiltRad);
        const sinT = Math.sin(tiltRad);
        const turretRadius = 24 * turretScreen.scale;
        const tiltEcc = Math.max(0.25, Math.abs(cosT));

        ctx.save();
        ctx.translate(turretScreen.px, turretScreen.py);
        ctx.rotate(-panRad);
        ctx.beginPath();
        ctx.ellipse(0, 0, turretRadius * tiltEcc, turretRadius, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#191c1e';
        ctx.fill();
        ctx.strokeStyle = '#564338';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // Pan direction arrow on turret head
        const arrowLen = turretRadius * 0.65;
        const arrowUX = sinP * arrowLen;
        const arrowUZ = cosP * arrowLen;
        const aP1 = project(arrowUX, 100, arrowUZ);
        const aP2 = project(arrowUX * 1.45, 100, arrowUZ * 1.45);
        if (aP1.visible && aP2.visible) {
          ctx.strokeStyle = 'rgba(255, 138, 61, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(aP1.px, aP1.py); ctx.lineTo(aP2.px, aP2.py); ctx.stroke();
          // Arrowhead
          const dx = aP2.px - aP1.px;
          const dy = aP2.py - aP1.py;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 2) {
            const ux = dx / len; const uy = dy / len;
            ctx.beginPath();
            ctx.moveTo(aP2.px, aP2.py);
            ctx.lineTo(aP2.px - ux * 7 + uy * 4, aP2.py - uy * 7 - ux * 4);
            ctx.moveTo(aP2.px, aP2.py);
            ctx.lineTo(aP2.px - ux * 7 - uy * 4, aP2.py - uy * 7 + ux * 4);
            ctx.stroke();
          }
        }

        // Lens aperture (bright orange dot)
        if (turretScreen.visible) {
          ctx.fillStyle = '#ff8a3d';
          ctx.shadowColor = 'rgba(255, 138, 61, 0.8)';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(turretScreen.px, turretScreen.py, 7 * turretScreen.scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // ── Optical Axis Line (turret → look direction) ──
        const axisLen = 500;
        const axEndX = Math.sin(panRad) * Math.cos(tiltRad) * axisLen;
        const axEndY = 100 + Math.sin(tiltRad) * axisLen;
        const axEndZ = Math.cos(panRad) * Math.cos(tiltRad) * axisLen;
        const axEnd = project(axEndX, axEndY, axEndZ);
        if (axEnd.visible) {
          ctx.strokeStyle = 'rgba(255, 138, 61, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(turretScreen.px, turretScreen.py);
          ctx.lineTo(axEnd.px, axEnd.py);
          ctx.stroke();
          ctx.setLineDash([]);
          // Axis endpoint marker
          ctx.fillStyle = 'rgba(255, 138, 61, 0.5)';
          ctx.beginPath();
          ctx.arc(axEnd.px, axEnd.py, 3 * axEnd.scale, 0, Math.PI * 2);
          ctx.fill();
        }

        // ── FOV Frustum Wireframe Cone ──
        if (showWireframe) {
          const fovRad = ((config.cameraFov || 20) * Math.PI) / 180;
          const coneRange = 1200;
          const coneHW = Math.tan(fovRad / 2) * coneRange;

          const corners = [
            { x: -coneHW, y: 100 + coneHW * 0.75, z: coneRange },
            { x:  coneHW, y: 100 + coneHW * 0.75, z: coneRange },
            { x:  coneHW, y: 100 - coneHW * 0.75, z: coneRange },
            { x: -coneHW, y: 100 - coneHW * 0.75, z: coneRange },
          ].map((pt) => {
            const rz = -pt.x * sinP + pt.z * cosP;
            const rx =  pt.x * cosP + pt.z * sinP;
            const ry = pt.y * cosT - rz * sinT;
            const rz2 = pt.y * sinT + rz * cosT;
            return project(rx, ry, rz2);
          });

          // Cone edge rays
          ctx.strokeStyle = 'rgba(255, 138, 61, 0.35)';
          ctx.lineWidth = 1.2;
          corners.forEach((c) => {
            if (c.visible && turretScreen.visible) {
              ctx.beginPath(); ctx.moveTo(turretScreen.px, turretScreen.py); ctx.lineTo(c.px, c.py); ctx.stroke();
            }
          });

          // Far-cap rectangle
          ctx.strokeStyle = 'rgba(255, 138, 61, 0.5)';
          ctx.fillStyle = 'rgba(255, 138, 61, 0.04)';
          ctx.beginPath();
          corners.forEach((c, i) => { i === 0 ? ctx.moveTo(c.px, c.py) : ctx.lineTo(c.px, c.py); });
          ctx.closePath(); ctx.fill(); ctx.stroke();

          // Mid-range cross-section ring
          const midCorners = [
            { x: -coneHW * 0.5, y: 100 + coneHW * 0.375, z: coneRange * 0.5 },
            { x:  coneHW * 0.5, y: 100 + coneHW * 0.375, z: coneRange * 0.5 },
            { x:  coneHW * 0.5, y: 100 - coneHW * 0.375, z: coneRange * 0.5 },
            { x: -coneHW * 0.5, y: 100 - coneHW * 0.375, z: coneRange * 0.5 },
          ].map((pt) => {
            const rz = -pt.x * sinP + pt.z * cosP;
            const rx =  pt.x * cosP + pt.z * sinP;
            const ry = pt.y * cosT - rz * sinT;
            const rz2 = pt.y * sinT + rz * cosT;
            return project(rx, ry, rz2);
          });
          ctx.strokeStyle = 'rgba(255, 138, 61, 0.18)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          midCorners.forEach((c, i) => { i === 0 ? ctx.moveTo(c.px, c.py) : ctx.lineTo(c.px, c.py); });
          ctx.closePath(); ctx.stroke();
        }
      }

      // 3. Tracking Line: turret → beacon
      if (beaconTarget && groundScreen.visible) {
        const bP = project(beaconTarget.x, beaconTarget.y, beaconTarget.z);
        if (bP.visible) {
          const isLocked = telemetry.status === 'LOCKED';
          ctx.strokeStyle = isLocked ? 'rgba(66, 224, 156, 0.35)' : 'rgba(255, 182, 141, 0.25)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 6]);
          ctx.beginPath();
          ctx.moveTo(turretScreen.px, turretScreen.py);
          ctx.lineTo(bP.px, bP.py);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // 4. Targets & Trajectory Trails
      targets.forEach((t) => {
        if (showTrails && t.trail && t.trail.length > 1) {
          ctx.strokeStyle = t.isBeacon ? 'rgba(255, 138, 61, 0.35)' : 'rgba(137, 148, 163, 0.2)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          let started = false;
          t.trail.forEach((pt) => {
            const pr = project(pt.x, pt.y, pt.z);
            if (pr.visible) {
              if (!started) { ctx.moveTo(pr.px, pr.py); started = true; }
              else { ctx.lineTo(pr.px, pr.py); }
            }
          });
          ctx.stroke();
        }

        const p = project(t.x, t.y, t.z);
        if (!p.visible) return;

        if (t.isBeacon) {
          // Glow
          ctx.shadowColor = '#FF8A3D'; ctx.shadowBlur = 15;
          ctx.fillStyle = '#FF8A3D';
          ctx.beginPath(); ctx.arc(p.px, p.py, 6 * p.scale, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;

          // Reticle box
          const boxSize = 22 * p.scale;
          ctx.strokeStyle = '#FF8A3D'; ctx.lineWidth = 1.5;
          ctx.strokeRect(p.px - boxSize / 2, p.py - boxSize / 2, boxSize, boxSize);

          // Outer ring
          ctx.strokeStyle = 'rgba(255, 138, 61, 0.4)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.px, p.py, 20 * p.scale, 0, Math.PI * 2); ctx.stroke();

          // Label
          ctx.fillStyle = '#F2F4F7';
          ctx.font = `${Math.max(10, Math.round(11 * p.scale))}px JetBrains Mono`;
          ctx.fillText(`BEACON #${t.id} [${t.range}m]`, p.px + 14 * p.scale, p.py - 10);
        } else {
          ctx.fillStyle = '#8994A3'; ctx.strokeStyle = '#26303B'; ctx.lineWidth = 1;
          ctx.save(); ctx.translate(p.px, p.py); ctx.rotate(Math.PI / 4);
          const d = 10 * p.scale;
          ctx.fillRect(-d / 2, -d / 2, d, d); ctx.strokeRect(-d / 2, -d / 2, d, d);
          ctx.restore();
          ctx.fillStyle = '#8994A3'; ctx.font = '9px JetBrains Mono';
          ctx.fillText(`T#${t.id}`, p.px + 10, p.py - 4);
        }
      });
    };

    render();
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [targets, camera, config, orbitAngleX, orbitAngleY, zoomScale, showTrails, showWireframe, telemetry.status, beaconTarget]);

  return (
    <main
      className="flex-grow md:ml-64 relative h-screen w-full flex flex-col pt-14 md:pt-0 bg-[#05070B] overflow-hidden select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      <div className="relative z-10 w-full h-full p-4 md:p-6 flex flex-col justify-between pointer-events-none">
        {/* Top HUD Row */}
        <div className="flex justify-between items-start pointer-events-auto">
          <div className="bg-[#0B1017]/90 backdrop-blur-md border border-[#26303B] rounded p-3 flex flex-col gap-2 min-w-[150px] shadow-lg">
            <div>
              <div className="font-['JetBrains_Mono'] text-[9px] text-[#8994A3] uppercase">TIME</div>
              <div className="font-['JetBrains_Mono'] text-xl text-[#F2F4F7] font-medium">
                {telemetry.formattedTime || '00:00'}
              </div>
            </div>
            <div>
              <div className="font-['JetBrains_Mono'] text-[9px] text-[#8994A3] uppercase">SCENARIO</div>
              <div className="font-['JetBrains_Mono'] text-[11px] text-[#F2F4F7]">
                {config.configDisplayName || config.name}
              </div>
            </div>
          </div>

          <div className="bg-[#0B1017]/90 backdrop-blur-md border border-[#26303B] rounded p-1.5 flex flex-col gap-1.5 shadow-lg">
            <button
              id="view-btn-3d"
              className="flex items-center gap-2 px-3 py-1.5 bg-[#FF8A3D]/20 border border-[#FF8A3D] rounded text-[#FF8A3D] font-['JetBrains_Mono'] text-[11px] uppercase font-bold"
            >
              <span className="material-symbols-outlined text-sm">language</span>
              <span>3D World</span>
            </button>
            <button
              id="view-btn-camera"
              onClick={() => onSwitchView('cameraview')}
              className="flex items-center gap-2 px-3 py-1.5 border border-transparent rounded text-[#8994A3] hover:text-[#F2F4F7] hover:bg-[#1A222C] transition-colors font-['JetBrains_Mono'] text-[11px] uppercase cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">videocam</span>
              <span>Camera View</span>
            </button>
          </div>
        </div>

        {/* Right Floating Tools */}
        <div className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 pointer-events-auto">
          <button title="Zoom In" onClick={() => setZoomScale((p) => Math.min(2.5, p + 0.2))}
            className="w-10 h-10 bg-[#0B1017]/90 backdrop-blur-md border border-[#26303B] rounded flex items-center justify-center text-[#8994A3] hover:text-[#FF8A3D] hover:border-[#FF8A3D] transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-lg">zoom_in</span>
          </button>
          <button title="Zoom Out" onClick={() => setZoomScale((p) => Math.max(0.5, p - 0.2))}
            className="w-10 h-10 bg-[#0B1017]/90 backdrop-blur-md border border-[#26303B] rounded flex items-center justify-center text-[#8994A3] hover:text-[#FF8A3D] hover:border-[#FF8A3D] transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-lg">zoom_out</span>
          </button>
          <button title="Reset View" onClick={() => { setOrbitAngleX(-15); setOrbitAngleY(0); setZoomScale(1.0); }}
            className="w-10 h-10 bg-[#0B1017]/90 backdrop-blur-md border border-[#26303B] rounded flex items-center justify-center text-[#8994A3] hover:text-[#FF8A3D] hover:border-[#FF8A3D] transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-lg">my_location</span>
          </button>
          <button title="Toggle Trails" onClick={() => setShowTrails((p) => !p)}
            className={`w-10 h-10 bg-[#0B1017]/90 backdrop-blur-md border rounded flex items-center justify-center transition-colors cursor-pointer ${showTrails ? 'border-[#FF8A3D] text-[#FF8A3D]' : 'border-[#26303B] text-[#8994A3]'}`}>
            <span className="material-symbols-outlined text-lg">layers</span>
          </button>
        </div>

        {/* Bottom HUD Row */}
        <div className="flex justify-between items-end pb-14 md:pb-16 pointer-events-auto">
          {/* Axis Indicator */}
          <div className="relative w-16 h-16 opacity-75">
            <div className="absolute bottom-0 left-0 w-full h-[1px] bg-[#ff4d4d]"></div>
            <div className="absolute bottom-0 left-0 w-[1px] h-full bg-[#38D996]"></div>
            <div className="absolute bottom-0 left-0 w-full h-[1px] bg-[#4287f5] -rotate-45 origin-left"></div>
            <span className="absolute right-0 bottom-1 font-['JetBrains_Mono'] text-[#ff4d4d] text-[8px] font-bold">X</span>
            <span className="absolute top-0 left-1 font-['JetBrains_Mono'] text-[#38D996] text-[8px] font-bold">Y</span>
            <span className="absolute top-0 right-0 font-['JetBrains_Mono'] text-[#4287f5] text-[8px] font-bold">Z</span>
          </div>

          {/* Target Info Panel */}
          <div className="bg-[#0B1017]/90 backdrop-blur-md border border-[#26303B] rounded p-4 min-w-[210px] shadow-lg">
            <h3 className="font-['JetBrains_Mono'] text-[10px] text-[#8994A3] uppercase border-b border-[#26303B] pb-2 mb-3 tracking-widest flex items-center justify-between">
              <span>TARGET INFO</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#38D996] animate-pulse"></span>
            </h3>
            <div className="flex flex-col gap-2 font-['JetBrains_Mono'] text-xs">
              <div className="flex justify-between items-center">
                <span className="text-[#8994A3]">ID</span>
                <span className="text-[#F2F4F7] font-medium">{beaconTarget ? beaconTarget.id : 1}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#8994A3]">Range</span>
                <span className="text-[#F2F4F7] font-medium">
                  {beaconTarget ? beaconTarget.range : 1250} <span className="text-[10px] text-[#8994A3]">m</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#8994A3]">Azimuth</span>
                <span className="text-[#F2F4F7] font-medium">
                  {beaconTarget ? beaconTarget.azimuth.toFixed(1) : '0.0'}°
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#8994A3]">Elevation</span>
                <span className="text-[#F2F4F7] font-medium">
                  {beaconTarget ? beaconTarget.elevation.toFixed(1) : '0.0'}°
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-[#26303B]">
                <span className="text-[#8994A3]">Track Mode</span>
                <span className={`font-bold uppercase ${
                  telemetry.status === 'LOCKED' ? 'text-[#38D996]' :
                  telemetry.status === 'ACQUIRING' ? 'text-[#FF8A3D]' : 'text-[#8994A3]'
                }`}>{telemetry.status}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#8994A3]">Gimbal Pan</span>
                <span className="text-[#F2F4F7] font-medium">{camera.pan.toFixed(1)}°</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#8994A3]">Gimbal Tilt</span>
                <span className="text-[#F2F4F7] font-medium">{camera.tilt.toFixed(1)}°</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#8994A3]">Tracking Error</span>
                <span className={`font-medium ${telemetry.totalError < 1.0 ? 'text-[#38D996]' : 'text-[#FF8A3D]'}`}>
                  {telemetry.totalError.toFixed(2)}°
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
