import React, { useState } from 'react';
import { AboutModal } from './AboutModal';
import { TeamModal } from './TeamModal';

interface LandingPageProps {
  onEnterLab: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterLab }) => {
  const [showAbout, setShowAbout] = useState(false);
  const [showTeam, setShowTeam] = useState(false);

  return (
    <div className="bg-[#101416] text-[#e0e3e6] font-['Hanken_Grotesk'] h-screen w-screen overflow-hidden flex flex-col relative grid-bg glow-earth select-none">
      {/* Navbar / Top Bar */}
      <header className="flex justify-between items-center px-6 md:px-10 py-4 z-50 relative border-b border-[#564338]/30">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[#ffb68d] text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            satellite_alt
          </span>
          <span className="font-['Hanken_Grotesk'] text-lg tracking-tighter font-bold text-[#e0e3e6]">
            FSOC TRACK LAB
          </span>
        </div>
        <nav className="hidden md:flex gap-8">
          <button
            id="landing-nav-about"
            onClick={() => setShowAbout(true)}
            className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] hover:text-[#ffb68d] transition-colors duration-200 uppercase tracking-widest"
          >
            About
          </button>
          <button
            id="landing-nav-team"
            onClick={() => setShowTeam(true)}
            className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] hover:text-[#ffb68d] transition-colors duration-200 uppercase tracking-widest"
          >
            Team
          </button>
        </nav>
        <div className="md:hidden flex items-center gap-3">
          <button 
            onClick={() => setShowAbout(true)}
            className="text-xs text-[#ffb68d] uppercase font-mono px-2 py-1 rounded border border-[#ffb68d]/30"
          >
            About
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center items-center text-center px-4 md:px-8 z-10 relative">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#ffb68d]/30 bg-[#ffb68d]/10 mb-2 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-[#ffb68d] animate-pulse"></div>
            <span className="font-['JetBrains_Mono'] text-[9px] text-[#ffb68d] uppercase tracking-widest font-medium">
              System Ready
            </span>
          </div>

          <h1 className="font-['Hanken_Grotesk'] text-3xl sm:text-4xl md:text-[56px] md:leading-[64px] font-extrabold tracking-tight text-[#e0e3e6]">
            AI-Powered Coarse Alignment for Mobile <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ffb68d] to-[#ff8a3d]">
              Free Space Optical
            </span> Communication
          </h1>

          <p className="font-['Hanken_Grotesk'] text-base md:text-lg text-[#ddc1b3] max-w-2xl mt-1 leading-relaxed">
            A virtual laboratory for developing and testing advanced camera tracking algorithms designed for next-generation mobile FSOC terminals. Simulate, analyze, and optimize targeting protocols in high-fidelity 3D environments.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-6">
            <button
              id="landing-enter-lab-btn"
              onClick={onEnterLab}
              className="bg-[#ffb68d] hover:bg-[#ff8a3d] text-[#532200] font-['JetBrains_Mono'] text-xs uppercase tracking-widest font-bold px-8 py-4 rounded transition-all duration-200 flex items-center justify-center gap-2.5 shadow-[0_0_20px_rgba(255,182,141,0.35)] hover:shadow-[0_0_30px_rgba(255,182,141,0.55)] cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              ENTER LAB
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </main>

      {/* Engineering Stats Footer */}
      <footer className="border-t border-[#564338]/30 bg-[#101416]/70 backdrop-blur-md z-10 relative">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#65fdb6] text-[18px]">speed</span>
            <div className="flex flex-col text-left">
              <span className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] uppercase tracking-widest">Latency</span>
              <span className="font-['JetBrains_Mono'] text-lg text-[#e0e3e6] font-medium">&lt;12ms</span>
            </div>
          </div>
          <div className="hidden md:block w-px h-8 bg-[#564338]/50"></div>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#65fdb6] text-[18px]">my_location</span>
            <div className="flex flex-col text-left">
              <span className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] uppercase tracking-widest">Precision</span>
              <span className="font-['JetBrains_Mono'] text-lg text-[#e0e3e6] font-medium">0.05 μrad</span>
            </div>
          </div>
          <div className="hidden md:block w-px h-8 bg-[#564338]/50"></div>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#65fdb6] text-[18px]">check_circle</span>
            <div className="flex flex-col text-left">
              <span className="font-['JetBrains_Mono'] text-[9px] text-[#ddc1b3] uppercase tracking-widest">Uptime Target</span>
              <span className="font-['JetBrains_Mono'] text-lg text-[#e0e3e6] font-medium">99.999%</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Decorative overlay lines */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#ffb68d]/20 to-transparent"></div>
        <div className="absolute top-3/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#ffb68d]/20 to-transparent"></div>
        <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-[#ffb68d]/10 to-transparent"></div>
        <div className="absolute top-0 right-1/4 w-px h-full bg-gradient-to-b from-transparent via-[#ffb68d]/10 to-transparent"></div>
      </div>

      {/* About & Team Modals */}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showTeam && <TeamModal onClose={() => setShowTeam(false)} />}
    </div>
  );
};
