import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { logMessage, getUserState } from '../store.js';
import { scanSelectedDirectory, getAppStateAndStats, getProcessQueue } from './zipService.js';

const watchers = {};
const debounceTimeouts = {};

export function stopWatching(userId = 'default') {
  if (watchers[userId]) {
    watchers[userId].close();
    delete watchers[userId];
  }
}

export function startWatching(dirPath, sseEmitter, userId = 'default') {
  stopWatching(userId);

  if (!dirPath || !fs.existsSync(dirPath)) return;

  // We set depth: 0 so we only monitor immediate children of the parent folder.
  watchers[userId] = chokidar.watch(dirPath, {
    ignored: (filePath) => {
      const base = path.basename(filePath);
      if (base.startsWith('.')) return true;
      return false;
    },
    persistent: true,
    depth: 0,
    ignoreInitial: true
  });

  const triggerRescan = () => {
    if (debounceTimeouts[userId]) clearTimeout(debounceTimeouts[userId]);
    debounceTimeouts[userId] = setTimeout(() => {
      const userQueue = getProcessQueue(userId);
      if (userQueue.isProcessing) return;

      try {
        const userState = getUserState(userId);
        if (userState.currentDirectory === dirPath && fs.existsSync(dirPath)) {
          scanSelectedDirectory(dirPath, userId);
          logMessage('Directory listing auto-refreshed.', 'info', userId);
          if (sseEmitter) {
            sseEmitter('state', getAppStateAndStats(userId), userId);
          }
        }
      } catch (err) {
        console.error(`Watcher rescan failed for user ${userId}:`, err);
      }
    }, 800); // 800ms debounce
  };

  watchers[userId]
    .on('add', (filePath) => {
      logMessage(`File added: ${path.basename(filePath)}`, 'info', userId);
      triggerRescan();
    })
    .on('addDir', (filePath) => {
      logMessage(`Folder added: ${path.basename(filePath)}`, 'info', userId);
      triggerRescan();
    })
    .on('unlink', (filePath) => {
      logMessage(`File removed: ${path.basename(filePath)}`, 'info', userId);
      triggerRescan();
    })
    .on('unlinkDir', (filePath) => {
      logMessage(`Folder removed: ${path.basename(filePath)}`, 'info', userId);
      triggerRescan();
    });

  logMessage(`Started file watcher on directory: ${dirPath}`, 'info', userId);
}

