import React, { useEffect, useRef } from 'react';
import { Terminal, Trash2 } from 'lucide-react';

export default function ActivityLogs({ logs, onClearLogs }) {
  const terminalEndRef = useRef(null);

  // Auto-scroll logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const getLogColor = (type) => {
    switch (type) {
      case 'success':
        return 'text-success';
      case 'error':
        return 'text-error font-semibold';
      case 'warning':
        return 'text-warning';
      default:
        return 'text-gray-300';
    }
  };

  return (
    <div className="glass-panel rounded-[20px] overflow-hidden border border-[var(--border-color)]">
      {/* Log Header */}
      <div className="px-5 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]/50 flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-main)]">
          <Terminal className="w-4 h-4 text-brand" />
          <span>Real-Time Activity Log</span>
        </div>
        
        {logs && logs.length > 0 && (
          <button
            onClick={onClearLogs}
            className="text-xs text-[var(--text-muted)] hover:text-error transition-colors flex items-center gap-1 active:scale-95"
            title="Clear logs history"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Terminal View */}
      <div className="p-4 bg-black/40 font-mono text-xs overflow-y-auto max-h-[160px] min-h-[120px] flex flex-col space-y-1 scrollbar-thin">
        {logs && logs.length > 0 ? (
          logs.map((log, idx) => (
            <div key={idx} className="leading-relaxed hover:bg-white/5 px-1 rounded transition-colors">
              <span className="text-brand mr-2">[{log.timestamp}]</span>
              <span className={getLogColor(log.type)}>{log.message}</span>
            </div>
          ))
        ) : (
          <div className="text-[var(--text-muted)] italic py-8 text-center">
            No system events logged yet. Select a directory or run an operation.
          </div>
        )}
        
        {/* Terminal Blinking Cursor */}
        <div className="pt-1 flex items-center">
          <span className="text-brand mr-2 font-bold">&gt;_</span>
          <span className="terminal-cursor"></span>
        </div>
        
        {/* Reference for scrolling */}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
}
