import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  NavScreen,
  SimulationConfig,
  Target,
  CameraGimbalState,
  TelemetryPoint,
  LogEntry,
  Scenario,
  AppSettings,
  PerformanceStats,
  TrackingPipelineState,
} from './types';
import {
  DEFAULT_CONFIG,
  DEFAULT_SETTINGS,
  PRESET_SCENARIOS,
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
import { DocumentationModal } from './components/DocumentationModal';
import { SupportModal } from './components/SupportModal';

export default function App() {
  // Screen & Navigation
  const [currentScreen, setCurrentScreen] = useState<NavScreen>('landing');

  // Modals
  const [showNewSimModal, setShowNewSimModal] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showSupportModal, setShowSupportModal] = useState<boolean>(false);

  // Settings & Scenarios
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [scenarios, setScenarios] = useState<Scenario[]>(PRESET_SCENARIOS);
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

  // Logs
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'log_0',
      time: '10:15:00',
      event: 'SYSTEM_BOOT',
      data: 'FSOC Optical Terminal Initialized. Gimbal calibrate OK.',
      type: 'info',
    },
    {
      id: 'log_1',
      time: '10:15:02',
      event: 'AI_MODEL_LOAD',
      data: 'Deep Beacon Centroid weights loaded into memory.',
      type: 'info',
    },
    {
      id: 'log_2',
      time: '10:15:05',
      event: 'STANDBY',
      data: 'Ready for simulation scenario activation.',
      type: 'success',
    },
  ]);

  // Append new log helper
  const addLog = useCallback((event: string, data: string, type: LogEntry['type'] = 'info') => {
    const now = new Date();
    const time = now.toTimeString().substring(0, 8);
    const newEntry: LogEntry = {
      id: `log_${Date.now()}_${Math.random()}`,
      time,
      event,
      data,
      type,
    };
    setLogs((prev) => [newEntry, ...prev.slice(0, 150)]);
  }, []);

  // Start a new simulation with config
  const handleStartSimulation = (newConfig: SimulationConfig, scenarioId: string | null = null) => {
    setActiveConfig(newConfig);
    setActiveScenarioId(scenarioId);
    setElapsedSec(0);
    setTelemetryHistory([]);
    setErrorHistory([]);

    const initialTargets = initializeTargets(newConfig);
    setTargets(initialTargets);

    const initialPan = newConfig.initialPosition === 'Offset Left (45°)' ? -45 : newConfig.initialPosition === 'Offset Right (45°)' ? 45 : (Math.random() - 0.5) * 20;
    setCamera({
      pan: initialPan,
      tilt: 0,
      zoom: 1.0,
      panVelocity: 0,
      tiltVelocity: 0,
      fov: newConfig.cameraFov,
      opticalFilter: true,
      autoTracking: true,
      algorithm: 'AI Centroid',
    });

    trackingPipelineRef.current = initTrackingPipeline('AI Centroid', initialPan, 0);

    setIsSimRunning(true);
    setShowNewSimModal(false);

    addLog('SIM_START', `Scenario "${newConfig.name}" started with ${newConfig.targetCount} target(s) @ MACH ${newConfig.targetSpeedMach}.`, 'success');

    if (currentScreen === 'landing' || currentScreen === 'dashboard' || currentScreen === 'scenarios') {
      setCurrentScreen('cameraview');
    }
  };

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

            setTelemetryHistory((prevHist) => [...prevHist, newTelem]);

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

        if (nextTime >= (activeConfig.durationSec || 120)) {
          setIsSimRunning(false);
          addLog('SIM_COMPLETE', `Scenario "${activeConfig.name}" finished. Report generated.`, 'success');
        }

        return nextTime;
      });
    }, 16);

    return () => clearInterval(interval);
  }, [isSimRunning, activeConfig, settings, addLog]);

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
                scenarios={scenarios}
                logs={logs}
                activeScenarioId={activeScenarioId}
                onRunScenario={(scen) => handleStartSimulation(scen.config, scen.id)}
                onStopScenario={() => {
                  setIsSimRunning(false);
                  addLog('SIM_STOPPED', 'Simulation manually halted.', 'warning');
                }}
                onOpenNewScenario={() => setShowNewSimModal(true)}
                onClearLogs={() => setLogs([])}
                isSimRunning={isSimRunning}
              />
            )}

            {currentScreen === 'performance' && (
              <PerformanceView
                stats={performanceStats}
                config={activeConfig}
              />
            )}

            {currentScreen === 'logs' && (
              <ScenariosLogsView
                scenarios={scenarios}
                logs={logs}
                activeScenarioId={activeScenarioId}
                onRunScenario={(scen) => handleStartSimulation(scen.config, scen.id)}
                onStopScenario={() => {
                  setIsSimRunning(false);
                  addLog('SIM_STOPPED', 'Simulation manually halted.', 'warning');
                }}
                onOpenNewScenario={() => setShowNewSimModal(true)}
                onClearLogs={() => setLogs([])}
                isSimRunning={isSimRunning}
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

            {/* Persistent Bottom Telemetry Bar on Dashboard, Performance, Camera, 3D, and Scenarios */}
            {currentScreen !== 'landing' && (
              <BottomTelemetry telemetry={telemetry} />
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
