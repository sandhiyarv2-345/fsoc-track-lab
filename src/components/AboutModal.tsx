import React from 'react';

interface ModalProps {
  onClose: () => void;
}

export const AboutModal: React.FC<ModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#1d2022] border border-[#564338] rounded-lg max-w-2xl w-full p-6 text-left relative shadow-2xl">
        <div className="flex justify-between items-center border-b border-[#564338]/50 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb68d]">info</span>
            <h2 className="font-['Hanken_Grotesk'] text-lg font-bold text-[#e0e3e6] uppercase tracking-wide">
              About FSOC Track Lab
            </h2>
          </div>
          <button onClick={onClose} className="text-[#ddc1b3] hover:text-[#ffb68d] p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="space-y-4 font-['Hanken_Grotesk'] text-sm text-[#ddc1b3] leading-relaxed max-h-[70vh] overflow-y-auto pr-2">
          <p>
            <strong className="text-[#ffb68d]">Free Space Optical Communications (FSOC)</strong> delivers fiber-like gigabit throughput wirelessly using narrow infrared laser beams. However, mobile platforms (such as UAVs, aircraft, high-speed maritime vessels, and orbital satellites) suffer from continuous atmospheric scintillation, structural vibration, and rapid relative angular velocities.
          </p>
          <p>
            The critical bottleneck in establishing an FSOC optical link is <strong className="text-[#e0e3e6]">coarse spatial acquisition</strong>: steering the narrow-beam gimbal from an initial search cone (±45°) down to sub-milliradian precision before handing over to fine steering fast-steering mirrors (FSMs).
          </p>
          <div className="p-3 bg-[#101416] border border-[#564338]/40 rounded font-['JetBrains_Mono'] text-xs text-[#65fdb6]">
            Target Acquisition Envelope: ±0.05 μrad Precision | &lt; 12ms Control Loop Latency | 99.999% Reliability
          </div>
          <p>
            FSOC Track Lab provides an aerospace-grade simulation testbed implementing AI computer vision centroiding, predictive Kalman filtering, disturbance rejection controllers, and real-time kinematic 6-DOF tracking telemetry.
          </p>
        </div>

        <div className="mt-6 pt-3 border-t border-[#564338]/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#ffb68d] hover:bg-[#ff8a3d] text-[#532200] font-['JetBrains_Mono'] text-xs uppercase font-bold rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
