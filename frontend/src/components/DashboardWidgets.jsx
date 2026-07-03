import React from 'react';
import { 
  Folder, 
  FileArchive,
  CheckCircle,
  XCircle,
  Zap,
  Clock,
  Layers
} from 'lucide-react';

export default function DashboardWidgets({ 
  currentDirectory,
  totalFolders, 
  totalZips, 
  operations 
}) {
  const {
    total,
    processed,
    success,
    failed,
    status,
    speed,
    eta
  } = operations;

  const remaining = total - processed;
  const progressPercent = total > 0 ? Math.round((processed / total) * 100) : 0;

  // Format path for display
  const shortPath = currentDirectory 
    ? currentDirectory.length > 50 
      ? '...' + currentDirectory.slice(-47) 
      : currentDirectory
    : 'No folder selected';

  const formatEta = (seconds) => {
    if (seconds === null || seconds === undefined) return '--';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Directory Summary */}
      <div className="glass-card p-5 rounded-[20px]">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Active Directory
            </span>
            <h4 className="text-sm font-medium mt-1 text-[var(--text-main)] truncate max-w-[200px]" title={currentDirectory}>
              {shortPath}
            </h4>
          </div>
          <div className="p-2 bg-brand/10 text-brand rounded-xl">
            <Folder className="w-5 h-5" />
          </div>
        </div>
        <div className="flex gap-4 mt-4 pt-4 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-1.5">
            <Folder className="w-4 h-4 text-brand/70" />
            <span className="text-sm font-semibold text-[var(--text-main)]">{totalFolders}</span>
            <span className="text-xs text-[var(--text-muted)]">Folders</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileArchive className="w-4 h-4 text-brand/70" />
            <span className="text-sm font-semibold text-[var(--text-main)]">{totalZips}</span>
            <span className="text-xs text-[var(--text-muted)]">ZIPs</span>
          </div>
        </div>
      </div>

      {/* Progress Widget */}
      <div className="glass-card p-5 rounded-[20px]">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Queue Progress
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-[var(--text-main)]">
                {processed}
              </span>
              <span className="text-sm text-[var(--text-muted)]">
                / {total}
              </span>
            </div>
          </div>
          <div className="p-2 bg-brand/10 text-brand rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-5">
          <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>{status === 'processing' ? 'Processing...' : 'Idle'}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full bg-[var(--border-color)] h-2 rounded-full overflow-hidden">
            <div 
              className="gradient-btn h-full rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Operations Counts Widget */}
      <div className="glass-card p-5 rounded-[20px]">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Task Outcomes
            </span>
            <h4 className="text-lg font-bold mt-1 text-[var(--text-main)]">
              {remaining > 0 ? `${remaining} remaining` : 'Queue cleared'}
            </h4>
          </div>
          <div className="flex gap-1.5">
            <div className="p-1.5 bg-success/10 text-success rounded-lg flex items-center justify-center">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div className="p-1.5 bg-error/10 text-error rounded-lg flex items-center justify-center">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="flex gap-4 mt-5 justify-between">
          <div className="flex-1 bg-success/5 border border-success/10 rounded-xl p-2.5 text-center">
            <span className="block text-xs text-[var(--text-muted)]">Success</span>
            <span className="text-sm font-bold text-success">{success}</span>
          </div>
          <div className="flex-1 bg-error/5 border border-error/10 rounded-xl p-2.5 text-center">
            <span className="block text-xs text-[var(--text-muted)]">Failed</span>
            <span className="text-sm font-bold text-error">{failed}</span>
          </div>
        </div>
      </div>

      {/* Speed & ETA Widget */}
      <div className="glass-card p-5 rounded-[20px]">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Processing Speed
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-[var(--text-main)]">
                {speed}
              </span>
              <span className="text-xs text-[var(--text-muted)]">items/s</span>
            </div>
          </div>
          <div className="p-2 bg-warning/10 text-warning rounded-xl">
            <Zap className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--border-color)] flex items-center gap-2 text-sm text-[var(--text-main)]">
          <Clock className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="text-xs text-[var(--text-muted)]">Est. Remaining:</span>
          <span className="font-semibold text-brand">{formatEta(eta)}</span>
        </div>
      </div>
    </div>
  );
}
