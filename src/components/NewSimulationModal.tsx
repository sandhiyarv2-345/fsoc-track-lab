import React, { useState } from 'react';
import { SimulationConfig, TrajectoryType } from '../types';

interface NewSimulationModalProps {
  initialConfig: SimulationConfig;
  isOpen: boolean;
  onClose: () => void;
  onStartSimulation: (config: SimulationConfig) => void;
}

export const NewSimulationModal: React.FC<NewSimulationModalProps> = ({
  initialConfig,
  isOpen,
  onClose,
  onStartSimulation,
}) => {
  const [config, setConfig] = useState<SimulationConfig>({ ...initialConfig });

  if (!isOpen) return null;

  const handleDisturbanceToggle = (key: keyof SimulationConfig['disturbances']) => {
    if (key === 'intensity') return;
    setConfig((prev) => ({
      ...prev,
      disturbances: {
        ...prev.disturbances,
        [key]: !prev.disturbances[key],
      },
    }));
  };

  const getIntensityLabel = (val: number) => {
    if (val < 30) return { text: 'LOW', color: 'text-[#42e09c]' };
    if (val < 70) return { text: 'MODERATE', color: 'text-[#ffb68d]' };
    return { text: 'HIGH', color: 'text-[#ffb4ab]' };
  };

  const intensityInfo = getIntensityLabel(config.disturbances.intensity);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const customConfig: SimulationConfig = {
      ...config,
      id: `custom_${Date.now()}`,
      name: 'Custom Configuration',
      configSource: 'custom',
      configDisplayName: 'Custom Configuration',
    };
    onStartSimulation(customConfig);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md select-none overflow-y-auto">
      {/* Background ambient circular grid */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <div className="w-[70vw] h-[70vw] max-w-[800px] max-h-[800px] border border-[#564338] rounded-full border-dashed animate-[spin_60s_linear_infinite]"></div>
        <div className="absolute w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] border border-[#564338] rounded-full"></div>
      </div>

      {/* Modal Container */}
      <div className="relative w-full max-w-5xl bg-[#1d2022] border border-[#564338] shadow-2xl flex flex-col max-h-[92vh] backdrop-blur-md bg-opacity-95 z-50 rounded">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#564338] bg-[#272a2d] rounded-t">
          <div>
            <h2 className="font-['Hanken_Grotesk'] text-xl md:text-2xl text-[#e0e3e6] font-bold tracking-tight">
              NEW SIMULATION
            </h2>
            <p className="text-[#ddc1b3] text-xs font-['Hanken_Grotesk'] mt-0.5">
              Configure your simulation parameters
            </p>
          </div>
          <button
            id="modal-close-btn"
            onClick={onClose}
            className="text-[#ddc1b3] hover:text-[#ffb68d] p-1.5 rounded hover:bg-[#323538] transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col justify-between">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* COLUMN 1: TARGET SETTINGS */}
            <div className="flex flex-col gap-5">
              <h3 className="font-['JetBrains_Mono'] text-[11px] uppercase text-[#ffb68d] tracking-widest border-b border-[#564338] pb-2 flex items-center gap-2 font-semibold">
                <span className="material-symbols-outlined text-[16px]">my_location</span>
                TARGET SETTINGS
              </h3>

              {/* Number of Targets */}
              <div className="flex flex-col gap-1.5">
                <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase tracking-wider">
                  Number of Targets
                </label>
                <select
                  value={config.targetCount}
                  onChange={(e) => setConfig({ ...config, targetCount: parseInt(e.target.value) })}
                  className="w-full bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2.5 rounded focus:border-[#ffb68d] focus:outline-none"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={8}>Swarm (8)</option>
                </select>
              </div>

              {/* Designated Beacon */}
              <div className="flex flex-col gap-1.5">
                <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase tracking-wider">
                  Designated Beacon
                </label>
                <select
                  value={config.designatedBeaconIndex}
                  onChange={(e) => setConfig({ ...config, designatedBeaconIndex: parseInt(e.target.value) })}
                  className="w-full bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2.5 rounded focus:border-[#ffb68d] focus:outline-none"
                >
                  <option value={1}>Target 1</option>
                  {config.targetCount > 1 && <option value={2}>Target 2</option>}
                  {config.targetCount > 2 && <option value={3}>Target 3</option>}
                  <option value={-1}>Auto-Select</option>
                </select>
              </div>

              {/* Target Speed Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase tracking-wider">
                    Target Speed
                  </label>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-[#42e09c] font-bold">
                    MACH {config.targetSpeedMach.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="4.5"
                  step="0.1"
                  value={config.targetSpeedMach}
                  onChange={(e) => setConfig({ ...config, targetSpeedMach: parseFloat(e.target.value) })}
                  className="mt-1"
                />
                <div className="flex justify-between font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3]/60 uppercase">
                  <span>Slow</span>
                  <span>Fast</span>
                </div>
              </div>

              {/* Trajectory Pattern */}
              <div className="flex flex-col gap-1.5">
                <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase tracking-wider">
                  Trajectory
                </label>
                <select
                  value={config.trajectory}
                  onChange={(e) => setConfig({ ...config, trajectory: e.target.value as TrajectoryType })}
                  className="w-full bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2.5 rounded focus:border-[#ffb68d] focus:outline-none"
                >
                  <option value="Random">Random</option>
                  <option value="Linear Escape">Linear Escape</option>
                  <option value="Evasive Maneuvers">Evasive Maneuvers</option>
                  <option value="Orbital Pattern">Orbital Pattern</option>
                  <option value="Sinusoidal Drift">Sinusoidal Drift</option>
                </select>
              </div>
            </div>

            {/* COLUMN 2: CAMERA SETTINGS */}
            <div className="flex flex-col gap-5">
              <h3 className="font-['JetBrains_Mono'] text-[11px] uppercase text-[#ffb68d] tracking-widest border-b border-[#564338] pb-2 flex items-center gap-2 font-semibold">
                <span className="material-symbols-outlined text-[16px]">videocam</span>
                CAMERA SETTINGS
              </h3>

              {/* FOV Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase tracking-wider">
                    FOV (Horizontal)
                  </label>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-[#42e09c] font-bold">
                    {config.cameraFov}°
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="90"
                  value={config.cameraFov}
                  onChange={(e) => setConfig({ ...config, cameraFov: parseInt(e.target.value) })}
                  className="mt-1"
                />
                <div className="flex justify-between font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3]/60 uppercase">
                  <span>Narrow</span>
                  <span>Wide</span>
                </div>
              </div>

              {/* Initial Position */}
              <div className="flex flex-col gap-1.5">
                <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase tracking-wider">
                  Initial Position
                </label>
                <select
                  value={config.initialPosition}
                  onChange={(e) => setConfig({ ...config, initialPosition: e.target.value as any })}
                  className="w-full bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2.5 rounded focus:border-[#ffb68d] focus:outline-none"
                >
                  <option value="Default Center">Default Center</option>
                  <option value="Offset Left (45°)">Offset Left (45°)</option>
                  <option value="Offset Right (45°)">Offset Right (45°)</option>
                </select>
              </div>

              {/* Pan Speed Limit */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase tracking-wider">
                    Pan Speed Limit
                  </label>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-[#42e09c] font-bold">
                    {config.panSpeedLimit}°/s
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="90"
                  value={config.panSpeedLimit}
                  onChange={(e) => setConfig({ ...config, panSpeedLimit: parseInt(e.target.value) })}
                  className="mt-1"
                />
              </div>

              {/* Tilt Speed Limit */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="font-['JetBrains_Mono'] text-[10px] text-[#ddc1b3] uppercase tracking-wider">
                    Tilt Speed Limit
                  </label>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-[#42e09c] font-bold">
                    {config.tiltSpeedLimit}°/s
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={config.tiltSpeedLimit}
                  onChange={(e) => setConfig({ ...config, tiltSpeedLimit: parseInt(e.target.value) })}
                  className="mt-1"
                />
              </div>
            </div>

            {/* COLUMN 3: DISTURBANCES */}
            <div className="flex flex-col gap-5">
              <h3 className="font-['JetBrains_Mono'] text-[11px] uppercase text-[#ffb68d] tracking-widest border-b border-[#564338] pb-2 flex items-center gap-2 font-semibold">
                <span className="material-symbols-outlined text-[16px]">vibration</span>
                DISTURBANCES
              </h3>

              {/* Checkboxes */}
              <div className="flex flex-col gap-3 font-['Hanken_Grotesk'] text-sm">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div
                    onClick={() => handleDisturbanceToggle('sensorNoise')}
                    className={`flex items-center justify-center w-4 h-4 rounded-sm border ${
                      config.disturbances.sensorNoise
                        ? 'border-[#ffb68d] bg-[#ffb68d] text-[#532200]'
                        : 'border-[#564338] bg-[#323538] group-hover:border-[#ffb68d]'
                    } transition-colors`}
                  >
                    {config.disturbances.sensorNoise && (
                      <span className="material-symbols-outlined text-[13px] font-bold">check</span>
                    )}
                  </div>
                  <span className="text-[#e0e3e6]" onClick={() => handleDisturbanceToggle('sensorNoise')}>
                    Sensor Noise (Gaussian)
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div
                    onClick={() => handleDisturbanceToggle('vibration')}
                    className={`flex items-center justify-center w-4 h-4 rounded-sm border ${
                      config.disturbances.vibration
                        ? 'border-[#ffb68d] bg-[#ffb68d] text-[#532200]'
                        : 'border-[#564338] bg-[#323538] group-hover:border-[#ffb68d]'
                    } transition-colors`}
                  >
                    {config.disturbances.vibration && (
                      <span className="material-symbols-outlined text-[13px] font-bold">check</span>
                    )}
                  </div>
                  <span className="text-[#e0e3e6]" onClick={() => handleDisturbanceToggle('vibration')}>
                    Vibration (Platform)
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div
                    onClick={() => handleDisturbanceToggle('atmosphericTurbulence')}
                    className={`flex items-center justify-center w-4 h-4 rounded-sm border ${
                      config.disturbances.atmosphericTurbulence
                        ? 'border-[#ffb68d] bg-[#ffb68d] text-[#532200]'
                        : 'border-[#564338] bg-[#323538] group-hover:border-[#ffb68d]'
                    } transition-colors`}
                  >
                    {config.disturbances.atmosphericTurbulence && (
                      <span className="material-symbols-outlined text-[13px] font-bold">check</span>
                    )}
                  </div>
                  <span className="text-[#e0e3e6]" onClick={() => handleDisturbanceToggle('atmosphericTurbulence')}>
                    Atmospheric Turbulence
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div
                    onClick={() => handleDisturbanceToggle('motionJitter')}
                    className={`flex items-center justify-center w-4 h-4 rounded-sm border ${
                      config.disturbances.motionJitter
                        ? 'border-[#ffb68d] bg-[#ffb68d] text-[#532200]'
                        : 'border-[#564338] bg-[#323538] group-hover:border-[#ffb68d]'
                    } transition-colors`}
                  >
                    {config.disturbances.motionJitter && (
                      <span className="material-symbols-outlined text-[13px] font-bold">check</span>
                    )}
                  </div>
                  <span className="text-[#e0e3e6]" onClick={() => handleDisturbanceToggle('motionJitter')}>
                    Camera Motion Jitter
                  </span>
                </label>
              </div>

              {/* Global Disturbance Intensity Panel */}
              <div className="flex flex-col gap-2 mt-2 p-3.5 border border-[#564338] bg-[#191c1e] rounded">
                <div className="flex justify-between items-center">
                  <label className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] uppercase tracking-wider">
                    Global Disturbance Intensity
                  </label>
                  <span className={`font-['JetBrains_Mono'] text-[11px] font-bold ${intensityInfo.color}`}>
                    {intensityInfo.text}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={config.disturbances.intensity}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      disturbances: {
                        ...config.disturbances,
                        intensity: parseInt(e.target.value),
                      },
                    })
                  }
                  className="mt-1.5"
                />
                <div className="flex justify-between font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3]/60 uppercase">
                  <span>Low</span>
                  <span>Max</span>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end pt-6 mt-6 border-t border-[#564338] gap-4">
            <button
              type="button"
              id="modal-cancel-btn"
              onClick={onClose}
              className="px-6 py-2.5 border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs uppercase tracking-wider hover:bg-[#272a2d] hover:border-[#a58c7f] transition-all rounded cursor-pointer"
            >
              CANCEL
            </button>
            <button
              type="submit"
              id="modal-start-sim-btn"
              className="px-8 py-2.5 bg-[#ffb68d] hover:bg-[#ff8a3d] text-[#532200] font-['JetBrains_Mono'] text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 rounded shadow-[0_0_15px_rgba(255,182,141,0.3)] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              START SIMULATION
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
