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

// Centered fetch response handling to handle HTML/JSON and errors gracefully
async function handleResponse(res) {
  if (!res.ok) {
    let errMsg = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data && data.error) errMsg = data.error;
    } catch (e) {
      // Content is not JSON (e.g., HTML 404/500 page)
    }
    throw new Error(errMsg);
  }
  try {
    return await res.json();
  } catch (e) {
    throw new Error('Invalid response format from server');
  }
}

export async function fetchStatus() {
  const res = await fetch(`${getApiBase()}/status`, {
    headers: getRequestHeaders()
  });
  return handleResponse(res);
}

export async function selectDirectory(path) {
  const res = await fetch(`${getApiBase()}/select-dir`, {
    method: 'POST',
    headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ path })
  });
  return handleResponse(res);
}

export async function scanDirectory() {
  const res = await fetch(`${getApiBase()}/scan`, {
    method: 'POST',
    headers: getRequestHeaders()
  });
  return handleResponse(res);
}

export async function browsePath(path = '') {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await fetch(`${getApiBase()}/browse${query}`, {
    headers: getRequestHeaders()
  });
  return handleResponse(res);
}

export async function processItems(items, action) {
  const res = await fetch(`${getApiBase()}/process`, {
    method: 'POST',
    headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ items, action })
  });
  return handleResponse(res);
}

export async function resolveConflict(itemPath, decision) {
  const res = await fetch(`${getApiBase()}/resolve-conflict`, {
    method: 'POST',
    headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ itemPath, decision })
  });
  return handleResponse(res);
}

export async function cancelQueue() {
  const res = await fetch(`${getApiBase()}/cancel`, {
    method: 'POST',
    headers: getRequestHeaders()
  });
  return handleResponse(res);
}

export async function deleteItem(path) {
  const res = await fetch(`${getApiBase()}/delete`, {
    method: 'POST',
    headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ path })
  });
  return handleResponse(res);
}

export async function clearLogs() {
  const res = await fetch(`${getApiBase()}/clear-logs`, {
    method: 'POST',
    headers: getRequestHeaders()
  });
  return handleResponse(res);
}

export async function fetchSettings() {
  const res = await fetch(`${getApiBase()}/settings`, {
    headers: getRequestHeaders()
  });
  return handleResponse(res);
}

export async function saveSettings(settings) {
  const res = await fetch(`${getApiBase()}/settings`, {
    method: 'POST',
    headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(settings)
  });
  return handleResponse(res);
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
  return handleResponse(res);
}

// Upload local files/folders to the remote workspace with progress reporting
export function uploadFiles(filesList, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    // Append files to form data
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const uploadPath = file.webkitRelativePath || file.name;
      const safeUploadPath = uploadPath.replace(/[\\/]/g, '____');
      formData.append('files', file, safeUploadPath);
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
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (e) {
          reject(new Error('Invalid response format from server'));
        }
      } else {
        let errMsg = `Upload failed with status code ${xhr.status}`;
        try {
          const errResponse = JSON.parse(xhr.responseText || '{}');
          if (errResponse.error) errMsg = errResponse.error;
        } catch (e) {
          if (xhr.statusText) {
            errMsg = `${xhr.status} ${xhr.statusText}`;
          }
        }
        reject(new Error(errMsg));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during upload'));
    };

    xhr.send(formData);
  });
}


