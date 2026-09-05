import React, { useState } from 'react';
import { PerformanceStats, SimulationConfig, BenchmarkContext, CompletedAlgorithmRun, TrackingAlgorithm, AlgorithmMetrics, TelemetryPoint } from '../types';
import { ReportModal } from './ReportModal';
import { sanitizeCsvRow } from '../services/csvSanitize';

interface PerformanceViewProps {
  stats: PerformanceStats;
  config: SimulationConfig;
  completedRuns: CompletedAlgorithmRun[];
  benchmarkContext: BenchmarkContext;
}

const ALGORITHMS: TrackingAlgorithm[] = ['AI Centroid', 'Kalman Predictive', 'Deep Beacon'];

const ALGO_COLORS: Record<TrackingAlgorithm, string> = {
  'AI Centroid': '#ffb68d',
  'Kalman Predictive': '#42e09c',
  'Deep Beacon': '#65fdb6',
};

export const PerformanceView: React.FC<PerformanceViewProps> = ({ stats, config, completedRuns, benchmarkContext }) => {
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [selectedRunAlgo, setSelectedRunAlgo] = useState<TrackingAlgorithm | null>(null);

  // Derive the display name from the most recent completed run (authoritative source)
  const runDisplayName = completedRuns.length > 0
    ? completedRuns[completedRuns.length - 1].configDisplayName
    : config.configDisplayName || config.name;

  // Build history for graphing - use completed runs' telemetry
  const getRunHistory = (algo: TrackingAlgorithm): TelemetryPoint[] => {
    const run = completedRuns.find(r => r.algorithm === algo);
    if (run && run.telemetryHistory.length > 0) {
      return run.telemetryHistory;
    }
    return [];
  };

  // Get metrics for a completed run
  const getRunMetrics = (algo: TrackingAlgorithm): AlgorithmMetrics | null => {
    const run = completedRuns.find(r => r.algorithm === algo);
    return run?.metrics ?? null;
  };

  // Check if we have actual run data for an algorithm
  const hasActualRun = (algo: TrackingAlgorithm): boolean => {
    const run = completedRuns.find(r => r.algorithm === algo);
    return run !== undefined && run.telemetryHistory.length > 0;
  };

  const handleExportCSV = () => {
    const headers = [
      'Configuration', 'Algorithm', 'Seed', 'Duration(s)',
      'Time(s)', 'FormattedTime', 'Pan(deg)', 'Tilt(deg)',
      'AzimuthError(deg)', 'ElevationError(deg)', 'TotalError(deg)',
      'Confidence(%)', 'Status', 'Range(m)', 'FPS', 'CpuLoad(%)',
    ];
    const rows: string[][] = [];

    completedRuns.forEach(run => {
      run.telemetryHistory.forEach(h => {
        rows.push([
          run.configDisplayName || run.config.name,
          run.algorithm,
          String(run.seed),
          String(run.config.durationSec),
          h.timeSec.toFixed(2),
          h.formattedTime,
          h.pan.toFixed(2),
          h.tilt.toFixed(2),
          h.azimuthError.toFixed(2),
          h.elevationError.toFixed(2),
          h.totalError.toFixed(2),
          h.confidence.toFixed(1),
          h.status,
          String(h.range),
          String(h.fps),
          String(h.cpuLoad),
        ]);
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => sanitizeCsvRow(e).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `FSOC_Performance_Comparison_${runDisplayName.replace(/\s+/g, '_')}.csv`);
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
            PERFORMANCE ANALYSIS
          </h1>
          <p className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] tracking-widest uppercase mt-1">
            Actual Run Comparison &bull; {runDisplayName}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="perf-export-csv-btn"
            onClick={handleExportCSV}
            disabled={completedRuns.length === 0}
            className="flex items-center gap-2 bg-[#323538] hover:bg-[#363a3c] border border-[#564338] text-[#e0e3e6] px-4 py-2 rounded font-['JetBrains_Mono'] text-xs uppercase font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Actual Completed Runs Status */}
      <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#564338]/40">
          <span className="material-symbols-outlined text-[18px] text-[#42e09c]">verified</span>
          <h2 className="font-['JetBrains_Mono'] text-xs text-[#ddc1b3] uppercase tracking-widest font-bold">
            ACTUAL LIVE RUNS
          </h2>
          <span className="ml-auto px-2 py-1 bg-[#42e09c]/20 border border-[#42e09c] rounded text-[#42e09c] font-['JetBrains_Mono'] text-[9px] uppercase">
            Real Telemetry
          </span>
        </div>

        {completedRuns.length === 0 ? (
          <div className="text-center py-8">
            <span className="material-symbols-outlined text-[32px] text-[#564338] mb-3 block">track_changes</span>
            <p className="font-['JetBrains_Mono'] text-xs text-[#a58c7f] mb-4">
              No completed algorithm runs yet.
            </p>
            <p className="font-['JetBrains_Mono'] text-[9px] text-[#a58c7f] leading-relaxed max-w-md mx-auto">
              Run benchmarks first, then use "RUN RECOMMENDED ALGORITHM" or run other algorithms from the Benchmark tab.
              Each live run with the same configuration and seed will appear here for comparison.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ALGORITHMS.map(algo => {
              const run = completedRuns.find(r => r.algorithm === algo);
              const metrics = getRunMetrics(algo);
              const color = ALGO_COLORS[algo];
              const isSelected = selectedRunAlgo === algo;

              return (
                <div
                  key={algo}
                  onClick={() => setSelectedRunAlgo(isSelected ? null : algo)}
                  className={`border rounded p-4 cursor-pointer transition-all ${isSelected ? 'border-[#ffb68d] bg-[#ffb68d]/10' : 'border-[#564338]/40 bg-[#191c1e] hover:border-[#ffb68d]/50'}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-['JetBrains_Mono'] text-[11px] text-[#e0e3e6] font-bold">{algo}</span>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  </div>
                  {run && metrics ? (
                    <div className="space-y-1.5 font-['JetBrains_Mono'] text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-[#a58c7f]">Avg Error</span>
                        <span style={{ color }} className="font-bold">{metrics.avgTotalError.toFixed(2)}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#a58c7f]">Max Error</span>
                        <span style={{ color }} className="font-bold">{metrics.maxTotalError.toFixed(2)}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#a58c7f]">Lock Retention</span>
                        <span className="text-[#42e09c] font-bold">{metrics.lockRetentionPct.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#a58c7f]">Acq Time</span>
                        <span className="text-[#ddc1b3] font-bold">{metrics.acquisitionTimeSec < Infinity ? metrics.acquisitionTimeSec.toFixed(2) + 's' : 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#a58c7f]">Avg Confidence</span>
                        <span className="text-[#ddc1b3] font-bold">{metrics.avgConfidence.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#a58c7f]">Avg FPS</span>
                        <span className="text-[#ddc1b3] font-bold">{metrics.avgFps.toFixed(1)}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-[#564338]/30 font-['JetBrains_Mono'] text-[9px] text-[#a58c7f]">
                        Run: {new Date(run.timestamp).toLocaleTimeString()}
                        {run.seed !== undefined && <span className="ml-2">Seed: {run.seed}</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[#564338] font-['JetBrains_Mono'] text-[10px] text-center py-4">
                      No live run completed
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tracking Error Over Time — Per-Algorithm Panels */}
      {completedRuns.length > 0 && (() => {
        // Determine the best (lowest avg error) algorithm
        const algoAvgErrors = ALGORITHMS.map(algo => {
          const metrics = getRunMetrics(algo);
          return { algo, avgError: metrics?.avgTotalError ?? Infinity };
        }).filter(x => x.avgError < Infinity);
        const bestAlgo = algoAvgErrors.length > 0
          ? algoAvgErrors.reduce((a, b) => a.avgError < b.avgError ? a : b).algo
          : null;

        // Get common duration from completed runs for X-axis labels
        const durations = completedRuns.map(r => r.config.durationSec);
        const runDuration = durations.length > 0 ? Math.max(...durations) : 30;

        return (
          <div className="mb-6">
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#ff8a3d]">query_stats</span>
                <h2 className="font-['Hanken_Grotesk'] text-lg text-[#e0e3e6] font-bold tracking-tight">
                  TRACKING ERROR OVER TIME
                </h2>
                <span className="px-2 py-0.5 bg-[#42e09c]/20 border border-[#42e09c] rounded text-[#42e09c] font-['JetBrains_Mono'] text-[9px] uppercase font-bold">
                  Actual Telemetry
                </span>
              </div>
            </div>

            {/* Demo Explanation Labels */}
            <div className="flex flex-wrap gap-4 mb-4 font-['JetBrains_Mono'] text-[10px]">
              <div className="flex items-center gap-2 text-[#ddc1b3]">
                <span className="material-symbols-outlined text-[14px] text-[#ff8a3d]">info</span>
                Actual tracking error measured during live simulation. Lower error indicates closer target tracking.
              </div>
              <div className="flex items-center gap-2 text-[#ddc1b3]">
                <span className="material-symbols-outlined text-[14px] text-[#42e09c]">same_config</span>
                Same configuration + seed for direct algorithm comparison.
              </div>
            </div>

            {/* Three Algorithm Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {ALGORITHMS.map(algo => {
                const history = getRunHistory(algo);
                const metrics = getRunMetrics(algo);
                const color = ALGO_COLORS[algo];
                const hasRun = history.length > 0;
                const isBest = bestAlgo === algo;

                if (!hasRun) return (
                  <div key={algo} className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-4 flex flex-col items-center justify-center min-h-[280px]">
                    <span className="material-symbols-outlined text-[28px] text-[#564338] mb-2">timeline</span>
                    <span className="font-['JetBrains_Mono'] text-[11px] text-[#a58c7f]">{algo}</span>
                    <span className="font-['JetBrains_Mono'] text-[9px] text-[#564338] mt-1">No live run</span>
                  </div>
                );

                // Compute X-axis time labels from actual run duration
                const timeMarks: string[] = [];
                const markCount = 5;
                for (let i = 0; i <= markCount; i++) {
                  const t = (runDuration / markCount) * i;
                  const m = Math.floor(t / 60).toString().padStart(2, '0');
                  const s = Math.floor(t % 60).toString().padStart(2, '0');
                  timeMarks.push(`${m}:${s}`);
                }

                return (
                  <div key={algo} className={`bg-[#1d2022] border rounded-lg p-4 flex flex-col ${isBest ? 'border-[#42e09c]/50 shadow-[0_0_12px_rgba(66,224,156,0.1)]' : 'border-[#564338]/40'}`}>
                    {/* Panel Header */}
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#564338]/40">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        <span className="font-['JetBrains_Mono'] text-[11px] text-[#e0e3e6] font-bold">{algo}</span>
                        {isBest && (
                          <span className="text-[8px] bg-[#42e09c]/20 text-[#42e09c] px-1.5 py-0.5 rounded font-bold">BEST</span>
                        )}
                      </div>
                      {metrics && (
                        <div className="font-['JetBrains_Mono'] text-[9px] text-[#a58c7f]">
                          Avg: <span style={{ color }} className="font-bold">{metrics.avgTotalError.toFixed(2)}°</span>
                          {' '}&bull;{' '}
                          Max: <span style={{ color }} className="font-bold">{metrics.maxTotalError.toFixed(2)}°</span>
                        </div>
                      )}
                    </div>

                    {/* SVG Chart */}
                    <div className="flex-1 relative bg-[#101416] rounded border border-[#564338]/30 p-2 min-h-[180px]">
                      <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 800 160">
                        {/* Y-axis grid */}
                        {[0, 0.5, 1.0, 2.0, 3.0].map(val => {
                          const y = 160 - (val / 3.0) * 160;
                          return (
                            <g key={val}>
                              <line x1="0" y1={y} x2="800" y2={y}
                                stroke={val === 0.5 ? 'rgba(66,224,156,0.4)' : '#323538'}
                                strokeWidth={val === 0.5 ? 1.5 : 0.5}
                                strokeDasharray={val === 0.5 ? '6,4' : 'none'} />
                              <text x="2" y={y - 3} fill="#a58c7f" fontSize="8" fontFamily="JetBrains Mono">
                                {val.toFixed(1)}°
                              </text>
                            </g>
                          );
                        })}

                        {/* Telemetry curve */}
                        <polyline
                          fill="none"
                          stroke={color}
                          strokeWidth="2"
                          points={history.map((pt) => {
                            const x = (pt.timeSec / Math.max(1, runDuration)) * 800;
                            const y = 160 - Math.min(160, (pt.totalError / 3.0) * 160);
                            return `${x},${y}`;
                          }).join(' ')}
                        />

                        {/* Lock threshold band label */}
                        <text x="790" y={160 - (0.5 / 3.0) * 160 - 4} fill="#42e09c" fontSize="7" fontFamily="JetBrains Mono" textAnchor="end" opacity="0.7">
                          0.5° lock
                        </text>
                      </svg>
                    </div>

                    {/* X-axis time labels */}
                    <div className="flex justify-between font-['JetBrains_Mono'] text-[8px] text-[#a58c7f] mt-1.5 px-1">
                      {timeMarks.map((label, i) => (
                        <span key={i}>{label}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Algorithm-wise Metrics Comparison Table */}
      {completedRuns.length > 0 && (
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#564338]/40">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#ffb68d]">compare</span>
              <h2 className="font-['JetBrains_Mono'] text-xs text-[#ddc1b3] uppercase tracking-widest font-bold">
                ALGORITHM COMPARISON
              </h2>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full font-['JetBrains_Mono'] text-[10px]">
              <thead>
                <tr className="border-b border-[#564338]/40">
                  <th className="text-left py-2 px-3 text-[#a58c7f] uppercase tracking-wider">Metric</th>
                  {ALGORITHMS.map(algo => (
                    <th key={algo} className="text-right py-2 px-3 uppercase tracking-wider text-[#a58c7f]">
                      {algo}
                      {hasActualRun(algo) && (
                        <span className="ml-1 text-[8px] bg-[#42e09c]/20 text-[#42e09c] px-1 py-0.5 rounded">LIVE</span>
                      )}

                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Avg Error (deg)', key: 'avgTotalError', fmt: (v: number) => v.toFixed(2), lower: true },
                  { label: 'Max Error (deg)', key: 'maxTotalError', fmt: (v: number) => v.toFixed(2), lower: true },
                  { label: 'Lock Retention (%)', key: 'lockRetentionPct', fmt: (v: number) => v.toFixed(1), lower: false },
                  { label: 'Acq Time (s)', key: 'acquisitionTimeSec', fmt: (v: number) => v < Infinity ? v.toFixed(2) : 'N/A', lower: true },
                  { label: 'Avg Confidence (%)', key: 'avgConfidence', fmt: (v: number) => v.toFixed(1), lower: false },
                  { label: 'Avg FPS', key: 'avgFps', fmt: (v: number) => v.toFixed(1), lower: false },
                ].map((row) => {
                  const values = ALGORITHMS.map(algo => {
                    const metrics = getRunMetrics(algo);
                    const isActual = !!metrics;
                    return { algo, metrics, isActual };
                  });

                  const numValues = values
                    .filter(v => v.metrics && (row.key !== 'acquisitionTimeSec' || v.metrics.acquisitionTimeSec < Infinity))
                    .map(v => v.metrics![row.key as keyof AlgorithmMetrics] as number);

                  const bestVal = numValues.length > 0
                    ? (row.lower ? Math.min(...numValues) : Math.max(...numValues))
                    : 0;

                  return (
                    <tr key={row.label} className="border-b border-[#564338]/20 hover:bg-[#272a2d]/50">
                      <td className="py-2 px-3 text-[#ddc1b3]">{row.label}</td>
                      {values.map(({ algo, metrics, isActual }) => {
                        let displayVal: string;
                        let rawVal: number;
                        if (metrics) {
                          rawVal = metrics[row.key as keyof AlgorithmMetrics] as number;
                          displayVal = row.fmt(rawVal);
                        } else {
                          rawVal = 0;
                          displayVal = 'N/A';
                        }
                        const isBest = numValues.length > 1 && rawVal === bestVal;
                        const color = ALGO_COLORS[algo];
                        return (
                          <td
                            key={algo}
                            className={`py-2 px-3 text-right ${
                              isBest ? 'font-bold' : ''
                            } ${isActual ? `text-${color.replace('#', '')}` : 'text-[#a58c7f]'}`}
                            style={isBest && isActual ? { color } : {}}
                          >
                            {displayVal}
                            {isBest && isActual && <span className="ml-1 text-[8px] font-bold" style={{ color }}>★</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-3 bg-[#101416] rounded border border-[#564338]/30">
            <p className="font-['JetBrains_Mono'] text-[9px] text-[#a58c7f] leading-relaxed">
              <span className="text-[#42e09c]">★</span> = Best actual live performance for this metric.
              <br />
              <span className="text-[#42e09c]">LIVE</span> = Measured from live simulation with benchmark config + seed.
              <br />
              Only live runs with identical configuration and seed are directly comparable.
            </p>
          </div>
        </div>
      )}

      {/* Printable Report Modal */}
      {showReportModal && (
        <ReportModal
          stats={stats}
          config={config}
          completedRuns={completedRuns}
          benchmarkContext={benchmarkContext}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
};