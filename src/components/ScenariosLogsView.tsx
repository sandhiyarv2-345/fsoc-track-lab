/**
 * FSOC Track Lab — Performance Log (Consolidated)
 *
 * Telemetry log viewer with filter, CSV/PDF export.
 * Scenario management moved to Benchmark page (18 PS scenarios).
 */

import React, { useState } from 'react';
import { LogEntry } from '../types';
import { sanitizeCsvRow } from '../services/csvSanitize';

interface ScenariosLogsViewProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  isSimRunning: boolean;
}

export const ScenariosLogsView: React.FC<ScenariosLogsViewProps> = ({
  logs,
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
    const now = new Date();
    const exportTimestamp = now.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });

    const logRows = logs.map((l) => {
      const badgeColor =
        l.type === 'success' ? '#42e09c' :
        l.type === 'warning' ? '#ffb68d' :
        l.type === 'error' ? '#ffb4ab' :
        l.type === 'metric' ? '#65fdb6' : '#ddc1b3';
      return `<tr>
        <td style="padding:4px 8px;font-family:monospace;font-size:11px;color:#666;white-space:nowrap;border-bottom:1px solid #eee">${l.time}</td>
        <td style="padding:4px 8px;font-family:monospace;font-size:10px;font-weight:bold;color:${badgeColor};border-bottom:1px solid #eee;white-space:nowrap">${l.event}</td>
        <td style="padding:4px 8px;font-family:monospace;font-size:11px;color:#333;border-bottom:1px solid #eee">${l.data}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<title>FSOC Track Lab — Performance Log</title>
<style>
  body { font-family: 'Courier New', monospace; margin: 40px; color: #222; background: #fff; }
  h1 { font-size: 22px; margin: 0 0 4px 0; color: #111; letter-spacing: 1px; }
  h2 { font-size: 13px; margin: 0 0 20px 0; color: #666; font-weight: normal; }
  .meta { font-size: 11px; color: #555; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #333; font-size: 11px; color: #333; }
  .footer { margin-top: 24px; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 8px; }
  @media print {
    body { margin: 20px; }
    @page { margin: 1.5cm; }
  }
</style>
</head>
<body>
  <h1>FSOC TRACK LAB</h1>
  <h2>PERFORMANCE LOG</h2>
  <div class="meta">Exported: ${exportTimestamp} IST</div>
  <div class="meta">Total Events: ${logs.length}</div>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Event</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${logRows || '<tr><td colspan="3" style="padding:20px;text-align:center;color:#999;font-size:12px">No log entries</td></tr>'}
    </tbody>
  </table>
  <div class="footer">FSOC Track Lab — Performance Log Export</div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
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
            PERFORMANCE LOG
          </h1>
          <p className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] tracking-widest uppercase mt-1">
            Live Telemetry Feed &bull; Event History
          </p>
        </div>
      </div>

      {/* Log Terminal — Full Width */}
      <div className="flex-1 flex flex-col bg-[#1d2022] border border-[#564338]/40 rounded-lg p-5 shadow-sm min-h-[500px]">
        {/* Log Controls Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 mb-4 border-b border-[#564338]/40 gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-[#ff8a3d]">terminal</span>
            <h2 className="font-['JetBrains_Mono'] text-[11px] text-[#ddc1b3] uppercase tracking-widest font-bold">
              TELEMETRY LOG
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
        <div className="flex-1 bg-[#101416] border border-[#564338]/30 rounded p-3 overflow-y-auto max-h-[520px] font-['JetBrains_Mono'] text-xs flex flex-col gap-1.5">
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
  );
};
