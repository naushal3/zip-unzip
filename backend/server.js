import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import archiver from 'archiver';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

import {
  state,
  logMessage,
  saveSettings,
  clearItems,
  updateItemStatus,
  getAppState
} from './store.js';
import {
  scanSelectedDirectory,
  getAppStateAndStats,
  processQueue,
  activeConflicts
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

// Helper to send events to all clients
function sendSseEvent(event, data) {
  sseClients.forEach(client => {
    client.write(`event: ${event}\n`);
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// Connect processQueue to SSE notifications
processQueue.setSseEmitter(sendSseEvent);

// Helper to list Windows drives using powershell and fallback to wmic
function getWindowsDrives() {
  return new Promise((resolve) => {
    // Try PowerShell first as it is modern and standard
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

      // Fallback to wmic
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

// REST APIs

// SSE event stream
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Send initial state immediately
  res.write(`event: state\n`);
  res.write(`data: ${JSON.stringify(getAppStateAndStats())}\n\n`);

  const client = res;
  sseClients.push(client);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== client);
  });
});

// Get current state
app.get('/api/status', (req, res) => {
  res.json(getAppStateAndStats());
});

// Select and scan directory
app.post('/api/select-dir', (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath) {
    return res.status(400).json({ error: 'Path is required' });
  }

  try {
    const resolvedPath = path.resolve(dirPath);
    clearItems();
    const items = scanSelectedDirectory(resolvedPath);

    // Start watching this folder
    startWatching(resolvedPath, sendSseEvent);

    // Notify clients of the updated state
    sendSseEvent('state', getAppStateAndStats());

    res.json({ success: true, path: resolvedPath, items });
  } catch (err) {
    logMessage(`Failed to select directory ${dirPath}: ${err.message}`, 'error');
    res.status(500).json({ error: err.message });
  }
});

// Scan current directory
app.post('/api/scan', (req, res) => {
  if (!state.currentDirectory) {
    return res.status(400).json({ error: 'No directory selected' });
  }
  try {
    const items = scanSelectedDirectory(state.currentDirectory);
    sendSseEvent('state', getAppStateAndStats());
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Browse server directory structure (for folder explorer modal)
app.get('/api/browse', async (req, res) => {
  let targetPath = req.query.path;
  const isWindows = process.platform === 'win32';

  if (!targetPath) {
    targetPath = os.homedir();
  }

  try {
    const resolvedPath = path.resolve(targetPath);

    // Check path exists and is a folder
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
      // Skip system or dot files
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
        // Skip inaccessible files/folders (permission errors)
      }
    }

    let drives = [];
    if (isWindows) {
      drives = await getWindowsDrives();
    }

    // Determine parent path
    const parentPath = path.dirname(resolvedPath);

    res.json({
      currentPath: resolvedPath,
      parentPath: parentPath === resolvedPath ? null : parentPath,
      directories: directories.sort((a, b) => a.name.localeCompare(b.name)),
      drives
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger batch actions (compress folders / extract archives)
app.post('/api/process', (req, res) => {
  const { items, action } = req.body; // items: array of itemPaths, action: 'zip' | 'extract' | 'auto'
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required' });
  }
  if (action !== 'zip' && action !== 'extract' && action !== 'auto') {
    return res.status(400).json({ error: 'Action must be "zip", "extract", or "auto"' });
  }

  items.forEach(itemPath => {
    let taskAction = action;
    if (action === 'auto') {
      const item = state.items[itemPath];
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
    processQueue.add(itemPath, taskAction);
  });

  processQueue.start();
  res.json({ success: true, message: 'Processing started' });
});

// Resolve conflicts (overwrite, timestamp, skip)
app.post('/api/resolve-conflict', (req, res) => {
  const { itemPath, decision } = req.body;
  if (!itemPath || !decision) {
    return res.status(400).json({ error: 'itemPath and decision are required' });
  }

  const conflict = activeConflicts.get(itemPath);
  if (!conflict) {
    return res.status(404).json({ error: 'No pending conflict for this path' });
  }

  conflict.resolve(decision);
  res.json({ success: true });
});

// Cancel queue
app.post('/api/cancel', (req, res) => {
  processQueue.stop();
  res.json({ success: true, message: 'Processing queue cancelled' });
});

// Download single ZIP
app.get('/api/download', (req, res) => {
  const { file: filePath } = req.query;
  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
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
  if (!state.currentDirectory) {
    return res.status(400).json({ error: 'No directory selected' });
  }

  try {
    const parentDir = state.currentDirectory;
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
  state.logs = [];
  sendSseEvent('state', getAppStateAndStats());
  res.json({ success: true });
});

// Delete file or folder from disk
app.post('/api/delete', (req, res) => {
  const { path: itemPath } = req.body;
  if (!itemPath) {
    return res.status(400).json({ error: 'Path is required' });
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

    logMessage(`Deleted ${path.basename(resolvedPath)} from disk`, 'warning');

    // Rescan and update clients
    scanSelectedDirectory(state.currentDirectory);
    sendSseEvent('state', getAppStateAndStats());

    res.json({ success: true });
  } catch (err) {
    logMessage(`Failed to delete ${itemPath}: ${err.message}`, 'error');
    res.status(500).json({ error: err.message });
  }
});

// Get/Set settings
app.get('/api/settings', (req, res) => {
  res.json(state.settings);
});

app.post('/api/settings', (req, res) => {
  const { theme, concurrencyLimit, overwritePolicy, excludedExtensions } = req.body;

  if (theme !== undefined) state.settings.theme = theme;
  if (concurrencyLimit !== undefined) state.settings.concurrencyLimit = parseInt(concurrencyLimit, 10);
  if (overwritePolicy !== undefined) state.settings.overwritePolicy = overwritePolicy;
  if (excludedExtensions !== undefined) state.settings.excludedExtensions = excludedExtensions;

  saveSettings();
  sendSseEvent('state', getAppStateAndStats());
  res.json({ success: true, settings: state.settings });
});

// Open native OS folder picker dialog
app.post('/api/select-dir-dialog', (req, res) => {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isWindows) {
    // PowerShell script to open FolderBrowserDialog
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
    // macOS AppleScript to open folder picker
    const osascriptCommand = `osascript -e 'POSIX path of (choose folder with prompt "Select Working Directory for ZIP Manager")'`;
    exec(osascriptCommand, (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: `Failed to open dialog: ${err.message}` });
      const selectedPath = stdout.trim();
      if (!selectedPath) return res.json({ cancelled: true });
      res.json({ success: true, path: selectedPath });
    });
  } else {
    // Linux Zenity fallback
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
  logMessage(`Server listening on port ${PORT}`, 'info');
});

process.on('SIGTERM', () => {
  stopWatching();
  server.close();
});
