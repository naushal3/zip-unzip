const isLocalhost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const getApiBase = () => {
  const stored = localStorage.getItem('ZIP_MANAGER_API_BASE');
  if (stored) return stored;

  if (isLocalhost) {
    return '/api';
  }
  return 'https://zip-unzip-1.onrender.com/api';
};

export async function fetchStatus() {
  const res = await fetch(`${getApiBase()}/status`);
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

export async function selectDirectory(path) {
  const res = await fetch(`${getApiBase()}/select-dir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to select directory');
  }
  return res.json();
}

export async function scanDirectory() {
  const res = await fetch(`${getApiBase()}/scan`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to scan directory');
  return res.json();
}

export async function browsePath(path = '') {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await fetch(`${getApiBase()}/browse${query}`);
  if (!res.ok) throw new Error('Failed to browse path');
  return res.json();
}

export async function processItems(items, action) {
  const res = await fetch(`${getApiBase()}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, action })
  });
  if (!res.ok) throw new Error('Failed to process items');
  return res.json();
}

export async function resolveConflict(itemPath, decision) {
  const res = await fetch(`${getApiBase()}/resolve-conflict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemPath, decision })
  });
  if (!res.ok) throw new Error('Failed to resolve conflict');
  return res.json();
}

export async function cancelQueue() {
  const res = await fetch(`${getApiBase()}/cancel`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to cancel processing');
  return res.json();
}

export async function deleteItem(path) {
  const res = await fetch(`${getApiBase()}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to delete item');
  }
  return res.json();
}

export async function clearLogs() {
  const res = await fetch(`${getApiBase()}/clear-logs`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to clear logs');
  return res.json();
}

export async function fetchSettings() {
  const res = await fetch(`${getApiBase()}/settings`);
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function saveSettings(settings) {
  const res = await fetch(`${getApiBase()}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
}

export function getDownloadUrl(filePath) {
  return `${getApiBase()}/download?file=${encodeURIComponent(filePath)}`;
}

export function getDownloadAllUrl() {
  return `${getApiBase()}/download-all`;
}

export async function openNativeDirectoryDialog() {
  const res = await fetch(`${getApiBase()}/select-dir-dialog`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to open native dialog');
  }
  return res.json();
}
