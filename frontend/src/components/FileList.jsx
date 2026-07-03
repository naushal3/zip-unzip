import React, { useState } from 'react';
import { 
  Folder, 
  FileArchive, 
  Search, 
  Filter, 
  Play, 
  Download, 
  Trash2, 
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { getDownloadUrl } from '../utils/api';

function formatBytes(bytes) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleString();
}

export default function FileList({ 
  items, 
  onProcessSingle, 
  onDeleteSingle,
  selectedItems,
  setSelectedItems
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'folder' | 'zip'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'Waiting' | 'Completed' | 'Failed' | 'Processing'

  // Selection helpers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedItems(filteredItems.map(item => item.path));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (path) => {
    setSelectedItems(prev => 
      prev.includes(path) 
        ? prev.filter(p => p !== path) 
        : [...prev, path]
    );
  };

  // Filter logic
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || item.type === typeFilter;
    
    let matchesStatus = true;
    if (statusFilter !== 'all') {
      if (statusFilter === 'Processing') {
        matchesStatus = ['Scanning', 'Zipping', 'Extracting'].includes(item.status);
      } else {
        matchesStatus = item.status === statusFilter;
      }
    }

    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-success/15 text-success">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case 'Failed':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-error/15 text-error">
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case 'Waiting':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--border-color)] text-[var(--text-muted)]">
            <Clock className="w-3.5 h-3.5" />
            Waiting
          </span>
        );
      case 'Scanning':
      case 'Zipping':
      case 'Extracting':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-brand/15 text-brand animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--border-color)] text-[var(--text-main)]">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="glass-panel rounded-[20px] overflow-hidden flex flex-col">
      {/* Search & Filters Toolbar */}
      <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-card)]/50 flex flex-col sm:flex-row gap-3 justify-between items-center">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-xl text-sm text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2.5 w-full sm:w-auto">
          {/* Type Filter */}
          <div className="flex items-center gap-1.5 bg-[var(--input-bg)] border border-[var(--border-color)] px-3 py-2 rounded-xl text-sm text-[var(--text-main)] w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-transparent border-none text-sm text-[var(--text-main)] focus:outline-none cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="folder">Folders Only</option>
              <option value="zip">ZIP Archives</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-[var(--input-bg)] border border-[var(--border-color)] px-3 py-2 rounded-xl text-sm text-[var(--text-main)] w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent border-none text-sm text-[var(--text-main)] focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="Waiting">Waiting</option>
              <option value="Processing">Processing</option>
              <option value="Completed">Completed</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-color)] text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-card)]/30">
              <th className="py-4 px-5 w-12 text-center">
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={filteredItems.length > 0 && selectedItems.length === filteredItems.length}
                  className="rounded border-[var(--border-color)] text-brand focus:ring-brand cursor-pointer"
                />
              </th>
              <th className="py-4 px-4">Name</th>
              <th className="py-4 px-4">Size</th>
              <th className="py-4 px-4">Last Modified</th>
              <th className="py-4 px-4">Status</th>
              <th className="py-4 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)] text-sm">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan="6" className="py-12 text-center text-[var(--text-muted)]">
                  No files or directories matching search criteria found.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedItems.includes(item.path);
                const isProcessing = ['Scanning', 'Zipping', 'Extracting'].includes(item.status);
                
                return (
                  <tr 
                    key={item.path} 
                    className={`hover:bg-[var(--bg-card)]/40 transition-colors ${
                      isSelected ? 'bg-brand/5' : ''
                    }`}
                  >
                    <td className="py-4 px-5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectItem(item.path)}
                        className="rounded border-[var(--border-color)] text-brand focus:ring-brand cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${
                          item.type === 'folder' ? 'bg-brand/10 text-brand' : 'bg-warning/10 text-warning'
                        }`}>
                          {item.type === 'folder' ? (
                            <Folder className="w-4 h-4" />
                          ) : (
                            <FileArchive className="w-4 h-4" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-[var(--text-main)] truncate max-w-[280px]" title={item.name}>
                            {item.name}
                          </span>
                          {/* If active, show inline progress */}
                          {isProcessing && (
                            <div className="flex items-center gap-2 mt-1 w-[180px]">
                              <div className="w-full bg-[var(--border-color)] h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="gradient-btn h-full rounded-full transition-all duration-300"
                                  style={{ width: `${item.progress}%` }}
                                ></div>
                              </div>
                              <span className="text-[10px] text-brand font-semibold">{item.progress}%</span>
                            </div>
                          )}
                          {item.error && (
                            <span className="text-xs text-error mt-0.5 flex items-center gap-1 font-mono">
                              <AlertCircle className="w-3 h-3" />
                              {item.error}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-[var(--text-muted)] font-mono">
                      {item.type === 'zip' ? formatBytes(item.size) : '--'}
                    </td>
                    <td className="py-4 px-4 text-[var(--text-muted)] text-xs">
                      {formatDate(item.mtime)}
                    </td>
                    <td className="py-4 px-4">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Process Single Action (Zip or Unzip) */}
                        <button
                          onClick={() => onProcessSingle(item.path, item.type === 'zip' ? 'extract' : 'zip')}
                          disabled={isProcessing}
                          title={item.type === 'zip' ? 'Extract archive' : 'Zip item'}
                          className="p-2 text-[var(--text-muted)] hover:text-brand hover:bg-[var(--bg-secondary)] rounded-xl transition-all disabled:opacity-30 active:scale-95"
                        >
                          <Play className="w-4 h-4" />
                        </button>

                        {/* Download zip file */}
                        {item.type === 'zip' && (
                          <a
                            href={getDownloadUrl(item.path)}
                            title="Download ZIP"
                            className="p-2 text-[var(--text-muted)] hover:text-success hover:bg-[var(--bg-secondary)] rounded-xl transition-all inline-block active:scale-95"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}

                        {/* Delete item */}
                        <button
                          onClick={() => onDeleteSingle(item.path)}
                          title="Delete from disk"
                          className="p-2 text-[var(--text-muted)] hover:text-error hover:bg-[var(--bg-secondary)] rounded-xl transition-all active:scale-95"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
