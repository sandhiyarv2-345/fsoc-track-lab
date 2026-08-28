import React from 'react';

interface DocumentationModalProps {
  onClose: () => void;
}

export const DocumentationModal: React.FC<DocumentationModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none overflow-y-auto">
      <div className="bg-[#1d2022] border border-[#564338] rounded-lg max-w-4xl w-full p-6 text-left relative shadow-2xl max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[#564338]/50 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb68d] text-2xl">menu_book</span>
            <div>
              <h2 className="font-['Hanken_Grotesk'] text-xl font-bold text-[#e0e3e6] uppercase tracking-wide">
                FSOC Virtual Track Lab Documentation
              </h2>
              <p className="font-['JetBrains_Mono'] text-xs text-[#ddc1b3]">
                Theoretical Foundations &bull; Control Kinematics &bull; Operational Guide
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#ddc1b3] hover:text-[#ffb68d] p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2 font-['Hanken_Grotesk'] text-sm text-[#ddc1b3] leading-relaxed">
          {/* Section 1 */}
          <div>
            <h3 className="font-['JetBrains_Mono'] text-sm font-bold text-[#ffb68d] uppercase mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">satellite_alt</span>
              1. Two-Stage Optical Acquisition Architecture
            </h3>
            <p>
              Free Space Optical Communication (FSOC) utilizes high-intensity, diffraction-limited laser beams (typically 1550nm NIR band) offering data transmission rates exceeding 100 Gbps. Because optical beam divergence is typically under 100 μrad, pointing errors of even 1 mrad cause catastrophic link outages.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div className="p-3 bg-[#101416] border border-[#564338]/40 rounded font-['JetBrains_Mono'] text-xs">
                <span className="text-[#ff8a3d] font-bold block mb-1">Stage 1: Coarse Alignment (This Lab)</span>
                Wide-angle optical sensor (5°–90° FOV) + pan-tilt gimbal servo loop tracks beacon from initial uncertainty down to &lt; 0.5° handover cone.
              </div>
              <div className="p-3 bg-[#101416] border border-[#564338]/40 rounded font-['JetBrains_Mono'] text-xs">
                <span className="text-[#42e09c] font-bold block mb-1">Stage 2: Fine Tracking (FSM)</span>
                Piezoelectric Fast Steering Mirror + 4-quadrant photodiode achieves sub-microradian closed-loop lock at kHz frequencies.
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div>
            <h3 className="font-['JetBrains_Mono'] text-sm font-bold text-[#ffb68d] uppercase mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">psychology</span>
              2. AI Centroid &amp; Beacon Discrimination
            </h3>
            <p>
              Under high background clutter, solar reflections, and multi-agent operations, conventional thresholding fails. FSOC Track Lab implements a convolutional deep beacon extractor capable of isolating the designated optical transceiver beacon and predicting trajectory dynamics via continuous-discrete extended Kalman filtering.
            </p>
          </div>

          {/* Section 3 */}
          <div>
            <h3 className="font-['JetBrains_Mono'] text-sm font-bold text-[#ffb68d] uppercase mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">keyboard</span>
              3. Lab Hotkeys &amp; Controls
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-['JetBrains_Mono'] text-xs">
              <div className="p-2 bg-[#191c1e] rounded border border-[#564338]/30">
                <kbd className="px-1.5 py-0.5 bg-[#323538] rounded text-[#ffb68d]">Space / P</kbd>
                <span className="block mt-1 text-[#e0e3e6]">Pause / Resume</span>
              </div>
              <div className="p-2 bg-[#191c1e] rounded border border-[#564338]/30">
                <kbd className="px-1.5 py-0.5 bg-[#323538] rounded text-[#ffb68d]">Arrows</kbd>
                <span className="block mt-1 text-[#e0e3e6]">PTZ Nudge</span>
              </div>
              <div className="p-2 bg-[#191c1e] rounded border border-[#564338]/30">
                <kbd className="px-1.5 py-0.5 bg-[#323538] rounded text-[#ffb68d]">1 - 4</kbd>
                <span className="block mt-1 text-[#e0e3e6]">Zoom (1x - 8x)</span>
              </div>
              <div className="p-2 bg-[#191c1e] rounded border border-[#564338]/30">
                <kbd className="px-1.5 py-0.5 bg-[#323538] rounded text-[#ffb68d]">Drag</kbd>
                <span className="block mt-1 text-[#e0e3e6]">3D View Orbit</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-[#564338]/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#ffb68d] hover:bg-[#ff8a3d] text-[#532200] font-['JetBrains_Mono'] text-xs uppercase font-bold rounded"
          >
            Close Documentation
          </button>
        </div>
      </div>
    </div>
  );
};
