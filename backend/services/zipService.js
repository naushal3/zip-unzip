import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import { 
  getUserState, 
  logMessage, 
  updateItemStatus, 
  addRecentDirectory 
} from '../store.js';

// Holds active conflicts requiring user confirmation
// key: `${userId}:${itemPath}`, value: { userId, type: 'zip'|'extract', itemPath, destPath, resolve }
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
export function scanSelectedDirectory(dirPath, userId = 'default') {
  if (!dirPath || !fs.existsSync(dirPath)) {
    throw new Error('Directory path does not exist');
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    throw new Error('Path is not a directory');
  }

  const userState = getUserState(userId);
  userState.currentDirectory = dirPath;
  addRecentDirectory(dirPath, userId);

  const files = fs.readdirSync(dirPath);
  const items = {};

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    try {
      const fstat = fs.statSync(fullPath);
      const isDir = fstat.isDirectory();
      const isZip = !isDir && file.toLowerCase().endsWith('.zip');

      items[fullPath] = {
        path: fullPath,
        name: file,
        type: isDir ? 'folder' : (isZip ? 'zip' : 'file'),
        status: 'Waiting',
        progress: 0,
        size: fstat.size,
        mtime: fstat.mtime,
        error: null
      };
    } catch (e) {
      console.error(`Error reading file stats for ${file}:`, e);
    }
  });

  userState.items = items;
  logMessage(`Scanned directory: ${dirPath}. Found ${Object.keys(items).length} items.`, 'success', userId);
  return Object.values(items);
}

// Check excluded extensions
function isExcluded(fileName, userId = 'default') {
  const ext = path.extname(fileName).toLowerCase();
  const userState = getUserState(userId);
  return userState.settings.excludedExtensions.includes(ext);
}

