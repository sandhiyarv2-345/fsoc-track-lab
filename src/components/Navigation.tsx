import React from 'react';
import { NavScreen } from '../types';

interface NavigationProps {
  currentScreen: NavScreen;
  onNavigate: (screen: NavScreen) => void;
  onOpenNewSimulation: () => void;
  onOpenHelp: () => void;
  onOpenSupport: () => void;
  isSimRunning?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentScreen,
  onNavigate,
  onOpenNewSimulation,
  onOpenHelp,
  onOpenSupport,
  isSimRunning = false,
}) => {
  const navItems = [
    { id: 'dashboard' as NavScreen, label: 'Dashboard', icon: 'dashboard' },
    { id: 'simulation' as NavScreen, label: 'Simulation', icon: 'precision_manufacturing', isAction: true },
    { id: 'cameraview' as NavScreen, label: 'Camera View', icon: 'videocam' },
    { id: 'world3d' as NavScreen, label: '3D World', icon: 'language' },
    { id: 'scenarios' as NavScreen, label: 'Scenarios', icon: 'list_alt' },
    { id: 'performance' as NavScreen, label: 'Performance', icon: 'analytics' },
    { id: 'logs' as NavScreen, label: 'Logs', icon: 'description' },
    { id: 'settings' as NavScreen, label: 'Settings', icon: 'settings' },
  ];

  return (
    <>
      {/* Mobile Top App Bar */}
      <header className="md:hidden fixed top-0 left-0 w-full z-50 bg-[#1d2022] border-b border-[#564338]/40 flex justify-between items-center px-4 h-14">
        <button
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2 text-left"
        >
          <span className="material-symbols-outlined text-[#ffb68d] text-2xl">radar</span>
          <span className="font-['Hanken_Grotesk'] text-lg font-bold tracking-tighter text-[#e0e3e6]">
            FSOC TRACK LAB
          </span>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#101416] border border-[#42e09c]/30">
            <span className="w-2 h-2 rounded-full bg-[#42e09c] animate-pulse"></span>
            <span className="font-['JetBrains_Mono'] text-[9px] text-[#42e09c] tracking-widest uppercase">
              {isSimRunning ? 'SIM ACTIVE' : 'SYSTEM READY'}
            </span>
          </div>
          <button 
            onClick={() => onNavigate('settings')}
            className="p-1.5 text-[#ddc1b3] hover:text-[#ffb68d]"
            title="Settings"
          >
            <span className="material-symbols-outlined text-xl">settings</span>
          </button>
        </div>
      </header>

      {/* Desktop Side Navigation */}
      <nav className="hidden md:flex flex-col py-5 h-screen w-64 flex-shrink-0 bg-[#191c1e] border-r border-[#564338]/40 z-40 fixed left-0 top-0 select-none">
        {/* Lab Brand Header */}
        <div className="px-5 mb-7 flex flex-col gap-1">
          <div className="flex items-center gap-3 mb-1.5 cursor-pointer" onClick={() => onNavigate('landing')}>
            <div className="w-9 h-9 rounded-full overflow-hidden bg-[#101416] border border-[#a58c7f]/30 flex-shrink-0 flex items-center justify-center relative shadow-sm">
              <img
                alt="Lab Technician"
                className="w-full h-full object-cover grayscale opacity-85"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCRqYMhFqnKxZ2Nax8KbRTdD1WTuaPxIJkZmS0oVLv7wY_qd8ULPZcpGdyL9oFMBIUwuz1zXk0tiSJb-Vw8eKw_1sLrMcGIp65sCKK-jS8llNlRNk4fw3g6Ogs5TCktSJ1WZRslwUD0nGzfBVQUTDYSL_sMS5Xhjm_ysxdKcPtImSeRPf5fh8tj2kPt3RyBf8WTKm8szcd1T4j629fulXm0lptXcth32x6C1Sn_USsZSUCPGACK45qESg"
                onError={(e) => {
                  // Fallback to radar icon if hotlinked image fails
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <span className="material-symbols-outlined text-[#ffb68d] text-xl absolute">radar</span>
            </div>
            <div>
              <h1 className="font-['Hanken_Grotesk'] text-[17px] leading-tight font-bold tracking-tight text-[#ffb68d]">
                FSOC TRACK LAB
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-0.5">
            <div className={`w-2 h-2 rounded-full ${isSimRunning ? 'bg-[#ff8a3d]' : 'bg-[#42e09c]'} shadow-[0_0_8px_rgba(66,224,156,0.6)] animate-pulse`}></div>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#42e09c] tracking-widest uppercase font-medium">
              {isSimRunning ? 'SIM RUNNING' : 'SYSTEM READY'}
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                id={`nav-item-${item.id}`}
                onClick={() => {
                  if (item.id === 'simulation') {
                    onOpenNewSimulation();
                  } else {
                    onNavigate(item.id);
                  }
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg font-['JetBrains_Mono'] text-[11px] uppercase tracking-wider transition-all duration-150 text-left group ${
                  isActive
                    ? 'bg-[#ff8a3d] text-[#682d00] font-bold shadow-[0_0_12px_rgba(255,138,61,0.25)] scale-[0.98]'
                    : 'text-[#ddc1b3] hover:bg-[#272a2d] hover:text-[#e0e3e6]'
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[19px] transition-colors ${
                    isActive
                      ? 'text-[#532200]'
                      : 'text-[#a58c7f] group-hover:text-[#ffb68d]'
                  }`}
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.id === 'simulation' && (
                  <span className="text-[10px] bg-[#323538] text-[#ffb68d] px-1.5 py-0.5 rounded font-mono font-normal">
                    CONFIG
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer Actions: Help & Support */}
        <div className="px-3 mt-auto pt-3 border-t border-[#564338]/30 space-y-1">
          <button
            id="nav-btn-help"
            onClick={onOpenHelp}
            className="w-full flex items-center gap-3.5 px-3.5 py-2 text-[#ddc1b3] hover:bg-[#272a2d] hover:text-[#e0e3e6] rounded-lg font-['JetBrains_Mono'] text-[11px] uppercase tracking-wider transition-all"
          >
            <span className="material-symbols-outlined text-[19px] text-[#a58c7f]">help</span>
            <span>Help</span>
          </button>
          <button
            id="nav-btn-support"
            onClick={onOpenSupport}
            className="w-full flex items-center gap-3.5 px-3.5 py-2 text-[#ddc1b3] hover:bg-[#272a2d] hover:text-[#e0e3e6] rounded-lg font-['JetBrains_Mono'] text-[11px] uppercase tracking-wider transition-all"
          >
            <span className="material-symbols-outlined text-[19px] text-[#a58c7f]">contact_support</span>
            <span>Support</span>
          </button>
        </div>
      </nav>
    </>
  );
};
