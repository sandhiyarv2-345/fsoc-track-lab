/**
 * FSOC Track Lab — Phase 3C: Final Performance Optimization & Validation
 * Run with: npx tsx src/services/__tests__/phase3c.ts
 */

import { AppSettings, TrackingAlgorithm, BenchmarkRunMetrics, TelemetryPoint } from '../../types';
import { BENCHMARK_SCENARIOS, getScenarioById } from '../benchmarkScenarios';
import { runBenchmarkScenarioRun } from '../benchmarkRunner';
import { DEFAULT_SETTINGS } from '../simulationEngine';
import { groundTruthToPixel, computePixelTrackingError, computeBenchmarkMetrics } from '../benchmarkMetrics';

const ALL_SCENARIOS = ['S01','S02','S03','S04','S05','S06','S06-MAX','S07','S08','S09','S10','S11','S12','S13','S14','S15','S16','S17'];

function makeSettings(overrides: Partial<AppSettings>): AppSettings {
  return { ...DEFAULT_SETTINGS, ...overrides, kalmanConfig: overrides.kalmanConfig ?? DEFAULT_SETTINGS.kalmanConfig, enhancedBeaconConfig: overrides.enhancedBeaconConfig ?? DEFAULT_SETTINGS.enhancedBeaconConfig };
}

function run(algo: TrackingAlgorithm, sid: string, settings: AppSettings): { metrics: BenchmarkRunMetrics; history: TelemetryPoint[] } {
  const s = getScenarioById(sid);
  if (!s) throw new Error(sid);
  const r = runBenchmarkScenarioRun(s, algo, settings);
  return { metrics: r.metrics, history: r.telemetryHistory };
}

function rmse(h: TelemetryPoint[]): number {
  if (h.length === 0) return Infinity;
  return Math.sqrt(h.reduce((a, e) => a + e.totalError * e.totalError, 0) / h.length);
}

