/**
 * FSOC Track Lab — Phase 3B-2: Controller and Tracker Optimization
 *
 * Systematic parameter grid search for PID, Kalman, and Enhanced Beacon.
 * Run with: npx tsx src/services/__tests__/optimizer.ts
 */

import { AppSettings, TrackingAlgorithm, BenchmarkRunMetrics, TelemetryPoint } from '../../types';
import { BENCHMARK_SCENARIOS, getScenarioById } from '../benchmarkScenarios';
import { runBenchmarkScenarioRun } from '../benchmarkRunner';
import { DEFAULT_SETTINGS } from '../simulationEngine';

// ═══════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════

const PID_KP_GRID = [1.8, 2.2, 2.6, 3.0];
const PID_KI_GRID = [0.12, 0.20, 0.30, 0.40];
const PID_KD_GRID = [0.30, 0.45, 0.60];

const KALMAN_Q_SCALE_GRID = [0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0, 200.0];
const KALMAN_R_BASE_GRID = [0.1, 0.5, 1.0, 2.0, 5.0];
const KALMAN_P_INIT_GRID = [10, 50, 100, 500];

const EMA_ALPHA_GRID = [0.25, 0.35, 0.45, 0.55, 0.65];

const TEST_SCENARIOS = ['S01', 'S05', 'S08', 'S09', 'S13', 'S15'];
const KALMAN_SCENARIOS = ['S01', 'S02', 'S03', 'S13'];
const ALL_SCENARIOS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S06-MAX', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S16', 'S17'];

function makeSettings(overrides: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
    kalmanConfig: overrides.kalmanConfig ?? DEFAULT_SETTINGS.kalmanConfig,
    enhancedBeaconConfig: overrides.enhancedBeaconConfig ?? DEFAULT_SETTINGS.enhancedBeaconConfig,
  };
}

function runScenario(algo: TrackingAlgorithm, scenarioId: string, settings: AppSettings): BenchmarkRunMetrics {
  const scenario = getScenarioById(scenarioId);
  if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);
  const result = runBenchmarkScenarioRun(scenario, algo, settings);
  return result.metrics;
}

function runScenarioFull(algo: TrackingAlgorithm, scenarioId: string, settings: AppSettings): { metrics: BenchmarkRunMetrics; history: TelemetryPoint[] } {
  const scenario = getScenarioById(scenarioId);
  if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);
  const result = runBenchmarkScenarioRun(scenario, algo, settings);
  return { metrics: result.metrics, history: result.telemetryHistory };
}

// ═══════════════════════════════════════════════════════════
// Safety Analysis (Part B)
// ═══════════════════════════════════════════════════════════

function analyzeSafety(history: TelemetryPoint[]): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  if (history.length < 10) return { pass: false, notes: ['Insufficient history'] };

  // Check for sustained oscillation: count sign changes of panError
  const panErrors = history.map(h => h.panError);
  let crossings = 0;
  for (let i = 2; i < panErrors.length; i++) {
    if (panErrors[i - 1] * panErrors[i] < 0) crossings++;
  }
  const crossingRate = crossings / (panErrors.length * 0.016);
  if (crossingRate > 2.0) {
    notes.push(`Oscillation: ${crossingRate.toFixed(1)} crossings/s`);
    pass = false;
  }

  // Check overshoot: max error vs initial error
  const errors = history.map(h => h.totalError);
  const initialError = errors.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  const peakError = Math.max(...errors);
  if (initialError > 0.5) {
    const overshootRatio = peakError / initialError;
    if (overshootRatio > 4.0) {
      notes.push(`Overshoot: ${overshootRatio.toFixed(1)}x`);
    }
  }

  // Check for gimbal instability: velocity variance
  const panVels = history.map(h => h.panError);
  const meanVel = panVels.reduce((a, b) => a + b, 0) / panVels.length;
  const varVel = panVels.reduce((a, b) => a + (b - meanVel) ** 2, 0) / panVels.length;
  if (varVel > 10) {
    notes.push(`High pan variance: ${varVel.toFixed(1)}`);
  }

  // Check convergence: time to reach <1.2° total error
  let convergenceTime = Infinity;
  for (const h of history) {
    if (h.totalError < 1.2) {
      convergenceTime = h.timeSec;
      break;
    }
  }
  if (convergenceTime > 10) {
    notes.push(`Slow convergence: ${convergenceTime.toFixed(1)}s`);
  }

  return { pass, notes };
}

