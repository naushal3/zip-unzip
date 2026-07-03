import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import archiver from 'archiver';
import multer from 'multer';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

import {
  getUserState,
  logMessage,
  saveSettings,
  clearItems,
  updateItemStatus,
  getAppState
} from './store.js';
import {
  scanSelectedDirectory,
  getAppStateAndStats,
  getProcessQueue,
  activeConflicts,
  zipFolder,
  unzipFile
} from './services/zipService.js';
import {
  startWatching,
  stopWatching
} from './services/watcherService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// List of connected SSE clients
let sseClients = [];

// Helper to send events to clients of a specific user
function sendSseEvent(event, data, userId = 'default') {
  sseClients.forEach(client => {
    if (client.userId === userId) {
      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  });
}

// Sanitize relative path to prevent directory traversal
function sanitizeRelativePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const cleanParts = parts.filter(part => part && part !== '.' && part !== '..');
  return cleanParts.join('/');
}

// Secure boundary checks for paths
function isPathSecure(targetPath, userId) {
  if (!targetPath) return true;
  const resolvedTarget = path.resolve(targetPath);
  const workspaceRoot = path.resolve(path.join(__dirname, 'workspace'));
  const userWorkspace = path.resolve(path.join(workspaceRoot, userId));
  
  if (resolvedTarget.startsWith(workspaceRoot)) {
    return resolvedTarget.startsWith(userWorkspace);
  }
  
  // If authenticated user, strictly restrict access to their workspace folder
  if (userId !== 'default') {
    return resolvedTarget.startsWith(userWorkspace);
  }
  
  return true; // Local mode allows other drives
}

// Multer storage engine configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const userId = req.headers['x-user-id'] || 'default';
    const cleanPath = sanitizeRelativePath(file.originalname);
    const targetDir = path.join(__dirname, 'workspace', userId, path.dirname(cleanPath));
    
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: function (req, file, cb) {
    const cleanPath = sanitizeRelativePath(file.originalname);
    cb(null, path.basename(cleanPath));
  }
});

const upload = multer({ storage: storage });

// Helper to list Windows drives using powershell and fallback to wmic
function getWindowsDrives() {
  return new Promise((resolve) => {
    exec('powershell -Command "[System.IO.DriveInfo]::GetDrives() | Where-Object IsReady | Select-Object -ExpandProperty Name"', (err, stdout) => {
      if (!err && stdout) {
        const drives = stdout
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => /^[A-Za-z]:\\$/.test(line));
        if (drives.length) {
          return resolve(drives);
        }
      }

      exec('wmic logicaldisk get name', (err2, stdout2) => {
        if (err2) return resolve(['C:\\']);
        const drives = stdout2
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => /^[A-Za-z]:$/.test(line))
          .map(drive => drive + '\\');
        resolve(drives.length ? drives : ['C:\\']);
      });
    });
  });
}

// Ensure workspace directory exists
const globalWorkspaceDir = path.join(__dirname, 'workspace');
if (!fs.existsSync(globalWorkspaceDir)) {
  fs.mkdirSync(globalWorkspaceDir, { recursive: true });
}

// REST APIs

// SSE event stream
app.get('/api/events', (req, res) => {
  const userId = req.query.userId || 'default';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(`event: state\n`);
  res.write(`data: ${JSON.stringify(getAppStateAndStats(userId))}\n\n`);

  const client = { res, userId };
  sseClients.push(client);

  getProcessQueue(userId).setSseEmitter(sendSseEvent);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== client);
  });
});

// Get current state
app.get('/api/status', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  res.json(getAppStateAndStats(userId));
});

