import React from 'react';

interface ModalProps {
  onClose: () => void;
}

export const TeamModal: React.FC<ModalProps> = ({ onClose }) => {
  const team = [
    {
      role: 'Principal Optical Systems Lead',
      specialty: 'Laser Transceiver Design & Scintillation Mitigation',
      callsign: 'OPT-LEAD-01',
    },
    {
      role: 'Gimbal Controls & Kinematics Engineer',
      specialty: 'Adaptive PID & Fast Steering Mirror (FSM) Integration',
      callsign: 'CTRL-SERVO-02',
    },
    {
      role: 'Computer Vision & AI Tracking Specialist',
      specialty: 'Deep Beacon Localization & Kalman Filter Prediction',
      callsign: 'VISION-AI-03',
    },
    {
      role: 'Flight Systems & Field Validation',
      specialty: 'Mobile Airborne Terminal Integration & Telemetry',
      callsign: 'FLIGHT-TEST-04',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#1d2022] border border-[#564338] rounded-lg max-w-2xl w-full p-6 text-left relative shadow-2xl">
        <div className="flex justify-between items-center border-b border-[#564338]/50 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb68d]">groups</span>
            <h2 className="font-['Hanken_Grotesk'] text-lg font-bold text-[#e0e3e6] uppercase tracking-wide">
              FSOC Research Team
            </h2>
          </div>
          <button onClick={onClose} className="text-[#ddc1b3] hover:text-[#ffb68d] p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto pr-1">
          {team.map((member, i) => (
            <div key={i} className="p-3.5 bg-[#101416] border border-[#564338]/40 rounded flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#ff8a3d] uppercase font-bold tracking-wider">
                  {member.callsign}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#42e09c] animate-pulse"></span>
              </div>
              <h3 className="font-['Hanken_Grotesk'] text-sm font-semibold text-[#e0e3e6]">
                {member.role}
              </h3>
              <p className="font-['Hanken_Grotesk'] text-xs text-[#ddc1b3]/80 mt-1">
                {member.specialty}
              </p>
            </div>
          ))}
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
