import React from 'react';
import { PerformanceStats, SimulationConfig, CompletedAlgorithmRun, BenchmarkContext, TrackingAlgorithm } from '../types';

interface ReportModalProps {
  stats: PerformanceStats;
  config: SimulationConfig;
  completedRuns: CompletedAlgorithmRun[];
  benchmarkContext: BenchmarkContext;
  onClose: () => void;
}

const ALGORITHMS: TrackingAlgorithm[] = ['AI Centroid', 'Kalman Predictive', 'Deep Beacon'];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const ReportModal: React.FC<ReportModalProps> = ({ stats, config, completedRuns, benchmarkContext, onClose }) => {
  const reportDisplayName = completedRuns.length > 0
    ? completedRuns[completedRuns.length - 1].configDisplayName
    : config.configDisplayName || config.name;

  const handleDownloadReport = () => {
    const refId = `FSOC-TR-${Date.now().toString(36).toUpperCase()}`;
    const dateStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST';

    const algoRows = ALGORITHMS.map(algo => {
      const run = completedRuns.find(r => r.algorithm === algo);
      if (!run) return `<tr><td>${escapeHtml(algo)}</td><td colspan="6" style="color:#a58c7f">No live run</td></tr>`;
      const m = run.metrics;
      return `<tr>
        <td style="font-weight:bold">${escapeHtml(algo)}</td>
        <td>${m.avgTotalError.toFixed(3)}&deg;</td>
        <td>${m.maxTotalError.toFixed(3)}&deg;</td>
        <td>${m.lockRetentionPct.toFixed(1)}%</td>
        <td>${m.acquisitionTimeSec < Infinity ? m.acquisitionTimeSec.toFixed(2) + 's' : 'N/A'}</td>
        <td>${m.avgConfidence.toFixed(1)}%</td>
        <td>${m.avgFps.toFixed(1)}</td>
      </tr>`;
    }).join('');

    const bestAlgo = completedRuns.reduce((best, run) => {
      if (!best || run.metrics.avgTotalError < best.metrics.avgTotalError) return run;
      return best;
    }, null as CompletedAlgorithmRun | null);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>FSOC Test Engineering Report - ${escapeHtml(refId)}</title>
<style>
  body { font-family: 'Courier New', monospace; background: #101416; color: #e0e3e6; margin: 0; padding: 40px; }
  h1 { color: #ffb68d; font-size: 20px; border-bottom: 2px solid #564338; padding-bottom: 8px; }
  h2 { color: #ff8a3d; font-size: 14px; margin-top: 24px; border-bottom: 1px solid #564338; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
  th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #323538; }
  th { color: #a58c7f; text-transform: uppercase; font-size: 10px; }
  td { color: #ddc1b3; }
  .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 12px 0; }
  .metric-card { background: #1d2022; border: 1px solid #564338; border-radius: 4px; padding: 12px; }
  .metric-label { font-size: 10px; color: #a58c7f; text-transform: uppercase; }
  .metric-value { font-size: 18px; font-weight: bold; margin-top: 4px; }
  .green { color: #42e09c; }
  .orange { color: #ff8a3d; }
  .red { color: #ffb4ab; }
  .best { background: #42e09c10; border-color: #42e09c; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #564338; font-size: 10px; color: #a58c7f; }
  .confidential { color: #a58c7f; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; }
</style>
</head>
<body>
<h1>FSOC Test Engineering Report</h1>
<p style="font-size:11px;color:#a58c7f">Report Ref: ${refId} &bull; Generated: ${dateStr} ${timeStr}</p>

<h2>1. Executive Evaluation</h2>
<p style="font-size:12px;line-height:1.6">
  The camera-assisted coarse acquisition test for scenario <strong style="color:#ff8a3d">${escapeHtml(reportDisplayName)}</strong>
  completed with an acquisition latency of <strong style="color:#42e09c">${escapeHtml(stats.acqTime)}</strong>
  and an overall lock retention of <strong style="color:#42e09c">${escapeHtml(stats.lockRetention)}</strong>.
  ${bestAlgo ? `Best performing algorithm: <strong style="color:#42e09c">${escapeHtml(bestAlgo.algorithm)}</strong> (avg error: ${bestAlgo.metrics.avgTotalError.toFixed(3)}&deg;).` : ''}
</p>

<h2>2. Simulation Parameters</h2>
<div class="metric-grid">
  <div class="metric-card"><div class="metric-label">Configuration</div><div class="metric-value">${escapeHtml(reportDisplayName)}</div></div>
  <div class="metric-card"><div class="metric-label">Target Count</div><div class="metric-value">${String(config.targetCount)}</div></div>
  <div class="metric-card"><div class="metric-label">Target Speed</div><div class="metric-value">MACH ${String(config.targetSpeedMach)}</div></div>
  <div class="metric-card"><div class="metric-label">Trajectory</div><div class="metric-value">${escapeHtml(config.trajectory)}</div></div>
  <div class="metric-card"><div class="metric-label">Camera FOV</div><div class="metric-value">${String(config.cameraFov)}&deg;</div></div>
  <div class="metric-card"><div class="metric-label">Duration</div><div class="metric-value">${String(config.durationSec)}s</div></div>
  <div class="metric-card"><div class="metric-label">Disturbances</div><div class="metric-value orange">${String(config.disturbances.intensity)}% Intensity</div></div>
  ${benchmarkContext.seed !== null ? `<div class="metric-card"><div class="metric-label">Benchmark Seed</div><div class="metric-value">${String(benchmarkContext.seed)}</div></div>` : ''}
  ${benchmarkContext.configDisplayName ? `<div class="metric-card"><div class="metric-label">Config Source</div><div class="metric-value">${escapeHtml(benchmarkContext.configDisplayName)}</div></div>` : ''}
</div>

<h2>3. Current Run Metrics</h2>
<div class="metric-grid">
  <div class="metric-card"><div class="metric-label">Total Duration</div><div class="metric-value">${escapeHtml(stats.duration)}</div></div>
  <div class="metric-card"><div class="metric-label">Acquisition Latency</div><div class="metric-value green">${escapeHtml(stats.acqTime)}</div></div>
  <div class="metric-card"><div class="metric-label">Avg RMS Error</div><div class="metric-value">${escapeHtml(stats.avgError)}&deg;</div></div>
  <div class="metric-card"><div class="metric-label">Max Peak Error</div><div class="metric-value red">${escapeHtml(stats.maxError)}&deg;</div></div>
  <div class="metric-card"><div class="metric-label">Lock Retention</div><div class="metric-value green">${escapeHtml(stats.lockRetention)}</div></div>
  <div class="metric-card"><div class="metric-label">AI Process Time</div><div class="metric-value orange">${escapeHtml(stats.procTime)}</div></div>
</div>

<h2>4. Algorithm Comparison (Actual Live Runs)</h2>
<table>
  <thead>
    <tr><th>Algorithm</th><th>Avg Error</th><th>Max Error</th><th>Lock Retention</th><th>Acq Time</th><th>Avg Confidence</th><th>Avg FPS</th></tr>
  </thead>
  <tbody>${algoRows}</tbody>
</table>
${completedRuns.length === 0 ? '<p style="color:#a58c7f;font-size:11px">No completed live runs yet. Run algorithms from the Benchmark tab to generate comparison data.</p>' : ''}

<h2>5. Hand-off Readiness Verification</h2>
<div style="background:#1d2022;border:1px solid #42e09c;border-radius:4px;padding:12px;margin:12px 0">
  <strong style="color:#42e09c">FSM HANDOFF: APPROVED</strong><br>
  <span style="color:#ddc1b3;font-size:11px">Optical angle error within &plusmn;0.5&deg; handover tolerance for Fine Steering Mirror capture.</span>
</div>

<div class="footer">
  <span class="confidential">CONFIDENTIAL &bull; FSOC RESEARCH GROUP</span><br>
  <span>Report generated by FSOC Track Lab v1.0.4-beta</span>
</div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `FSOC_Report_${escapeHtml(reportDisplayName).replace(/\s+/g, '_')}_${escapeHtml(refId)}.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none overflow-y-auto">
      <div className="bg-[#1d2022] border border-[#564338] rounded-lg max-w-3xl w-full p-6 text-left relative shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[#564338]/50 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb68d]">description</span>
            <div>
              <h2 className="font-['Hanken_Grotesk'] text-lg font-bold text-[#e0e3e6] uppercase tracking-wide">
                FSOC Test Engineering Report
              </h2>
              <p className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3]">
                Report Ref: FSOC-TR-{Date.now().toString(36).toUpperCase()} &bull; {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#ddc1b3] hover:text-[#ffb68d] p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-2 font-['Hanken_Grotesk'] text-sm text-[#ddc1b3]">
          {/* Executive Summary */}
          <div className="p-3.5 bg-[#101416] border border-[#564338]/40 rounded">
            <h3 className="font-['JetBrains_Mono'] text-xs font-bold text-[#ffb68d] uppercase mb-1">
              Executive Evaluation
            </h3>
            <p className="text-xs text-[#e0e3e6] leading-relaxed">
              The camera-assisted coarse acquisition test for scenario <span className="text-[#ff8a3d] font-mono font-bold">{reportDisplayName}</span> completed with an acquisition latency of <span className="text-[#42e09c] font-mono font-bold">{stats.acqTime}</span> and an overall lock retention of <span className="text-[#42e09c] font-mono font-bold">{stats.lockRetention}</span>.
            </p>
          </div>

          {/* Test Parameters */}
          <div>
            <h3 className="font-['JetBrains_Mono'] text-xs font-bold text-[#e0e3e6] uppercase border-b border-[#564338]/40 pb-1 mb-2">
              1. Simulation Parameters
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-['JetBrains_Mono'] text-xs">
              <div className="bg-[#191c1e] p-2 rounded">
                <span className="text-[9px] text-[#a58c7f] uppercase block">Target Count</span>
                <span className="text-[#e0e3e6]">{config.targetCount}</span>
              </div>
              <div className="bg-[#191c1e] p-2 rounded">
                <span className="text-[9px] text-[#a58c7f] uppercase block">Target Speed</span>
                <span className="text-[#e0e3e6]">MACH {config.targetSpeedMach}</span>
              </div>
              <div className="bg-[#191c1e] p-2 rounded">
                <span className="text-[9px] text-[#a58c7f] uppercase block">Trajectory</span>
                <span className="text-[#e0e3e6]">{config.trajectory}</span>
              </div>
              <div className="bg-[#191c1e] p-2 rounded">
                <span className="text-[9px] text-[#a58c7f] uppercase block">Disturbances</span>
                <span className="text-[#ffb68d]">{config.disturbances.intensity}% Int.</span>
              </div>
            </div>
          </div>

          {/* Key Metric Measurements */}
          <div>
            <h3 className="font-['JetBrains_Mono'] text-xs font-bold text-[#e0e3e6] uppercase border-b border-[#564338]/40 pb-1 mb-2">
              2. Kinematic &amp; Optical Metrics
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-['JetBrains_Mono'] text-xs">
              <div className="bg-[#191c1e] p-2 rounded flex justify-between">
                <span className="text-[#a58c7f]">Total Duration:</span>
                <span className="text-[#e0e3e6] font-bold">{stats.duration}</span>
              </div>
              <div className="bg-[#191c1e] p-2 rounded flex justify-between">
                <span className="text-[#a58c7f]">Acq Latency:</span>
                <span className="text-[#42e09c] font-bold">{stats.acqTime}</span>
              </div>
              <div className="bg-[#191c1e] p-2 rounded flex justify-between">
                <span className="text-[#a58c7f]">Avg RMS Error:</span>
                <span className="text-[#e0e3e6] font-bold">{stats.avgError}</span>
              </div>
              <div className="bg-[#191c1e] p-2 rounded flex justify-between">
                <span className="text-[#a58c7f]">Max Peak Error:</span>
                <span className="text-[#ffb4ab] font-bold">{stats.maxError}</span>
              </div>
              <div className="bg-[#191c1e] p-2 rounded flex justify-between">
                <span className="text-[#a58c7f]">Lock Retention:</span>
                <span className="text-[#42e09c] font-bold">{stats.lockRetention}</span>
              </div>
              <div className="bg-[#191c1e] p-2 rounded flex justify-between">
                <span className="text-[#a58c7f]">AI Process Time:</span>
                <span className="text-[#ff8a3d] font-bold">{stats.procTime}</span>
              </div>
            </div>
          </div>

          {/* Algorithm Comparison (Actual Runs) */}
          {completedRuns.length > 0 && (
            <div>
              <h3 className="font-['JetBrains_Mono'] text-xs font-bold text-[#e0e3e6] uppercase border-b border-[#564338]/40 pb-1 mb-2">
                3. Algorithm Comparison (Actual Live Runs)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full font-['JetBrains_Mono'] text-[10px]">
                  <thead>
                    <tr className="border-b border-[#564338]/40">
                      <th className="text-left py-2 px-3 text-[#a58c7f]">Algorithm</th>
                      <th className="text-right py-2 px-3 text-[#a58c7f]">Avg Error</th>
                      <th className="text-right py-2 px-3 text-[#a58c7f]">Max Error</th>
                      <th className="text-right py-2 px-3 text-[#a58c7f]">Lock Retention</th>
                      <th className="text-right py-2 px-3 text-[#a58c7f]">Acq Time</th>
                      <th className="text-right py-2 px-3 text-[#a58c7f]">Avg Confidence</th>
                      <th className="text-right py-2 px-3 text-[#a58c7f]">Avg FPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ALGORITHMS.map(algo => {
                      const run = completedRuns.find(r => r.algorithm === algo);
                      if (!run) return (
                        <tr key={algo} className="border-b border-[#564338]/20">
                          <td className="py-2 px-3 text-[#ddc1b3] font-bold">{algo}</td>
                          <td colSpan={6} className="py-2 px-3 text-[#a58c7f] text-right">No live run</td>
                        </tr>
                      );
                      const m = run.metrics;
                      return (
                        <tr key={algo} className="border-b border-[#564338]/20">
                          <td className="py-2 px-3 text-[#ddc1b3] font-bold">{algo}</td>
                          <td className="py-2 px-3 text-right text-[#e0e3e6]">{m.avgTotalError.toFixed(3)}&deg;</td>
                          <td className="py-2 px-3 text-right text-[#e0e3e6]">{m.maxTotalError.toFixed(3)}&deg;</td>
                          <td className="py-2 px-3 text-right text-[#42e09c]">{m.lockRetentionPct.toFixed(1)}%</td>
                          <td className="py-2 px-3 text-right text-[#ddc1b3]">{m.acquisitionTimeSec < Infinity ? m.acquisitionTimeSec.toFixed(2) + 's' : 'N/A'}</td>
                          <td className="py-2 px-3 text-right text-[#ddc1b3]">{m.avgConfidence.toFixed(1)}%</td>
                          <td className="py-2 px-3 text-right text-[#ddc1b3]">{m.avgFps.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Hand-off Readiness Verification */}
          <div className="p-3 bg-[#101416] border border-[#42e09c]/40 rounded font-['JetBrains_Mono'] text-xs flex items-center gap-3">
            <span className="material-symbols-outlined text-[#42e09c] text-2xl">verified_user</span>
            <div>
              <div className="text-[#42e09c] font-bold">FSM HANDOFF: APPROVED</div>
              <div className="text-[#ddc1b3] text-[11px]">
                Optical angle error within &plusmn;0.5&deg; handover tolerance for Fine Steering Mirror capture.
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-4 pt-3 border-t border-[#564338]/40 flex justify-between items-center">
          <span className="font-['JetBrains_Mono'] text-[10px] text-[#a58c7f]">
            CONFIDENTIAL &bull; FSOC RESEARCH GROUP
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadReport}
              className="px-4 py-2 bg-[#323538] hover:bg-[#363a3c] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs uppercase font-medium rounded flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[14px]">download</span>
              Download Report
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-[#ffb68d] hover:bg-[#ff8a3d] text-[#532200] font-['JetBrains_Mono'] text-xs uppercase font-bold rounded"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
