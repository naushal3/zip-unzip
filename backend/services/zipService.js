import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import { 
  state, 
  logMessage, 
  updateItemStatus, 
  addRecentDirectory 
} from '../store.js';

// Holds active conflicts requiring user confirmation
// key: itemPath, value: { type: 'extract', zipPath, destPath, resolvePromise }
export const activeConflicts = new Map();

// Helper to format date as YYYYMMDD
function getYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// Helper to format date as YYYYMMDD_HHMM
function getYYYYMMDD_HHMM(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${hh}${mm}`;
}

// Scan directory
export function scanSelectedDirectory(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) {
    throw new Error('Directory path does not exist');
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    throw new Error('Path is not a directory');
  }

  state.currentDirectory = dirPath;
  addRecentDirectory(dirPath);

  const files = fs.readdirSync(dirPath);
  const items = {};

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    try {
      const fstat = fs.statSync(fullPath);
      const isDir = fstat.isDirectory();
      const isZip = !isDir && file.toLowerCase().endsWith('.zip');

      if (isDir || isZip) {
        items[fullPath] = {
          path: fullPath,
          name: file,
          type: isDir ? 'folder' : 'zip',
          status: 'Waiting',
          progress: 0,
          size: fstat.size,
          mtime: fstat.mtime,
          error: null
        };
      }
    } catch (e) {
      console.error(`Error reading file stats for ${file}:`, e);
    }
  });

  state.items = items;
  logMessage(`Scanned directory: ${dirPath}. Found ${Object.keys(items).length} items.`, 'success');
  return Object.values(items);
}

// Check excluded extensions
function isExcluded(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return state.settings.excludedExtensions.includes(ext);
}

// Helper to recursively find the maximum modified time in a directory
function getDirectoryMaxMtime(dirPath) {
  let maxMtime = 0;
  
  // Get stat of the directory itself
  try {
    const dirStat = fs.statSync(dirPath);
    maxMtime = Math.max(maxMtime, dirStat.mtimeMs);
  } catch (err) {
    return 0;
  }

  function traverse(currentPath) {
    try {
      const files = fs.readdirSync(currentPath);
      for (const file of files) {
        const fullPath = path.join(currentPath, file);
        if (isExcluded(file)) continue;
        
        const stat = fs.statSync(fullPath);
        maxMtime = Math.max(maxMtime, stat.mtimeMs);
        
        if (stat.isDirectory()) {
          traverse(fullPath);
        }
      }
    } catch (err) {
      // Ignore errors for inaccessible files/folders
    }
  }

  traverse(dirPath);
  return maxMtime;
}

// Helper to check if the existing zip is newer than all files in the folder
function isZipUpToDate(folderPath, zipPath) {
  if (!fs.existsSync(zipPath)) return false;
  try {
    const zipStat = fs.statSync(zipPath);
    const zipMtime = zipStat.mtimeMs;
    const folderMaxMtime = getDirectoryMaxMtime(folderPath);
    return folderMaxMtime <= zipMtime;
  } catch (err) {
    return false;
  }
}

// Zip single folder
export function zipFolder(folderPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    try {
      // Validate folder contains files
      if (!fs.existsSync(folderPath)) {
        return reject(new Error('Folder does not exist'));
      }
      
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      output.on('close', () => {
        resolve();
      });

      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          logMessage(`Warning zipping ${path.basename(folderPath)}: ${err.message}`, 'warning');
        } else {
          reject(err);
        }
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.on('progress', (progressData) => {
        const total = progressData.entries.total || 1;
        const processed = progressData.entries.processed || 0;
        const percent = Math.min(Math.round((processed / total) * 100), 99); // max 99 until write finishes
        onProgress(percent);
      });

      archive.pipe(output);

      // Append directory with file filter
      archive.directory(folderPath, false, (entry) => {
        if (isExcluded(entry.name)) {
          return false; // Skip this file
        }
        return entry;
      });

      archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}

// Unzip single file
export async function unzipFile(zipPath, outputPath, onProgress) {
  const zip = new AdmZip(zipPath);
  const zipEntries = zip.getEntries();
  const total = zipEntries.length;
  if (total === 0) {
    onProgress(100);
    return;
  }

  // Get all zip entry names/relative paths
  const zipPaths = new Set();
  zipEntries.forEach(entry => {
    // Normalize path separators to forward slashes to match zip entry formats
    const entryPath = entry.entryName.replace(/\\/g, '/');
    zipPaths.add(entryPath);
    // Also add parent directories of entries to prevent deleting them
    let parts = entryPath.split('/');
    if (parts.length > 1) {
      for (let i = 1; i < parts.length; i++) {
        zipPaths.add(parts.slice(0, i).join('/') + '/');
      }
    }
  });

  // If the directory already exists, perform synchronization (remove files not in ZIP)
  if (fs.existsSync(outputPath)) {
    const removeExtraneous = (currentDir) => {
      try {
        const files = fs.readdirSync(currentDir);
        for (const file of files) {
          const fullPath = path.join(currentDir, file);
          const relativePath = path.relative(outputPath, fullPath).replace(/\\/g, '/');
          
          const isDir = fs.statSync(fullPath).isDirectory();
          const matchPath = isDir ? `${relativePath}/` : relativePath;

          if (!zipPaths.has(matchPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            logMessage(`Cleaned up outdated item: ${relativePath}`, 'info');
          } else if (isDir) {
            removeExtraneous(fullPath);
          }
        }
      } catch (err) {
        // Ignore read/write errors during sync
      }
    };
    
    removeExtraneous(outputPath);
  }

  // Verify write permission on output directory
  fs.mkdirSync(outputPath, { recursive: true });

  for (let i = 0; i < total; i++) {
    const entry = zipEntries[i];
    zip.extractEntryTo(entry, outputPath, true, true);
    const percent = Math.round(((i + 1) / total) * 100);
    onProgress(percent);

    // Yield execution to event loop
    if (i % 5 === 0) {
      await new Promise(res => setImmediate(res));
    }
  }
}

// Queue system for processing multiple items
class ProcessQueue {
  constructor() {
    this.queue = [];
    this.active = [];
    this.isProcessing = false;
    this.sseEmitter = null;
  }

  setSseEmitter(emitter) {
    this.sseEmitter = emitter;
  }

  notifyClients() {
    if (this.sseEmitter) {
      this.sseEmitter('state', getAppStateAndStats());
    }
  }

  add(itemPath, operationType) {
    // Only queue if not already in queue/active
    if (this.queue.some(q => q.path === itemPath) || this.active.some(a => a.path === itemPath)) {
      return;
    }
    this.queue.push({ path: itemPath, type: operationType });
    updateItemStatus(itemPath, { status: 'Waiting', progress: 0, error: null });
  }

  async start() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    state.operations.status = 'processing';
    state.operations.startTime = Date.now();
    state.operations.total = this.queue.length + this.active.length;
    state.operations.processed = 0;
    state.operations.success = 0;
    state.operations.failed = 0;
    state.operations.speed = 0;
    state.operations.eta = null;

    logMessage(`Batch processing started with concurrency limit ${state.settings.concurrencyLimit}`, 'info');
    this.notifyClients();
    this.processNext();
  }

  stop() {
    this.queue = [];
    state.operations.status = 'idle';
    state.operations.endTime = Date.now();
    this.isProcessing = false;
    this.notifyClients();
    logMessage('Processing queue stopped.', 'info');
  }

  async processNext() {
    // If we have slots and items in queue
    while (this.active.length < state.settings.concurrencyLimit && this.queue.length > 0) {
      const task = this.queue.shift();
      this.active.push(task);
      this.executeTask(task);
    }

    if (this.active.length === 0 && this.queue.length === 0) {
      this.isProcessing = false;
      state.operations.status = 'idle';
      state.operations.endTime = Date.now();
      logMessage(`Batch processing completed. Success: ${state.operations.success}, Failed: ${state.operations.failed}`, 'success');
      this.notifyClients();
    }
  }

  async executeTask(task) {
    const item = state.items[task.path];
    if (!item) {
      this.taskFinished(task, false, 'Item not found in state');
      return;
    }

    try {
      if (task.type === 'zip') {
        await this.handleZipTask(item);
      } else if (task.type === 'extract') {
        await this.handleExtractTask(item);
      }
      this.taskFinished(task, true);
    } catch (err) {
      console.error(`Task error on ${item.name}:`, err);
      logMessage(`Failed to process ${item.name}: ${err.message}`, 'error');
      updateItemStatus(task.path, { status: 'Failed', error: err.message, progress: 0 });
      this.taskFinished(task, false, err.message);
    }
  }

  async handleZipTask(item) {
    updateItemStatus(item.path, { status: 'Scanning', progress: 10 });
    this.notifyClients();

    const parentDir = state.currentDirectory;
    const baseName = path.basename(item.path);
    let targetZipPath = path.join(parentDir, `${baseName}.zip`);

    // Check if the ZIP is already up-to-date
    if (isZipUpToDate(item.path, targetZipPath)) {
      logMessage(`Zip archive for ${baseName} is already up to date. Skipping compression.`, 'success');
      updateItemStatus(item.path, { status: 'Completed', progress: 100 });
      return;
    }

    // Check if zip already exists
    if (fs.existsSync(targetZipPath)) {
      const decision = await this.resolveZipConflict(item.path, targetZipPath);
      if (decision === 'skip') {
        logMessage(`Compression skipped for ${baseName}.zip by user decision.`, 'warning');
        updateItemStatus(item.path, { status: 'Completed', progress: 100 });
        return;
      } else if (decision === 'timestamp') {
        const todayStr = getYYYYMMDD(new Date());
        let newZipName = `${baseName}_${todayStr}.zip`;
        let tempZipPath = path.join(parentDir, newZipName);

        if (fs.existsSync(tempZipPath)) {
          // Add HHMM timestamp if YYYYMMDD exists
          const fullTimeStr = getYYYYMMDD_HHMM(new Date());
          newZipName = `${baseName}_${fullTimeStr}.zip`;
          tempZipPath = path.join(parentDir, newZipName);
          
          if (fs.existsSync(tempZipPath)) {
            // Append increments if exact minute duplicate exists
            let count = 1;
            while (fs.existsSync(path.join(parentDir, `${baseName}_${fullTimeStr}_${count}.zip`))) {
              count++;
            }
            newZipName = `${baseName}_${fullTimeStr}_${count}.zip`;
            tempZipPath = path.join(parentDir, newZipName);
          }
        }
        targetZipPath = tempZipPath;
        logMessage(`Zip already exists for ${baseName}. Renamed output file to ${newZipName}`, 'warning');
      } else {
        // 'overwrite'
        logMessage(`Zip archive already exists for ${baseName}. Overwriting file.`, 'info');
        try {
          fs.rmSync(targetZipPath, { force: true });
        } catch (err) {
          // Ignore delete errors
        }
      }
    }

    updateItemStatus(item.path, { status: 'Zipping', progress: 15 });
    this.notifyClients();

    await zipFolder(item.path, targetZipPath, (percent) => {
      updateItemStatus(item.path, { progress: percent });
      this.notifyClients();
    });

    updateItemStatus(item.path, { status: 'Completed', progress: 100 });
    logMessage(`Folder ${baseName} zipped successfully`, 'success');
  }

  async handleExtractTask(item) {
    updateItemStatus(item.path, { status: 'Scanning', progress: 10 });
    this.notifyClients();

    const parentDir = state.currentDirectory;
    const baseName = path.basename(item.path, '.zip');
    let targetDestPath = path.join(parentDir, baseName);

    // Conflict Check
    if (fs.existsSync(targetDestPath)) {
      const decision = await this.resolveExtractionConflict(item.path, targetDestPath);
      if (decision === 'skip') {
        logMessage(`Extraction skipped for ${item.name} by user decision.`, 'warning');
        updateItemStatus(item.path, { status: 'Completed', progress: 100 });
        return;
      } else if (decision === 'timestamp') {
        const todayStr = getYYYYMMDD(new Date());
        let newDirName = `${baseName}_${todayStr}`;
        let tempPath = path.join(parentDir, newDirName);
        if (fs.existsSync(tempPath)) {
          const fullTimeStr = getYYYYMMDD_HHMM(new Date());
          newDirName = `${baseName}_${fullTimeStr}`;
          tempPath = path.join(parentDir, newDirName);
          if (fs.existsSync(tempPath)) {
            let count = 1;
            while (fs.existsSync(path.join(parentDir, `${baseName}_${fullTimeStr}_${count}`))) {
              count++;
            }
            newDirName = `${baseName}_${fullTimeStr}_${count}`;
            tempPath = path.join(parentDir, newDirName);
          }
        }
        targetDestPath = tempPath;
        logMessage(`Destination folder exists for ${item.name}. Output folder renamed to ${newDirName}`, 'warning');
      } else if (decision === 'overwrite') {
        logMessage(`Destination folder exists for ${item.name}. Overwriting existing contents.`, 'info');
      }
    }

    updateItemStatus(item.path, { status: 'Extracting', progress: 15 });
    this.notifyClients();

    await unzipFile(item.path, targetDestPath, (percent) => {
      updateItemStatus(item.path, { progress: percent });
      this.notifyClients();
    });

    updateItemStatus(item.path, { status: 'Completed', progress: 100 });
    logMessage(`Archive ${item.name} extracted successfully`, 'success');
  }

  resolveExtractionConflict(itemPath, destPath) {
    const policy = state.settings.overwritePolicy;
    // If not "ask", resolve immediately
    if (policy !== 'ask') {
      return Promise.resolve(policy); // policy can be 'overwrite', 'timestamp', 'skip'
    }

    return new Promise((resolve) => {
      updateItemStatus(itemPath, { status: 'Waiting' });
      logMessage(`Conflict detected for ${path.basename(itemPath)}. Waiting for user resolution.`, 'warning');
      this.notifyClients();

      activeConflicts.set(itemPath, {
        type: 'extract',
        itemPath,
        destPath,
        resolve: (decision) => {
          activeConflicts.delete(itemPath);
          resolve(decision);
        }
      });
    });
  }

  resolveZipConflict(itemPath, destZipPath) {
    const policy = state.settings.overwritePolicy;
    if (policy !== 'ask') {
      return Promise.resolve(policy);
    }

    return new Promise((resolve) => {
      updateItemStatus(itemPath, { status: 'Waiting' });
      logMessage(`Conflict detected for ${path.basename(itemPath)}.zip. Waiting for user resolution.`, 'warning');
      this.notifyClients();

      activeConflicts.set(itemPath, {
        type: 'zip',
        itemPath,
        destPath: destZipPath,
        resolve: (decision) => {
          activeConflicts.delete(itemPath);
          resolve(decision);
        }
      });
    });
  }

  taskFinished(task, success, errorMsg = null) {
    this.active = this.active.filter(a => a.path !== task.path);
    state.operations.processed++;
    if (success) {
      state.operations.success++;
    } else {
      state.operations.failed++;
    }

    // Update Speed and ETA
    const elapsedSec = (Date.now() - state.operations.startTime) / 1000;
    if (elapsedSec > 0) {
      state.operations.speed = parseFloat((state.operations.processed / elapsedSec).toFixed(2));
      const remaining = state.operations.total - state.operations.processed;
      if (state.operations.speed > 0) {
        state.operations.eta = Math.max(0, Math.round(remaining / state.operations.speed));
      }
    }

    this.notifyClients();
    this.processNext();
  }
}

export const processQueue = new ProcessQueue();

// Get app state + computed stats
export function getAppStateAndStats() {
  const appState = state;
  const itemsArray = Object.values(appState.items);
  
  // Calculate dynamic dashboard stats
  const totalFolders = itemsArray.filter(i => i.type === 'folder').length;
  const totalZips = itemsArray.filter(i => i.type === 'zip').length;

  return {
    currentDirectory: appState.currentDirectory,
    recentDirectories: appState.recentDirectories,
    settings: appState.settings,
    items: itemsArray,
    operations: appState.operations,
    logs: appState.logs,
    totalFolders,
    totalZips,
    conflicts: Array.from(activeConflicts.values()).map(c => ({
      itemPath: c.itemPath,
      type: c.type,
      name: path.basename(c.itemPath),
      destPath: c.destPath
    }))
  };
}

