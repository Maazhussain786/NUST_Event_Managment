'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Save,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { PageLoader, ErrorState, EmptyState } from '../_components/Shared';
import { fetchSystemConfig, updateSystemConfig } from '../api';
import type { SystemConfigItem } from '../types';

export default function SystemConfigPage() {
  const [configs, setConfigs] = useState<SystemConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSystemConfig();
      setConfigs(data);
      // Initialize edit values
      const vals: Record<string, string> = {};
      data.forEach(c => { vals[c.key] = String(c.value); });
      setEditValues(vals);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load system configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (key: string) => {
    const newValue = editValues[key];
    const config = configs.find(c => c.key === key);
    if (!config || config.value === newValue) return;

    setSaving(key);
    try {
      await updateSystemConfig(key, newValue);
      setConfigs(prev => prev.map(c => c.key === key ? { ...c, value: newValue } : c));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  const handleReset = (key: string) => {
    const config = configs.find(c => c.key === key);
    if (config) {
      setEditValues(prev => ({ ...prev, [key]: String(config.value) }));
    }
  };

  const isModified = (key: string) => {
    const config = configs.find(c => c.key === key);
    return config ? editValues[key] !== config.value : false;
  };

  // Group by category
  const categories = configs.reduce<Record<string, SystemConfigItem[]>>((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const modifiedCount = configs.filter(c => isModified(c.key)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>System Configuration</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Platform-wide settings and thresholds
          </p>
        </div>
        {modifiedCount > 0 && (
          <span className="text-xs px-2 py-1 bg-amber-500/20 text-amber-500 rounded-full font-medium">
            {modifiedCount} unsaved change{modifiedCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : configs.length === 0 ? (
        <EmptyState message="No configuration available" />
      ) : (
        <div className="space-y-6">
          {Object.entries(categories).map(([category, catItems]) => (
            <div key={category}>
              <h3
                className="text-xs font-semibold uppercase tracking-widest mb-3 px-1"
                style={{ color: 'var(--text-muted)' }}
              >
                {category}
              </h3>
              <div className="space-y-2">
                {catItems.map((item) => (
                  <div key={item.key} className="card px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {item.label}
                        </h4>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {item.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.type === 'boolean' ? (
                          <select
                            className="input-field text-sm py-1.5 px-3 w-24"
                            value={editValues[item.key] || ''}
                            onChange={e => setEditValues(prev => ({ ...prev, [item.key]: e.target.value }))}
                          >
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type={item.type === 'number' ? 'number' : 'text'}
                              className="input-field text-sm py-1.5 px-3 w-28 text-right"
                              value={editValues[item.key] || ''}
                              onChange={e => setEditValues(prev => ({ ...prev, [item.key]: e.target.value }))}
                            />
                            {item.unit && (
                              <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                                {item.unit}
                              </span>
                            )}
                          </div>
                        )}
                        {isModified(item.key) && (
                          <>
                            <button
                              onClick={() => handleReset(item.key)}
                              className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                              title="Reset"
                            >
                              <RotateCcw className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                            </button>
                            <button
                              onClick={() => handleSave(item.key)}
                              disabled={saving === item.key}
                              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
                            >
                              {saving === item.key ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Save className="w-3 h-3" />
                              )}
                              Save
                            </button>
                          </>
                        )}
                      </div>
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
