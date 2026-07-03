import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { 
  FolderLock, 
  Settings, 
  RefreshCw, 
  FolderKanban,
  FileArchive,
  AlertOctagon,
  Moon,
  Sun,
  LogOut,
  FolderOpen
} from 'lucide-react';

import {
  selectDirectory,
  scanDirectory,
  processItems,
  resolveConflict,
  cancelQueue,
  saveSettings,
  deleteItem,
  clearLogs,
  getApiBase
} from '../utils/api';

import DirectoryPicker from './DirectoryPicker';
import DashboardWidgets from './DashboardWidgets';
import FileList from './FileList';
import ControlPanel from './ControlPanel';
import ActivityLogs from './ActivityLogs';
import SettingsModal from './SettingsModal';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';

export default function Dashboard() {
  const { currentUser, logoutUser } = useAuth();
  
  const [appState, setAppState] = useState({
    currentDirectory: '',
    recentDirectories: [],
    settings: {
      theme: 'dark',
      concurrencyLimit: 4,
      overwritePolicy: 'timestamp',
      excludedExtensions: []
    },
    items: [],
    operations: {
      total: 0,
      processed: 0,
      success: 0,
      failed: 0,
      status: 'idle',
      speed: 0,
      eta: null
    },
    logs: [],
    totalFolders: 0,
    totalZips: 0,
    conflicts: []
  });

  const [selectedItems, setSelectedItems] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [backendUrl, setBackendUrl] = useState(
    localStorage.getItem('ZIP_MANAGER_API_BASE') || 'http://localhost:5000/api'
  );

  // Mixed / auto-processing content state
  const [showMixedModal, setShowMixedModal] = useState(false);
  const [modalType, setModalType] = useState('mixed'); // 'mixed' | 'folders-only' | 'zips-only'
  const [modalCounts, setModalCounts] = useState({ folders: 0, zips: 0 });
  const [lastPromptedKey, setLastPromptedKey] = useState('');

  // Establish SSE connection
  useEffect(() => {
    let eventSource;
    let timer;

    function connect() {
      const uid = auth.currentUser?.uid;
      const query = uid ? `?userId=${uid}` : '';
      eventSource = new EventSource(`${getApiBase()}/events${query}`);

      eventSource.onopen = () => {
        setSseConnected(true);
      };

      eventSource.addEventListener('state', (event) => {
        const data = JSON.parse(event.data);
        setAppState(data);
        
        // Sync HTML class for dark/light theme
        if (data.settings && data.settings.theme) {
          if (data.settings.theme === 'light') {
            document.documentElement.classList.add('light');
          } else {
            document.documentElement.classList.remove('light');
          }
        }
      });

      eventSource.onerror = (err) => {
        setSseConnected(false);
        eventSource.close();
        timer = setTimeout(connect, 3000); // Reconnect in 3s
      };
    }

    connect();

    return () => {
      if (eventSource) eventSource.close();
      if (timer) clearTimeout(timer);
    };
  }, [backendUrl, currentUser]);

  // Mixed / auto-processing content prompts when directory changes
  useEffect(() => {
    if (!appState.currentDirectory || !appState.items || appState.items.length === 0) {
      return;
    }

    const isIdle = appState.operations && appState.operations.status === 'idle';
    const hasConflicts = appState.conflicts && appState.conflicts.length > 0;
    if (!isIdle || hasConflicts) {
      return;
    }

    const currentKey = `${appState.currentDirectory}:${appState.items.length}`;
    if (lastPromptedKey === currentKey) {
      return;
    }

    const folders = appState.items.filter(i => i.type === 'folder' && i.status === 'Waiting');
    const zips = appState.items.filter(i => i.type === 'zip' && i.status === 'Waiting');

    if (folders.length > 0 && zips.length > 0) {
      setModalType('mixed');
      setModalCounts({ folders: folders.length, zips: zips.length });
      setShowMixedModal(true);
      setLastPromptedKey(currentKey);
    } else if (folders.length > 0 && zips.length === 0) {
      setModalType('folders-only');
      setModalCounts({ folders: folders.length, zips: 0 });
      setShowMixedModal(true);
      setLastPromptedKey(currentKey);
    } else if (zips.length > 0 && folders.length === 0) {
      setModalType('zips-only');
      setModalCounts({ folders: 0, zips: zips.length });
      setShowMixedModal(true);
      setLastPromptedKey(currentKey);
    }
  }, [appState.items, appState.currentDirectory, appState.operations, appState.conflicts, lastPromptedKey]);

  const handleZipOpenFolders = () => {
    const folders = appState.items.filter(i => i.type === 'folder' && i.status === 'Waiting');
    if (folders.length > 0) {
      handleProcessBatch(folders.map(f => f.path), 'zip');
    }
    setShowMixedModal(false);
  };

  const handleUnzipZipFiles = () => {
    const zips = appState.items.filter(i => i.type === 'zip' && i.status === 'Waiting');
    if (zips.length > 0) {
      handleProcessBatch(zips.map(z => z.path), 'extract');
    }
    setShowMixedModal(false);
  };

  const handleProcessBoth = () => {
    const folders = appState.items.filter(i => i.type === 'folder' && i.status === 'Waiting');
    const zips = appState.items.filter(i => i.type === 'zip' && i.status === 'Waiting');
    const allPaths = [...folders.map(f => f.path), ...zips.map(z => z.path)];
    if (allPaths.length > 0) {
      handleProcessBatch(allPaths, 'auto');
    }
    setShowMixedModal(false);
  };

  const handleSelectDirectory = async (path) => {
    const loadingToast = toast.loading(`Scanning folder: ${path}...`);
    try {
      const data = await selectDirectory(path);
      toast.success('Directory selected successfully!', { id: loadingToast });
      setSelectedItems([]);
    } catch (err) {
      toast.error(err.message || 'Failed to select directory', { id: loadingToast });
    }
  };

  const handleRefresh = async () => {
    try {
      await scanDirectory();
      toast.success('Directory rescanned');
    } catch (err) {
      toast.error('Failed to refresh: ' + err.message);
    }
  };

  const handleProcessBatch = async (paths, action) => {
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    try {
      await processItems(pathsArray, action);
      toast.success(`Started processing ${pathsArray.length} items`);
    } catch (err) {
      toast.error('Failed to start processing: ' + err.message);
    }
  };

  const handleCancelQueue = async () => {
    try {
      await cancelQueue();
      toast.success('Batch operations cancelled');
    } catch (err) {
      toast.error('Failed to cancel: ' + err.message);
    }
  };

  const handleSaveSettings = async (newSettings) => {
    try {
      await saveSettings(newSettings);
      toast.success('Settings saved and synchronized');
    } catch (err) {
      toast.error('Failed to save settings: ' + err.message);
    }
  };

  const handleDeleteSingle = async (path) => {
    const fileName = path.split(/[\\/]/).pop();
    if (confirm(`Are you sure you want to permanently delete "${fileName}" from disk?`)) {
      try {
        await deleteItem(path);
        toast.success(`Deleted ${fileName}`);
        setSelectedItems(prev => prev.filter(p => p !== path));
      } catch (err) {
        toast.error('Delete failed: ' + err.message);
      }
    }
  };

  const handleClearLogs = async () => {
    try {
      await clearLogs();
      toast.success('Activity logs cleared');
    } catch (err) {
      toast.error('Failed to clear logs');
    }
  };

  const handleResolveConflictDecision = async (itemPath, decision) => {
    try {
      await resolveConflict(itemPath, decision);
      toast.success(`Conflict resolved: ${decision}`);
    } catch (err) {
      toast.error('Failed to resolve conflict: ' + err.message);
    }
  };

  // Toggle theme quick helper
  const toggleTheme = () => {
    const nextTheme = appState.settings.theme === 'dark' ? 'light' : 'dark';
    handleSaveSettings({ ...appState.settings, theme: nextTheme });
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      toast.success('Logged out successfully');
    } catch (err) {
      toast.error('Failed to log out: ' + err.message);
    }
  };

  // Active conflict to display
  const activeConflict = appState.conflicts && appState.conflicts[0];

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-300 pb-32">
      {/* Toast provider */}
      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-main)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px'
          }
        }}
      />

      {/* Header bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-color)] bg-[var(--bg-main)]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand/15 text-brand rounded-2xl shadow-[0_0_15px_rgba(139,92,246,0.15)]">
              <FolderLock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-brand to-indigo-400 bg-clip-text text-transparent">
                ZIP Manager Pro
              </h1>
              <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
                High-Performance Archiver Utility
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Status indicator */}
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${
                sseConnected ? 'bg-success shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-error shadow-[0_0_8px_rgba(239,68,68,0.5)]'
              }`} />
              <span className="text-xs text-[var(--text-muted)] font-medium">
                {sseConnected ? 'Connected' : 'Reconnecting...'}
              </span>
            </div>

            {/* Quick theme toggler */}
            <button
              onClick={toggleTheme}
              className="p-2 bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-brand/40 text-[var(--text-main)] rounded-xl transition-all active:scale-95"
              title="Toggle Light/Dark Theme"
            >
              {appState.settings.theme === 'light' ? (
                <Moon className="w-4 h-4 text-brand" />
              ) : (
                <Sun className="w-4 h-4 text-warning" />
              )}
            </button>

            {/* Authenticated User & Logout */}
            {currentUser && (
              <div className="flex items-center gap-3 pl-4 border-l border-[var(--border-color)]">
                {currentUser.photoURL ? (
                  <img src={currentUser.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-brand/30 shadow-sm" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-brand/10 text-brand border border-brand/20 flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                    {currentUser.email ? currentUser.email.charAt(0) : 'U'}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold max-w-[120px] truncate">
                    {currentUser.displayName || currentUser.email.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate max-w-[120px]">
                    {currentUser.email}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-error/40 hover:text-error text-[var(--text-muted)] hover:text-white rounded-xl transition-all active:scale-95"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        
        {/* Step 1: Directory Selection & Explorer */}
        <section className="glass-panel p-6 rounded-[20px] shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-brand" />
            Select Parent Directory
          </h2>
          <DirectoryPicker 
            currentDirectory={appState.currentDirectory}
            recentDirectories={appState.recentDirectories}
            onSelectDirectory={handleSelectDirectory}
          />
        </section>

        {appState.currentDirectory ? (
          <>
            {/* Step 2: Stats Widgets Grid */}
            <DashboardWidgets 
              currentDirectory={appState.currentDirectory}
              totalFolders={appState.totalFolders}
              totalZips={appState.totalZips}
              operations={appState.operations}
            />

            {/* Step 3: Files listing area */}
            <FileList 
              items={appState.items}
              onProcessSingle={handleProcessBatch}
              onDeleteSingle={handleDeleteSingle}
              selectedItems={selectedItems}
              setSelectedItems={setSelectedItems}
            />

            {/* Step 4: Activity Terminal log */}
            <ActivityLogs 
              logs={appState.logs}
              onClearLogs={handleClearLogs}
            />
          </>
        ) : (
          <div className="glass-panel p-16 rounded-[20px] text-center border-dashed border-2 border-[var(--border-color)]">
            <FileArchive className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4 animate-bounce" />
            <h3 className="text-lg font-semibold text-[var(--text-main)] mb-1">
              No active workspace
            </h3>
            <p className="text-sm text-[var(--text-muted)] max-w-sm mx-auto">
              Please enter an absolute path, select folders, or use the Browse directory tree explorer above to load directories and start archiving.
            </p>
          </div>
        )}
      </main>

      {/* Floating Control Panel */}
      {appState.currentDirectory && (
        <ControlPanel 
          items={appState.items}
          selectedItems={selectedItems}
          operations={appState.operations}
          onProcessBatch={handleProcessBatch}
          onCancelQueue={handleCancelQueue}
          onRefresh={handleRefresh}
          onOpenSettings={() => setShowSettings(true)}
          onClearSelection={() => setSelectedItems([])}
          currentDirectory={appState.currentDirectory}
        />
      )}

      {/* Settings Dialog Modal */}
      {showSettings && (
        <SettingsModal 
          settings={appState.settings}
          onSaveSettings={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Conflict Dialog Modal (Compression or Extraction) */}
      {activeConflict && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md rounded-[20px] shadow-2xl p-6 border-warning/30 animate-[bounceIn_0.3s_ease-out]">
            <div className="flex items-center gap-3 text-warning mb-4">
              <AlertOctagon className="w-8 h-8 shrink-0 animate-pulse" />
              <div>
                <h3 className="font-bold text-lg text-[var(--text-main)]">
                  {activeConflict.type === 'zip' ? 'Compression Conflict' : 'Extraction Conflict'}
                </h3>
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                  {activeConflict.type === 'zip' ? 'ZIP Archive Already Exists' : 'Destination Directory Exists'}
                </span>
              </div>
            </div>

            <div className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-color)] mb-5 text-sm">
              <p className="text-[var(--text-muted)] mb-2 font-medium">
                {activeConflict.type === 'zip' ? 'Source folder:' : 'Archive file:'}
              </p>
              <p className="font-mono text-brand text-xs break-all mb-3">{activeConflict.name}</p>
              
              <p className="text-[var(--text-muted)] mb-2 font-medium">
                {activeConflict.type === 'zip' ? 'Target ZIP archive location:' : 'Target folder location:'}
              </p>
              <p className="font-mono text-warning text-xs break-all">{activeConflict.destPath}</p>
            </div>

            <p className="text-sm text-[var(--text-main)] mb-6">
              How would you like to resolve this conflict?
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => handleResolveConflictDecision(activeConflict.itemPath, 'overwrite')}
                className="w-full py-2.5 px-4 bg-error text-white font-semibold rounded-xl text-sm transition-all hover:bg-error/90 active:scale-95 shadow-md"
              >
                {activeConflict.type === 'zip' ? 'Overwrite Existing ZIP' : 'Overwrite Folder Contents'}
              </button>
              <button
                onClick={() => handleResolveConflictDecision(activeConflict.itemPath, 'timestamp')}
                className="w-full py-2.5 px-4 bg-brand text-white font-semibold rounded-xl text-sm transition-all hover:bg-brand-hover active:scale-95 shadow-md"
              >
                Keep Both (Append Timestamp)
              </button>
              <button
                onClick={() => handleResolveConflictDecision(activeConflict.itemPath, 'skip')}
                className="w-full py-2.5 px-4 bg-[var(--bg-card)] hover:bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-main)] font-semibold rounded-xl text-sm transition-all active:scale-95"
              >
                {activeConflict.type === 'zip' ? 'Skip Compression' : 'Skip Extraction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mixed / Auto-processing Content Confirmation Modal */}
      {showMixedModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md rounded-[20px] shadow-2xl p-6 border-brand/30 animate-[bounceIn_0.3s_ease-out]">
            <div className="flex items-center gap-3 text-brand mb-4">
              <FolderLock className="w-8 h-8 shrink-0 animate-pulse" />
              <div>
                <h3 className="font-bold text-lg text-[var(--text-main)]">
                  {modalType === 'mixed' ? 'Mixed Content Detected' : (modalType === 'folders-only' ? 'Folders Found' : 'ZIP Archives Found')}
                </h3>
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                  Workspace Auto-Process Action
                </span>
              </div>
            </div>

            <div className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-color)] mb-5 text-sm space-y-2">
              <p className="text-[var(--text-muted)] font-medium">We found:</p>
              <ul className="list-disc list-inside text-xs font-mono space-y-1 text-[var(--text-main)]">
                {modalCounts.folders > 0 && <li>{modalCounts.folders} folders</li>}
                {modalCounts.zips > 0 && <li>{modalCounts.zips} ZIP files</li>}
              </ul>
              <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
                What operation would you like to perform inside this parent directory?
              </p>
            </div>

            <div className="space-y-2.5">
              {modalType === 'mixed' && (
                <>
                  <button
                    onClick={handleZipOpenFolders}
                    className="w-full py-2.5 px-4 bg-brand text-white font-semibold rounded-xl text-sm transition-all hover:bg-brand-hover active:scale-95 shadow-md flex items-center justify-center gap-2"
                  >
                    <FileArchive className="w-4 h-4" />
                    ZIP Open Folders
                  </button>
                  <button
                    onClick={handleUnzipZipFiles}
                    className="w-full py-2.5 px-4 bg-warning text-white font-semibold rounded-xl text-sm transition-all hover:bg-warning/90 active:scale-95 shadow-md flex items-center justify-center gap-2"
                  >
                    <FolderOpen className="w-4 h-4" />
                    UNZIP ZIP Files
                  </button>
                  <button
                    onClick={handleProcessBoth}
                    className="w-full py-2.5 px-4 bg-success text-white font-semibold rounded-xl text-sm transition-all hover:bg-success/90 active:scale-95 shadow-md flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Process Both
                  </button>
                </>
              )}

              {modalType === 'folders-only' && (
                <button
                  onClick={handleZipOpenFolders}
                  className="w-full py-2.5 px-4 bg-brand text-white font-semibold rounded-xl text-sm transition-all hover:bg-brand-hover active:scale-95 shadow-md flex items-center justify-center gap-2"
                >
                  <FileArchive className="w-4 h-4" />
                  ZIP Open Folders
                </button>
              )}

              {modalType === 'zips-only' && (
                <button
                  onClick={handleUnzipZipFiles}
                  className="w-full py-2.5 px-4 bg-warning text-white font-semibold rounded-xl text-sm transition-all hover:bg-warning/90 active:scale-95 shadow-md flex items-center justify-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  UNZIP ZIP Files
                </button>
              )}

              <button
                onClick={() => setShowMixedModal(false)}
                className="w-full py-2.5 px-4 bg-[var(--bg-card)] hover:bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-main)] font-semibold rounded-xl text-sm transition-all active:scale-95"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
