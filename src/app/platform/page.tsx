'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  Building2,
  Calendar,
  Clock,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { StatCard } from './_components/StatCard';
import { StatusBadge } from './_components/StatusBadge';
import { PageLoader, ErrorState } from './_components/Shared';
import { fetchStats, fetchSocieties, fetchEvents, patchSociety, patchEvent } from './api';
import type { PlatformStats, AdminSociety, AdminEvent } from './types';

export default function PlatformOverviewPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [pendingSocieties, setPendingSocieties] = useState<AdminSociety[]>([]);
  const [pendingEvents, setPendingEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [s, soc, evt] = await Promise.all([
        fetchStats(),
        fetchSocieties('PENDING'),
        fetchEvents('PENDING'),
      ]);
      setStats(s);
      setPendingSocieties(soc);
      setPendingEvents(evt);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSocietyAction = async (id: string, action: string) => {
    setActionLoading(id);
    try {
      await patchSociety(id, action);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEventAction = async (id: string, action: string) => {
    setActionLoading(id);
    try {
      await patchEvent(id, action);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!stats) return null;

  return (
    <div className="space-y-8">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Overview</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Platform-wide statistics and pending actions</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium
            hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={stats.totalUsers} icon={Users} accent="blue" />
        <StatCard label="Societies" value={stats.totalSocieties} icon={Building2} accent="green" />
        <StatCard label="Events" value={stats.totalEvents} icon={Calendar} accent="purple" />
        <StatCard
          label="Pending Actions"
          value={stats.pendingSocieties + stats.pendingEvents}
          icon={Clock}
          accent="amber"
          trend={`${stats.pendingSocieties} societies · ${stats.pendingEvents} events`}
        />
      </div>

      {/* Pending sections */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Pending Societies */}
        <div className="card">
          <div className="flex items-center justify-between p-5 pb-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Pending Societies
              </h2>
              {pendingSocieties.length > 0 && (
                <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                  {pendingSocieties.length}
                </span>
              )}
            </div>
            <Link
              href="/platform/societies"
              className="text-xs font-medium text-brand-500 hover:text-brand-600 flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-5">
            {pendingSocieties.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>No pending societies</p>
            ) : (
              <div className="space-y-3">
                {pendingSocieties.slice(0, 5).map((soc) => (
                  <div
                    key={soc.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{soc.name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{soc.description}</p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-3 shrink-0">
                      <button
                        disabled={actionLoading === soc.id}
                        onClick={() => handleSocietyAction(soc.id, 'APPROVED')}
                        className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400
                          hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                        title="Approve"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        disabled={actionLoading === soc.id}
                        onClick={() => handleSocietyAction(soc.id, 'REJECTED')}
                        className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400
                          hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                        title="Reject"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pending Events */}
        <div className="card">
          <div className="flex items-center justify-between p-5 pb-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Pending Events
              </h2>
              {pendingEvents.length > 0 && (
                <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                  {pendingEvents.length}
                </span>
              )}
            </div>
            <Link
              href="/platform/events"
              className="text-xs font-medium text-brand-500 hover:text-brand-600 flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-5">
            {pendingEvents.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>No pending events</p>
            ) : (
              <div className="space-y-3">
                {pendingEvents.slice(0, 5).map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{evt.title}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {evt.society_name} · {new Date(evt.start_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-3 shrink-0">
                      <button
                        disabled={actionLoading === evt.id}
                        onClick={() => handleEventAction(evt.id, 'APPROVED')}
                        className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400
                          hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                        title="Approve"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        disabled={actionLoading === evt.id}
                        onClick={() => handleEventAction(evt.id, 'REJECTED')}
                        className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400
                          hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                        title="Reject"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/platform/audit-logs', label: 'Audit Logs', icon: '📋' },
          { href: '/platform/analytics', label: 'Analytics', icon: '📊' },
          { href: '/platform/storage', label: 'Storage', icon: '💾' },
          { href: '/platform/users', label: 'Users', icon: '👥' },
        ].map(l => (
          <Link
            key={l.href}
            href={l.href}
            className="card p-4 flex items-center gap-3 hover:shadow-lg transition-shadow group"
          >
            <span className="text-xl">{l.icon}</span>
            <span className="text-sm font-semibold group-hover:text-brand-500 transition-colors" style={{ color: 'var(--text-primary)' }}>
              {l.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
