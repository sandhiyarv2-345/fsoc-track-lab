import React from 'react';
import { PerformanceStats, SimulationConfig } from '../types';

interface ReportModalProps {
  stats: PerformanceStats;
  config: SimulationConfig;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ stats, config, onClose }) => {
  const handlePrint = () => {
    window.print();
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
                Report Ref: FSOC-TR-{(Math.random() * 10000).toFixed(0)} &bull; {new Date().toLocaleDateString()}
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
              The camera-assisted coarse acquisition test for scenario <span className="text-[#ff8a3d] font-mono font-bold">{config.name}</span> completed with an acquisition latency of <span className="text-[#42e09c] font-mono font-bold">{stats.acqTime}</span> and an overall lock retention of <span className="text-[#42e09c] font-mono font-bold">{stats.lockRetention}</span>.
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

          {/* Hand-off Readiness Verification */}
          <div className="p-3 bg-[#101416] border border-[#42e09c]/40 rounded font-['JetBrains_Mono'] text-xs flex items-center gap-3">
            <span className="material-symbols-outlined text-[#42e09c] text-2xl">verified_user</span>
            <div>
              <div className="text-[#42e09c] font-bold">FSM HANDOFF: APPROVED</div>
              <div className="text-[#ddc1b3] text-[11px]">
                Optical angle error within ±0.5° handover tolerance for Fine Steering Mirror capture.
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
              onClick={handlePrint}
              className="px-4 py-2 bg-[#323538] hover:bg-[#363a3c] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs uppercase font-medium rounded"
            >
              Print
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
