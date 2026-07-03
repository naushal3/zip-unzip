import { auth } from '../firebase';

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

// Helper to inject the x-user-id header
function getRequestHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const currentUser = auth.currentUser;
  if (currentUser) {
    headers['x-user-id'] = currentUser.uid;
  }
  return headers;
}

export async function fetchStatus() {
  const res = await fetch(`${getApiBase()}/status`, {
    headers: getRequestHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json();
}

export async function selectDirectory(path) {
  const res = await fetch(`${getApiBase()}/select-dir`, {
    method: 'POST',
    headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ path })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to select directory');
  }
  return res.json();
}

export async function scanDirectory() {
  const res = await fetch(`${getApiBase()}/scan`, {
    method: 'POST',
    headers: getRequestHeaders()
  });
  if (!res.ok) throw new Error('Failed to scan directory');
  return res.json();
}

export async function browsePath(path = '') {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await fetch(`${getApiBase()}/browse${query}`, {
    headers: getRequestHeaders()
  });
  if (!res.ok) throw new Error('Failed to browse path');
  return res.json();
}

export async function processItems(items, action) {
  const res = await fetch(`${getApiBase()}/process`, {
    method: 'POST',
    headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ items, action })
  });
  if (!res.ok) throw new Error('Failed to process items');
  return res.json();
}

export async function resolveConflict(itemPath, decision) {
  const res = await fetch(`${getApiBase()}/resolve-conflict`, {
    method: 'POST',
    headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ itemPath, decision })
  });
  if (!res.ok) throw new Error('Failed to resolve conflict');
  return res.json();
}

export async function cancelQueue() {
  const res = await fetch(`${getApiBase()}/cancel`, {
    method: 'POST',
    headers: getRequestHeaders()
  });
  if (!res.ok) throw new Error('Failed to cancel processing');
  return res.json();
}

export async function deleteItem(path) {
  const res = await fetch(`${getApiBase()}/delete`, {
    method: 'POST',
    headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ path })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to delete item');
  }
  return res.json();
}

export async function clearLogs() {
  const res = await fetch(`${getApiBase()}/clear-logs`, {
    method: 'POST',
    headers: getRequestHeaders()
  });
  if (!res.ok) throw new Error('Failed to clear logs');
  return res.json();
}

export async function fetchSettings() {
  const res = await fetch(`${getApiBase()}/settings`, {
    headers: getRequestHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function saveSettings(settings) {
  const res = await fetch(`${getApiBase()}/settings`, {
    method: 'POST',
    headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(settings)
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
}

export function getDownloadUrl(filePath) {
  return `${getApiBase()}/download?file=${encodeURIComponent(filePath)}&userId=${auth.currentUser?.uid || 'default'}`;
}

export function getDownloadAllUrl() {
  return `${getApiBase()}/download-all?userId=${auth.currentUser?.uid || 'default'}`;
}

export async function openNativeDirectoryDialog() {
  const res = await fetch(`${getApiBase()}/select-dir-dialog`, {
    method: 'POST',
    headers: getRequestHeaders()
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to open native dialog');
  }
  return res.json();
}

// Upload local files/folders to the remote workspace with progress reporting
export function uploadFiles(filesList, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    // Append files to form data
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      // originalname is mapped to file.webkitRelativePath (or name) to preserve structure
      const uploadPath = file.webkitRelativePath || file.name;
      formData.append('files', file, uploadPath);
    }

    xhr.open('POST', `${getApiBase()}/upload`, true);

    // Inject user ID header
    const currentUser = auth.currentUser;
    if (currentUser) {
      xhr.setRequestHeader('x-user-id', currentUser.uid);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress(percentComplete);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        const errResponse = JSON.parse(xhr.responseText || '{}');
        reject(new Error(errResponse.error || 'Upload failed'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during upload'));
    };

    xhr.send(formData);
  });
}

