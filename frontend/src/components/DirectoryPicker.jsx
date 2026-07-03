import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Folder, 
  FolderOpen, 
  ArrowLeft, 
  ChevronRight, 
  History,
  HardDrive,
  UploadCloud,
  Info,
  File,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { browsePath, openNativeDirectoryDialog, uploadFiles, getApiBase } from '../utils/api';
import toast from 'react-hot-toast';

function formatBytes(bytes) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function getFilesFromHandle(directoryHandle) {
  const files = [];
  async function read(handle, relativePath = '') {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        const fullPath = relativePath ? `${relativePath}/${entry.name}` : `${directoryHandle.name}/${entry.name}`;
        Object.defineProperty(file, 'webkitRelativePath', {
          value: fullPath,
          writable: true,
          configurable: true
        });
        files.push(file);
      } else if (entry.kind === 'directory') {
        const subPath = relativePath ? `${relativePath}/${entry.name}` : `${directoryHandle.name}/${entry.name}`;
        await read(entry, subPath);
      }
    }
  }
  await read(directoryHandle);
  return files;
}

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

  // Upload/Workspace state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const apiBase = getApiBase();
  const isRemoteApi = apiBase.includes('onrender.com') || 
    (!apiBase.includes('localhost') && !apiBase.includes('127.0.0.1') && apiBase.startsWith('http'));

  const [workspaceMode, setWorkspaceMode] = useState(isRemoteApi ? 'remote' : 'local');

  useEffect(() => {
    if (currentDirectory) {
      setPathInput(currentDirectory);
    }
  }, [currentDirectory]);

  useEffect(() => {
    setWorkspaceMode(isRemoteApi ? 'remote' : 'local');
  }, [isRemoteApi]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!pathInput.trim()) {
      toast.error('Please enter or select a folder path');
      return;
    }
    onSelectDirectory(pathInput.trim());
  };

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

  const openExplorer = async () => {
    if (workspaceMode === 'remote') {
      try {
        if (window.showDirectoryPicker) {
          const handle = await window.showDirectoryPicker();
          toast.success(`Selected local folder: "${handle.name}"`);
          setPathInput(handle.name);
          setLoading(true);
          const files = await getFilesFromHandle(handle);
          setSelectedFiles(files);
          setLoading(false);
        } else {
          const input = document.getElementById('directory-picker-fallback-input');
          if (input) input.click();
        }
      } catch (err) {
        setLoading(false);
        if (err.name !== 'AbortError') {
          toast.error(`Folder picker error: ${err.message}`);
        }
      }
    } else {
      setShowExplorer(true);
      loadExplorerPath(pathInput || '');
    }
  };

  const handleSelectExplorer = () => {
    setPathInput(explorerData.currentPath);
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
    
    if (workspaceMode === 'remote') {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const filesArray = Array.from(e.dataTransfer.files);
        setSelectedFiles(filesArray);
        const firstFile = filesArray[0];
        const relativePath = firstFile.webkitRelativePath || firstFile.name;
        const rootName = relativePath.split('/')[0];
        setPathInput(rootName);
        toast.success(`Selected ${filesArray.length} items from drag & drop!`);
      }
    } else {
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

  const handleFolderSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(filesArray);
      const firstFile = filesArray[0];
      const relativePath = firstFile.webkitRelativePath || firstFile.name;
      const rootName = relativePath.split('/')[0];
      setPathInput(rootName);
      toast.success(`Selected folder containing ${e.target.files.length} files`);
    }
  };

  const handleFilesSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles(filesArray);
      const firstFile = filesArray[0];
      const relativePath = firstFile.webkitRelativePath || firstFile.name;
      const rootName = relativePath.split('/')[0];
      setPathInput(rootName);
      toast.success(`Selected ${e.target.files.length} files`);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error('No files selected for upload');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    const loadingToast = toast.loading(`Uploading ${selectedFiles.length} files to remote workspace...`);

    try {
      const res = await uploadFiles(selectedFiles, (progress) => {
        setUploadProgress(progress);
      });
      toast.success('Workspace updated successfully!', { id: loadingToast });
      setSelectedFiles([]);
      if (res.path) {
        onSelectDirectory(res.path);
      }
    } catch (err) {
      toast.error(`Upload failed: ${err.message}`, { id: loadingToast });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle Control */}
      {!isRemoteApi && (
        <div className="flex bg-[var(--bg-secondary)] p-1 rounded-xl w-fit border border-[var(--border-color)]">
          <button
            type="button"
            onClick={() => setWorkspaceMode('local')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
              workspaceMode === 'local'
                ? 'bg-brand text-white shadow-md'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            Local Drives
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceMode('remote')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
              workspaceMode === 'remote'
                ? 'bg-brand text-white shadow-md'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            Web Workspace
          </button>
        </div>
      )}

      {/* Main Path Input / Selection Form */}
      <form onSubmit={workspaceMode === 'local' ? handleSubmit : (e) => { e.preventDefault(); handleUpload(); }} className="relative flex flex-col md:flex-row gap-3">
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
            value={workspaceMode === 'local' ? pathInput : (selectedFiles.length > 0 ? `Selected Folder: ${selectedFiles[0].webkitRelativePath.split('/')[0]}` : (currentDirectory ? `Workspace: ${currentDirectory.split(/[\\/]/).pop()}` : ''))}
            onChange={(e) => workspaceMode === 'local' && setPathInput(e.target.value)}
            readOnly={workspaceMode === 'remote'}
            placeholder={workspaceMode === 'local' ? "Type or paste a parent directory path... (e.g. C:\\Projects\\Assets)" : "Click Browse to select a local folder..."}
            className="w-full pl-12 pr-4 py-3.5 bg-transparent border-0 text-[var(--text-main)] placeholder-[var(--text-muted)] rounded-2xl focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <button
          type="button"
          onClick={openExplorer}
          className="px-5 bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-brand/40 text-[var(--text-main)] rounded-2xl flex items-center gap-2 hover:bg-[var(--bg-secondary)] transition-all active:scale-95 shadow-sm font-semibold whitespace-nowrap"
        >
          <FolderOpen className="w-4 h-4 text-brand" />
          <span>Browse</span>
        </button>

        {workspaceMode === 'local' && (
          <button
            type="button"
            onClick={handleNativeBrowse}
            className="px-5 bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-brand/40 text-[var(--text-main)] rounded-2xl flex items-center gap-2 hover:bg-[var(--bg-secondary)] transition-all active:scale-95 shadow-sm font-semibold whitespace-nowrap"
            title="Choose using OS native dialog picker"
          >
            <Folder className="w-4 h-4 text-brand" />
            <span>Native Select</span>
          </button>
        )}

        <button
          type="submit"
          disabled={workspaceMode === 'remote' && selectedFiles.length === 0}
          className="gradient-btn px-6 py-3.5 rounded-2xl font-semibold shadow-md flex items-center gap-2 active:scale-95 disabled:opacity-50 whitespace-nowrap"
        >
          {workspaceMode === 'local' ? 'Select Directory' : 'Upload & Process'}
        </button>
      </form>

      {/* Hidden input for directory selection fallback in remote mode */}
      <input
        type="file"
        id="directory-picker-fallback-input"
        webkitdirectory="true"
        directory="true"
        multiple
        className="hidden"
        onChange={handleFolderSelect}
      />

      {workspaceMode === 'remote' && (
        <>
          {/* Selected Files Summary Card */}
          {selectedFiles.length > 0 && !uploading && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-5 rounded-[20px] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-[fadeIn_0.2s_ease-out]">
              <div>
                <p className="font-bold text-sm text-[var(--text-main)] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  Files Selected
                </p>
                <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
                  {selectedFiles.length} files detected (Total: {formatBytes(selectedFiles.reduce((sum, f) => sum + f.size, 0))})
                </p>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => { setSelectedFiles([]); setPathInput(''); }}
                  className="px-4 py-2.5 border border-[var(--border-color)] hover:bg-[var(--bg-secondary)] text-[var(--text-main)] rounded-xl text-sm font-semibold transition-all active:scale-95"
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  className="gradient-btn px-6 py-2.5 rounded-xl font-semibold shadow-md flex items-center gap-2 text-sm active:scale-95 shrink-0"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload & Process</span>
                </button>
              </div>
            </div>
          )}

          {/* Uploading progress card */}
          {uploading && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-5 rounded-[20px] space-y-3 animate-[fadeIn_0.2s_ease-out]">
              <div className="flex justify-between items-center text-sm font-semibold">
                <span className="flex items-center gap-2 text-brand">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Uploading items...
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-[var(--border-color)] h-2 rounded-full overflow-hidden">
                <div 
                  className="gradient-btn h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Dropzone / Drag Hint */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-[20px] p-8 text-center transition-all duration-300 ${
              isDragOver 
                ? 'border-brand bg-brand/5 shadow-[0_0_20px_rgba(139,92,246,0.1)] text-brand' 
                : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-brand/20'
            }`}
          >
            <UploadCloud className="w-10 h-10 text-brand mx-auto mb-2" />
            <p className="text-sm font-bold text-[var(--text-main)] mb-1">
              Drag and Drop folders or files here to select them
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Or click **Browse** above to open the native folder picker.
            </p>
          </div>

          {/* Explanatory Message on Remote Drive Restrictions */}
          {isRemoteApi && (
            <div className="flex gap-3.5 bg-brand/5 border border-brand/20 p-5 rounded-[20px] text-xs text-[var(--text-main)] text-left leading-relaxed">
              <Info className="w-5 h-5 text-brand shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-brand block mb-1">Remote Server Deployment Active</span>
                Because the ZIP Manager backend is running in the cloud, it cannot access your local drives (C: or D) directly. 
                Click **Browse** above to choose a folder from your local machine using the browser's native directory picker. Your folder structure will be uploaded securely to your private workspace for processing.
              </div>
            </div>
          )}
        </>
      )}

      {/* Recent History */}
      {recentDirectories && recentDirectories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
            <History className="w-3.5 h-3.5" />
            Workspace History:
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

            {/* Drives Selection */}
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


