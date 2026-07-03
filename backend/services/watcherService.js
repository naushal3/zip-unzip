import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { logMessage, state } from '../store.js';
import { scanSelectedDirectory, getAppStateAndStats, processQueue } from './zipService.js';

let watcher = null;
let debounceTimeout = null;

export function stopWatching() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

export function startWatching(dirPath, sseEmitter) {
  stopWatching();

  if (!dirPath || !fs.existsSync(dirPath)) return;

  // We set depth: 0 so we only monitor immediate children of the parent folder.
  // This matches our compression targets (top-level folders inside selected directory).
  watcher = chokidar.watch(dirPath, {
    ignored: (filePath) => {
      // Ignore hidden files and active temp writes or zipped files
      const base = path.basename(filePath);
      if (base.startsWith('.')) return true;
      // Skip folders inside subfolders if we only want depth 0
      return false;
    },
    persistent: true,
    depth: 0,
    ignoreInitial: true
  });

  const triggerRescan = () => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      // If we are currently executing batch operations, let the queue update itself.
      // We only update if the watcher detects an outside file action.
      if (processQueue.isProcessing) return;

      try {
        if (state.currentDirectory === dirPath && fs.existsSync(dirPath)) {
          scanSelectedDirectory(dirPath);
          logMessage('Directory listing auto-refreshed.', 'info');
          if (sseEmitter) {
            sseEmitter('state', getAppStateAndStats());
          }
        }
      } catch (err) {
        console.error('Watcher rescan failed:', err);
      }
    }, 800); // 800ms debounce
  };

  watcher
    .on('add', (filePath) => {
      logMessage(`File added: ${path.basename(filePath)}`, 'info');
      triggerRescan();
    })
    .on('addDir', (filePath) => {
      logMessage(`Folder added: ${path.basename(filePath)}`, 'info');
      triggerRescan();
    })
    .on('unlink', (filePath) => {
      logMessage(`File removed: ${path.basename(filePath)}`, 'info');
      triggerRescan();
    })
    .on('unlinkDir', (filePath) => {
      logMessage(`Folder removed: ${path.basename(filePath)}`, 'info');
      triggerRescan();
    });

  logMessage(`Started file watcher on directory: ${dirPath}`, 'info');
}
