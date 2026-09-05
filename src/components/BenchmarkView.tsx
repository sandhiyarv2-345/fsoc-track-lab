import React, { useState } from 'react';
import {
  BenchmarkResult,
  SimulationConfig,
  AppSettings,
  TrackingAlgorithm,
  BenchmarkContext,
} from '../types';
import { PRESET_SCENARIOS } from '../services/simulationEngine';
import { runBenchmark, benchmarkToCsv } from '../services/benchmarkRunner';

interface BenchmarkViewProps {
  isSimRunning: boolean;
  activeConfig: SimulationConfig;
  settings: AppSettings;
  benchmarkContext: BenchmarkContext;
  onSaveBenchmarkContext: (
    result: BenchmarkResult,
    config: SimulationConfig,
    seed: number,
    configSource: 'preset' | 'custom',
    selectedPresetIndex: number,
    configDisplayName: string,
  ) => void;
  onRunBenchmarkAlgorithm: (config: SimulationConfig, seed: number, algorithm: TrackingAlgorithm) => void;
}

type ConfigSource = 'preset' | 'custom';

export const BenchmarkView: React.FC<BenchmarkViewProps> = ({
  isSimRunning,
  activeConfig,
  settings,
  benchmarkContext,
  onSaveBenchmarkContext,
  onRunBenchmarkAlgorithm,
}) => {
  const [configSource, setConfigSource] = useState<ConfigSource>(
    benchmarkContext.configSource === 'custom' ? 'custom' : 'preset'
  );
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(
    benchmarkContext.selectedPresetIndex ?? 0
  );
  const [snapshotConfig, setSnapshotConfig] = useState<SimulationConfig | null>(
    benchmarkContext.configSource === 'custom' ? benchmarkContext.config : null
  );
  const [snapshotSettings, setSnapshotSettings] = useState<AppSettings | null>(null);
  const [hasSnapshot, setHasSnapshot] = useState<boolean>(
    benchmarkContext.configSource === 'custom' && benchmarkContext.config !== null
  );
  const [seed, setSeed] = useState<number>(benchmarkContext.seed ?? 42);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<string>('');
  const [result, setResult] = useState<BenchmarkResult | null>(benchmarkContext.result);

  const scenarios = PRESET_SCENARIOS;

  // Resolve the config to use for benchmarking
  const resolvedConfig: SimulationConfig = (() => {
    if (configSource === 'custom') {
      return snapshotConfig ?? activeConfig;
    }
    return scenarios[selectedPresetIndex]?.config ?? scenarios[0].config;
  })();

  const resolvedSettings: AppSettings = snapshotSettings ?? settings;

  const configSourceLabel = configSource === 'custom'
    ? (hasSnapshot ? 'Source: Custom Configuration (snapshot)' : 'Source: Current Simulation Config')
    : `Preset: ${scenarios[selectedPresetIndex]?.title ?? 'N/A'}`;

  const randomizeSeed = () => {
    setSeed(Math.floor(Math.random() * 999999) + 1);
  };

  const handleUseCurrentConfig = () => {
    setSnapshotConfig({ ...activeConfig });
    setSnapshotSettings({ ...settings });
    setHasSnapshot(true);
  };

  const handleRunBenchmark = () => {
    if (isRunning) return;
    setIsRunning(true);
    setResult(null);
    setProgress('Initializing deterministic environment...');

    setTimeout(() => {
      try {
        setProgress('Running AI Centroid...');
        setTimeout(() => {
          try {
            const benchmarkResult = runBenchmark({
              simulationConfig: resolvedConfig,
              settings: resolvedSettings,
              seed,
              algorithms: ['AI Centroid', 'Kalman Predictive', 'Deep Beacon'],
            });

            setResult(benchmarkResult);
            const configDisplayName = configSource === 'custom'
              ? 'Custom Configuration'
              : scenarios[selectedPresetIndex]?.title ?? 'Preset';
            onSaveBenchmarkContext(
              benchmarkResult,
              resolvedConfig,
              seed,
              configSource,
              selectedPresetIndex,
              configDisplayName,
            );
            setProgress('Benchmark complete.');
          } catch (err) {
            setProgress(`Error: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setIsRunning(false);
          }
        }, 50);
      } catch (err) {
        setProgress(`Error: ${err instanceof Error ? err.message : String(err)}`);
        setIsRunning(false);
      }
    }, 50);
  };

  const handleExportCsv = () => {
    if (!result) return;
    const csv = benchmarkToCsv(result);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `FSOC_Benchmark_Seed${seed}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const winnerAlgo = result?.comparison.recommendation;
  const allAlgorithms: TrackingAlgorithm[] = ['AI Centroid', 'Kalman Predictive', 'Deep Beacon'];

  const disturbanceFlags: string[] = [];
  if (resolvedConfig.disturbances.sensorNoise) disturbanceFlags.push('Sensor Noise');
  if (resolvedConfig.disturbances.vibration) disturbanceFlags.push('Vibration');
  if (resolvedConfig.disturbances.atmosphericTurbulence) disturbanceFlags.push('Turbulence');
  if (resolvedConfig.disturbances.motionJitter) disturbanceFlags.push('Motion Jitter');
  const disturbanceSummary = disturbanceFlags.length > 0
    ? `${disturbanceFlags.join(', ')} @ ${resolvedConfig.disturbances.intensity}%`
    : 'None';

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto mt-14 md:mt-0 tech-grid-bg relative p-4 md:p-8 select-none pb-16">
      {/* Header */}
      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-[#564338]/40 pb-4 gap-4">
        <div>
          <h1 className="font-['Hanken_Grotesk'] text-2xl md:text-3xl text-[#e0e3e6] font-bold tracking-tight">
            ALGORITHM BENCHMARK
          </h1>
          <p className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] tracking-widest uppercase mt-1">
            Deterministic Comparison &bull; AI Centroid vs Kalman Predictive vs Deep Beacon
          </p>
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Test Source */}
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-4 flex flex-col gap-3">
          <h3 className="font-['JetBrains_Mono'] text-[10px] text-[#ffb68d] uppercase tracking-widest font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">science</span>
            Test Source
          </h3>

          {/* Radio buttons */}
          <div className="flex gap-4 font-['JetBrains_Mono'] text-[10px]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="configSource"
                value="preset"
                checked={configSource === 'preset'}
                onChange={() => setConfigSource('preset')}
                className="accent-[#ffb68d]"
              />
              <span className="text-[#e0e3e6]">Preset Scenario</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="configSource"
                value="custom"
                checked={configSource === 'custom'}
                onChange={() => setConfigSource('custom')}
                className="accent-[#ffb68d]"
              />
              <span className="text-[#e0e3e6]">Custom Config</span>
            </label>
          </div>

          {configSource === 'preset' ? (
            <select
              value={selectedPresetIndex}
              onChange={(e) => setSelectedPresetIndex(parseInt(e.target.value))}
              className="bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2.5 rounded focus:border-[#ffb68d] focus:outline-none"
            >
              {scenarios.map((s, i) => (
                <option key={s.id} value={i}>
                  {s.title} — {s.description}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleUseCurrentConfig}
                className="w-full py-2 bg-[#323538] hover:bg-[#363a3c] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-[10px] uppercase rounded transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[14px]">download</span>
                Use Current Simulation Config
              </button>
              {hasSnapshot && (
                <div className="font-['JetBrains_Mono'] text-[9px] text-[#42e09c]">
                  Snapshot captured. Later changes to the live config will not affect this benchmark.
                </div>
              )}
              {!hasSnapshot && (
                <div className="font-['JetBrains_Mono'] text-[9px] text-[#a58c7f]">
                  Captures a snapshot of the current simulation config.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Seed Input */}
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-4 flex flex-col gap-3">
          <h3 className="font-['JetBrains_Mono'] text-[10px] text-[#ffb68d] uppercase tracking-widest font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">key</span>
            Random Seed
          </h3>
          <div className="flex gap-2">
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value) || 1)}
              className="flex-1 bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2.5 rounded focus:border-[#ffb68d] focus:outline-none"
            />
            <button
              onClick={randomizeSeed}
              className="px-3 py-2 bg-[#323538] hover:bg-[#363a3c] border border-[#564338] text-[#ddc1b3] font-['JetBrains_Mono'] text-xs rounded transition-colors flex items-center gap-1"
              title="Randomize seed"
            >
              <span className="material-symbols-outlined text-[14px]">casino</span>
            </button>
          </div>
          <div className="font-['JetBrains_Mono'] text-[9px] text-[#a58c7f] mt-1">
            Same seed + same config = identical environment for all three algorithms
          </div>
        </div>

        {/* Run Button */}
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded p-4 flex flex-col gap-3">
          <h3 className="font-['JetBrains_Mono'] text-[10px] text-[#ffb68d] uppercase tracking-widest font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">play_arrow</span>
            Execute
          </h3>
          <button
            onClick={handleRunBenchmark}
            disabled={isRunning || isSimRunning}
            className={`w-full py-3 rounded font-['JetBrains_Mono'] text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              isRunning || isSimRunning
                ? 'bg-[#323538] text-[#a58c7f] border border-[#564338] cursor-not-allowed'
                : 'bg-[#ffb68d] hover:bg-[#ff8a3d] text-[#532200] shadow-[0_0_15px_rgba(255,182,141,0.25)] cursor-pointer'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isRunning ? 'hourglass_top' : 'science'}
            </span>
            {isRunning ? 'RUNNING...' : 'RUN BENCHMARK'}
          </button>
          {isSimRunning && (
            <div className="font-['JetBrains_Mono'] text-[9px] text-[#ffb4ab]">
              Stop the live simulation first
            </div>
          )}
          {progress && (
            <div className="font-['JetBrains_Mono'] text-[10px] text-[#42e09c] mt-1">
              {progress}
            </div>
          )}
        </div>
      </div>

      {/* Configuration Under Test */}
      <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#564338]/40">
          <span className="material-symbols-outlined text-[16px] text-[#ffb68d]">info</span>
          <h2 className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase tracking-widest font-bold">
            CONFIGURATION UNDER TEST
          </h2>
          <span className="font-['JetBrains_Mono'] text-[9px] text-[#a58c7f] ml-auto">
            {configSourceLabel}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-['JetBrains_Mono'] text-[10px]">
          <div>
            <span className="text-[#a58c7f] uppercase block mb-0.5">Targets</span>
            <span className="text-[#e0e3e6] font-bold">{resolvedConfig.targetCount}</span>
          </div>
          <div>
            <span className="text-[#a58c7f] uppercase block mb-0.5">Speed</span>
            <span className="text-[#e0e3e6] font-bold">Mach {resolvedConfig.targetSpeedMach}</span>
          </div>
          <div>
            <span className="text-[#a58c7f] uppercase block mb-0.5">Trajectory</span>
            <span className="text-[#e0e3e6] font-bold">{resolvedConfig.trajectory}</span>
          </div>
          <div>
            <span className="text-[#a58c7f] uppercase block mb-0.5">FOV</span>
            <span className="text-[#e0e3e6] font-bold">{resolvedConfig.cameraFov}°</span>
          </div>
          <div>
            <span className="text-[#a58c7f] uppercase block mb-0.5">Disturbance</span>
            <span className="text-[#e0e3e6] font-bold">{disturbanceSummary}</span>
          </div>
          <div>
            <span className="text-[#a58c7f] uppercase block mb-0.5">Duration</span>
            <span className="text-[#e0e3e6] font-bold">{resolvedConfig.durationSec}s</span>
          </div>
        </div>
        <div className="mt-2 font-['JetBrains_Mono'] text-[9px] text-[#a58c7f]">
          Presets are standardized test configurations. You can also benchmark any custom configuration.
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Algorithm Comparison Table */}
          <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 mb-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#564338]/40">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#ff8a3d]">compare</span>
                <h2 className="font-['JetBrains_Mono'] text-xs text-[#ddc1b3] uppercase tracking-widest font-bold">
                  COMPARISON RESULTS
                </h2>
              </div>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-2 bg-[#323538] hover:bg-[#363a3c] border border-[#564338] text-[#e0e3e6] px-3 py-1.5 rounded font-['JetBrains_Mono'] text-[10px] uppercase cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">file_download</span>
                CSV
              </button>
            </div>

            {/* Metrics Table */}
            <div className="overflow-x-auto">
              <table className="w-full font-['JetBrains_Mono'] text-[10px]">
                <thead>
                  <tr className="border-b border-[#564338]/40">
                    <th className="text-left py-2 px-3 text-[#a58c7f] uppercase tracking-wider">Metric</th>
                    {allAlgorithms.map((algo) => (
                      <th
                        key={algo}
                        className={`text-right py-2 px-3 uppercase tracking-wider ${
                          algo === winnerAlgo ? 'text-[#42e09c] font-bold' : 'text-[#a58c7f]'
                        }`}
                      >
                        {algo}
                        {algo === winnerAlgo && (
                          <span className="ml-1 text-[8px] bg-[#42e09c]/20 text-[#42e09c] px-1 py-0.5 rounded">
                            WIN
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Avg Error (deg)', key: 'avgTotalError' as const, fmt: (v: number) => v.toFixed(3), lower: true },
                    { label: 'Max Error (deg)', key: 'maxTotalError' as const, fmt: (v: number) => v.toFixed(3), lower: true },
                    { label: 'Lock Retention (%)', key: 'lockRetentionPct' as const, fmt: (v: number) => v.toFixed(1), lower: false },
                    { label: 'Acq Time (s)', key: 'acquisitionTimeSec' as const, fmt: (v: number) => v < Infinity ? v.toFixed(2) : 'N/A', lower: true },
                    { label: 'Avg Confidence (%)', key: 'avgConfidence' as const, fmt: (v: number) => v.toFixed(1), lower: false },
                    { label: 'Score', key: '_score' as const, fmt: (v: number) => (v * 100).toFixed(1), lower: false },
                  ].map((row) => {
                    const values = allAlgorithms.map((algo) => {
                      const r = result.comparison.results.find((x) => x.algorithm === algo);
                      const sr = result.comparison.scoredResults.find((x) => x.algorithm === algo);
                      return { algo, metrics: r?.metrics, scored: sr };
                    });

                    const numValues = values
                      .filter((v) => {
                        if (row.key === '_score') return true;
                        return v.metrics && (row.key !== 'acquisitionTimeSec' || v.metrics.acquisitionTimeSec < Infinity);
                      })
                      .map((v) => {
                        if (row.key === '_score') return v.scored?.score ?? 0;
                        return v.metrics ? v.metrics[row.key] : 0;
                      });

                    const bestVal = numValues.length > 0
                      ? (row.lower ? Math.min(...numValues) : Math.max(...numValues))
                      : 0;

                    return (
                      <tr key={row.label} className="border-b border-[#564338]/20 hover:bg-[#272a2d]/50">
                        <td className="py-2 px-3 text-[#ddc1b3]">{row.label}</td>
                        {values.map(({ algo, metrics, scored }) => {
                          let displayVal: string;
                          let rawVal: number;
                          if (row.key === '_score') {
                            rawVal = scored?.score ?? 0;
                            displayVal = row.fmt(rawVal);
                          } else {
                            rawVal = metrics ? metrics[row.key] : 0;
                            displayVal = metrics
                              ? row.fmt(rawVal)
                              : 'N/A';
                          }
                          const isBest = numValues.length > 1 && rawVal === bestVal;
                          return (
                            <td
                              key={algo}
                              className={`py-2 px-3 text-right ${
                                isBest
                                  ? 'text-[#42e09c] font-bold'
                                  : algo === winnerAlgo
                                  ? 'text-[#e0e3e6]'
                                  : 'text-[#a58c7f]'
                              }`}
                            >
                              {displayVal}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recommendation */}
          <div className="bg-[#1d2022] border border-[#42e09c]/30 rounded-lg p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[20px] text-[#42e09c]">psychology</span>
              <h2 className="font-['JetBrains_Mono'] text-xs text-[#42e09c] uppercase tracking-widest font-bold">
                RECOMMENDATION
              </h2>
            </div>
            <div className="font-['Hanken_Grotesk'] text-lg text-[#e0e3e6] font-bold mb-2">
              {result.comparison.recommendation}
            </div>
            <p className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] leading-relaxed mb-4">
              {result.comparison.recommendationReason}
            </p>
            
            {/* Run Recommended Algorithm */}
            <button
              onClick={() => onRunBenchmarkAlgorithm(resolvedConfig, seed, result.comparison.recommendation)}
              disabled={isSimRunning || isRunning}
              className="w-full py-3 rounded font-['JetBrains_Mono'] text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 bg-[#42e09c] hover:bg-[#38c98a] text-[#0d2b1a] shadow-[0_0_15px_rgba(66,224,156,0.25)] cursor-pointer disabled:bg-[#323538] disabled:text-[#a58c7f] disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              RUN RECOMMENDED ALGORITHM
            </button>
            
            <div className="font-['JetBrains_Mono'] text-[9px] text-[#a58c7f] mt-2 text-center">
              Launches live simulation with benchmark config + seed + recommended algorithm
            </div>

            {/* Run Other Algorithms */}
            <div className="mt-4 pt-4 border-t border-[#564338]/40">
              <div className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase tracking-wider mb-2">
                Run Other Algorithms (Same Config + Seed)
              </div>
              <div className="flex flex-wrap gap-2">
                {allAlgorithms.map((algo) => (
                  <button
                    key={algo}
                    onClick={() => onRunBenchmarkAlgorithm(resolvedConfig, seed, algo)}
                    disabled={isSimRunning || isRunning || algo === result.comparison.recommendation}
                    className={`px-3 py-2 rounded font-['JetBrains_Mono'] text-[10px] uppercase transition-all flex items-center justify-center gap-1 ${
                      algo === result.comparison.recommendation
                        ? 'bg-[#42e09c]/20 border border-[#42e09c] text-[#42e09c] cursor-default'
                        : isSimRunning || isRunning
                        ? 'bg-[#323538] text-[#a58c7f] border border-[#564338] cursor-not-allowed'
                        : 'bg-[#323538] hover:bg-[#363a3c] border border-[#564338] text-[#e0e3e6] cursor-pointer'
                    }`}
                  >
                    {algo}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#564338]/40">
              <span className="material-symbols-outlined text-[18px] text-[#ffb68d]">bar_chart</span>
              <h2 className="font-['JetBrains_Mono'] text-xs text-[#ddc1b3] uppercase tracking-widest font-bold">
                SCORE BREAKDOWN
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {result.comparison.scoredResults.map((sr) => (
                <div
                  key={sr.algorithm}
                  className={`border rounded p-4 ${
                    sr.algorithm === winnerAlgo
                      ? 'border-[#42e09c]/50 bg-[#42e09c]/5'
                      : 'border-[#564338]/40 bg-[#191c1e]'
                  }`}
                >
                  <div className="font-['JetBrains_Mono'] text-[11px] text-[#e0e3e6] font-bold mb-3">
                    {sr.algorithm}
                    {sr.algorithm === winnerAlgo && (
                      <span className="ml-2 text-[8px] bg-[#42e09c]/20 text-[#42e09c] px-1.5 py-0.5 rounded">
                        BEST
                      </span>
                    )}
                  </div>
                  <div className="font-['JetBrains_Mono'] text-2xl text-[#ffb68d] font-bold mb-3">
                    {(sr.score * 100).toFixed(1)}
                    <span className="text-[10px] text-[#a58c7f] ml-1">/ 100</span>
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(sr.breakdown).map(([key, val]) => (
                      <div key={key} className="flex justify-between font-['JetBrains_Mono'] text-[9px]">
                        <span className="text-[#a58c7f] uppercase">{key.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="text-[#ddc1b3]">{((val as number) * 100).toFixed(1)}pts</span>
                      </div>
                    ))}
                  </div>
                  {/* Score bar */}
                  <div className="mt-3 h-1.5 bg-[#323538] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        sr.algorithm === winnerAlgo ? 'bg-[#42e09c]' : 'bg-[#ffb68d]'
                      }`}
                      style={{ width: `${sr.score * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!result && !isRunning && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="material-symbols-outlined text-[48px] text-[#564338] mb-4 block">science</span>
            <p className="font-['JetBrains_Mono'] text-xs text-[#a58c7f]">
              Configure test source and seed, then click RUN BENCHMARK
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
