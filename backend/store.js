import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// Default initial state
const state = {
  currentDirectory: '',
  recentDirectories: [],
  logs: [],
  settings: {
    theme: 'dark',
    concurrencyLimit: 4,
    overwritePolicy: 'overwrite', // 'overwrite' | 'timestamp' | 'skip'
    excludedExtensions: ['.tmp', '.log', '.ds_store']
  },
  items: {}, // Keyed by item path, tracks status: Waiting | Scanning | Zipping | Extracting | Completed | Failed, progress: 0-100, error: string, etc.
  operations: {
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    startTime: null,
    endTime: null,
    status: 'idle', // 'idle' | 'processing'
    speed: 0, // items per second
    eta: null // estimated remaining seconds
  }
};

// Load settings from disk if they exist
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const rawData = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const saved = JSON.parse(rawData);
    state.settings = { ...state.settings, ...saved.settings };
    state.recentDirectories = saved.recentDirectories || [];
  }
} catch (err) {
  console.error('Failed to load settings:', err);
}

// Function to persist settings
export function saveSettings() {
  try {
    const dataToSave = {
      settings: state.settings,
      recentDirectories: state.recentDirectories
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

// Log utility
export function logMessage(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = { timestamp, message, type };
  state.logs.push(logEntry);
  if (state.logs.length > 500) {
    state.logs.shift(); // Keep logs buffer manageable
  }
  return logEntry;
}

export function addRecentDirectory(dirPath) {
  if (!dirPath) return;
  state.recentDirectories = state.recentDirectories.filter(d => d !== dirPath);
  state.recentDirectories.unshift(dirPath);
  if (state.recentDirectories.length > 10) {
    state.recentDirectories.pop();
  }
  saveSettings();
}

export function updateItemStatus(itemPath, updates) {
  if (!state.items[itemPath]) {
    state.items[itemPath] = {
      path: itemPath,
      name: path.basename(itemPath),
      status: 'Waiting',
      progress: 0,
      size: 0,
      error: null
    };
  }
  state.items[itemPath] = { ...state.items[itemPath], ...updates };
}

export function clearItems() {
  state.items = {};
  state.operations = {
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

export function getAppState() {
  return {
    currentDirectory: state.currentDirectory,
    recentDirectories: state.recentDirectories,
    settings: state.settings,
    items: Object.values(state.items),
    operations: state.operations,
    logs: state.logs
  };
}

export { state };
