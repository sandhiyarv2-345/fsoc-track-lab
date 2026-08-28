import React from 'react';
import { TelemetryPoint } from '../types';

interface BottomTelemetryProps {
  telemetry: TelemetryPoint;
}

export const BottomTelemetry: React.FC<BottomTelemetryProps> = ({ telemetry }) => {
  const isLocked = telemetry.status === 'LOCKED';
  const isAcquiring = telemetry.status === 'ACQUIRING';

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around md:justify-between items-center h-12 px-4 md:px-8 bg-[#0B1017] border-t border-[#26303B] md:ml-64 md:w-[calc(100%-16rem)] shadow-lg select-none">
      {/* FPS Metric */}
      <div className="flex items-center gap-2 text-[#8994A3] hover:text-[#F2F4F7] transition-colors cursor-default">
        <span className="material-symbols-outlined text-[17px] text-[#8994A3]">speed</span>
        <div className="flex flex-col">
          <span className="font-['JetBrains_Mono'] text-[9px] uppercase leading-none tracking-widest text-[#8994A3]">FPS</span>
          <span className="font-['JetBrains_Mono'] text-[15px] leading-none text-[#38D996] font-medium mt-0.5">{telemetry.fps}</span>
        </div>
      </div>

      {/* PAN Metric */}
      <div className="flex items-center gap-2 text-[#8994A3] hover:text-[#F2F4F7] transition-colors cursor-default">
        <span className="material-symbols-outlined text-[17px] text-[#8994A3]">rotate_right</span>
        <div className="flex flex-col">
          <span className="font-['JetBrains_Mono'] text-[9px] uppercase leading-none tracking-widest text-[#8994A3]">PAN</span>
          <span className="font-['JetBrains_Mono'] text-[15px] leading-none text-[#F2F4F7] font-medium mt-0.5">{telemetry.pan.toFixed(1)}°</span>
        </div>
      </div>

      {/* TILT Metric */}
      <div className="flex items-center gap-2 text-[#8994A3] hover:text-[#F2F4F7] transition-colors cursor-default">
        <span className="material-symbols-outlined text-[17px] text-[#8994A3]">height</span>
        <div className="flex flex-col">
          <span className="font-['JetBrains_Mono'] text-[9px] uppercase leading-none tracking-widest text-[#8994A3]">TILT</span>
          <span className="font-['JetBrains_Mono'] text-[15px] leading-none text-[#F2F4F7] font-medium mt-0.5">{telemetry.tilt.toFixed(1)}°</span>
        </div>
      </div>

      {/* ERROR Metric */}
      <div className="flex items-center gap-2 text-[#8994A3] hover:text-[#F2F4F7] transition-colors cursor-default">
        <span className="material-symbols-outlined text-[17px] text-[#8994A3]">error_outline</span>
        <div className="flex flex-col">
          <span className="font-['JetBrains_Mono'] text-[9px] uppercase leading-none tracking-widest text-[#8994A3]">ERROR</span>
          <span className={`font-['JetBrains_Mono'] text-[15px] leading-none font-medium mt-0.5 ${telemetry.totalError > 1.5 ? 'text-[#ffb4ab]' : 'text-[#F2F4F7]'}`}>
            {telemetry.totalError.toFixed(2)}°
          </span>
        </div>
      </div>

      {/* CONFIDENCE Metric */}
      <div className="flex items-center gap-2 text-[#8994A3] hover:text-[#F2F4F7] transition-colors cursor-default">
        <span className="material-symbols-outlined text-[17px] text-[#8994A3]">verified</span>
        <div className="flex flex-col">
          <span className="font-['JetBrains_Mono'] text-[9px] uppercase leading-none tracking-widest text-[#8994A3]">CONFIDENCE</span>
          <span className="font-['JetBrains_Mono'] text-[15px] leading-none text-[#F2F4F7] font-medium mt-0.5">{telemetry.confidence.toFixed(1)}%</span>
        </div>
      </div>

      {/* LOCK Status Indicator */}
      <div className={`flex items-center gap-2 cursor-default font-bold ${
        isLocked ? 'text-[#38D996]' : isAcquiring ? 'text-[#FF8A3D]' : 'text-[#8994A3]'
      }`}>
        <span
          className={`material-symbols-outlined text-[17px] ${isLocked ? 'text-[#38D996]' : ''}`}
          style={{ fontVariationSettings: isLocked ? "'FILL' 1" : "'FILL' 0" }}
        >
          {isLocked ? 'lock' : isAcquiring ? 'track_changes' : 'lock_open'}
        </span>
        <div className="flex flex-col">
          <span className="font-['JetBrains_Mono'] text-[9px] uppercase leading-none text-[#8994A3]">LOCK</span>
          <span className={`font-['JetBrains_Mono'] text-[14px] leading-none tracking-wider mt-0.5 ${
            isLocked ? 'text-[#38D996] glow-secondary' : isAcquiring ? 'text-[#FF8A3D]' : 'text-[#8994A3]'
          }`}>
            {isLocked ? 'ACTIVE' : isAcquiring ? 'ACQUIRING' : 'SEARCHING'}
          </span>
        </div>
      </div>
    </nav>
  );
};
