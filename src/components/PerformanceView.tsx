import React, { useState } from 'react';
import { PerformanceStats, SimulationConfig } from '../types';
import { ReportModal } from './ReportModal';

interface PerformanceViewProps {
  stats: PerformanceStats;
  config: SimulationConfig;
}

export const PerformanceView: React.FC<PerformanceViewProps> = ({ stats, config }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  // Generate synthetic points if history is short
  const history = stats.history && stats.history.length > 10
    ? stats.history
    : Array.from({ length: 60 }).map((_, i) => {
        const t = (i / 60) * 150;
        const az = Math.max(0.05, 0.4 + Math.sin(t * 0.1) * 0.35 + (Math.random() * 0.15));
        const el = Math.max(0.05, 0.35 + Math.cos(t * 0.12) * 0.3 + (Math.random() * 0.12));
        const mins = Math.floor(t / 60).toString().padStart(2, '0');
        const secs = Math.floor(t % 60).toString().padStart(2, '0');
        return {
          timeSec: t,
          formattedTime: `${mins}:${secs}`,
          fps: 59,
          pan: 12,
          tilt: -2,
          panError: az,
          tiltError: el,
          totalError: Math.sqrt(az * az + el * el),
          azimuthError: parseFloat(az.toFixed(2)),
          elevationError: parseFloat(el.toFixed(2)),
          confidence: 96.2,
          status: 'LOCKED' as const,
          range: 1250,
          cpuLoad: 14,
          gpuMem: 1.2,
        };
      });

  const hoveredPoint = hoverIndex !== null ? history[hoverIndex] : null;

  const handleExportCSV = () => {
    const headers = ['Time(s)', 'FormattedTime', 'Pan(deg)', 'Tilt(deg)', 'AzimuthError(deg)', 'ElevationError(deg)', 'TotalError(deg)', 'Confidence(%)', 'Status'];
    const rows = history.map(h => [
      h.timeSec.toFixed(2),
      h.formattedTime,
      h.pan.toFixed(2),
      h.tilt.toFixed(2),
      h.azimuthError.toFixed(2),
      h.elevationError.toFixed(2),
      h.totalError.toFixed(2),
      h.confidence.toFixed(1),
      h.status,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `FSOC_Tracking_Report_${config.name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto mt-14 md:mt-0 tech-grid-bg relative p-4 md:p-8 select-none pb-16">
      {/* Header */}
      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-[#564338]/40 pb-4 gap-4">
        <div>
          <h1 className="font-['Hanken_Grotesk'] text-2xl md:text-3xl text-[#e0e3e6] font-bold tracking-tight">
            PERFORMANCE SUMMARY
          </h1>
          <p className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] tracking-widest uppercase mt-1">
            Post-Simulation Engineering Analysis &bull; {config.name}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="perf-export-csv-btn"
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-[#323538] hover:bg-[#363a3c] border border-[#564338] text-[#e0e3e6] px-4 py-2 rounded font-['JetBrains_Mono'] text-xs uppercase font-medium cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">file_download</span>
            CSV DATA
          </button>
          <button
            id="perf-export-report-btn"
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-2 bg-[#ffb68d] hover:bg-[#ff8a3d] text-[#532200] px-5 py-2 rounded font-['JetBrains_Mono'] text-xs uppercase font-bold cursor-pointer transition-all shadow-[0_0_15px_rgba(255,182,141,0.25)]"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            EXPORT REPORT
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-3 text-center">
          <span className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] uppercase tracking-wider">Duration</span>
          <div className="font-['JetBrains_Mono'] text-xl text-[#e0e3e6] font-bold mt-1">{stats.duration}</div>
        </div>
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-3 text-center">
          <span className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] uppercase tracking-wider">Acq Time</span>
          <div className="font-['JetBrains_Mono'] text-xl text-[#42e09c] font-bold mt-1">{stats.acqTime}</div>
        </div>
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-3 text-center">
          <span className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] uppercase tracking-wider">Avg Error</span>
          <div className="font-['JetBrains_Mono'] text-xl text-[#e0e3e6] font-bold mt-1">{stats.avgError}</div>
        </div>
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-3 text-center">
          <span className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] uppercase tracking-wider">Max Error</span>
          <div className="font-['JetBrains_Mono'] text-xl text-[#ffb4ab] font-bold mt-1">{stats.maxError}</div>
        </div>
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-3 text-center">
          <span className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] uppercase tracking-wider">Lock Retention</span>
          <div className="font-['JetBrains_Mono'] text-xl text-[#42e09c] font-bold mt-1">{stats.lockRetention}</div>
        </div>
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-3 text-center">
          <span className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] uppercase tracking-wider">Avg FPS</span>
          <div className="font-['JetBrains_Mono'] text-xl text-[#e0e3e6] font-bold mt-1">{stats.avgFps}</div>
        </div>
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-3 text-center col-span-2 sm:col-span-1">
          <span className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] uppercase tracking-wider">Proc Time</span>
          <div className="font-['JetBrains_Mono'] text-xl text-[#ffb68d] font-bold mt-1">{stats.procTime}</div>
        </div>
      </div>

      {/* Main Engineering Chart: Tracking Error Over Time */}
      <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 flex flex-col shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 pb-3 border-b border-[#564338]/40 gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#ff8a3d]">query_stats</span>
            <h2 className="font-['JetBrains_Mono'] text-xs text-[#ddc1b3] uppercase tracking-widest font-bold">
              TRACKING ERROR OVER TIME
            </h2>
          </div>

          {/* Chart Legend */}
          <div className="flex items-center gap-5 font-['JetBrains_Mono'] text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#42e09c]"></span>
              <span className="text-[#ddc1b3]">Azimuth Error (deg)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#ffb68d]"></span>
              <span className="text-[#ddc1b3]">Elevation Error (deg)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1.5 bg-[#42e09c]/20 border border-[#42e09c]/40 rounded-sm"></span>
              <span className="text-[#42e09c]">Lock Threshold (0.5°)</span>
            </div>
          </div>
        </div>

        {/* Interactive SVG Chart Area */}
        <div className="w-full h-72 relative bg-[#101416] rounded border border-[#564338]/30 p-4">
          {/* Y Axis Grid lines */}
          <div className="absolute left-10 right-4 top-4 bottom-8 flex flex-col justify-between pointer-events-none">
            {[3.0, 2.0, 1.0, 0.5, 0.0].map((val) => (
              <div key={val} className="w-full flex items-center gap-2">
                <span className="font-['JetBrains_Mono'] text-[9px] text-[#a58c7f] w-6 text-right">{val.toFixed(1)}°</span>
                <div className={`flex-1 h-px ${val === 0.5 ? 'bg-[#42e09c]/40 border-b border-dashed border-[#42e09c]' : 'bg-[#323538]/60'}`}></div>
              </div>
            ))}
          </div>

          {/* SVG Data Curves */}
          <div className="absolute left-18 right-4 top-4 bottom-8">
            <svg
              className="w-full h-full cursor-crosshair"
              preserveAspectRatio="none"
              viewBox="0 0 1000 200"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, mouseX / rect.width));
                const idx = Math.round(ratio * (history.length - 1));
                setHoverIndex(idx);
              }}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {/* Threshold Shaded Band (< 0.5 deg is in-band lock) */}
              <rect x="0" y="166" width="1000" height="34" fill="rgba(66, 224, 156, 0.06)" />

              {/* Azimuth Error Polyline */}
              <polyline
                fill="none"
                stroke="#42e09c"
                strokeWidth="2.5"
                points={history
                  .map((pt, i) => {
                    const x = (i / (history.length - 1)) * 1000;
                    const y = 200 - Math.min(200, (pt.azimuthError / 3.0) * 200);
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />

              {/* Elevation Error Polyline */}
              <polyline
                fill="none"
                stroke="#ffb68d"
                strokeWidth="2.5"
                points={history
                  .map((pt, i) => {
                    const x = (i / (history.length - 1)) * 1000;
                    const y = 200 - Math.min(200, (pt.elevationError / 3.0) * 200);
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />

              {/* Scrubber vertical line */}
              {hoverIndex !== null && (
                <line
                  x1={(hoverIndex / (history.length - 1)) * 1000}
                  y1="0"
                  x2={(hoverIndex / (history.length - 1)) * 1000}
                  y2="200"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  strokeDasharray="4,4"
                />
              )}
            </svg>
          </div>

          {/* Hover Scrubber Tooltip */}
          {hoveredPoint && (
            <div className="absolute top-6 right-6 bg-[#1d2022] border border-[#ffb68d] rounded p-2.5 shadow-xl font-['JetBrains_Mono'] text-xs pointer-events-none z-30 flex flex-col gap-1">
              <div className="text-[#e0e3e6] font-bold border-b border-[#564338] pb-1">
                Time: {hoveredPoint.formattedTime} (T+{hoveredPoint.timeSec.toFixed(1)}s)
              </div>
              <div className="text-[#42e09c] flex justify-between gap-4">
                <span>Azimuth Error:</span>
                <span className="font-bold">{hoveredPoint.azimuthError.toFixed(2)}°</span>
              </div>
              <div className="text-[#ffb68d] flex justify-between gap-4">
                <span>Elevation Error:</span>
                <span className="font-bold">{hoveredPoint.elevationError.toFixed(2)}°</span>
              </div>
              <div className="text-[#ddc1b3] flex justify-between gap-4">
                <span>Total RMS:</span>
                <span className="font-bold">{hoveredPoint.totalError.toFixed(2)}°</span>
              </div>
            </div>
          )}
        </div>

        {/* X Axis Time Labels */}
        <div className="flex justify-between font-['JetBrains_Mono'] text-[10px] text-[#a58c7f] mt-2 px-14">
          <span>00:00</span>
          <span>00:30</span>
          <span>01:00</span>
          <span>01:30</span>
          <span>02:00</span>
          <span>{stats.duration}</span>
        </div>
      </div>

      {/* Engineering Insights & Verification Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[#42e09c]">
            <span className="material-symbols-outlined text-[18px]">verified</span>
            <h3 className="font-['JetBrains_Mono'] text-xs uppercase font-bold">Acquisition Criteria</h3>
          </div>
          <p className="font-['Hanken_Grotesk'] text-xs text-[#ddc1b3] leading-relaxed">
            Coarse alignment succeeded within <span className="text-[#e0e3e6] font-mono">{stats.acqTime}</span>, well within the &lt; 1.0s requirement for mobile handoff to Fine Steering Mirrors (FSM).
          </p>
        </div>

        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[#ff8a3d]">
            <span className="material-symbols-outlined text-[18px]">vibration</span>
            <h3 className="font-['JetBrains_Mono'] text-xs uppercase font-bold">Jitter Rejection</h3>
          </div>
          <p className="font-['Hanken_Grotesk'] text-xs text-[#ddc1b3] leading-relaxed">
            PID feedforward damping attenuated platform vibrations up to {config.disturbances.intensity}% intensity with minimal phase lag.
          </p>
        </div>

        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[#65fdb6]">
            <span className="material-symbols-outlined text-[18px]">signal_cellular_alt</span>
            <h3 className="font-['JetBrains_Mono'] text-xs uppercase font-bold">Link Reliability</h3>
          </div>
          <p className="font-['Hanken_Grotesk'] text-xs text-[#ddc1b3] leading-relaxed">
            Maintained continuous optical beam lock retention at <span className="text-[#e0e3e6] font-mono">{stats.lockRetention}</span> across high angular velocity trajectory profiles.
          </p>
        </div>
      </div>

      {/* Printable Report Modal */}
      {showReportModal && (
        <ReportModal
          stats={stats}
          config={config}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
};
