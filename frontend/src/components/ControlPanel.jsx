import React from 'react';
import { 
  Play, 
  Pause, 
  X, 
  Settings, 
  Download, 
  RefreshCw,
  FileArchive,
  FolderOpen
} from 'lucide-react';
import { getDownloadAllUrl } from '../utils/api';

export default function ControlPanel({
  items,
  selectedItems,
  operations,
  onProcessBatch,
  onCancelQueue,
  onRefresh,
  onOpenSettings,
  onClearSelection,
  currentDirectory
}) {
  console.log("Current Directory:", currentDirectory);

  const isProcessing = operations.status === 'processing';
  const hasSelection = selectedItems.length > 0;

  // Filter selected items by type
  const selectedFolders = items.filter(i => selectedItems.includes(i.path) && i.type === 'folder');
  const selectedZips = items.filter(i => selectedItems.includes(i.path) && i.type === 'zip');

  const foldersInList = items.filter(i => i.type === 'folder');
  const zipsInList = items.filter(i => i.type === 'zip');

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-5xl">
      <div className="glass-panel px-6 py-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl border-brand/20">
        
        {/* Selection Info */}
        <div className="flex items-center gap-3">
          {hasSelection ? (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-brand/20 text-brand px-2.5 py-1 rounded-full font-bold">
                {selectedItems.length} selected
              </span>
              <button
                onClick={onClearSelection}
                className="text-[var(--text-muted)] hover:text-brand transition-colors text-xs flex items-center gap-0.5"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
          ) : (
            <span className="text-xs text-[var(--text-muted)] font-medium">
              No items selected. Choose items above for batch operations.
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isProcessing ? (
            <button
              onClick={onCancelQueue}
              className="px-5 py-2.5 bg-error/15 hover:bg-error/25 border border-error/30 text-error rounded-xl font-medium flex items-center gap-2 transition-all active:scale-95 shadow-md"
            >
              <Pause className="w-4 h-4" />
              <span>Cancel Processing</span>
            </button>
          ) : (
            <>
              {/* Batch Actions for Selection */}
              {hasSelection && (
                <>
                  <button
                    onClick={() => onProcessBatch(selectedItems, 'auto')}
                    className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl font-medium flex items-center gap-1.5 transition-all active:scale-95 shadow-md text-sm"
                    title="Smart process selected items (ZIP folders / Extract archives)"
                  >
                    <Play className="w-4 h-4" />
                    <span>Process Selected (Smart)</span>
                  </button>
                  {selectedFolders.length > 0 && (
                    <button
                      onClick={() => onProcessBatch(selectedFolders.map(f => f.path), 'zip')}
                      className="px-4 py-2 bg-brand/20 hover:bg-brand/30 border border-brand/40 text-brand rounded-xl font-medium flex items-center gap-1.5 transition-all active:scale-95 text-sm"
                    >
                      <span>Zip Selected ({selectedFolders.length})</span>
                    </button>
                  )}
                  {selectedZips.length > 0 && (
                    <button
                      onClick={() => onProcessBatch(selectedZips.map(z => z.path), 'extract')}
                      className="px-4 py-2 bg-warning/20 hover:bg-warning/30 border border-warning/40 text-warning rounded-xl font-medium flex items-center gap-1.5 transition-all active:scale-95 text-sm"
                    >
                      <span>Extract Selected ({selectedZips.length})</span>
                    </button>
                  )}
                </>
              )}

              {/* Standard Batch Actions */}
              {!hasSelection && (
                <>
                  {items.length > 0 && (
                    <button
                      onClick={() => onProcessBatch(items.map(i => i.path), 'auto')}
                      className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl font-medium flex items-center gap-1.5 transition-all active:scale-95 text-sm shadow-md"
                      title="Smart process all items (ZIP folders / Extract archives)"
                    >
                      <Play className="w-4 h-4" />
                      <span>Process All (Smart)</span>
                    </button>
                  )}
                  {foldersInList.length > 0 && (
                    <button
                      onClick={() => onProcessBatch(foldersInList.map(f => f.path), 'zip')}
                      className="px-4 py-2 bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand rounded-xl font-medium flex items-center gap-1.5 transition-all active:scale-95 text-sm"
                    >
                      <FileArchive className="w-4 h-4" />
                      <span>Zip All Folders</span>
                    </button>
                  )}
                  {zipsInList.length > 0 && (
                    <button
                      onClick={() => onProcessBatch(zipsInList.map(z => z.path), 'extract')}
                      className="px-4 py-2 bg-warning/10 hover:bg-warning/20 border border-warning/30 text-warning rounded-xl font-medium flex items-center gap-1.5 transition-all active:scale-95 text-sm"
                    >
                      <FolderOpen className="w-4 h-4" />
                      <span>Extract All ZIPs</span>
                    </button>
                  )}
                </>
              )}

              {/* Combined Download */}
              {zipsInList.length > 0 && (
                <a
                  href={getDownloadAllUrl(currentDirectory)}
                  className="px-4 py-2 bg-success/15 hover:bg-success/25 border border-success/30 text-success rounded-xl font-medium flex items-center gap-1.5 transition-all active:scale-95 text-sm"
                  title="Download all ZIP files in this folder combined as a single ZIP archive"
                >
                  <Download className="w-4 h-4" />
                  <span>Download All Combined</span>
                </a>
              )}

              {/* Rescan Button */}
              <button
                onClick={onRefresh}
                className="p-2.5 bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-brand/40 text-[var(--text-main)] rounded-xl transition-all active:scale-95"
                title="Rescan Directory"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {/* Settings Toggle */}
              <button
                onClick={onOpenSettings}
                className="p-2.5 bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-brand/40 text-[var(--text-main)] rounded-xl transition-all active:scale-95"
                title="Application Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