// Helper to recursively find the maximum modified time in a directory
function getDirectoryMaxMtime(dirPath, userId = 'default') {
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
        if (isExcluded(file, userId)) continue;
        
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
function isZipUpToDate(folderPath, zipPath, userId = 'default') {
  if (!fs.existsSync(zipPath)) return false;
  try {
    const zipStat = fs.statSync(zipPath);
    const zipMtime = zipStat.mtimeMs;
    const folderMaxMtime = getDirectoryMaxMtime(folderPath, userId);
    return folderMaxMtime <= zipMtime;
  } catch (err) {
    return false;
  }
}

// Zip single folder
export function zipFolder(folderPath, outputPath, onProgress, userId = 'default') {
  return new Promise((resolve, reject) => {
    try {
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
          logMessage(`Warning zipping ${path.basename(folderPath)}: ${err.message}`, 'warning', userId);
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

      const folderStat = fs.statSync(folderPath);
      if (folderStat.isDirectory()) {
        // Append directory with file filter
        archive.directory(folderPath, false, (entry) => {
          if (isExcluded(entry.name, userId)) {
            return false; // Skip this file
          }
          return entry;
        });
      } else {
        // Append single file
        archive.file(folderPath, { name: path.basename(folderPath) });
      }

      archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}

// Unzip single file
export async function unzipFile(zipPath, outputPath, onProgress, userId = 'default') {
  console.log('ZIP PATH:', zipPath);
  console.log('OUTPUT PATH:', outputPath);
  const fileExists = fs.existsSync(zipPath);
  console.log('Exists:', fileExists);
  if (fileExists) {
    console.log('Size:', fs.statSync(zipPath).size);
  }

  logMessage(`[UNZIP] Found ZIP file: ${path.basename(zipPath)}`, 'info', userId);
  logMessage(`[UNZIP] Extracting to directory: ${outputPath}`, 'info', userId);

  const zip = new AdmZip(zipPath);
  const zipEntries = zip.getEntries();
  const total = zipEntries.length;
  console.log('Entries:', total);
  if (total === 0) {
    onProgress(100);
    logMessage(`[UNZIP] ZIP file is empty: ${path.basename(zipPath)}`, 'warning', userId);
    return;
  }

  fs.mkdirSync(outputPath, { recursive: true });

  for (let i = 0; i < total; i++) {
    const entry = zipEntries[i];
    try {
      if (entry.isDirectory) {
        fs.mkdirSync(path.join(outputPath, entry.entryName), { recursive: true });
      } else {
        const targetFilePath = path.join(outputPath, entry.entryName);
        fs.mkdirSync(path.dirname(targetFilePath), { recursive: true });
        zip.extractEntryTo(entry, outputPath, true, true);
      }
    } catch (err) {
      console.error(`Failed to extract entry ${entry.entryName} from ${path.basename(zipPath)}:`, err);
      throw new Error(`Failed to extract ${entry.entryName}: ${err.message}`);
    }

    const percent = Math.round(((i + 1) / total) * 100);
    onProgress(percent);

    if (i % 5 === 0) {
      await new Promise(res => setImmediate(res));
    }
  }

  logMessage(`[UNZIP] Extraction completed successfully for: ${path.basename(zipPath)}`, 'success', userId);
}

// Queue system for processing multiple items
class ProcessQueue {
  constructor(userId) {
    this.userId = userId;
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
      this.sseEmitter('state', getAppStateAndStats(this.userId), this.userId);
    }
  }

  add(itemPath, operationType) {
    if (this.queue.some(q => q.path === itemPath) || this.active.some(a => a.path === itemPath)) {
      return;
    }
    this.queue.push({ path: itemPath, type: operationType });
    updateItemStatus(itemPath, { status: 'Waiting', progress: 0, error: null }, this.userId);
  }

  async start() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    const userState = getUserState(this.userId);
    userState.operations.status = 'processing';
    userState.operations.startTime = Date.now();
    userState.operations.total = this.queue.length + this.active.length;
    userState.operations.processed = 0;
    userState.operations.success = 0;
    userState.operations.failed = 0;
    userState.operations.speed = 0;
    userState.operations.eta = null;

    logMessage(`Batch processing started with concurrency limit ${userState.settings.concurrencyLimit}`, 'info', this.userId);
    this.notifyClients();
    this.processNext();
  }

  stop() {
    this.queue = [];
    const userState = getUserState(this.userId);
    userState.operations.status = 'idle';
    userState.operations.endTime = Date.now();
    this.isProcessing = false;
    this.notifyClients();
    logMessage('Processing queue stopped.', 'info', this.userId);
  }

  async processNext() {
    const userState = getUserState(this.userId);
    while (this.active.length < userState.settings.concurrencyLimit && this.queue.length > 0) {
      const task = this.queue.shift();
      this.active.push(task);
      this.executeTask(task);
    }

    if (this.active.length === 0 && this.queue.length === 0) {
      this.isProcessing = false;
      userState.operations.status = 'idle';
      userState.operations.endTime = Date.now();
      
      try {
        if (userState.currentDirectory) {
          scanSelectedDirectory(userState.currentDirectory, this.userId);
        }
      } catch (e) {
        console.error('Failed to rescan directory on queue finish:', e);
      }
      
      logMessage(`Batch processing completed. Success: ${userState.operations.success}, Failed: ${userState.operations.failed}`, 'success', this.userId);
      this.notifyClients();
    }
  }

  async executeTask(task) {
    const userState = getUserState(this.userId);
    const resolvedPath = path.resolve(task.path);
    const item = userState.items[task.path] || userState.items[resolvedPath] || Object.values(userState.items).find(i => path.resolve(i.path) === resolvedPath);
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
      logMessage(`Failed to process ${item.name}: ${err.message}`, 'error', this.userId);
      updateItemStatus(task.path, { status: 'Failed', error: err.message, progress: 0 }, this.userId);
      this.taskFinished(task, false, err.message);
    }
  }

  async handleZipTask(item) {
    updateItemStatus(item.path, { status: 'Scanning', progress: 10 }, this.userId);
    this.notifyClients();
    logMessage(`[ZIP] Scanning files in directory: ${item.path}`, 'info', this.userId);

    const userState = getUserState(this.userId);
    const parentDir = userState.currentDirectory;
    const baseName = path.basename(item.path);
    let targetZipPath = path.join(parentDir, `${baseName}.zip`);

    if (isZipUpToDate(item.path, targetZipPath, this.userId)) {
      logMessage(`[ZIP] Zip archive for ${baseName} is already up to date. Skipping compression.`, 'success', this.userId);
      updateItemStatus(item.path, { status: 'Completed', progress: 100 }, this.userId);
      return;
    }

    if (fs.existsSync(targetZipPath)) {
      const decision = await this.resolveZipConflict(item.path, targetZipPath);
      if (decision === 'skip') {
        logMessage(`[ZIP] Compression skipped for ${baseName}.zip by user decision.`, 'warning', this.userId);
        updateItemStatus(item.path, { status: 'Completed', progress: 100 }, this.userId);
        return;
      } else if (decision === 'timestamp') {
        const todayStr = getYYYYMMDD(new Date());
        let newZipName = `${baseName}_${todayStr}.zip`;
        let tempZipPath = path.join(parentDir, newZipName);

        if (fs.existsSync(tempZipPath)) {
          const fullTimeStr = getYYYYMMDD_HHMM(new Date());
          newZipName = `${baseName}_${fullTimeStr}.zip`;
          tempZipPath = path.join(parentDir, newZipName);
          
          if (fs.existsSync(tempZipPath)) {
            let count = 1;
            while (fs.existsSync(path.join(parentDir, `${baseName}_${fullTimeStr}_${count}.zip`))) {
              count++;
            }
            newZipName = `${baseName}_${fullTimeStr}_${count}.zip`;
            tempZipPath = path.join(parentDir, newZipName);
          }
        }
        targetZipPath = tempZipPath;
        logMessage(`[ZIP] Zip already exists for ${baseName}. Renamed output file to ${newZipName}`, 'warning', this.userId);
      } else {
        logMessage(`[ZIP] Zip archive already exists for ${baseName}. Overwriting file.`, 'info', this.userId);
        try {
          fs.rmSync(targetZipPath, { force: true });
        } catch (err) {
          // Ignore
        }
      }
    }

    logMessage(`[ZIP] Initiating archiver compression to target: ${targetZipPath}`, 'info', this.userId);

    updateItemStatus(item.path, { status: 'Zipping', progress: 15 }, this.userId);
    this.notifyClients();

    await zipFolder(item.path, targetZipPath, (percent) => {
      updateItemStatus(item.path, { progress: percent }, this.userId);
      this.notifyClients();
    }, this.userId);

    updateItemStatus(item.path, { status: 'Completed', progress: 100 }, this.userId);
    logMessage(`[ZIP] Folder ${baseName} compressed successfully to ${path.basename(targetZipPath)}`, 'success', this.userId);
  }

  async handleExtractTask(item) {
    console.log('[UNZIP] handleExtractTask called');
    console.log(item);

    updateItemStatus(item.path, { status: 'Scanning', progress: 10 }, this.userId);
    this.notifyClients();
    logMessage(`[UNZIP] Reading ZIP archive structure for: ${item.name}`, 'info', this.userId);

    const userState = getUserState(this.userId);
    const parentDir = userState.currentDirectory;
    console.log('userState.currentDirectory:', parentDir);

    const baseName = path.basename(item.path, '.zip');
    let targetDestPath = path.join(parentDir, baseName);

    if (fs.existsSync(targetDestPath)) {
      const decision = await this.resolveExtractionConflict(item.path, targetDestPath);
      if (decision === 'skip') {
        logMessage(`[UNZIP] Extraction skipped for ${item.name} by user decision.`, 'warning', this.userId);
        updateItemStatus(item.path, { status: 'Completed', progress: 100 }, this.userId);
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
        logMessage(`[UNZIP] Destination folder exists for ${item.name}. Output folder renamed to ${newDirName}`, 'warning', this.userId);
      } else if (decision === 'overwrite') {
        logMessage(`[UNZIP] Destination folder exists for ${item.name}. Overwriting existing contents.`, 'info', this.userId);
        try {
          fs.rmSync(targetDestPath, { recursive: true, force: true });
        } catch (err) {
          console.error(`Failed to remove old folder ${targetDestPath}:`, err);
        }
      }
    }

    logMessage(`[UNZIP] Initiating extraction to directory: ${targetDestPath}`, 'info', this.userId);

    updateItemStatus(item.path, { status: 'Extracting', progress: 15 }, this.userId);
    this.notifyClients();

    await unzipFile(item.path, targetDestPath, (percent) => {
      updateItemStatus(item.path, { progress: percent }, this.userId);
      this.notifyClients();
    }, this.userId);

    updateItemStatus(item.path, { status: 'Completed', progress: 100 }, this.userId);
    logMessage(`[UNZIP] Archive ${item.name} extracted successfully to ${baseName}/`, 'success', this.userId);
  }

  resolveExtractionConflict(itemPath, destPath) {
    const userState = getUserState(this.userId);
    const policy = userState.settings.overwritePolicy;
    if (policy !== 'ask') {
      return Promise.resolve(policy);
    }

    return new Promise((resolve) => {
      updateItemStatus(itemPath, { status: 'Waiting' }, this.userId);
      logMessage(`Conflict detected for ${path.basename(itemPath)}. Waiting for user resolution.`, 'warning', this.userId);
      this.notifyClients();

      const conflictKey = `${this.userId}:${itemPath}`;
      activeConflicts.set(conflictKey, {
        userId: this.userId,
        type: 'extract',
        itemPath,
        destPath,
        resolve: (decision) => {
          activeConflicts.delete(conflictKey);
          resolve(decision);
        }
      });
    });
  }

  resolveZipConflict(itemPath, destZipPath) {
    const userState = getUserState(this.userId);
    const policy = userState.settings.overwritePolicy;
    if (policy !== 'ask') {
      return Promise.resolve(policy);
    }

    return new Promise((resolve) => {
      updateItemStatus(itemPath, { status: 'Waiting' }, this.userId);
      logMessage(`Conflict detected for ${path.basename(itemPath)}.zip. Waiting for user resolution.`, 'warning', this.userId);
      this.notifyClients();

      const conflictKey = `${this.userId}:${itemPath}`;
      activeConflicts.set(conflictKey, {
        userId: this.userId,
        type: 'zip',
        itemPath,
        destPath: destZipPath,
        resolve: (decision) => {
          activeConflicts.delete(conflictKey);
          resolve(decision);
        }
      });
    });
  }

  taskFinished(task, success, errorMsg = null) {
    this.active = this.active.filter(a => a.path !== task.path);
    const userState = getUserState(this.userId);
    userState.operations.processed++;
    if (success) {
      userState.operations.success++;
      try {
        if (userState.currentDirectory) {
          scanSelectedDirectory(userState.currentDirectory, this.userId);
        }
      } catch (e) {
        console.error('Failed to rescan directory after task completion:', e);
      }
    } else {
      userState.operations.failed++;
    }

    const elapsedSec = (Date.now() - userState.operations.startTime) / 1000;
    if (elapsedSec > 0) {
      userState.operations.speed = parseFloat((userState.operations.processed / elapsedSec).toFixed(2));
      const remaining = userState.operations.total - userState.operations.processed;
      if (userState.operations.speed > 0) {
        userState.operations.eta = Math.max(0, Math.round(remaining / userState.operations.speed));
      }
    }

    this.notifyClients();
    this.processNext();
  }
}

// Map of user-specific process queues
const processQueues = new Map();

export function getProcessQueue(userId = 'default') {
  if (!processQueues.has(userId)) {
    processQueues.set(userId, new ProcessQueue(userId));
  }
  return processQueues.get(userId);
}

// Backward compatibility export
export const processQueue = getProcessQueue('default');

// Get app state + computed stats
export function getAppStateAndStats(userId = 'default') {
  const appState = getUserState(userId);
  const itemsArray = Object.values(appState.items);
  
  const totalFolders = itemsArray.filter(i => i.type === 'folder').length;
  const totalZips = itemsArray.filter(i => i.type === 'zip').length;

  const userConflicts = [];
  activeConflicts.forEach((c) => {
    if (c.userId === userId) {
      userConflicts.push({
        itemPath: c.itemPath,
        type: c.type,
        name: path.basename(c.itemPath),
        destPath: c.destPath
      });
    }
  });

  return {
    currentDirectory: appState.currentDirectory,
    recentDirectories: appState.recentDirectories,
    settings: appState.settings,
    items: itemsArray,
    operations: appState.operations,
    logs: appState.logs,
    totalFolders,
    totalZips,
    conflicts: userConflicts
  };
}


