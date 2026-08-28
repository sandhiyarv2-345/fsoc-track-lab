import React, { useState } from 'react';

interface SupportModalProps {
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ onClose }) => {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none overflow-y-auto">
      <div className="bg-[#1d2022] border border-[#564338] rounded-lg max-w-xl w-full p-6 text-left relative shadow-2xl">
        <div className="flex justify-between items-center border-b border-[#564338]/50 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb68d]">contact_support</span>
            <h2 className="font-['Hanken_Grotesk'] text-lg font-bold text-[#e0e3e6] uppercase tracking-wide">
              Engineering Support &amp; Telemetry Feed
            </h2>
          </div>
          <button onClick={onClose} className="text-[#ddc1b3] hover:text-[#ffb68d] p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-4xl text-[#42e09c]">check_circle</span>
            <h3 className="font-['Hanken_Grotesk'] text-base font-bold text-[#e0e3e6]">
              Diagnostic Ticket Dispatched
            </h3>
            <p className="font-['Hanken_Grotesk'] text-xs text-[#ddc1b3] max-w-md">
              Your flight kinematics test telemetry and logs have been recorded. Our optical test engineers will review the trace.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2 bg-[#ffb68d] hover:bg-[#ff8a3d] text-[#532200] font-['JetBrains_Mono'] text-xs uppercase font-bold rounded"
            >
              Return to Lab
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 font-['Hanken_Grotesk'] text-xs text-[#ddc1b3]">
            <div className="flex flex-col gap-1">
              <label className="font-['JetBrains_Mono'] text-[10px] uppercase text-[#e0e3e6]">
                Issue Category
              </label>
              <select className="bg-[#323538] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs p-2 rounded focus:outline-none">
                <option>Gimbal Servo Oscillation / Phase Margin</option>
                <option>Kalman Filter Divergence under Jitter</option>
                <option>Atmospheric Turbulence Model Calibration</option>
                <option>Custom Flight Profile Ingestion</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-['JetBrains_Mono'] text-[10px] uppercase text-[#e0e3e6]">
                Diagnostic Description
              </label>
              <textarea
                rows={3}
                required
                placeholder="Describe scenario, target speed, and tracking anomalies..."
                className="bg-[#323538] border border-[#564338] text-[#e0e3e6] text-xs p-2 rounded focus:outline-none focus:border-[#ffb68d]"
              ></textarea>
            </div>

            <div className="p-3 bg-[#101416] border border-[#564338]/40 rounded font-['JetBrains_Mono'] text-[11px] text-[#42e09c]">
              &bull; Auto-attaching current simulation configuration &amp; last 100 telemetry frames
            </div>

            <div className="pt-3 border-t border-[#564338]/40 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#323538] hover:bg-[#363a3c] text-[#e0e3e6] font-['JetBrains_Mono'] text-xs uppercase rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-[#ffb68d] hover:bg-[#ff8a3d] text-[#532200] font-['JetBrains_Mono'] text-xs uppercase font-bold rounded"
              >
                Submit Diagnostics
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
