import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Folder, 
  FolderOpen, 
  ArrowLeft, 
  ChevronRight, 
  History,
  HardDrive,
  UploadCloud
} from 'lucide-react';
import { browsePath, openNativeDirectoryDialog } from '../utils/api';
import toast from 'react-hot-toast';

export default function DirectoryPicker({ 
  currentDirectory, 
  recentDirectories, 
  onSelectDirectory 
}) {
  const [pathInput, setPathInput] = useState(currentDirectory || '');
  const [showExplorer, setShowExplorer] = useState(false);
  const [explorerData, setExplorerData] = useState({
    currentPath: '',
    parentPath: null,
    directories: [],
    drives: []
  });
  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (currentDirectory) {
      setPathInput(currentDirectory);
    }
  }, [currentDirectory]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!pathInput.trim()) {
      toast.error('Please enter or select a folder path');
      return;
    }
    onSelectDirectory(pathInput.trim());
  };

  // Fetch directory list for explorer
  const loadExplorerPath = async (targetPath = '') => {
    setLoading(true);
    try {
      const data = await browsePath(targetPath);
      setExplorerData(data);
    } catch (err) {
      toast.error(`Error loading folder: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openExplorer = () => {
    setShowExplorer(true);
    loadExplorerPath(pathInput || '');
  };

  const handleSelectExplorer = () => {
    onSelectDirectory(explorerData.currentPath);
    setShowExplorer(false);
  };

  // Drag and Drop support
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    // Web browsers don't expose full local OS file paths for security.
    // However, we can read the dropped file/directory name and offer guidance.
    const items = e.dataTransfer.items;
    if (items && items[0]) {
      const entry = items[0].webkitGetAsEntry();
      if (entry) {
        toast.success(`Dropped folder/file: "${entry.name}" detected!`);
        if (entry.isDirectory) {
          toast((t) => (
            <span>
              To manage <b>{entry.name}</b>, please browse to its parent folder or paste its absolute path.
            </span>
          ), { duration: 5000 });
        }
      }
    }
  };

  const handleNativeBrowse = async () => {
    try {
      const data = await openNativeDirectoryDialog();
      if (data.path) {
        setPathInput(data.path);
        onSelectDirectory(data.path);
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search / Select Form */}
      <form onSubmit={handleSubmit} className="relative flex gap-3">
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative flex-1 flex items-center rounded-2xl border transition-all duration-300 ${
            isDragOver 
              ? 'border-brand bg-brand/5 shadow-[0_0_15px_rgba(139,92,246,0.2)]' 
              : 'border-[var(--border-color)] bg-[var(--input-bg)]'
          }`}
        >
          <Folder className="absolute left-4 w-5 h-5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="Type or paste a parent directory path... (e.g. C:\Projects\Assets)"
            className="w-full pl-12 pr-4 py-3.5 bg-transparent border-0 text-[var(--text-main)] placeholder-[var(--text-muted)] rounded-2xl focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <button
          type="button"
          onClick={openExplorer}
          className="px-5 bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-brand/40 text-[var(--text-main)] rounded-2xl flex items-center gap-2 hover:bg-[var(--bg-secondary)] transition-all active:scale-95 shadow-sm"
        >
          <FolderOpen className="w-4 h-4 text-brand" />
          <span>Browse</span>
        </button>

        <button
          type="button"
          onClick={handleNativeBrowse}
          className="px-5 bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-brand/40 text-[var(--text-main)] rounded-2xl flex items-center gap-2 hover:bg-[var(--bg-secondary)] transition-all active:scale-95 shadow-sm"
          title="Choose using OS native dialog picker"
        >
          <Folder className="w-4 h-4 text-brand" />
          <span>Native Select</span>
        </button>

        <button
          type="submit"
          className="gradient-btn px-6 py-3.5 rounded-2xl font-medium shadow-md flex items-center gap-2 active:scale-95"
        >
          Select Directory
        </button>
      </form>

      {/* Drag & Drop Hint */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl py-4 px-6 text-center text-sm transition-all duration-300 ${
          isDragOver 
            ? 'border-brand bg-brand/5 text-brand' 
            : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-brand/20'
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          <UploadCloud className="w-4 h-4 text-brand" />
          <span>Drag & Drop target folders here to view them in ZIP Manager</span>
        </div>
      </div>

      {/* Recent History */}
      {recentDirectories && recentDirectories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
            <History className="w-3.5 h-3.5" />
            Recent:
          </span>
          <div className="flex flex-wrap gap-2">
            {recentDirectories.map((dir, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectDirectory(dir)}
                className="text-xs px-3 py-1.5 rounded-full bg-[var(--bg-card)] hover:bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-brand/40 text-[var(--text-main)] transition-all max-w-[250px] truncate"
                title={dir}
              >
                {dir.split(/[\\/]/).pop() || dir}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Explorer Dialog Modal */}
      {showExplorer && createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-2xl rounded-[20px] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-[fadeIn_0.2s_ease-out]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-[var(--text-main)]">
                <FolderOpen className="w-5 h-5 text-brand" />
                Select Working Directory
              </h3>
              <button
                type="button"
                onClick={() => setShowExplorer(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Path Navigator bar */}
            <div className="bg-[var(--bg-secondary)] px-6 py-3 flex items-center gap-2 border-b border-[var(--border-color)] overflow-x-auto">
              {explorerData.parentPath && (
                <button
                  onClick={() => loadExplorerPath(explorerData.parentPath)}
                  className="p-1 text-[var(--text-muted)] hover:text-brand hover:bg-[var(--bg-card)] rounded-lg transition-all"
                  title="Up One level"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <span className="text-sm font-mono text-brand truncate">
                {explorerData.currentPath}
              </span>
            </div>

            {/* Drives Selection (Windows only) */}
            {explorerData.drives && explorerData.drives.length > 0 && (
              <div className="px-6 py-2 border-b border-[var(--border-color)] flex gap-2 overflow-x-auto">
                {explorerData.drives.map((drive, idx) => (
                  <button
                    key={idx}
                    onClick={() => loadExplorerPath(drive)}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                      explorerData.currentPath.toLowerCase().startsWith(drive.toLowerCase())
                        ? 'border-brand bg-brand/10 text-brand font-semibold'
                        : 'border-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--bg-card)]'
                    }`}
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>{drive}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Folders List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : explorerData.directories.length === 0 ? (
                <div className="text-center py-12 text-[var(--text-muted)]">
                  No subdirectories found.
                </div>
              ) : (
                explorerData.directories.map((dir, idx) => (
                  <button
                    key={idx}
                    onClick={() => loadExplorerPath(dir.path)}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-brand/5 border border-transparent hover:border-brand/10 transition-all text-left text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Folder className="w-4 h-4 text-brand/80" />
                      <span className="text-[var(--text-main)] truncate max-w-[450px]">
                        {dir.name}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                  </button>
                ))
              )}
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border-color)] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowExplorer(false)}
                className="px-4 py-2 border border-[var(--border-color)] hover:bg-[var(--bg-card)] text-[var(--text-main)] rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSelectExplorer}
                disabled={loading}
                className="gradient-btn px-5 py-2 rounded-xl font-medium shadow active:scale-95 disabled:opacity-50"
              >
                Choose This Folder
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
