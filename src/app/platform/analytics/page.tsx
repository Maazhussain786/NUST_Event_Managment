'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  Calendar,
  Building2,
  Ticket,
  DollarSign,
  HardDrive,
  Activity,
  Clock,
} from 'lucide-react';
import { PageLoader, ErrorState } from '../_components/Shared';
import { StatCard } from '../_components/StatCard';
import { fetchAnalytics } from '../api';
import type { AnalyticsData } from '../types';

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const analytics = await fetchAnalytics();
      setData(analytics);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageLoader />;
  if (error || !data) return <ErrorState message={error || 'No data'} onRetry={load} />;

  const maxUserGrowth = Math.max(...data.userGrowth.map(d => Number(d.count)), 1);
  const maxEventsByMonth = Math.max(...data.eventsByMonth.map(d => Number(d.count)), 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Analytics</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Platform-wide metrics and trends
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Registrations"
          value={data.registrationStats?.total_registrations || 0}
          icon={Ticket}
          accent="blue"
        />
        <StatCard
          label="Active"
          value={data.registrationStats?.active_registrations || 0}
          icon={Users}
          accent="green"
        />
        <StatCard
          label="Total Revenue"
          value={`Rs. ${Number(data.revenueStats?.total_revenue || 0).toLocaleString()}`}
          icon={DollarSign}
          accent="brand"
        />
        <StatCard
          label="Tickets Sold"
          value={data.revenueStats?.approved_tickets || 0}
          icon={Calendar}
          accent="purple"
        />
      </div>

      {/* User Growth Chart */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-brand-500" />
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>User Growth (Last 12 Months)</h2>
        </div>
        <div className="flex items-end gap-1 h-40">
          {data.userGrowth.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
              <span className="text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--text-secondary)' }}>
                {d.count}
              </span>
              <div
                className="w-full rounded-t-md bg-brand-400 dark:bg-brand-500 group-hover:bg-brand-500 dark:group-hover:bg-brand-400 transition-colors"
                style={{ height: `${Math.max((Number(d.count) / maxUserGrowth) * 100, 4)}%` }}
              />
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {d.month.substring(5)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Events by Month Chart */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-blue-500" />
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Events by Month (Last 12 Months)</h2>
        </div>
        <div className="flex items-end gap-1 h-40">
          {data.eventsByMonth.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
              <span className="text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--text-secondary)' }}>
                {d.count}
              </span>
              <div
                className="w-full rounded-t-md bg-blue-400 dark:bg-blue-500 group-hover:bg-blue-500 dark:group-hover:bg-blue-400 transition-colors"
                style={{ height: `${Math.max((Number(d.count) / maxEventsByMonth) * 100, 4)}%` }}
              />
              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {d.month.substring(5)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Events by Status */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-purple-500" />
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Events by Status</h2>
          </div>
          <div className="space-y-3">
            {data.eventsByStatus.map((s) => {
              const total = data.eventsByStatus.reduce((a, b) => a + Number(b.count), 0) || 1;
              const pct = Math.round((Number(s.count) / total) * 100);
              return (
                <div key={s.status} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-secondary)' }}>{s.status}</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{s.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${pct}%`,
                      backgroundColor: statusColor(s.status),
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Societies by Status */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-emerald-500" />
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Societies by Status</h2>
          </div>
          <div className="space-y-3">
            {data.societiesByStatus.map((s) => {
              const total = data.societiesByStatus.reduce((a, b) => a + Number(b.count), 0) || 1;
              const pct = Math.round((Number(s.count) / total) * 100);
              return (
                <div key={s.status} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-secondary)' }}>{s.status}</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{s.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${pct}%`,
                      backgroundColor: statusColor(s.status),
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Societies */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-brand-500" />
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Top 10 Societies by Members</h2>
        </div>
        <div className="space-y-2">
          {data.topSocieties.map((s, i) => {
            const maxMembers = Number(data.topSocieties[0]?.member_count) || 1;
            return (
              <div key={s.id} className="flex items-center gap-3">
                <span className="text-xs font-bold w-6 text-center" style={{ color: 'var(--text-muted)' }}>
                  #{i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {s.name}
                    </span>
                    <span className="text-xs font-semibold shrink-0 ml-2" style={{ color: 'var(--text-secondary)' }}>
                      {s.member_count} members
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-brand-400" style={{
                      width: `${(Number(s.member_count) / maxMembers) * 100}%`,
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
          {data.topSocieties.length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No data available</p>
          )}
        </div>
      </div>

      {/* Storage Overview */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-5 h-5 text-emerald-500" />
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Storage Overview</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Total Societies" value={data.storageOverview?.total_societies || 0} />
          <MiniStat label="Total Used" value={formatBytes(Number(data.storageOverview?.total_used_bytes) || 0)} />
          <MiniStat label="Total Allocated" value={formatBytes(Number(data.storageOverview?.total_quota_bytes) || 0)} />
          <MiniStat label="Max Used" value={formatBytes(Number(data.storageOverview?.max_used_bytes) || 0)} />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-blue-500" />
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Recent Activity</h2>
        </div>
        <div className="space-y-3">
          {data.recentActivity.map((act) => (
            <div key={act.id} className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-brand-400 mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  <span className="font-semibold">{act.user_name || 'System'}</span>{' '}
                  <span className="lowercase">{act.action.replace(/_/g, ' ')}</span>
                  {act.society_name && (
                    <span> in <span className="font-medium">{act.society_name}</span></span>
                  )}
                </p>
                <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  <Clock className="w-3 h-3" /> {new Date(act.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
          {data.recentActivity.length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'APPROVED': case 'ACTIVE': return '#10b981';
    case 'PENDING': return '#f59e0b';
    case 'REJECTED': case 'CANCELLED': return '#ef4444';
    case 'SUSPENDED': case 'DEACTIVATED': return '#f97316';
    default: return '#6b7280';
  }
}
