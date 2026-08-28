import React, { useState } from 'react';
import { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../services/simulationEngine';

interface SettingsViewProps {
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSaveSettings }) => {
  const [formData, setFormData] = useState<AppSettings>({ ...settings });
  const [showSavedToast, setShowSavedToast] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  const handleReset = () => {
    setFormData({ ...DEFAULT_SETTINGS });
    onSaveSettings({ ...DEFAULT_SETTINGS });
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto mt-14 md:mt-0 tech-grid-bg relative p-4 md:p-8 select-none pb-16">
      {/* Header */}
      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-[#564338]/40 pb-4 gap-4">
        <div>
          <h1 className="font-['Hanken_Grotesk'] text-2xl md:text-3xl text-[#e0e3e6] font-bold tracking-tight">
            LAB SETTINGS &amp; CONFIGURATION
          </h1>
          <p className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] tracking-widest uppercase mt-1">
            Global Aerospace Testbed Parameters
          </p>
        </div>

        {showSavedToast && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#42e09c]/20 border border-[#42e09c] text-[#42e09c] font-['JetBrains_Mono'] text-xs animate-bounce">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            Settings Applied Successfully
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-start">
        {/* CARD 1: DISPLAY & INTERFACE SETTINGS */}
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 flex flex-col gap-4 shadow-sm">
          <h2 className="font-['JetBrains_Mono'] text-[11px] text-[#ffb68d] uppercase tracking-widest border-b border-[#564338]/40 pb-2 flex items-center gap-2 font-bold">
            <span className="material-symbols-outlined text-[16px]">palette</span>
            DISPLAY SETTINGS
          </h2>

          {/* Theme */}
          <div className="flex flex-col gap-1.5">
            <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase">
              UI Theme
            </label>
            <select
              value={formData.uiTheme}
              onChange={(e) => setFormData({ ...formData, uiTheme: e.target.value as any })}
              className="bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2 rounded focus:outline-none focus:border-[#ffb68d]"
            >
              <option value="dark">Aerospace Dark Mode (Standard)</option>
              <option value="light">High Contrast Lab</option>
            </select>
          </div>

          {/* Coordinate Units */}
          <div className="flex flex-col gap-1.5">
            <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase">
              Coordinate Units
            </label>
            <select
              value={formData.coordinateUnits}
              onChange={(e) => setFormData({ ...formData, coordinateUnits: e.target.value as any })}
              className="bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2 rounded focus:outline-none focus:border-[#ffb68d]"
            >
              <option value="metric">Metric (m, km/h, μrad)</option>
              <option value="nautical">Nautical (NM, knots, deg)</option>
              <option value="imperial">Imperial (ft, mph, deg)</option>
            </select>
          </div>

          {/* Reticle Style */}
          <div className="flex flex-col gap-1.5">
            <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase">
              HUD Reticle Style
            </label>
            <select
              value={formData.reticleStyle}
              onChange={(e) => setFormData({ ...formData, reticleStyle: e.target.value as any })}
              className="bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2 rounded focus:outline-none focus:border-[#ffb68d]"
            >
              <option value="crosshair">Standard Mil-Dot Crosshair</option>
              <option value="brackets">Corner Bracket HUD</option>
              <option value="circle">Center Tracking Circle</option>
            </select>
          </div>
        </div>

        {/* CARD 2: SIMULATION & PID TUNING */}
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 flex flex-col gap-4 shadow-sm">
          <h2 className="font-['JetBrains_Mono'] text-[11px] text-[#ffb68d] uppercase tracking-widest border-b border-[#564338]/40 pb-2 flex items-center gap-2 font-bold">
            <span className="material-symbols-outlined text-[16px]">tune</span>
            SIMULATION &amp; PID
          </h2>

          {/* Default Duration */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase">
                Default Duration
              </label>
              <span className="font-['JetBrains_Mono'] text-xs text-[#42e09c] font-bold">
                {formData.defaultDuration}s
              </span>
            </div>
            <input
              type="range"
              min="30"
              max="300"
              step="10"
              value={formData.defaultDuration}
              onChange={(e) => setFormData({ ...formData, defaultDuration: parseInt(e.target.value) })}
            />
          </div>

          {/* PID Gain: Kp */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3]">Kp (Proportional)</label>
              <input
                type="number"
                step="0.1"
                value={formData.pidKp}
                onChange={(e) => setFormData({ ...formData, pidKp: parseFloat(e.target.value) || 1.0 })}
                className="bg-[#323538] border border-[#564338] text-[#e0e3e6] font-mono text-xs p-1.5 rounded"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3]">Ki (Integral)</label>
              <input
                type="number"
                step="0.01"
                value={formData.pidKi}
                onChange={(e) => setFormData({ ...formData, pidKi: parseFloat(e.target.value) || 0.1 })}
                className="bg-[#323538] border border-[#564338] text-[#e0e3e6] font-mono text-xs p-1.5 rounded"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3]">Kd (Derivative)</label>
              <input
                type="number"
                step="0.05"
                value={formData.pidKd}
                onChange={(e) => setFormData({ ...formData, pidKd: parseFloat(e.target.value) || 0.4 })}
                className="bg-[#323538] border border-[#564338] text-[#e0e3e6] font-mono text-xs p-1.5 rounded"
              />
            </div>
          </div>

          {/* Base Noise Variance */}
          <div className="flex flex-col gap-1.5">
            <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase">
              Base Noise Variance (σ²)
            </label>
            <input
              type="text"
              value={formData.baseNoiseVariance}
              onChange={(e) => setFormData({ ...formData, baseNoiseVariance: e.target.value })}
              className="bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2 rounded focus:outline-none focus:border-[#ffb68d]"
            />
          </div>
        </div>

        {/* CARD 3: DATA & STORAGE MANAGEMENT */}
        <div className="bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 flex flex-col gap-4 shadow-sm">
          <h2 className="font-['JetBrains_Mono'] text-[11px] text-[#ffb68d] uppercase tracking-widest border-b border-[#564338]/40 pb-2 flex items-center gap-2 font-bold">
            <span className="material-symbols-outlined text-[16px]">database</span>
            DATA &amp; LOGS
          </h2>

          {/* Log Dir */}
          <div className="flex flex-col gap-1.5">
            <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase">
              Log Storage Path
            </label>
            <input
              type="text"
              value={formData.logDirPath}
              onChange={(e) => setFormData({ ...formData, logDirPath: e.target.value })}
              className="bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2 rounded focus:outline-none focus:border-[#ffb68d]"
            />
          </div>

          {/* Retention Policy */}
          <div className="flex flex-col gap-1.5">
            <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase">
              Log Retention (Days)
            </label>
            <select
              value={formData.retentionPolicy}
              onChange={(e) => setFormData({ ...formData, retentionPolicy: e.target.value })}
              className="bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2 rounded focus:outline-none focus:border-[#ffb68d]"
            >
              <option value="7">7 Days</option>
              <option value="30">30 Days</option>
              <option value="90">90 Days</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </div>

          {/* Verbose Telemetry */}
          <label className="flex items-center gap-3 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={formData.verboseTelemetry}
              onChange={(e) => setFormData({ ...formData, verboseTelemetry: e.target.checked })}
              className="rounded bg-[#323538] border-[#564338] text-[#ff8a3d]"
            />
            <span className="font-['Hanken_Grotesk'] text-xs text-[#e0e3e6]">
              Enable High-Rate 100Hz Raw Telemetry
            </span>
          </label>

          {/* Purge Logs Button */}
          <div className="pt-2 border-t border-[#564338]/30">
            <button
              type="button"
              onClick={() => alert('Local log buffer purged.')}
              className="w-full py-2 bg-[#323538] hover:bg-[#ffb4ab]/20 hover:text-[#ffb4ab] border border-[#564338] text-[#ddc1b3] font-['JetBrains_Mono'] text-xs uppercase rounded transition-colors"
            >
              Purge Local Cache
            </button>
          </div>
        </div>

        {/* Global Save / Reset Footer */}
        <div className="lg:col-span-3 flex justify-end gap-3 pt-4 border-t border-[#564338]/40">
          <button
            type="button"
            onClick={handleReset}
            className="px-5 py-2.5 bg-[#323538] hover:bg-[#363a3c] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs uppercase rounded cursor-pointer"
          >
            Reset Defaults
          </button>
          <button
            type="submit"
            className="px-8 py-2.5 bg-[#ffb68d] hover:bg-[#ff8a3d] text-[#532200] font-['JetBrains_Mono'] text-xs font-bold uppercase rounded cursor-pointer shadow-[0_0_15px_rgba(255,182,141,0.3)]"
          >
            Apply Changes
          </button>
        </div>
      </form>
    </div>
  );
};
