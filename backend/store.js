import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory cache of user-specific states
export const userStates = {};

// Helper to initialize and retrieve a user's isolated state
export function getUserState(userId = 'default') {
  if (!userStates[userId]) {
    const userSettingsFile = path.join(__dirname, `settings_${userId}.json`);
    let settings = {
      theme: 'dark',
      concurrencyLimit: 4,
      overwritePolicy: 'overwrite', // 'overwrite' | 'timestamp' | 'skip'
      excludedExtensions: ['.tmp', '.log', '.ds_store']
    };
    let recentDirectories = [];

    // Load user settings if they exist
    try {
      if (fs.existsSync(userSettingsFile)) {
        const rawData = fs.readFileSync(userSettingsFile, 'utf8');
        const saved = JSON.parse(rawData);
        settings = { ...settings, ...saved.settings };
        recentDirectories = saved.recentDirectories || [];
      }
    } catch (err) {
      console.error(`Failed to load settings for user ${userId}:`, err);
    }

    userStates[userId] = {
      currentDirectory: '',
      recentDirectories,
      logs: [],
      settings,
      items: {}, // Keyed by item path
      operations: {
        total: 0,
        processed: 0,
        success: 0,
        failed: 0,
        startTime: null,
        endTime: null,
        status: 'idle', // 'idle' | 'processing'
        speed: 0,
        eta: null
      }
    };
  }
  return userStates[userId];
}

// Global fallback state for backward compatibility
export const state = getUserState('default');

// Function to persist user settings
export function saveSettings(userId = 'default') {
  try {
    const userSettingsFile = path.join(__dirname, `settings_${userId}.json`);
    const userState = getUserState(userId);
    const dataToSave = {
      settings: userState.settings,
      recentDirectories: userState.recentDirectories
    };
    fs.writeFileSync(userSettingsFile, JSON.stringify(dataToSave, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to save settings for user ${userId}:`, err);
  }
}

// Log utility
export function logMessage(message, type = 'info', userId = 'default') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = { timestamp, message, type };
  const userState = getUserState(userId);
  userState.logs.push(logEntry);
  if (userState.logs.length > 500) {
    userState.logs.shift(); // Keep logs buffer manageable
  }
  return logEntry;
}

export function addRecentDirectory(dirPath, userId = 'default') {
  if (!dirPath) return;
  const userState = getUserState(userId);
  userState.recentDirectories = userState.recentDirectories.filter(d => d !== dirPath);
  userState.recentDirectories.unshift(dirPath);
  if (userState.recentDirectories.length > 10) {
    userState.recentDirectories.pop();
  }
  saveSettings(userId);
}

export function updateItemStatus(itemPath, updates, userId = 'default') {
  const userState = getUserState(userId);
  if (!userState.items[itemPath]) {
    userState.items[itemPath] = {
      path: itemPath,
      name: path.basename(itemPath),
      status: 'Waiting',
      progress: 0,
      size: 0,
      error: null
    };
  }
  userState.items[itemPath] = { ...userState.items[itemPath], ...updates };
}

export function clearItems(userId = 'default') {
  const userState = getUserState(userId);
  userState.items = {};
  userState.operations = {
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    startTime: null,
    endTime: null,
    status: 'idle',
    speed: 0,
    eta: null
  };
}

export function getAppState(userId = 'default') {
  const userState = getUserState(userId);
  return {
    currentDirectory: userState.currentDirectory,
    recentDirectories: userState.recentDirectories,
    settings: userState.settings,
    items: Object.values(userState.items),
    operations: userState.operations,
    logs: userState.logs
  };
}

