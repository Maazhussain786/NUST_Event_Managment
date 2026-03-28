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
  DollarSign,
  HardDrive,
  Zap,
  Shield,
  Activity,
} from 'lucide-react';
import { StatCard } from './_components/StatCard';
import { StatusBadge } from './_components/StatusBadge';
import { PageLoader, ErrorState } from './_components/Shared';
import { fetchStats, fetchSocieties, fetchEvents, patchSociety, patchEvent } from './api';
import type { PlatformStats, AdminSociety, AdminEvent } from './types';

function formatBytes(bytes: string | number): string {
  const b = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

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

  const storagePercent = Number(stats.globalStorageQuota) > 0
    ? ((Number(stats.globalStorageUsed) / Number(stats.globalStorageQuota)) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-8">
      {/* Title bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Command Center
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Platform-wide overview · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
            hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Primary stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={stats.totalUsers}
          icon={Users}
          accent="blue"
          trend={`${stats.totalSuperAdmins} super admin(s)`}
        />
        <StatCard label="Societies" value={stats.totalSocieties} icon={Building2} accent="green" />
        <StatCard label="Total Events" value={stats.totalEvents} icon={Calendar} accent="purple" />
        <StatCard
          label="Pending Actions"
          value={stats.pendingSocieties + stats.pendingEvents}
          icon={Clock}
          accent="amber"
          trend={`${stats.pendingSocieties} societies · ${stats.pendingEvents} events`}
        />
      </div>

      {/* Secondary stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Events"
          value={stats.activeEvents}
          icon={Zap}
          accent="green"
          trend="Currently running"
        />
        <StatCard
          label="Revenue Today"
          value={`Rs. ${Number(stats.revenueToday).toLocaleString()}`}
          icon={DollarSign}
          accent="brand"
        />
        <StatCard
          label="Storage Used"
          value={formatBytes(stats.globalStorageUsed)}
          icon={HardDrive}
          accent="blue"
          trend={`${storagePercent}% of ${formatBytes(stats.globalStorageQuota)}`}
        />
        <StatCard
          label="QR Scans Today"
          value={stats.qrScansToday}
          icon={Activity}
          accent="purple"
          trend={stats.suspensionsToday > 0 ? `${stats.suspensionsToday} suspension(s)` : 'No suspensions today'}
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
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {soc.created_by_name ? `by ${soc.created_by_name}` : soc.description}
                      </p>
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

      {/* Quick navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { href: '/platform/administrators', label: 'Administrators', icon: Shield, color: 'text-brand-500 bg-brand-500/10' },
          { href: '/platform/finance', label: 'Finance', icon: DollarSign, color: 'text-emerald-500 bg-emerald-500/10' },
          { href: '/platform/analytics', label: 'Analytics', icon: Activity, color: 'text-blue-500 bg-blue-500/10' },
          { href: '/platform/audit-logs', label: 'Audit Logs', icon: Clock, color: 'text-purple-500 bg-purple-500/10' },
          { href: '/platform/storage', label: 'Storage', icon: HardDrive, color: 'text-amber-500 bg-amber-500/10' },
          { href: '/platform/security', label: 'Security', icon: Shield, color: 'text-red-500 bg-red-500/10' },
        ].map(({ href, label, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className="card p-4 flex flex-col items-center gap-2 hover:shadow-lg transition-shadow group text-center"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold group-hover:text-brand-500 transition-colors" style={{ color: 'var(--text-primary)' }}>
              {label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
