import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  NavScreen,
  SimulationConfig,
  Target,
  CameraGimbalState,
  TelemetryPoint,
  LogEntry,
  AppSettings,
  PerformanceStats,
  TrackingPipelineState,
  BenchmarkResult,
  BenchmarkContext,
  CompletedAlgorithmRun,
  TrackingAlgorithm,
  VideoTrackerTelemetry,
} from './types';
import {
  DEFAULT_CONFIG,
  DEFAULT_SETTINGS,
  initializeTargets,
  updateTargetPositions,
  initTrackingPipeline,
  runTrackingPipeline,
  generatePerformanceSummary,
} from './services/simulationEngine';
import { LandingPage } from './components/LandingPage';
import { Navigation } from './components/Navigation';
import { BottomTelemetry } from './components/BottomTelemetry';
import { DashboardView } from './components/DashboardView';
import { NewSimulationModal } from './components/NewSimulationModal';
import { World3DView } from './components/World3DView';
import { CameraView } from './components/CameraView';
import { PerformanceView } from './components/PerformanceView';
import { ScenariosLogsView } from './components/ScenariosLogsView';
import { SettingsView } from './components/SettingsView';
import { BenchmarkView } from './components/BenchmarkView';
import { VideoInputView } from './components/VideoInputView';
import { DocumentationModal } from './components/DocumentationModal';
import { SupportModal } from './components/SupportModal';