function hdr(title: string) { console.log(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}`); }

// ═══════════════════════════════════════════════════════
// 1. FEED-FORWARD INVESTIGATION
// ═══════════════════════════════════════════════════════
function part1_FeedForward() {
  hdr('1. FEED-FORWARD INVESTIGATION');

  const ffGains = [0.0, 0.2, 0.4, 0.6, 0.8];
  const scenarios = ['S01', 'S02', 'S03', 'S05', 'S13'];

  console.log(`\n  Testing FF gains: ${ffGains.join(', ')}`);
  console.log(`  Scenarios: ${scenarios.join(', ')}`);

  const results: { gain: number; data: Record<string, BenchmarkRunMetrics> }[] = [];

  for (const ff of ffGains) {
    const settings = makeSettings({ pidFeedForward: ff });
    const data: Record<string, BenchmarkRunMetrics> = {};
    for (const sid of scenarios) {
      try { data[sid] = run('AI Centroid', sid, settings).metrics; } catch {}
    }
    results.push({ gain: ff, data });
  }

  console.log(`\n    ${'FF'.padStart(4)} | ${scenarios.map(s => s.padStart(8)).join(' | ')}`);
    console.log('    ' + '-'.repeat(4 + scenarios.length * 11));

  for (const r of results) {
    const vals = scenarios.map(s => {
      const m = r.data[s];
      return m ? m.rmseTrackingErrorPx.toFixed(1).padStart(8) : '     ERR';
    });
    console.log(`    ${r.gain.toFixed(1).padStart(4)} | ${vals.join(' | ')}`);
  }

  console.log('\n  Steady-state RMSE:');
  console.log(`    ${'FF'.padStart(4)} | ${scenarios.map(s => s.padStart(8)).join(' | ')}`);
  console.log('    ' + '-'.repeat(4 + scenarios.length * 11));
  for (const r of results) {
    const vals = scenarios.map(s => {
      const m = r.data[s];
      return m && m.steadyStateRmsePx < Infinity ? m.steadyStateRmsePx.toFixed(1).padStart(8) : '     N/A';
    });
    console.log(`    ${r.gain.toFixed(1).padStart(4)} | ${vals.join(' | ')}`);
  }
}

// ═══════════════════════════════════════════════════════
// 2. INITIAL OFFSET SENSITIVITY
// ═══════════════════════════════════════════════════════
function part2_OffsetSensitivity() {
  hdr('2. INITIAL OFFSET SENSITIVITY');

  const offsets = [0, 0.1, 0.25, 0.5];
  const scenarios = ['S01', 'S05', 'S08', 'S13'];

  console.log(`\n  Testing offsets: ${offsets.map(o => o + '°').join(', ')}`);

  for (const algo of ['AI Centroid', 'Kalman Predictive', 'Deep Beacon'] as TrackingAlgorithm[]) {
    console.log(`\n  ═══ ${algo} ═══`);
    console.log(`    ${'Offset'.padStart(7)} | ${scenarios.map(s => s.padStart(8)).join(' | ')}`);
    console.log('    ' + '-'.repeat(7 + scenarios.length * 11));

    for (const offset of offsets) {
      const settings = makeSettings({});
      // Run with different initial target azimuth by modifying scenario config
      const row: string[] = [`  ${(offset + '°').padStart(5)}`];
      for (const sid of scenarios) {
        try {
          const s = getScenarioById(sid)!;
          const modScenario = {
            ...s,
            config: {
              ...s.config,
              initialTargetAzimuth: offset,
            }
          };
          const r = runBenchmarkScenarioRun(modScenario, algo, settings);
          row.push(r.metrics.rmseTrackingErrorPx.toFixed(1).padStart(8));
        } catch {
          row.push('ERR'.padStart(8));
        }
      }
      console.log(row.join(' | '));
    }

    console.log(`\n    Steady-state:`);
    console.log(`    ${'Offset'.padStart(7)} | ${scenarios.map(s => s.padStart(8)).join(' | ')}`);
    console.log('    ' + '-'.repeat(7 + scenarios.length * 11));
    for (const offset of offsets) {
      const settings = makeSettings({});
      const row: string[] = [`  ${(offset + '°').padStart(5)}`];
      for (const sid of scenarios) {
        try {
          const s = getScenarioById(sid)!;
          const modScenario = { ...s, config: { ...s.config, initialTargetAzimuth: offset } };
          const r = runBenchmarkScenarioRun(modScenario, algo, settings);
          const ss = r.metrics.steadyStateRmsePx;
          row.push(ss < Infinity ? ss.toFixed(1).padStart(8) : '     N/A');
        } catch {
          row.push('ERR'.padStart(8));
        }
      }
      console.log(row.join(' | '));
    }
  }
}

// ═══════════════════════════════════════════════════════
// 3. ACQUISITION-WINDOW ANALYSIS
// ═══════════════════════════════════════════════════════
function part3_AcquisitionWindow() {
  hdr('3. ACQUISITION-WINDOW RMSE DECOMPOSITION');

  const scenarios = ['S01', 'S02', 'S03', 'S05', 'S13'];
  const algorithms: TrackingAlgorithm[] = ['AI Centroid', 'Kalman Predictive', 'Deep Beacon'];

  for (const algo of algorithms) {
    console.log(`\n  ═══ ${algo} ═══`);
    console.log(`    ${'Scenario'.padEnd(8)} ${'Full RMSE'.padStart(10)} ${'Acq Phase'.padStart(10)} ${'Post-Acq'.padStart(10)} ${'Steady'.padStart(10)} ${'Acq Frames'.padStart(11)}`);
    console.log('    ' + '-'.repeat(65));

    for (const sid of scenarios) {
      try {
        const { metrics, history } = run(algo, sid, DEFAULT_SETTINGS);
        const totalFrames = history.length;

        // Acquisition phase: from frame 0 to first LOCKED frame
        let acqEnd = totalFrames;
        for (let i = 0; i < totalFrames; i++) {
          if (history[i].status === 'LOCKED') { acqEnd = i; break; }
        }

        // Steady state: last 60% of frames after acquisition
        const ssStart = Math.floor(acqEnd + (totalFrames - acqEnd) * 0.4);

        const acqErrors = history.slice(0, acqEnd).map(h => h.totalError);
        const postErrors = history.slice(acqEnd).map(h => h.totalError);
        const ssErrors = history.slice(ssStart).map(h => h.totalError);

        const acqRmse = acqErrors.length > 0 ? Math.sqrt(acqErrors.reduce((a, e) => a + e * e, 0) / acqErrors.length) : 0;
        const postRmse = postErrors.length > 0 ? Math.sqrt(postErrors.reduce((a, e) => a + e * e, 0) / postErrors.length) : 0;
        const ssRmse = ssErrors.length > 0 ? Math.sqrt(ssErrors.reduce((a, e) => a + e * e, 0) / ssErrors.length) : 0;

        console.log(`    ${sid.padEnd(8)} ${metrics.rmseTrackingErrorPx.toFixed(1).padStart(10)} ${acqRmse.toFixed(1).padStart(10)} ${postRmse.toFixed(1).padStart(10)} ${ssRmse.toFixed(1).padStart(10)} ${(acqEnd + '/' + totalFrames).padStart(11)}`);
      } catch {
        console.log(`    ${sid.padEnd(8)} ERROR`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
// 4. PS INTERPRETATION SAFETY — DEFERRED TO FINAL REPORT
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// 5. GIMBAL SPEED COMPARISON
// ═══════════════════════════════════════════════════════
function part5_GimbalSpeed() {
  hdr('5. GIMBAL SPEED 5°/s vs 10°/s');

  const algorithms: TrackingAlgorithm[] = ['AI Centroid', 'Kalman Predictive', 'Deep Beacon'];
  const scenarios = ['S01', 'S05', 'S08', 'S09', 'S13', 'S15'];

  for (const algo of algorithms) {
    console.log(`\n  ═══ ${algo} ═══`);
    console.log(`    ${'Scen'.padEnd(5)} ${'5°/s Full'.padStart(10)} ${'10°/s Full'.padStart(11)} ${'Δ Full'.padStart(9)} ${'5°/s SS'.padStart(9)} ${'10°/s SS'.padStart(10)} ${'Δ SS'.padStart(8)} ${'Loss 5°'.padStart(8)} ${'Loss 10°'.padStart(9)}`);
    console.log('    ' + '-'.repeat(95));

    for (const sid of scenarios) {
      try {
        const s = getScenarioById(sid)!;
        const c5 = { ...s.config, panSpeedLimit: 5, tiltSpeedLimit: 5 };
        const c10 = { ...s.config, panSpeedLimit: 10, tiltSpeedLimit: 10 };
        const r5 = runBenchmarkScenarioRun({ ...s, config: c5 }, algo, DEFAULT_SETTINGS);
        const r10 = runBenchmarkScenarioRun({ ...s, config: c10 }, algo, DEFAULT_SETTINGS);

        const f5 = r5.metrics.rmseTrackingErrorPx;
        const f10 = r10.metrics.rmseTrackingErrorPx;
        const s5 = r5.metrics.steadyStateRmsePx;
        const s10 = r10.metrics.steadyStateRmsePx;
        const df = f5 - f10;
        const ds = s5 < Infinity && s10 < Infinity ? s5 - s10 : Infinity;

        console.log(`    ${sid.padEnd(5)} ${f5.toFixed(1).padStart(10)} ${f10.toFixed(1).padStart(11)} ${(df > 0 ? '-' : '+') + Math.abs(df).toFixed(1).padStart(8)} ${s5 < Infinity ? s5.toFixed(1).padStart(9) : 'N/A'.padStart(9)} ${s10 < Infinity ? s10.toFixed(1).padStart(10) : 'N/A'.padStart(10)} ${ds < Infinity ? ((ds > 0 ? '-' : '+') + Math.abs(ds).toFixed(1).padStart(7)) : 'N/A'.padStart(8)} ${(r5.metrics.targetLossPercent.toFixed(1) + '%').padStart(8)} ${(r10.metrics.targetLossPercent.toFixed(1) + '%').padStart(9)}`);
      } catch {
        console.log(`    ${sid.padEnd(5)} ERROR`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
// 7. FULL FINAL BENCHMARK
// ═══════════════════════════════════════════════════════
function part7_FinalBenchmark() {
  hdr('7. FULL FINAL BENCHMARK');

  const algorithms: TrackingAlgorithm[] = ['AI Centroid', 'Kalman Predictive', 'Deep Beacon'];

  for (const algo of algorithms) {
    console.log(`\n  ═══ ${algo} ═══`);
    console.log(`    ${'ID'.padEnd(8)} ${'Full'.padStart(7)} ${'PostAcq'.padStart(8)} ${'Steady'.padStart(7)} ${'Max'.padStart(7)} ${'Loss%'.padStart(6)} ${'Acq(s)'.padStart(7)} ${'FPS'.padStart(5)} ${'Track'.padEnd(10)} ${'Status'.padEnd(6)}`);
    console.log('    ' + '-'.repeat(80));

    for (const sid of ALL_SCENARIOS) {
      try {
        const scenario = getScenarioById(sid)!;
        const result = runBenchmarkScenarioRun(scenario, algo, DEFAULT_SETTINGS);
        const m = result.metrics;
        const status = result.overallPass ? 'PASS' : 'FAIL';
        const ss = m.steadyStateRmsePx < Infinity ? m.steadyStateRmsePx.toFixed(1) : 'N/A';
        const post = m.postAcquisitionRmsePx < Infinity ? m.postAcquisitionRmsePx.toFixed(1) : 'N/A';
        const acq = m.acquisitionTimeSec < Infinity ? m.acquisitionTimeSec.toFixed(2) : 'N/A';
        const track = result.trackability ?? 'n/a';

        console.log(`    ${sid.padEnd(8)} ${m.rmseTrackingErrorPx.toFixed(1).padStart(7)} ${post.padStart(8)} ${ss.padStart(7)} ${m.maxTrackingErrorPx.toFixed(1).padStart(7)} ${(m.targetLossPercent.toFixed(1) + '%').padStart(6)} ${acq.padStart(7)} ${m.averageFps.toFixed(0).padStart(5)} ${track.padEnd(10)} ${status.padEnd(6)}`);
      } catch {
        console.log(`    ${sid.padEnd(8)} ERROR`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  FSOC Track Lab — Phase 3C Final Validation         ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`PID: Kp=${DEFAULT_SETTINGS.pidKp} Ki=${DEFAULT_SETTINGS.pidKi} Kd=${DEFAULT_SETTINGS.pidKd} FF=${DEFAULT_SETTINGS.pidFeedForward}`);
  console.log(`Kalman: Q=${DEFAULT_SETTINGS.kalmanConfig.processNoiseQScale} R=${DEFAULT_SETTINGS.kalmanConfig.measurementNoiseRBase} P=${DEFAULT_SETTINGS.kalmanConfig.initialCovarianceP}`);
  console.log(`EMA: α=${DEFAULT_SETTINGS.enhancedBeaconConfig.emaAlpha}`);

  const t0 = Date.now();

  part1_FeedForward();
  part2_OffsetSensitivity();
  part3_AcquisitionWindow();
  part5_GimbalSpeed();
  part7_FinalBenchmark();

  console.log(`\n  Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
