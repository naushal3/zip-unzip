import React, { useState } from 'react';
import { 
  Settings, 
  Moon, 
  Sun, 
  Info,
  ShieldAlert,
  Sliders,
  FolderMinus
} from 'lucide-react';

export default function SettingsModal({
  settings,
  onSaveSettings,
  onClose
}) {
  const [theme, setTheme] = useState(settings.theme || 'dark');
  const [concurrencyLimit, setConcurrencyLimit] = useState(settings.concurrencyLimit || 4);
  const [overwritePolicy, setOverwritePolicy] = useState(settings.overwritePolicy || 'timestamp');
  const [exclusions, setExclusions] = useState(
    settings.excludedExtensions ? settings.excludedExtensions.join(', ') : ''
  );

  const handleSave = () => {
    // Parse exclusions back to array
    const parsedExclusions = exclusions
      .split(',')
      .map(ext => ext.trim().toLowerCase())
      .filter(ext => ext.length > 0)
      .map(ext => ext.startsWith('.') ? ext : `.${ext}`);

    onSaveSettings({
      theme,
      concurrencyLimit: parseInt(concurrencyLimit, 10),
      overwritePolicy,
      excludedExtensions: parsedExclusions
    });
    
    // Toggle Light Mode Class on HTML
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-lg rounded-[20px] shadow-2xl flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
          <h3 className="font-semibold text-lg flex items-center gap-2 text-[var(--text-main)]">
            <Settings className="w-5 h-5 text-brand" />
            ZIP Manager Settings
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-brand text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          
          {/* Theme selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5" />
              Theme Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all font-medium ${
                  theme === 'dark'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <Moon className="w-4 h-4" />
                Dark Theme
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`py-3 px-4 rounded-xl border flex items-center justify-center gap-2 transition-all font-medium ${
                  theme === 'light'
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <Sun className="w-4 h-4" />
                Light Theme
              </button>
            </div>
          </div>

          {/* Concurrency Limit */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              Parallel Processing Tasks
            </label>
            <div className="flex items-center gap-3">
              <select
                value={concurrencyLimit}
                onChange={(e) => setConcurrencyLimit(e.target.value)}
                className="flex-1 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
              >
                <option value="1">1 Task (Sequential)</option>
                <option value="2">2 Tasks (Conservative)</option>
                <option value="4">4 Tasks (Balanced / Default)</option>
                <option value="8">8 Tasks (High Performance)</option>
              </select>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] flex items-start gap-1">
              <Info className="w-3 h-3 text-brand shrink-0 mt-0.5" />
              <span>Limits how many zip/unzip operations run simultaneously. Higher is faster but uses more disk IO and CPU.</span>
            </p>
          </div>

          {/* Overwrite conflict policy */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              Overwrite / Conflict Policy
            </label>
            <select
              value={overwritePolicy}
              onChange={(e) => setOverwritePolicy(e.target.value)}
              className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
            >
              <option value="timestamp">Append Timestamp (Keep both, e.g. Folder_20260702)</option>
              <option value="overwrite">Overwrite existing folders and ZIPs</option>
              <option value="skip">Skip files that already exist</option>
              <option value="ask">Ask interactively for each extraction conflict</option>
            </select>
          </div>

          {/* Excluded File Extensions */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <FolderMinus className="w-3.5 h-3.5" />
              Exclude File Extensions
            </label>
            <input
              type="text"
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              placeholder="e.g. .tmp, .log, .ds_store"
              className="w-full bg-[var(--input-bg)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
            />
            <p className="text-[11px] text-[var(--text-muted)] flex items-start gap-1">
              <Info className="w-3 h-3 text-brand shrink-0 mt-0.5" />
              <span>Enter file extensions separated by commas. Files matching these will be ignored during compression.</span>
            </p>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border-color)] flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-[var(--border-color)] hover:bg-[var(--bg-card)] text-[var(--text-main)] rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              handleSave();
              onClose();
            }}
            className="gradient-btn px-6 py-2 rounded-xl font-medium shadow active:scale-95"
          >
            Save Settings
          </button>
        </div>

      </div>
    </div>
  );
}
