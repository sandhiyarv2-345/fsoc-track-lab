import React, { useState, useEffect } from 'react';
import { TelemetryPoint, SimulationConfig, TrackingAlgorithm } from '../types';

interface DashboardViewProps {
  onNewSimulation: () => void;
  onLoadScenario: () => void;
  onViewDocs: () => void;
  onNavigateCameraView: () => void;
  telemetry: TelemetryPoint;
  isSimRunning: boolean;
  activeConfig: SimulationConfig;
  activeAlgorithm: TrackingAlgorithm;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNewSimulation,
  onLoadScenario,
  onViewDocs,
  onNavigateCameraView,
  telemetry,
  isSimRunning,
  activeConfig,
  activeAlgorithm,
}) => {
  const [localTime, setLocalTime] = useState<string>('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setLocalTime(now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST');
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto mt-14 md:mt-0 tech-grid-bg relative p-4 md:p-8 select-none">
      {/* Page Header */}
      <div className="mb-6 md:mb-8 flex justify-between items-end border-b border-[#564338]/40 pb-4">
        <div>
          <h1 className="font-['Hanken_Grotesk'] text-2xl md:text-3xl text-[#e0e3e6] font-bold tracking-tight">
            DASHBOARD
          </h1>
          <p className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] tracking-widest uppercase mt-1">
            System Overview &amp; Initialization
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 font-['JetBrains_Mono'] text-sm text-[#c1c7d3]">
          <span className="material-symbols-outlined text-sm opacity-70">schedule</span>
          <span id="system-time">{localTime || '00:00:00 IST'}</span>
        </div>
      </div>

      {/* Dashboard Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 content-start">
        {/* Left Column: Status & Actions */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-5">
          {/* TRACKING STATUS PANEL */}
          <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 relative overflow-hidden flex flex-col min-h-[280px] shadow-sm">
            {/* Scanner beam effect */}
            <div className="absolute inset-0 w-full h-[2px] bg-[#ffb68d]/30 blur-[2px] animate-scan pointer-events-none"></div>

            <div className="flex justify-between items-start mb-6 relative z-10">
              <h2 className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#ffb68d]">track_changes</span>
                TRACKING STATUS
              </h2>
              {isSimRunning && (
                <span className="px-2 py-0.5 rounded bg-[#42e09c]/10 text-[#42e09c] border border-[#42e09c]/30 text-[9px] font-mono uppercase font-bold animate-pulse">
                  LIVE
                </span>
              )}
            </div>

            <div className="flex-1 flex flex-col justify-center items-center relative z-10 text-center">
              <div className={`font-['Hanken_Grotesk'] text-[46px] leading-none tracking-[0.2em] font-bold mb-5 ${
                isSimRunning && telemetry.status === 'LOCKED' 
                  ? 'text-[#42e09c] glow-secondary' 
                  : isSimRunning 
                  ? 'text-[#ff8a3d]' 
                  : 'text-[#c1c7d3] opacity-40'
              }`}>
                {isSimRunning ? telemetry.status : 'IDLE'}
              </div>

              {isSimRunning ? (
                <button
                  onClick={onNavigateCameraView}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#ff8a3d]/20 border border-[#ff8a3d]/40 rounded-full font-['JetBrains_Mono'] text-[11px] text-[#ffb68d] uppercase tracking-wider hover:bg-[#ff8a3d]/30 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">videocam</span>
                  Sim Active: {activeConfig.configDisplayName || activeConfig.name} &bull; {activeAlgorithm} &bull; View Feed &rarr;
                </button>
              ) : (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#323538]/50 border border-[#564338]/50 rounded-full font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[14px]">info</span>
                  No active simulation
                </div>
              )}
            </div>
          </div>

          {/* QUICK ACTIONS PANEL */}
          <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 shadow-sm">
            <h2 className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-[#ff8a3d]">bolt</span>
              QUICK ACTIONS
            </h2>
            <div className="flex flex-col gap-3">
              <button
                id="btn-new-simulation"
                onClick={onNewSimulation}
                className="w-full bg-[#ff8a3d] text-[#682d00] hover:bg-[#ffb68d] transition-all duration-200 py-3.5 px-6 rounded font-['JetBrains_Mono'] text-xs uppercase font-bold flex justify-center items-center gap-3 shadow-[0_0_15px_rgba(255,138,61,0.2)] hover:shadow-[0_0_20px_rgba(255,138,61,0.4)] cursor-pointer"
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                  play_arrow
                </span>
                NEW SIMULATION
              </button>

              <button
                id="btn-load-scenario"
                onClick={onLoadScenario}
                className="w-full bg-[#323538] border border-[#564338] text-[#e0e3e6] hover:bg-[#363a3c] transition-colors py-3 px-6 rounded font-['JetBrains_Mono'] text-xs uppercase font-medium flex justify-center items-center gap-3 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">folder_open</span>
                LOAD SCENARIO
              </button>

              <button
                id="btn-view-documentation"
                onClick={onViewDocs}
                className="w-full bg-[#323538] border border-[#564338] text-[#e0e3e6] hover:bg-[#363a3c] transition-colors py-3 px-6 rounded font-['JetBrains_Mono'] text-xs uppercase font-medium flex justify-center items-center gap-3 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">menu_book</span>
                VIEW DOCUMENTATION
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: System Overview */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col">
          <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 h-full flex flex-col shadow-sm">
            <h2 className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] uppercase tracking-widest mb-6 pb-3 border-b border-[#564338]/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-[#ff8a3d]">memory</span>
                SYSTEM OVERVIEW
              </div>
              <span className="text-[10px] text-[#a58c7f]">6-DOF GIMBAL &amp; OPTICAL TELEMETRY</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-7 flex-1 content-start">
              {/* Telemetry Item: Camera Status */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[#ddc1b3]">
                  <span className="material-symbols-outlined text-[18px] text-[#a58c7f]">videocam</span>
                  <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-wider">Camera Status</span>
                </div>
                <div className="flex items-end gap-3 border-b border-[#564338]/30 pb-2">
                  <span className={`w-2.5 h-2.5 rounded-full mb-1.5 ${isSimRunning ? 'bg-[#42e09c] animate-pulse shadow-[0_0_6px_#42e09c]' : 'bg-[#c1c7d3]'}`}></span>
                  <span className="font-['JetBrains_Mono'] text-2xl text-[#e0e3e6] font-medium tracking-tight">
                    {isSimRunning ? 'Active (PTZ Lock)' : 'Standby'}
                  </span>
                </div>
              </div>

              {/* Telemetry Item: Target Status */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[#ddc1b3]">
                  <span className="material-symbols-outlined text-[18px] text-[#a58c7f]">my_location</span>
                  <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-wider">Target Status</span>
                </div>
                <div className="flex items-end gap-3 border-b border-[#564338]/30 pb-2">
                  <span className={`w-2.5 h-2.5 rounded-full mb-1.5 ${isSimRunning ? (telemetry.status === 'LOCKED' ? 'bg-[#42e09c]' : 'bg-[#ff8a3d]') : 'bg-[#ffb4ab]'}`}></span>
                  <span className={`font-['JetBrains_Mono'] text-2xl font-medium tracking-tight ${isSimRunning ? 'text-[#e0e3e6]' : 'text-[#e0e3e6] opacity-60'}`}>
                    {isSimRunning ? `Target #1 (${telemetry.range}m)` : 'Not Detected'}
                  </span>
                </div>
              </div>

              {/* Telemetry Item: Tracking Error */}
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-2 text-[#ddc1b3]">
                  <span className="material-symbols-outlined text-[18px] text-[#a58c7f]">show_chart</span>
                  <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-wider">Tracking Error</span>
                </div>
                <div className="flex items-end gap-3 border-b border-[#564338]/30 pb-2">
                  <span className={`font-['JetBrains_Mono'] text-2xl font-medium ${isSimRunning ? 'text-[#e0e3e6]' : 'text-[#c1c7d3] opacity-40'}`}>
                    {isSimRunning ? telemetry.totalError.toFixed(2) : '--'}
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] mb-1">deg</span>
                </div>
              </div>

              {/* Telemetry Item: Lock Retention */}
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-2 text-[#ddc1b3]">
                  <span className="material-symbols-outlined text-[18px] text-[#a58c7f]">lock</span>
                  <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-wider">Lock Retention</span>
                </div>
                <div className="flex items-end gap-3 border-b border-[#564338]/30 pb-2">
                  <span className={`font-['JetBrains_Mono'] text-2xl font-medium ${isSimRunning ? 'text-[#42e09c]' : 'text-[#c1c7d3] opacity-40'}`}>
                    {isSimRunning ? `${telemetry.confidence.toFixed(1)}` : '--'}
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] mb-1">%</span>
                </div>
              </div>

              {/* Hardware Resources Block */}
              <div className="flex flex-col gap-2 mt-4 md:col-span-2">
                <div className="flex items-center gap-2 text-[#ddc1b3]">
                  <span className="material-symbols-outlined text-[18px] text-[#a58c7f]">dns</span>
                  <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-wider">Hardware Resources</span>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-1">
                  <div className="bg-[#101416] rounded p-3 border border-[#564338]/30 flex flex-col justify-between">
                    <div className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] mb-1">CPU LOAD</div>
                    <div className="flex items-baseline justify-between">
                      <div className="font-['JetBrains_Mono'] text-lg text-[#e0e3e6] font-medium">{telemetry.cpuLoad}%</div>
                      <div className="w-12 h-1.5 bg-[#323538] rounded-full overflow-hidden">
                        <div className="h-full bg-[#ff8a3d]" style={{ width: `${Math.min(100, telemetry.cpuLoad * 2)}%` }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#101416] rounded p-3 border border-[#564338]/30 flex flex-col justify-between">
                    <div className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] mb-1">GPU MEM</div>
                    <div className="flex items-baseline justify-between">
                      <div className="font-['JetBrains_Mono'] text-lg text-[#e0e3e6] font-medium">{telemetry.gpuMem} GB</div>
                      <div className="w-12 h-1.5 bg-[#323538] rounded-full overflow-hidden">
                        <div className="h-full bg-[#42e09c]" style={{ width: '25%' }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#101416] rounded p-3 border border-[#564338]/30 flex flex-col justify-between">
                    <div className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] mb-1">NETWORK</div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#42e09c] animate-pulse"></span>
                      <div className="font-['JetBrains_Mono'] text-lg text-[#e0e3e6] font-medium">OK</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Version Footer */}
      <div className="mt-auto pt-6 pb-2 text-right">
        <span className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] opacity-50 uppercase tracking-widest">
          FSOC Track Lab v1.0.4-beta
        </span>
      </div>
    </div>
  );
};