// ═══════════════════════════════════════════════════════════
// PART A-B: PID Grid Search
// ═══════════════════════════════════════════════════════════

function runPidGridSearch(): { results: any[]; bestSettings: AppSettings } {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  PART A-B: PID Parameter Grid Search                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Grid: ${PID_KP_GRID.length}×${PID_KI_GRID.length}×${PID_KD_GRID.length} = ${PID_KP_GRID.length * PID_KI_GRID.length * PID_KD_GRID.length} combinations`);
  console.log(`Scenarios: ${TEST_SCENARIOS.join(', ')}`);

  const results: any[] = [];
  let count = 0;
  const total = PID_KP_GRID.length * PID_KI_GRID.length * PID_KD_GRID.length;

  for (const kp of PID_KP_GRID) {
    for (const ki of PID_KI_GRID) {
      for (const kd of PID_KD_GRID) {
        count++;
        const settings = makeSettings({ pidKp: kp, pidKi: ki, pidKd: kd });
        const scenarios: Record<string, BenchmarkRunMetrics> = {};
        let safetyPass = true;
        const safetyNotes: string[] = [];

        for (const sid of TEST_SCENARIOS) {
          try {
            const { metrics, history } = runScenarioFull('AI Centroid', sid, settings);
            scenarios[sid] = metrics;
            const safety = analyzeSafety(history);
            if (!safety.pass) safetyPass = false;
            safetyNotes.push(...safety.notes.map(n => `${sid}: ${n}`));
          } catch {
            safetyPass = false;
            safetyNotes.push(`${sid}: RUN ERROR`);
          }
        }

        const s01rmse = scenarios['S01']?.rmseTrackingErrorPx ?? Infinity;
        const s01ss = scenarios['S01']?.steadyStateRmsePx ?? Infinity;
        const marker = safetyPass ? '✓' : '✗';
        console.log(`  [${count}/${total}] ${marker} Kp=${kp} Ki=${ki} Kd=${kd} | S01=${s01rmse.toFixed(1)} SS=${s01ss.toFixed(1)} | ${safetyNotes.length > 0 ? safetyNotes[0] : 'safe'}`);

        results.push({
          label: `PID kp=${kp} ki=${ki} kd=${kd}`,
          params: { kp, ki, kd },
          scenarios,
          safetyPass,
          safetyNotes,
        });
      }
    }
  }

  // Score safe results: weighted by scenario importance
  const safeResults = results.filter((r: any) => r.safetyPass);
  console.log(`\n  Safe configurations: ${safeResults.length}/${results.length}`);

  const scored = safeResults.map((r: any) => {
    const s01 = r.scenarios['S01']?.rmseTrackingErrorPx ?? Infinity;
    const s05 = r.scenarios['S05']?.rmseTrackingErrorPx ?? Infinity;
    const s08 = r.scenarios['S08']?.rmseTrackingErrorPx ?? Infinity;
    const s09 = r.scenarios['S09']?.rmseTrackingErrorPx ?? Infinity;
    const s13 = r.scenarios['S13']?.rmseTrackingErrorPx ?? Infinity;
    const s15 = r.scenarios['S15']?.rmseTrackingErrorPx ?? Infinity;
    const loss = Math.max(...TEST_SCENARIOS.map(s => r.scenarios[s]?.targetLossPercent ?? 0));
    // Penalize heavy loss
    const lossPenalty = loss > 5 ? 100 : 0;
    const score = s01 * 0.25 + s05 * 0.15 + s08 * 0.15 + s09 * 0.15 + s13 * 0.15 + s15 * 0.15 + lossPenalty;
    return { ...r, score };
  }).sort((a: any, b: any) => a.score - b.score);

  if (scored.length > 0) {
    console.log('\n  Top 5 PID configurations (weighted score):');
    for (let i = 0; i < Math.min(5, scored.length); i++) {
      const r = scored[i];
      const vals = TEST_SCENARIOS.map(s => `${s}=${r.scenarios[s]?.rmseTrackingErrorPx.toFixed(1) ?? '?'}`).join(' ');
      console.log(`    ${i + 1}. ${r.label} | Score=${r.score.toFixed(1)} | ${vals}`);
    }
  }

  const best = scored[0];
  const bestSettings = best
    ? makeSettings({ pidKp: best.params.kp, pidKi: best.params.ki, pidKd: best.params.kd })
    : DEFAULT_SETTINGS;

  return { results: scored, bestSettings };
}

// ═══════════════════════════════════════════════════════════
// PART C: Kalman Optimization
// ═══════════════════════════════════════════════════════════

function runKalmanOptimization(pidSettings: AppSettings): AppSettings {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  PART C: Kalman Filter Optimization                 ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // Sweep Q scale (the most impactful parameter)
  console.log('\n  --- Q Scale Sweep (S01, Kalman Predictive) ---');
  let bestQ = 1.0;
  let bestQScore = Infinity;

  for (const qScale of KALMAN_Q_SCALE_GRID) {
    const settings = makeSettings({
      ...pidSettings,
      kalmanConfig: { ...pidSettings.kalmanConfig, processNoiseQScale: qScale },
    });

    let totalRmse = 0;
    let totalLoss = 0;
    let count = 0;

    for (const sid of KALMAN_SCENARIOS) {
      try {
        const m = runScenario('Kalman Predictive', sid, settings);
        totalRmse += m.rmseTrackingErrorPx;
        totalLoss += m.targetLossPercent;
        count++;
      } catch { /* skip */ }
    }

    const avgRmse = count > 0 ? totalRmse / count : Infinity;
    const avgLoss = count > 0 ? totalLoss / count : 0;
    const lossPenalty = avgLoss > 5 ? 50 : 0;
    const score = avgRmse + lossPenalty;

    console.log(`    Q=${qScale.toFixed(1).padStart(5)} | Avg RMSE=${avgRmse.toFixed(1)} Avg Loss=${avgLoss.toFixed(1)}% | Score=${score.toFixed(1)}`);

    if (score < bestQScore) {
      bestQScore = score;
      bestQ = qScale;
    }
  }

  console.log(`\n    Best Q scale: ${bestQ}`);

  // Sweep R base with best Q
  console.log('\n  --- R Base Sweep (best Q, S01) ---');
  let bestR = 0.5;
  let bestRScore = Infinity;

  for (const rBase of KALMAN_R_BASE_GRID) {
    const settings = makeSettings({
      ...pidSettings,
      kalmanConfig: { ...pidSettings.kalmanConfig, processNoiseQScale: bestQ, measurementNoiseRBase: rBase },
    });

    let totalRmse = 0;
    let count = 0;
    for (const sid of KALMAN_SCENARIOS) {
      try {
        const m = runScenario('Kalman Predictive', sid, settings);
        totalRmse += m.rmseTrackingErrorPx;
        count++;
      } catch { /* skip */ }
    }

    const avgRmse = count > 0 ? totalRmse / count : Infinity;
    console.log(`    R=${rBase.toFixed(1).padStart(5)} | Avg RMSE=${avgRmse.toFixed(1)}`);

    if (avgRmse < bestRScore) {
      bestRScore = avgRmse;
      bestR = rBase;
    }
  }

  console.log(`\n    Best R base: ${bestR}`);

  // Sweep initial P with best Q, R
  console.log('\n  --- Initial P Sweep (best Q, R, S01) ---');
  let bestP = 100;
  let bestPScore = Infinity;

  for (const pInit of KALMAN_P_INIT_GRID) {
    const settings = makeSettings({
      ...pidSettings,
      kalmanConfig: { processNoiseQScale: bestQ, measurementNoiseRBase: bestR, initialCovarianceP: pInit },
    });

    let totalRmse = 0;
    let count = 0;
    for (const sid of KALMAN_SCENARIOS) {
      try {
        const m = runScenario('Kalman Predictive', sid, settings);
        totalRmse += m.rmseTrackingErrorPx;
        count++;
      } catch { /* skip */ }
    }

    const avgRmse = count > 0 ? totalRmse / count : Infinity;
    console.log(`    P=${pInit.toString().padStart(5)} | Avg RMSE=${avgRmse.toFixed(1)}`);

    if (avgRmse < bestPScore) {
      bestPScore = avgRmse;
      bestP = pInit;
    }
  }

  console.log(`\n    Best initial P: ${bestP}`);

  // Final Kalman comparison on all 4 scenarios
  const kalmanSettings = makeSettings({
    ...pidSettings,
    kalmanConfig: { processNoiseQScale: bestQ, measurementNoiseRBase: bestR, initialCovarianceP: bestP },
  });

  console.log('\n  --- Kalman Before/After Comparison ---');
  console.log(`    ${'Scenario'.padEnd(8)} ${'Before RMSE'.padStart(12)} ${'After RMSE'.padStart(12)} ${'Before SS'.padStart(10)} ${'After SS'.padStart(10)}`);
  for (const sid of KALMAN_SCENARIOS) {
    const before = runScenario('Kalman Predictive', sid, pidSettings);
    const after = runScenario('Kalman Predictive', sid, kalmanSettings);
    console.log(`    ${sid.padEnd(8)} ${before.rmseTrackingErrorPx.toFixed(1).padStart(12)} ${after.rmseTrackingErrorPx.toFixed(1).padStart(12)} ${before.steadyStateRmsePx < Infinity ? before.steadyStateRmsePx.toFixed(1).padStart(10) : 'N/A'.padStart(10)} ${after.steadyStateRmsePx < Infinity ? after.steadyStateRmsePx.toFixed(1).padStart(10) : 'N/A'.padStart(10)}`);
  }

  return kalmanSettings;
}

// ═══════════════════════════════════════════════════════════
// PART D: Enhanced Beacon EMA Sweep
// ═══════════════════════════════════════════════════════════

function runEmaSweep(pidSettings: AppSettings): AppSettings {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  PART D: Enhanced Beacon EMA Parameter Sweep        ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  let bestAlpha = 0.35;
  let bestScore = Infinity;

  console.log(`\n    ${'Alpha'.padStart(6)} ${'S01 RMSE'.padStart(10)} ${'S05 RMSE'.padStart(10)} ${'S13 RMSE'.padStart(10)} ${'Score'.padStart(8)}`);

  for (const alpha of EMA_ALPHA_GRID) {
    const settings = makeSettings({
      ...pidSettings,
      enhancedBeaconConfig: { emaAlpha: alpha },
    });

    let totalScore = 0;
    let count = 0;
    let s01rmse = 0;
    let s05rmse = 0;
    let s13rmse = 0;

    for (const sid of ['S01', 'S05', 'S13']) {
      try {
        const m = runScenario('Deep Beacon', sid, settings);
        if (sid === 'S01') s01rmse = m.rmseTrackingErrorPx;
        if (sid === 'S05') s05rmse = m.rmseTrackingErrorPx;
        if (sid === 'S13') s13rmse = m.rmseTrackingErrorPx;
        totalScore += m.rmseTrackingErrorPx;
        count++;
      } catch { /* skip */ }
    }

    const avgScore = count > 0 ? totalScore / count : Infinity;
    console.log(`    ${alpha.toFixed(2).padStart(6)} ${s01rmse.toFixed(1).padStart(10)} ${s05rmse.toFixed(1).padStart(10)} ${s13rmse.toFixed(1).padStart(10)} ${avgScore.toFixed(1).padStart(8)}`);

    if (avgScore < bestScore) {
      bestScore = avgScore;
      bestAlpha = alpha;
    }
  }

  console.log(`\n    Best EMA alpha: ${bestAlpha}`);

  return makeSettings({
    ...pidSettings,
    enhancedBeaconConfig: { emaAlpha: bestAlpha },
  });
}

// ═══════════════════════════════════════════════════════════
// PART E-F: Fair Comparison Table
// ═══════════════════════════════════════════════════════════

function runFairComparison(pidSettings: AppSettings, kalmanSettings: AppSettings, beaconSettings: AppSettings): void {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  PART E-F: Fair Comparison Table                    ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const algorithms: { name: TrackingAlgorithm; settings: AppSettings }[] = [
    { name: 'AI Centroid', settings: pidSettings },
    { name: 'Kalman Predictive', settings: kalmanSettings },
    { name: 'Deep Beacon', settings: beaconSettings },
  ];

  console.log(`\n    ${'Algorithm'.padEnd(20)} ${'S01'.padStart(8)} ${'S05'.padStart(8)} ${'S08'.padStart(8)} ${'S09'.padStart(8)} ${'S13'.padStart(8)} ${'S15'.padStart(8)} ${'Loss%'.padStart(6)}`);
    console.log('    ' + '-'.repeat(82));

  for (const { name, settings } of algorithms) {
    const row: string[] = [`  ${name.padEnd(18)}`];
    let maxLoss = 0;

    for (const sid of TEST_SCENARIOS) {
      try {
        const m = runScenario(name, sid, settings);
        row.push(m.rmseTrackingErrorPx.toFixed(1).padStart(8));
        maxLoss = Math.max(maxLoss, m.targetLossPercent);
      } catch {
        row.push('ERR'.padStart(8));
      }
    }
    row.push(`${maxLoss.toFixed(1)}%`.padStart(6));
    console.log(row.join(' '));
  }
}

// ═══════════════════════════════════════════════════════════
// PART G: Full PS Benchmark
// ═══════════════════════════════════════════════════════════

function runFullPsBenchmark(pidSettings: AppSettings, kalmanSettings: AppSettings, beaconSettings: AppSettings, label: string): void {
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  PART G: Full PS Benchmark — ${label.padEnd(22)}║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);

  const algorithms: { name: TrackingAlgorithm; settings: AppSettings }[] = [
    { name: 'AI Centroid', settings: pidSettings },
    { name: 'Kalman Predictive', settings: kalmanSettings },
    { name: 'Deep Beacon', settings: beaconSettings },
  ];

  for (const { name, settings } of algorithms) {
    console.log(`\n  ═══ ${name} ═══`);
    console.log(`    ${'ID'.padEnd(8)} ${'FullRMSE'.padStart(10)} ${'PostRMSE'.padStart(10)} ${'SteadyRMSE'.padStart(11)} ${'Loss%'.padStart(6)} ${'Acq(s)'.padStart(7)} ${'Status'.padStart(6)}`);
    console.log('    ' + '-'.repeat(65));

    for (const sid of ALL_SCENARIOS) {
      try {
        const scenario = getScenarioById(sid);
        if (!scenario) continue;
        const result = runBenchmarkScenarioRun(scenario, name, settings);
        const m = result.metrics;
        const status = result.overallPass ? 'PASS' : 'FAIL';
        const postRm = m.postAcquisitionRmsePx < Infinity ? m.postAcquisitionRmsePx.toFixed(1) : 'N/A';
        const ssRm = m.steadyStateRmsePx < Infinity ? m.steadyStateRmsePx.toFixed(1) : 'N/A';
        const acq = m.acquisitionTimeSec < Infinity ? m.acquisitionTimeSec.toFixed(2) : 'N/A';
        console.log(`    ${sid.padEnd(8)} ${m.rmseTrackingErrorPx.toFixed(1).padStart(10)} ${postRm.padStart(10)} ${ssRm.padStart(11)} ${(m.targetLossPercent.toFixed(1) + '%').padStart(6)} ${acq.padStart(7)} ${status.padStart(6)}`);
      } catch {
        console.log(`    ${sid.padEnd(8)} ERROR`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// PART H: Gimbal Speed Comparison
// ═══════════════════════════════════════════════════════════

function runGimbalSpeedComparison(pidSettings: AppSettings, kalmanSettings: AppSettings, beaconSettings: AppSettings): void {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  PART H: Gimbal Speed 5°/s vs 10°/s                 ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const algorithms: { name: TrackingAlgorithm; settings: AppSettings }[] = [
    { name: 'AI Centroid', settings: pidSettings },
    { name: 'Kalman Predictive', settings: kalmanSettings },
    { name: 'Deep Beacon', settings: beaconSettings },
  ];

  for (const { name, settings } of algorithms) {
    console.log(`\n  ═══ ${name} ═══`);
    console.log(`    ${'Scenario'.padEnd(8)} ${'5°/s RMSE'.padStart(10)} ${'10°/s RMSE'.padStart(11)} ${'Δ RMSE'.padStart(10)} ${'Δ%'.padStart(8)}`);

    for (const sid of TEST_SCENARIOS) {
      try {
        const scenario = getScenarioById(sid);
        if (!scenario) continue;

        const config5 = { ...scenario.config, panSpeedLimit: 5, tiltSpeedLimit: 5 };
        const result5 = runBenchmarkScenarioRun({ ...scenario, config: config5 }, name, settings);

        const config10 = { ...scenario.config, panSpeedLimit: 10, tiltSpeedLimit: 10 };
        const result10 = runBenchmarkScenarioRun({ ...scenario, config: config10 }, name, settings);

        const rmse5 = result5.metrics.rmseTrackingErrorPx;
        const rmse10 = result10.metrics.rmseTrackingErrorPx;
        const delta = rmse5 - rmse10;
        const pct = rmse5 > 0 ? (delta / rmse5 * 100) : 0;

        console.log(`    ${sid.padEnd(8)} ${rmse5.toFixed(1).padStart(10)} ${rmse10.toFixed(1).padStart(11)} ${(delta > 0 ? '-' : '+') + Math.abs(delta).toFixed(1).padStart(9)} ${(pct > 0 ? '-' : '+') + Math.abs(pct).toFixed(1).padStart(6)}%`);
      } catch {
        console.log(`    ${sid.padEnd(8)} ERROR`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

function main(): void {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  FSOC Track Lab — Phase 3B-2 Optimization           ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\nBaseline PID: Kp=${DEFAULT_SETTINGS.pidKp} Ki=${DEFAULT_SETTINGS.pidKi} Kd=${DEFAULT_SETTINGS.pidKd}`);
  console.log(`Baseline Kalman: QScale=${DEFAULT_SETTINGS.kalmanConfig.processNoiseQScale} RBase=${DEFAULT_SETTINGS.kalmanConfig.measurementNoiseRBase} P=${DEFAULT_SETTINGS.kalmanConfig.initialCovarianceP}`);
  console.log(`Baseline EMA: alpha=${DEFAULT_SETTINGS.enhancedBeaconConfig.emaAlpha}`);
  console.log(`Gimbal speed: 5°/s (PS default)`);

  const startTime = Date.now();

  // PART A-B: PID Grid Search
  const { bestSettings: pidBestSettings } = runPidGridSearch();

  // PART C: Kalman Optimization (using best PID)
  const kalmanBestSettings = runKalmanOptimization(pidBestSettings);

  // PART D: EMA Sweep (using best PID)
  const beaconBestSettings = runEmaSweep(pidBestSettings);

  // PART E-F: Fair Comparison
  runFairComparison(pidBestSettings, kalmanBestSettings, beaconBestSettings);

  // PART G: Full PS Benchmark — Baseline
  runFullPsBenchmark(DEFAULT_SETTINGS, DEFAULT_SETTINGS, DEFAULT_SETTINGS, 'BASELINE');

  // PART G: Full PS Benchmark — Optimized
  runFullPsBenchmark(pidBestSettings, kalmanBestSettings, beaconBestSettings, 'OPTIMIZED');

  // PART H: Gimbal Speed Comparison
  runGimbalSpeedComparison(pidBestSettings, kalmanBestSettings, beaconBestSettings);

  const elapsed = Date.now() - startTime;
  console.log(`\n\n  ═══ OPTIMIZATION COMPLETE ═══`);
  console.log(`  Total time: ${(elapsed / 1000).toFixed(1)}s`);
}

main();
