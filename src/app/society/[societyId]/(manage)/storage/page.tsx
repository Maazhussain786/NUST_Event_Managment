'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  HardDrive, Trash2, File, AlertTriangle, LayoutGrid, List,
} from 'lucide-react';
import { fetchStorage, deleteMedia, SocietyApiError } from '../../../api';
import { PageLoader, ErrorState, EmptyState, ConfirmDialog } from '../../../_components/Shared';
import type { SocietyStorageInfo, MediaItem } from '../../../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function StoragePage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [data, setData] = useState<SocietyStorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const storage = await fetchStorage(societyId);
      setData(storage);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        if (err.status === 403) { setError('Access denied'); return; }
        setError(err.message);
      } else {
        setError('Failed to load storage data');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, router]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteMedia(deleteTarget.id, deleteTarget.media_table);
      setToast('File deleted');
      setDeleteTarget(null);
      setSelectedIds((prev) => prev.filter((id) => id !== deleteTarget.id));
      load();
    } catch (err) {
      if (err instanceof SocietyApiError) setToast(err.message);
      else setToast('Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!data || selectedIds.length === 0) return;

    try {
      setDeleting(true);
      const selectedItems = data.media_items.filter((item) => selectedIds.includes(item.id));
      await Promise.all(selectedItems.map((item) => deleteMedia(item.id, item.media_table)));
      setToast(`${selectedItems.length} file(s) deleted`);
      setConfirmBulkDelete(false);
      setSelectedIds([]);
      load();
    } catch (err) {
      if (err instanceof SocietyApiError) setToast(err.message);
      else setToast('Bulk delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  if (loading) return <PageLoader />;
  if (error || !data) return <ErrorState message={error || 'Failed to load'} onRetry={load} />;

  const categories = Array.from(new Set(data.media_items.map(m => m.category)));
  const filtered = categoryFilter
    ? data.media_items.filter(m => m.category === categoryFilter)
    : data.media_items;

  const filteredIds = filtered.map((item) => item.id);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        return prev.filter((id) => !filteredIds.includes(id));
      }
      return Array.from(new Set([...prev, ...filteredIds]));
    });
  };

  return (
    <div className="space-y-6">
      {/* Quota */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
            <HardDrive size={16} className="text-muted" /> Storage Quota
          </h2>
          <span className="text-sm font-medium text-primary">
            {formatBytes(data.used_bytes)} / {formatBytes(data.quota_bytes)}
          </span>
        </div>
        <div className="h-3 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              data.percent_used > 90 ? 'bg-red-500' :
              data.percent_used > 70 ? 'bg-amber-500' : 'bg-brand-500'
            }`}
            style={{ width: `${Math.min(data.percent_used, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted mt-2">
          {data.percent_used.toFixed(1)}% used
          {data.percent_used > 80 && (
            <span className="text-amber-500 ml-2 inline-flex items-center gap-1">
              <AlertTriangle size={12} /> Approaching limit
            </span>
          )}
        </p>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setCategoryFilter('')}
          className={`chip text-xs whitespace-nowrap ${!categoryFilter ? 'active' : ''}`}
        >
          All ({data.media_items.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`chip text-xs whitespace-nowrap ${categoryFilter === cat ? 'active' : ''}`}
          >
            {cat} ({data.media_items.filter(m => m.category === cat).length})
          </button>
        ))}
      </div>

      {/* View + Selection Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-themed p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`btn-ghost px-2 py-1 text-xs ${viewMode === 'grid' ? 'bg-secondary' : ''}`}
            title="Tiles view"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`btn-ghost px-2 py-1 text-xs ${viewMode === 'list' ? 'bg-secondary' : ''}`}
            title="List view"
          >
            <List size={14} />
          </button>
        </div>

        <button
          onClick={toggleSelectAllFiltered}
          className="btn-ghost text-xs px-3 py-2"
        >
          {allFilteredSelected ? 'Unselect All' : 'Select All'}
        </button>

        {selectedIds.length > 0 && (
          <button
            onClick={() => setConfirmBulkDelete(true)}
            className="bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-2 rounded-lg font-medium"
          >
            Delete Selected ({selectedIds.length})
          </button>
        )}
      </div>

      {/* Media list */}
      {filtered.length === 0 ? (
        <EmptyState message="No media files" />
      ) : (
        <div className={viewMode === 'grid' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
          {filtered.map(item => (
            <div key={item.id} className={`card p-3 ${viewMode === 'list' ? 'flex items-start gap-3' : ''}`}>
              <div className="pt-1">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  className="h-4 w-4 rounded border-themed bg-transparent"
                  aria-label={`Select ${item.file_name}`}
                />
              </div>

              <div className={viewMode === 'list' ? 'w-28 flex-shrink-0' : 'w-full'}>
                {item.media_type.startsWith('image') ? (
                  <div className="h-32 rounded-lg overflow-hidden mb-3 bg-secondary">
                    <img
                      src={item.file_url}
                      alt={item.file_name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder-event.jpg';
                      }}
                    />
                  </div>
                ) : (
                  <div className="h-32 rounded-lg bg-secondary flex items-center justify-center mb-3">
                    <File size={32} className="text-muted" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{item.file_name}</p>
                    <p className="text-xs text-muted">
                      {formatBytes(item.file_size)} • {item.category}
                    </p>
                    <p className="text-xs text-muted">
                      by {item.uploaded_by_name} •{' '}
                      {new Date(item.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(item)}
                    className="btn-ghost text-xs px-2 py-1.5 text-red-500 hover:bg-red-500/10 flex-shrink-0"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete File"
        message={`Delete "${deleteTarget?.file_name}"? This will free up ${deleteTarget ? formatBytes(deleteTarget.file_size) : ''} of storage.`}
        confirmText="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete Selected Files"
        message={`Delete ${selectedIds.length} selected file(s)? This action cannot be undone.`}
        confirmText="Delete Selected"
        variant="danger"
        loading={deleting}
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
