'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  HardDrive,
  AlertTriangle,
  AlertCircle,
  ArrowUpDown,
  Save,
  X,
  Building2,
} from 'lucide-react';
import { PageLoader, ErrorState, EmptyState } from '../_components/Shared';
import { StatCard } from '../_components/StatCard';
import { fetchStorageOverview, updateStorageLimit } from '../api';
import type { SocietyStorage, StorageAggregate, StorageResponse } from '../types';

type SortBy = 'percent_used' | 'storage_used_bytes' | 'society_name' | 'storage_quota_bytes';

export default function StoragePage() {
  const [societies, setSocieties] = useState<SocietyStorage[]>([]);
  const [aggregate, setAggregate] = useState<StorageAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('percent_used');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data: StorageResponse = await fetchStorageOverview(sortBy);
      setSocieties(data.societies);
      setAggregate(data.aggregate);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load storage data');
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (id: string) => {
    const bytes = parseInt(editValue) * 1024 * 1024;
    if (isNaN(bytes) || bytes <= 0) return;
    setSaving(true);
    try {
      await updateStorageLimit(id, bytes);
      setEditingId(null);
      setEditValue('');
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  const barColor = (pct: number) => {
    if (pct >= 95) return 'bg-red-500';
    if (pct >= 80) return 'bg-amber-500';
    if (pct >= 60) return 'bg-brand-400';
    return 'bg-emerald-500';
  };

  const barTextColor = (pct: number) => {
    if (pct >= 95) return 'text-red-600 dark:text-red-400';
    if (pct >= 80) return 'text-amber-600 dark:text-amber-400';
    return '';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Storage</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Monitor and manage storage quotas across societies
        </p>
      </div>

      {/* Aggregate Stats */}
      {aggregate && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Societies"
            value={aggregate.total_societies}
            icon={Building2}
            accent="blue"
          />
          <StatCard
            label="Total Used"
            value={formatBytes(Number(aggregate.total_used))}
            icon={HardDrive}
            accent="green"
          />
          <StatCard
            label="Near Limit (>80%)"
            value={aggregate.near_limit_count}
            icon={AlertTriangle}
            accent="brand"
          />
          <StatCard
            label="Critical (>95%)"
            value={aggregate.critical_count}
            icon={AlertCircle}
            accent="red"
          />
        </div>
      )}

      {/* Sort */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="input-field text-sm w-auto"
        >
          <option value="percent_used">Usage %</option>
          <option value="storage_used_bytes">Used Bytes</option>
          <option value="storage_quota_bytes">Quota</option>
          <option value="society_name">Name</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : societies.length === 0 ? (
        <EmptyState message="No storage data found" />
      ) : (
        <div className="space-y-3">
          {societies.map((soc) => {
            const pct = Number(soc.percent_used) || 0;
            const isEditing = editingId === soc.society_id;

            return (
              <div key={soc.society_id} className="card p-5">
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {soc.society_name}
                      </h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-bold ${barTextColor(pct)}`} style={pct < 80 ? { color: 'var(--text-secondary)' } : {}}>
                          {pct.toFixed(1)}%
                        </span>
                        {pct >= 80 && (
                          <AlertTriangle className={`w-3.5 h-3.5 ${pct >= 95 ? 'text-red-500' : 'text-amber-500'}`} />
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2.5 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden mb-1.5">
                      <div
                        className={`h-full rounded-full transition-all ${barColor(pct)}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span>{formatBytes(Number(soc.storage_used_bytes))} / {formatBytes(Number(soc.storage_quota_bytes))}</span>
                      <span>{soc.storage_used_mb} MB used</span>
                    </div>
                  </div>

                  {/* Edit Limit */}
                  <div className="shrink-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="input-field text-sm w-20 py-1.5"
                          placeholder="MB"
                          min="1"
                        />
                        <button
                          disabled={saving}
                          onClick={() => handleSave(soc.society_id)}
                          className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditValue(''); }}
                          className="p-1.5 rounded-lg bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(soc.society_id);
                          setEditValue(String(Math.round(Number(soc.storage_quota_bytes) / (1024 * 1024))));
                        }}
                        className="btn-secondary text-xs py-1.5 px-3"
                      >
                        Edit Limit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