export default function App() {
  // Screen & Navigation
  const [currentScreen, setCurrentScreen] = useState<NavScreen>('landing');

  // Modals
  const [showNewSimModal, setShowNewSimModal] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showSupportModal, setShowSupportModal] = useState<boolean>(false);

  // Settings
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);

  // Simulation State
  const [activeConfig, setActiveConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [isSimRunning, setIsSimRunning] = useState<boolean>(false);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // Physical State
  const [targets, setTargets] = useState<Target[]>(() => initializeTargets(DEFAULT_CONFIG));
  const [camera, setCamera] = useState<CameraGimbalState>({
    pan: 0,
    tilt: 0,
    zoom: 1.0,
    panVelocity: 0,
    tiltVelocity: 0,
    fov: 20,
    opticalFilter: true,
    autoTracking: true,
    algorithm: 'AI Centroid',
  });

  // Tracking Pipeline State
  const trackingPipelineRef = useRef<TrackingPipelineState | null>(null);

  // Refs for simulation loop (avoid re-running effect every tick)
  const telemetryHistoryRef = useRef<TelemetryPoint[]>([]);
  const cameraAlgorithmRef = useRef<TrackingAlgorithm>('AI Centroid');
  const benchmarkContextRef = useRef<BenchmarkContext>({
    result: null,
    config: null,
    seed: null,
    timestamp: null,
    configSource: null,
    selectedPresetIndex: null,
    configDisplayName: null,
  });

  // Record genuine system-ready event on mount
  useEffect(() => {
    addLog('SYSTEM_READY', 'Application initialized. Awaiting simulation configuration.', 'info');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear video telemetry when navigating away from video input
  useEffect(() => {
    if (currentScreen !== 'videoinput') {
      setVideoTelemetry(null);
    }
  }, [currentScreen]);

  // Keep refs in sync with state
  useEffect(() => {
    cameraAlgorithmRef.current = camera.algorithm;
  }, [camera.algorithm]);

  // Telemetry & Error Stream
  const [telemetry, setTelemetry] = useState<TelemetryPoint>({
    timeSec: 0,
    formattedTime: '00:00',
    fps: 60,
    pan: 0,
    tilt: 0,
    panError: 0,
    tiltError: 0,
    totalError: 0,
    azimuthError: 0,
    elevationError: 0,
    confidence: 0,
    status: 'IDLE',
    range: 1250,
    cpuLoad: 12,
    gpuMem: 1.2,
    groundTruthAz: 0,
    groundTruthEl: 0,
    measuredAz: 0,
    measuredEl: 0,
    estimatedAz: 0,
    estimatedEl: 0,
    kalmanActive: false,
    detectionSnr: 0,
  });

  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>([]);
  const [errorHistory, setErrorHistory] = useState<{ pan: number; tilt: number; time: string }[]>([]);

  // Logs — starts empty; only real system events are recorded
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Benchmark Context (persisted across navigation)
  const [benchmarkContext, setBenchmarkContext] = useState<BenchmarkContext>({
    result: null,
    config: null,
    seed: null,
    timestamp: null,
    configSource: null,
    selectedPresetIndex: null,
    configDisplayName: null,
  });

  // Keep benchmarkContextRef in sync with state
  useEffect(() => {
    benchmarkContextRef.current = benchmarkContext;
  }, [benchmarkContext]);

  // Completed Algorithm Runs (actual live simulation telemetry)
  const [completedRuns, setCompletedRuns] = useState<CompletedAlgorithmRun[]>([]);

  // Simulation session ID — increments when a genuinely new session starts.
  // Same session = same config + seed (allows running multiple algorithms for comparison).
  // New session = different config or seed (clears old completed runs).
  const [simulationSessionId, setSimulationSessionId] = useState<number>(0);

  // Video Input telemetry — lifted from VideoInputView so BottomTelemetry can display it
  const [videoTelemetry, setVideoTelemetry] = useState<VideoTrackerTelemetry | null>(null);

  // Append new log helper
  const addLog = useCallback((event: string, data: string, type: LogEntry['type'] = 'info') => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST';
    const newEntry: LogEntry = {
      id: `log_${Date.now()}_${Math.random()}`,
      time,
      event,
      data,
      type,
    };
    setLogs((prev) => [newEntry, ...prev.slice(0, 150)]);
  }, []);

  // Save benchmark context (persists across navigation)
  const saveBenchmarkContext = useCallback((
    result: BenchmarkResult,
    config: SimulationConfig,
    seed: number,
    configSource: 'preset' | 'custom' = 'custom',
    selectedPresetIndex: number | null = null,
  ) => {
    const context: BenchmarkContext = {
      result,
      config,
      seed,
      timestamp: new Date().toISOString(),
      configSource,
      selectedPresetIndex,
      configDisplayName: config.configDisplayName || config.name,
    };
    setBenchmarkContext(context);
    addLog('BENCHMARK_COMPLETE', `Benchmark completed. Recommended: ${result.comparison.recommendation}`, 'success');
  }, [addLog]);

  // Store completed algorithm run from live simulation
  const storeCompletedRun = useCallback((
    algorithm: TrackingAlgorithm,
    config: SimulationConfig,
    seed: number,
    telemetryHistory: TelemetryPoint[],
    stats: PerformanceStats,
    metrics: any // AlgorithmMetrics from types
  ) => {
    const run: CompletedAlgorithmRun = {
      algorithm,
      config,
      configDisplayName: config.configDisplayName || config.name,
      seed,
      telemetryHistory,
      stats,
      metrics,
      timestamp: new Date().toISOString(),
    };
    setCompletedRuns((prev) => {
      // Replace existing run for same algorithm if exists (same config+seed)
      const filtered = prev.filter(r => !(r.algorithm === algorithm && r.config.id === config.id && r.seed === seed));
      return [...filtered, run];
    });
    addLog('RUN_COMPLETE', `Live run completed for ${algorithm}. Telemetry stored.`, 'success');
  }, [addLog]);

  // Start a new simulation with config
  const handleStartSimulation = (
    newConfig: SimulationConfig,
    scenarioId: string | null = null,
    overrideSeed?: number,
    overrideAlgorithm?: TrackingAlgorithm,
    preserveRuns: boolean = false,
  ) => {
    // Check if this is a genuinely new session (different config or seed)
    // Don't clear runs if preserveRuns is true (e.g., running different algorithms from same benchmark)
    if (!preserveRuns) {
      const currentSeed = benchmarkContextRef.current.seed;
      const currentConfigId = activeConfig.id;
      const isNewSession = newConfig.id !== currentConfigId || (overrideSeed !== undefined && overrideSeed !== currentSeed);

      if (isNewSession && completedRuns.length > 0) {
        // Clear old completed runs — this is a new simulation session
        setCompletedRuns([]);
        addLog('SESSION_NEW', 'New simulation session started. Previous run results cleared.', 'info');
      }
    }

    setActiveConfig(newConfig);
    setActiveScenarioId(scenarioId);
    setElapsedSec(0);
    setTelemetryHistory([]);
    telemetryHistoryRef.current = [];
    setErrorHistory([]);

    const initialTargets = initializeTargets(newConfig);
    setTargets(initialTargets);

    const initialPan = newConfig.initialPosition === 'Offset Left (45°)' ? -45 : newConfig.initialPosition === 'Offset Right (45°)' ? 45 : 0;
    setCamera({
      pan: initialPan,
      tilt: 0,
      zoom: 1.0,
      panVelocity: 0,
      tiltVelocity: 0,
      fov: newConfig.cameraFovHorizontal || newConfig.cameraFov,
      opticalFilter: true,
      autoTracking: true,
      algorithm: overrideAlgorithm || 'AI Centroid',
    });

    trackingPipelineRef.current = initTrackingPipeline(overrideAlgorithm || 'AI Centroid', initialPan, 0);

    setIsSimRunning(true);
    setShowNewSimModal(false);

    const algoLabel = overrideAlgorithm ? ` (Benchmark: ${overrideAlgorithm})` : '';
    const displayName = newConfig.configDisplayName || newConfig.name;
    addLog('SIM_START', `Scenario "${displayName}" started with ${newConfig.targetCount} target(s) @ MACH ${newConfig.targetSpeedMach}.${algoLabel}`, 'success');

    if (currentScreen === 'landing' || currentScreen === 'dashboard' || currentScreen === 'scenarios') {
      setCurrentScreen('cameraview');
    }
  };

  // Trigger a simulation run with specific config, seed, and algorithm (from benchmark handoff)
  const runBenchmarkAlgorithm = useCallback((
    config: SimulationConfig,
    seed: number,
    algorithm: TrackingAlgorithm
  ) => {
    // Start simulation with benchmark config + seed + algorithm, navigate to Camera View
    // preserveRuns=true because benchmark algorithm runs are part of the same session
    handleStartSimulation(config, null, seed, algorithm, true);
    setCurrentScreen('cameraview');
  }, []);

  // Toggle running state
  const handleToggleSimRunning = () => {
    setIsSimRunning((prev) => {
      const next = !prev;
      addLog(next ? 'SIM_RESUMED' : 'SIM_PAUSED', next ? 'Simulation telemetry resumed.' : 'Simulation paused by operator.', next ? 'info' : 'warning');
      return next;
    });
  };

  // Main Real-Time Simulation Loop (50Hz physics update)
  useEffect(() => {
    if (!isSimRunning) return;

    let previousLockStatus = telemetry.status;
    let lastFrameTime = performance.now();

    const interval = setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
      lastFrameTime = now;

      setElapsedSec((prevTime) => {
        const nextTime = prevTime + dt;

        setTargets((prevTargets) => {
          const updated = updateTargetPositions(prevTargets, nextTime, activeConfig);
          const beacon = updated.find((t) => t.isBeacon) || updated[0];

          setCamera((prevCam) => {
            if (!trackingPipelineRef.current) {
              trackingPipelineRef.current = initTrackingPipeline(prevCam.algorithm, prevCam.pan, prevCam.tilt);
            }

            const { pipeline: newPipeline, camera: newCam, telemetry: newTelem } = runTrackingPipeline(
              trackingPipelineRef.current,
              prevCam,
              beacon,
              activeConfig,
              settings,
              nextTime,
              dt
            );

            trackingPipelineRef.current = newPipeline;

            setTelemetry(newTelem);

            setErrorHistory((prevErr) => [
              ...prevErr.slice(-35),
              {
                pan: newTelem.panError,
                tilt: newTelem.tiltError,
                time: newTelem.formattedTime,
              },
            ]);

            setTelemetryHistory((prevHist) => {
              const updated = [...prevHist, newTelem];
              telemetryHistoryRef.current = updated;
              return updated;
            });

            if (newTelem.status !== previousLockStatus) {
              if (newTelem.status === 'LOCKED') {
                addLog('LOCK_ENGAGED', `Optical lock secured on Beacon #${beacon ? beacon.id : 1} (RMS Error: ${newTelem.totalError}). Hand-off ready.`, 'success');
              } else if (newTelem.status === 'ACQUIRING') {
                addLog('ACQ_TARGET', `Acquiring beacon at Azimuth ${beacon?.azimuth} Elevation ${beacon?.elevation}.`, 'info');
              } else if (newTelem.status === 'SEARCHING') {
                addLog('SEARCH_MODE', 'Scanning spatial uncertainty cone.', 'warning');
              }
              previousLockStatus = newTelem.status;
            }

            return newCam;
          });

          return updated;
        });

        // Hard stop: elapsed simulation time >= configured duration
        if (nextTime >= (activeConfig.durationSec || 30)) {
          setIsSimRunning(false);
          addLog('SIM_COMPLETE', `Scenario "${activeConfig.configDisplayName || activeConfig.name}" finished. Report generated.`, 'success');

          // Store completed run if this was a benchmark algorithm run
          const currentAlgorithm = cameraAlgorithmRef.current;
          const ctx = benchmarkContextRef.current;
          if (ctx.config && ctx.seed && currentAlgorithm) {
            const finalHistory = telemetryHistoryRef.current;
            const stats = generatePerformanceSummary(finalHistory);
            const metrics = {
              avgTotalError: stats.history.reduce((a, b) => a + b.totalError, 0) / (stats.history.length || 1),
              maxTotalError: Math.max(...stats.history.map(h => h.totalError), 0),
              lockRetentionPct: (stats.history.filter(h => h.status === 'LOCKED').length / (stats.history.length || 1)) * 100,
              acquisitionTimeSec: stats.history.find(h => h.status === 'LOCKED')?.timeSec ?? Infinity,
              avgConfidence: stats.history.reduce((a, b) => a + b.confidence, 0) / (stats.history.length || 1),
              avgFps: stats.history.reduce((a, b) => a + b.fps, 0) / (stats.history.length || 1),
            };
            storeCompletedRun(currentAlgorithm, ctx.config, ctx.seed, finalHistory, stats, metrics);
          }
        }

        return nextTime;
      });
    }, 16);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimRunning, activeConfig, settings, addLog, storeCompletedRun]);

  // Keyboard shortcut listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if inside inputs or textareas
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleToggleSimRunning();
      } else if (e.key === 'Escape') {
        setShowNewSimModal(false);
        setShowHelpModal(false);
        setShowSupportModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSimRunning]);

  // Generated performance statistics
  const performanceStats: PerformanceStats = generatePerformanceSummary(telemetryHistory);

  // Render Screens
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#101416] text-[#e0e3e6] font-['Hanken_Grotesk'] flex flex-col antialiased select-none">
      {currentScreen === 'landing' ? (
        <LandingPage onEnterLab={() => setCurrentScreen('dashboard')} />
      ) : (
        <div className="flex h-full w-full overflow-hidden relative">
          {/* Main Navigation Sidebar */}
          <Navigation
            currentScreen={currentScreen}
            onNavigate={(screen) => setCurrentScreen(screen)}
            onOpenNewSimulation={() => setShowNewSimModal(true)}
            onOpenHelp={() => setShowHelpModal(true)}
            onOpenSupport={() => setShowSupportModal(true)}
            isSimRunning={isSimRunning}
          />

          {/* Active Screen View */}
          <div className="flex-1 flex flex-col h-full overflow-hidden md:ml-64 relative">
            {currentScreen === 'dashboard' && (
              <DashboardView
                onNewSimulation={() => setShowNewSimModal(true)}
                onLoadScenario={() => setCurrentScreen('scenarios')}
                onViewDocs={() => setShowHelpModal(true)}
                onNavigateCameraView={() => setCurrentScreen('cameraview')}
                telemetry={telemetry}
                isSimRunning={isSimRunning}
                activeConfig={activeConfig}
                activeAlgorithm={camera.algorithm}
              />
            )}

            {currentScreen === 'cameraview' && (
              <CameraView
                targets={targets}
                camera={camera}
                setCamera={setCamera}
                telemetry={telemetry}
                config={activeConfig}
                settings={settings}
                onSwitchView={(v) => setCurrentScreen(v)}
                onToggleSimRunning={handleToggleSimRunning}
                isSimRunning={isSimRunning}
                errorHistory={errorHistory}
                benchmarkContext={benchmarkContext}
              />
            )}

            {currentScreen === 'world3d' && (
              <World3DView
                targets={targets}
                camera={camera}
                telemetry={telemetry}
                config={activeConfig}
                onSwitchView={(v) => setCurrentScreen(v)}
                isSimRunning={isSimRunning}
              />
            )}

            {currentScreen === 'scenarios' && (
              <ScenariosLogsView
                logs={logs}
                onClearLogs={() => setLogs([])}
                isSimRunning={isSimRunning}
              />
            )}

            {currentScreen === 'performance' && (
              <PerformanceView
                stats={performanceStats}
                config={activeConfig}
                completedRuns={completedRuns}
                benchmarkContext={benchmarkContext}
                simulationSessionId={simulationSessionId}
              />
            )}

            {currentScreen === 'settings' && (
              <SettingsView
                settings={settings}
                onSaveSettings={(newSettings) => {
                  setSettings(newSettings);
                  addLog('SETTINGS_UPDATE', 'Lab settings updated.', 'info');
                }}
              />
            )}

            {currentScreen === 'benchmark' && (
              <BenchmarkView
                isSimRunning={isSimRunning}
                activeConfig={activeConfig}
                settings={settings}
                benchmarkContext={benchmarkContext}
                onSaveBenchmarkContext={saveBenchmarkContext}
                onRunBenchmarkAlgorithm={runBenchmarkAlgorithm}
              />
            )}

            {currentScreen === 'videoinput' && (
              <VideoInputView
                onSwitchView={(v) => setCurrentScreen(v)}
                onVideoTelemetryUpdate={setVideoTelemetry}
              />
            )}

            {/* Persistent Bottom Telemetry Bar on Dashboard, Performance, Camera, 3D, and Scenarios */}
            {currentScreen !== 'landing' && (
              <BottomTelemetry
                telemetry={telemetry}
                inputMode={currentScreen === 'videoinput' ? 'video' : 'simulation'}
                videoTelemetry={currentScreen === 'videoinput' ? videoTelemetry : null}
              />
            )}
          </div>
        </div>
      )}

      {/* New Simulation Modal */}
      <NewSimulationModal
        initialConfig={activeConfig}
        isOpen={showNewSimModal}
        onClose={() => setShowNewSimModal(false)}
        onStartSimulation={(cfg) => handleStartSimulation(cfg, null)}
      />

      {/* Documentation / Help Modal */}
      {showHelpModal && (
        <DocumentationModal onClose={() => setShowHelpModal(false)} />
      )}

      {/* Support Modal */}
      {showSupportModal && (
        <SupportModal onClose={() => setShowSupportModal(false)} />
      )}
    </div>
  );
}
