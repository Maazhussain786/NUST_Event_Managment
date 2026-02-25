'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ToggleLeft,
  ToggleRight,
  Loader2,
} from 'lucide-react';
import { PageLoader, ErrorState, EmptyState } from '../_components/Shared';
import { fetchFeatureFlags, updateFeatureFlag } from '../api';
import type { FeatureFlag } from '../types';

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchFeatureFlags();
      setFlags(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load feature flags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (key: string, currentEnabled: boolean) => {
    setToggling(key);
    try {
      await updateFeatureFlag(key, !currentEnabled);
      setFlags(prev => prev.map(f => f.key === key ? { ...f, enabled: !currentEnabled } : f));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Toggle failed');
    } finally {
      setToggling(null);
    }
  };

  // Group by category
  const categories = flags.reduce<Record<string, FeatureFlag[]>>((acc, flag) => {
    const cat = flag.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(flag);
    return acc;
  }, {});

  const enabledCount = flags.filter(f => f.enabled).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Feature Flags</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Control platform features globally or per-society
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{flags.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Total Flags</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-emerald-500">{enabledCount}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Enabled</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{flags.length - enabledCount}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Disabled</p>
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : flags.length === 0 ? (
        <EmptyState message="No feature flags configured" />
      ) : (
        <div className="space-y-6">
          {Object.entries(categories).map(([category, catFlags]) => (
            <div key={category}>
              <h3
                className="text-xs font-semibold uppercase tracking-widest mb-3 px-1"
                style={{ color: 'var(--text-muted)' }}
              >
                {category}
              </h3>
              <div className="space-y-2">
                {catFlags.map((flag) => (
                  <div key={flag.key} className="card px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-4">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {flag.label}
                          </h4>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-800" style={{ color: 'var(--text-muted)' }}>
                            {flag.scope === 'per_society' ? 'Per Society' : 'Global'}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {flag.description}
                        </p>
                      </div>
                      <button
                        disabled={toggling === flag.key}
                        onClick={() => handleToggle(flag.key, flag.enabled)}
                        className="shrink-0 p-1 transition-colors disabled:opacity-50"
                      >
                        {toggling === flag.key ? (
                          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
                        ) : flag.enabled ? (
                          <ToggleRight className="w-10 h-10 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="w-10 h-10" style={{ color: 'var(--text-muted)' }} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
