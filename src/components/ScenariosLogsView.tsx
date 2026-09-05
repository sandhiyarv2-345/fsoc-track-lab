import React, { useState } from 'react';
import { Scenario, LogEntry, SimulationConfig } from '../types';
import { sanitizeCsvRow } from '../services/csvSanitize';

interface ScenariosLogsViewProps {
  scenarios: Scenario[];
  logs: LogEntry[];
  activeScenarioId: string | null;
  onRunScenario: (scenario: Scenario) => void;
  onStopScenario: () => void;
  onOpenNewScenario: () => void;
  onClearLogs: () => void;
  isSimRunning: boolean;
}

export const ScenariosLogsView: React.FC<ScenariosLogsViewProps> = ({
  scenarios,
  logs,
  activeScenarioId,
  onRunScenario,
  onStopScenario,
  onOpenNewScenario,
  onClearLogs,
  isSimRunning,
}) => {
  const [filterQuery, setFilterQuery] = useState('');

  const filteredLogs = logs.filter(
    (l) =>
      l.event.toLowerCase().includes(filterQuery.toLowerCase()) ||
      l.data.toLowerCase().includes(filterQuery.toLowerCase()) ||
      l.time.includes(filterQuery)
  );

  const handleExportCSV = () => {
    const headers = ['Time', 'Event', 'Data', 'Type'];
    const rows = logs.map((l) => [l.time, l.event, `"${l.data.replace(/"/g, '""')}"`, l.type]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => sanitizeCsvRow(e).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `FSOC_Telemetry_Logs_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    window.print();
  };

  const getEventBadge = (event: string, type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return 'text-[#42e09c] border-[#42e09c]/30 bg-[#42e09c]/10';
      case 'warning':
        return 'text-[#ffb68d] border-[#ffb68d]/30 bg-[#ffb68d]/10';
      case 'error':
        return 'text-[#ffb4ab] border-[#ffb4ab]/30 bg-[#ffb4ab]/10';
      case 'metric':
        return 'text-[#65fdb6] border-[#65fdb6]/30 bg-[#65fdb6]/10';
      default:
        return 'text-[#ddc1b3] border-[#564338]/40 bg-[#323538]/40';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto mt-14 md:mt-0 tech-grid-bg relative p-4 md:p-8 select-none pb-16">
      {/* Header */}
      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-[#564338]/40 pb-4 gap-4">
        <div>
          <h1 className="font-['Hanken_Grotesk'] text-2xl md:text-3xl text-[#e0e3e6] font-bold tracking-tight">
            SCENARIOS &amp; SYSTEM LOGS
          </h1>
          <p className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] tracking-widest uppercase mt-1">
            Preset Test Protocols &amp; Live Telemetry Feed
          </p>
        </div>

        <button
          id="btn-new-scenario-top"
          onClick={onOpenNewScenario}
          className="bg-[#ff8a3d] hover:bg-[#ffb68d] text-[#682d00] font-['JetBrains_Mono'] text-xs uppercase font-bold px-4 py-2 rounded flex items-center gap-2 transition-all cursor-pointer shadow-[0_0_12px_rgba(255,138,61,0.25)]"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          NEW SCENARIO
        </button>
      </div>

      {/* 2-Column Split: Scenarios on Left, Logs on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
        {/* Left Column: Scenario Manager */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="flex justify-between items-center pb-2 border-b border-[#564338]/40">
            <h2 className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-[#ff8a3d]">folder_special</span>
              SCENARIO MANAGER
            </h2>
            <span className="text-[10px] text-[#a58c7f] font-mono">{scenarios.length} AVAILABLE</span>
          </div>

          <div className="flex flex-col gap-3">
            {scenarios.map((scen) => {
              const isRunningThis = isSimRunning && activeScenarioId === scen.id;
              return (
                <div
                  key={scen.id}
                  className={`p-4 bg-[#1d2022] border rounded-lg transition-all flex flex-col gap-2 relative overflow-hidden ${
                    isRunningThis
                      ? 'border-[#42e09c] shadow-[0_0_15px_rgba(66,224,156,0.2)]'
                      : 'border-[#564338]/40 hover:border-[#a58c7f]/50'
                  }`}
                >
                  {isRunningThis && (
                    <div className="absolute top-0 right-0 left-0 h-1 bg-[#42e09c] animate-pulse"></div>
                  )}

                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <h3 className="font-['Hanken_Grotesk'] text-base font-bold text-[#e0e3e6]">
                        {scen.title}
                      </h3>
                      {isRunningThis && (
                        <span className="px-2 py-0.5 rounded bg-[#42e09c]/20 text-[#42e09c] text-[9px] font-mono font-bold uppercase">
                          ACTIVE
                        </span>
                      )}
                    </div>

                    <button
                      id={`btn-run-${scen.id}`}
                      onClick={() => {
                        if (isRunningThis) {
                          onStopScenario();
                        } else {
                          onRunScenario(scen);
                        }
                      }}
                      className={`px-4 py-1.5 rounded font-['JetBrains_Mono'] text-xs font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                        isRunningThis
                          ? 'bg-[#ffb4ab] text-[#690005] hover:bg-[#ff8a3d]'
                          : 'bg-[#ffb68d] hover:bg-[#ff8a3d] text-[#532200]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {isRunningThis ? 'stop' : 'play_arrow'}
                      </span>
                      {isRunningThis ? 'STOP' : 'RUN'}
                    </button>
                  </div>

                  <p className="font-['Hanken_Grotesk'] text-xs text-[#ddc1b3]/90">
                    {scen.description}
                  </p>

                  <div className="flex justify-between items-center pt-2 border-t border-[#564338]/30 font-['JetBrains_Mono'] text-[10px] text-[#a58c7f]">
                    <span>Last Run: {scen.lastRun}</span>
                    <span className="text-[#ffb68d]">MACH {scen.config.targetSpeedMach} &bull; {scen.config.trajectory}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Performance & Telemetry Logs Terminal */}
        <div className="lg:col-span-7 flex flex-col bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 shadow-sm min-h-[500px]">
          {/* Log Controls Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 mb-4 border-b border-[#564338]/40 gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-[#ff8a3d]">terminal</span>
              <h2 className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] uppercase tracking-widest font-bold">
                PERFORMANCE LOG
              </h2>
              <span className="text-[9px] text-[#42e09c] font-['JetBrains_Mono'] uppercase">Live Events</span>
            </div>

            {/* Filter Input */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-48">
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full bg-[#101416] border border-[#564338] rounded px-2.5 py-1 text-xs font-['JetBrains_Mono'] text-[#e0e3e6] placeholder-[#a58c7f] focus:outline-none focus:border-[#ffb68d]"
                />
                {filterQuery && (
                  <button
                    onClick={() => setFilterQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#a58c7f] hover:text-[#e0e3e6]"
                  >
                    &times;
                  </button>
                )}
              </div>
              <button
                onClick={onClearLogs}
                title="Clear Logs"
                className="p-1 text-[#a58c7f] hover:text-[#ffb4ab] transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          </div>

          {/* Log Terminal Window */}
          <div className="flex-1 bg-[#101416] border border-[#564338]/30 rounded p-3 overflow-y-auto max-h-[380px] font-['JetBrains_Mono'] text-xs flex flex-col gap-1.5">
            {filteredLogs.length === 0 ? (
              <div className="text-[#a58c7f] text-center py-12 flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-2xl opacity-40">receipt_long</span>
                <span>No telemetry log entries found</span>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 py-1 px-2 rounded hover:bg-[#191c1e] transition-colors border-b border-[#272a2d]/30"
                >
                  <span className="text-[#a58c7f] text-[10px] min-w-[55px] font-mono mt-0.5">
                    {log.time}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${getEventBadge(
                      log.event,
                      log.type
                    )}`}
                  >
                    {log.event}
                  </span>
                  <span className="text-[#e0e3e6] flex-1 break-all text-[11px] leading-relaxed">
                    {log.data}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Log Actions Footer */}
          <div className="flex flex-col sm:flex-row justify-between items-center pt-4 mt-3 border-t border-[#564338]/40 gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#42e09c] animate-pulse"></span>
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#42e09c] uppercase tracking-wider">
                {isSimRunning ? 'Telemetry Stream Active (50Hz)' : 'Telemetry Stream Standby'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 bg-[#323538] hover:bg-[#363a3c] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-[11px] uppercase rounded flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">file_download</span>
                EXPORT CSV
              </button>
              <button
                onClick={handleExportPDF}
                className="px-3 py-1.5 bg-[#323538] hover:bg-[#363a3c] border border-[#564338] text-[#e0e3e6] font-['JetBrains_Mono'] text-[11px] uppercase rounded flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">print</span>
                EXPORT PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