// Select and scan directory
app.post('/api/select-dir', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  let { path: dirPath } = req.body;
  if (!dirPath) {
    return res.status(400).json({ error: 'Path is required' });
  }

  // Prepend user workspace prefix if in multi-tenant mode and path is relative
  if (userId !== 'default' && !path.isAbsolute(dirPath)) {
    dirPath = path.join(__dirname, 'workspace', userId, dirPath);
  }

  if (!isPathSecure(dirPath, userId)) {
    return res.status(403).json({ error: 'Access Denied: Path is outside your secure workspace' });
  }

  try {
    const resolvedPath = path.resolve(dirPath);
    clearItems(userId);
    const items = scanSelectedDirectory(resolvedPath, userId);

    startWatching(resolvedPath, sendSseEvent, userId);
    sendSseEvent('state', getAppStateAndStats(userId), userId);

    res.json({ success: true, path: resolvedPath, items });
  } catch (err) {
    logMessage(`Failed to select directory ${dirPath}: ${err.message}`, 'error', userId);
    res.status(500).json({ error: err.message });
  }
});

// Scan current directory
app.post('/api/scan', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const userState = getUserState(userId);
  if (!userState.currentDirectory) {
    return res.status(400).json({ error: 'No directory selected' });
  }

  if (!isPathSecure(userState.currentDirectory, userId)) {
    return res.status(403).json({ error: 'Access Denied' });
  }

  try {
    const items = scanSelectedDirectory(userState.currentDirectory, userId);
    sendSseEvent('state', getAppStateAndStats(userId), userId);
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Browse server directory structure
app.get('/api/browse', async (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  let targetPath = req.query.path;
  const isWindows = process.platform === 'win32';

  if (!targetPath) {
    if (userId !== 'default') {
      targetPath = path.join(__dirname, 'workspace', userId);
      fs.mkdirSync(targetPath, { recursive: true });
    } else {
      targetPath = os.homedir();
    }
  } else if (userId !== 'default' && !path.isAbsolute(targetPath)) {
    targetPath = path.join(__dirname, 'workspace', userId, targetPath);
  }

  if (!isPathSecure(targetPath, userId)) {
    return res.status(403).json({ error: 'Access Denied' });
  }

  try {
    const resolvedPath = path.resolve(targetPath);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const files = fs.readdirSync(resolvedPath);
    const directories = [];

    for (const file of files) {
      if (file.startsWith('$') || file.startsWith('.')) continue;
      try {
        const fullPath = path.join(resolvedPath, file);
        const fstat = fs.statSync(fullPath);
        if (fstat.isDirectory()) {
          directories.push({
            name: file,
            path: fullPath
          });
        }
      } catch (err) {
        // Skip inaccessible files/folders
      }
    }

    let drives = [];
    if (isWindows && userId === 'default') {
      drives = await getWindowsDrives();
    }

    const parentPath = path.dirname(resolvedPath);
    const isAtRoot = parentPath === resolvedPath || (userId !== 'default' && resolvedPath === path.resolve(path.join(__dirname, 'workspace', userId)));

    res.json({
      currentPath: resolvedPath,
      parentPath: isAtRoot ? null : parentPath,
      directories: directories.sort((a, b) => a.name.localeCompare(b.name)),
      drives
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload endpoint for folders and files
app.post('/api/upload', upload.array('files'), (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const workspacePath = path.resolve(path.join(__dirname, 'workspace', userId));
  
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files were uploaded' });
    }

    logMessage(`Successfully uploaded ${req.files.length} items to remote workspace`, 'success', userId);

    clearItems(userId);
    const items = scanSelectedDirectory(workspacePath, userId);
    startWatching(workspacePath, sendSseEvent, userId);
    sendSseEvent('state', getAppStateAndStats(userId), userId);

    res.json({ success: true, path: workspacePath, items });
  } catch (err) {
    logMessage(`Failed to handle uploaded items: ${err.message}`, 'error', userId);
    res.status(500).json({ error: err.message });
  }
});

// Trigger batch actions
app.post('/api/process', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const { items, action } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required' });
  }
  if (action !== 'zip' && action !== 'extract' && action !== 'auto') {
    return res.status(400).json({ error: 'Action must be "zip", "extract", or "auto"' });
  }

  for (const itemPath of items) {
    if (!isPathSecure(itemPath, userId)) {
      return res.status(403).json({ error: 'Access Denied: Path outside workspace boundary' });
    }
  }

  const userQueue = getProcessQueue(userId);
  const userState = getUserState(userId);

  items.forEach(itemPath => {
    let taskAction = action;
    if (action === 'auto') {
      const item = userState.items[itemPath];
      if (item) {
        taskAction = item.type === 'folder' ? 'zip' : 'extract';
      } else {
        try {
          const stat = fs.statSync(itemPath);
          taskAction = stat.isDirectory() ? 'zip' : 'extract';
        } catch (e) {
          taskAction = itemPath.toLowerCase().endsWith('.zip') ? 'extract' : 'zip';
        }
      }
    }
    userQueue.add(itemPath, taskAction);
  });

  userQueue.start();
  res.json({ success: true, message: 'Processing started' });
});

// Direct zip endpoint
app.post('/api/zip', async (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const { path: folderPath } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: 'path is required' });
  }
  if (!isPathSecure(folderPath, userId)) {
    return res.status(403).json({ error: 'Access Denied: Path outside workspace boundary' });
  }
  try {
    const baseName = path.basename(folderPath);
    const parentDir = path.dirname(folderPath);
    const targetZipPath = path.join(parentDir, `${baseName}.zip`);
    
    await zipFolder(folderPath, targetZipPath, () => {}, userId);
    scanSelectedDirectory(parentDir, userId);
    sendSseEvent('state', getAppStateAndStats(userId), userId);
    res.json({ success: true, message: 'Folder zipped successfully', archivePath: targetZipPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct unzip endpoint
app.post('/api/unzip', async (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const { path: zipPath } = req.body;
  if (!zipPath) {
    return res.status(400).json({ error: 'path is required' });
  }
  if (!isPathSecure(zipPath, userId)) {
    return res.status(403).json({ error: 'Access Denied: Path outside workspace boundary' });
  }
  try {
    const baseName = path.basename(zipPath, '.zip');
    const parentDir = path.dirname(zipPath);
    const targetDestPath = path.join(parentDir, baseName);
    
    await unzipFile(zipPath, targetDestPath, () => {}, userId);
    scanSelectedDirectory(parentDir, userId);
    sendSseEvent('state', getAppStateAndStats(userId), userId);
    res.json({ success: true, message: 'Archive extracted successfully', destPath: targetDestPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resolve conflicts
app.post('/api/resolve-conflict', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const { itemPath, decision } = req.body;
  if (!itemPath || !decision) {
    return res.status(400).json({ error: 'itemPath and decision are required' });
  }
  if (!isPathSecure(itemPath, userId)) {
    return res.status(403).json({ error: 'Access Denied' });
  }

  const conflictKey = `${userId}:${itemPath}`;
  const conflict = activeConflicts.get(conflictKey);
  if (!conflict) {
    return res.status(404).json({ error: 'No pending conflict for this path' });
  }

  conflict.resolve(decision);
  res.json({ success: true });
});

// Cancel queue
app.post('/api/cancel', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const userQueue = getProcessQueue(userId);
  userQueue.stop();
  res.json({ success: true, message: 'Processing queue cancelled' });
});

// Download single ZIP
app.get('/api/download', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const { file: filePath } = req.query;
  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  if (!isPathSecure(filePath, userId)) {
    return res.status(403).json({ error: 'Access Denied' });
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (path.extname(resolved).toLowerCase() !== '.zip') {
    return res.status(400).json({ error: 'Only ZIP files are downloadable' });
  }

  res.download(resolved, path.basename(resolved), (err) => {
    if (err) {
      console.error('Download error:', err);
    }
  });
});

// Download all zip files as a single combined zip stream
app.get('/api/download-all', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const userState = getUserState(userId);
  if (!userState.currentDirectory) {
    return res.status(400).json({ error: 'No directory selected' });
  }

  if (!isPathSecure(userState.currentDirectory, userId)) {
    return res.status(403).json({ error: 'Access Denied' });
  }

  try {
    const parentDir = userState.currentDirectory;
    const files = fs.readdirSync(parentDir);
    const zips = files
      .map(file => path.join(parentDir, file))
      .filter(fullPath => {
        try {
          const stat = fs.statSync(fullPath);
          return !stat.isDirectory() && fullPath.toLowerCase().endsWith('.zip');
        } catch (e) {
          return false;
        }
      });

    if (zips.length === 0) {
      return res.status(404).json({ error: 'No ZIP files found to combine' });
    }

    res.attachment('combined_archives.zip');
    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.on('error', (err) => {
      res.status(500).send({ error: err.message });
    });

    archive.pipe(res);

    zips.forEach(zipPath => {
      archive.file(zipPath, { name: path.basename(zipPath) });
    });

    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear system activity logs
app.post('/api/clear-logs', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const userState = getUserState(userId);
  userState.logs = [];
  sendSseEvent('state', getAppStateAndStats(userId), userId);
  res.json({ success: true });
});

// Delete file or folder from disk
app.post('/api/delete', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const { path: itemPath } = req.body;
  if (!itemPath) {
    return res.status(400).json({ error: 'Path is required' });
  }

  if (!isPathSecure(itemPath, userId)) {
    return res.status(403).json({ error: 'Access Denied' });
  }

  try {
    const resolvedPath = path.resolve(itemPath);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File or directory not found' });
    }

    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      fs.rmSync(resolvedPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(resolvedPath);
    }

    logMessage(`Deleted ${path.basename(resolvedPath)} from disk`, 'warning', userId);

    const userState = getUserState(userId);
    scanSelectedDirectory(userState.currentDirectory, userId);
    sendSseEvent('state', getAppStateAndStats(userId), userId);

    res.json({ success: true });
  } catch (err) {
    logMessage(`Failed to delete ${itemPath}: ${err.message}`, 'error', userId);
    res.status(500).json({ error: err.message });
  }
});

// Get/Set settings
app.get('/api/settings', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const userState = getUserState(userId);
  res.json(userState.settings);
});

app.post('/api/settings', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  const userState = getUserState(userId);
  const { theme, concurrencyLimit, overwritePolicy, excludedExtensions } = req.body;

  if (theme !== undefined) userState.settings.theme = theme;
  if (concurrencyLimit !== undefined) userState.settings.concurrencyLimit = parseInt(concurrencyLimit, 10);
  if (overwritePolicy !== undefined) userState.settings.overwritePolicy = overwritePolicy;
  if (excludedExtensions !== undefined) userState.settings.excludedExtensions = excludedExtensions;

  saveSettings(userId);
  sendSseEvent('state', getAppStateAndStats(userId), userId);
  res.json({ success: true, settings: userState.settings });
});

// Open native OS folder picker dialog
app.post('/api/select-dir-dialog', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  if (userId !== 'default') {
    return res.status(400).json({ error: 'Native OS dialog is not supported in remote cloud environments' });
  }

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isWindows) {
    const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Working Directory for ZIP Manager'; if ($f.ShowDialog() -eq 'OK') { Write-Host $f.SelectedPath }"`;

    exec(psCommand, (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({ error: `Failed to open dialog: ${err.message}` });
      }
      const selectedPath = stdout.trim();
      if (!selectedPath) return res.json({ cancelled: true });
      res.json({ success: true, path: selectedPath });
    });
  } else if (isMac) {
    const osascriptCommand = `osascript -e 'POSIX path of (choose folder with prompt "Select Working Directory for ZIP Manager")'`;
    exec(osascriptCommand, (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: `Failed to open dialog: ${err.message}` });
      const selectedPath = stdout.trim();
      if (!selectedPath) return res.json({ cancelled: true });
      res.json({ success: true, path: selectedPath });
    });
  } else {
    exec('zenity --file-selection --directory', (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: 'Native folder dialog is not supported or zenity is missing' });
      const selectedPath = stdout.trim();
      if (!selectedPath) return res.json({ cancelled: true });
      res.json({ success: true, path: selectedPath });
    });
  }
});

// Start listening
const server = app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  logMessage(`Server listening on port ${PORT}`, 'info', 'default');
});

process.on('SIGTERM', () => {
  // Stop watching all user workspaces
  Object.keys(userStates).forEach(uid => stopWatching(uid));
  server.close();
});

