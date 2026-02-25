'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  User,
  Mail,
  Globe,
  Activity,
} from 'lucide-react';
import { StatCard } from '../_components/StatCard';
import { PageLoader, ErrorState, EmptyState } from '../_components/Shared';
import { fetchSecurityMetrics } from '../api';
import type { SecurityMetrics } from '../types';

export default function SecurityPage() {
  const [data, setData] = useState<SecurityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'suspicious' | 'events'>('events');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const d = await fetchSecurityMetrics();
      setData(d);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load security data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const actionColor = (action: string) => {
    if (action.includes('SUSPENDED') || action.includes('REMOVED') || action.includes('REVOKED'))
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    if (action.includes('TRANSFERRED') || action.includes('OVERRIDE'))
      return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
    return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Security Monitoring</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Threat detection, anomaly monitoring, and security events
        </p>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="QR Scan Bursts" value={data.qrScanBursts} icon={Activity} accent="amber" trend="24h window" />
        <StatCard label="Rapid Registrations" value={data.rapidRegistrations} icon={AlertTriangle} accent="red" trend="24h window" />
        <StatCard
          label="Suspicious Users"
          value={data.suspiciousActivities.length}
          icon={ShieldAlert}
          accent="red"
          trend="High-volume actors"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        {([
          { value: 'events', label: 'Security Events' },
          { value: 'suspicious', label: 'Suspicious Activity' },
        ] as const).map((t) => (
          <button
            key={t.value}
            onClick={() => setActiveTab(t.value)}
            className={`chip ${activeTab === t.value ? 'active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'events' && (
        <div className="space-y-2">
          {data.recentSecurityEvents.length === 0 ? (
            <EmptyState message="No security events in the last 24 hours" />
          ) : (
            data.recentSecurityEvents.map((evt) => (
              <div key={evt.id} className="card px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/20 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldAlert className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${actionColor(evt.action)}`}>
                        {evt.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <Clock className="w-3 h-3" /> {formatTimestamp(evt.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs flex-wrap" style={{ color: 'var(--text-secondary)' }}>
                      {evt.user_name && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {evt.user_name}
                        </span>
                      )}
                      {evt.user_email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {evt.user_email}
                        </span>
                      )}
                      {evt.ip_address && (
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" /> {evt.ip_address}
                        </span>
                      )}
                    </div>
                    {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                      <pre className="text-xs mt-2 p-2 rounded-lg bg-surface-50 dark:bg-surface-900 overflow-x-auto" style={{ color: 'var(--text-secondary)' }}>
                        {JSON.stringify(evt.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'suspicious' && (
        <div className="space-y-2">
          {data.suspiciousActivities.length === 0 ? (
            <EmptyState message="No suspicious activity detected" />
          ) : (
            <>
              <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                <div className="col-span-3">User</div>
                <div className="col-span-3">Email</div>
                <div className="col-span-2">Indicator</div>
                <div className="col-span-2">Actions</div>
                <div className="col-span-2">Last Seen</div>
              </div>
              {data.suspiciousActivities.map((sa) => (
                <div key={sa.user_id} className="card px-5 py-4">
                  <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center space-y-2 md:space-y-0">
                    <div className="col-span-3 text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {sa.user_name}
                    </div>
                    <div className="col-span-3 text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      {sa.user_email}
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                        {sa.indicator.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="col-span-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {sa.count}
                    </div>
                    <div className="col-span-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatTimestamp(sa.last_occurred)}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
