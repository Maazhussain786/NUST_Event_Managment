'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  Database,
  HardDrive,
  Globe,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { PageLoader, ErrorState } from '../_components/Shared';
import { fetchHealthStatus } from '../api';
import type { HealthStatus, ServiceHealth } from '../types';

const SERVICE_META: Record<string, { icon: React.ElementType; label: string }> = {
  database: { icon: Database, label: 'Database' },
  storage: { icon: HardDrive, label: 'Storage Service' },
  api: { icon: Globe, label: 'API Gateway' },
};

const STATUS_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  healthy: { icon: CheckCircle, color: 'text-emerald-500' },
  degraded: { icon: AlertTriangle, color: 'text-amber-500' },
  unhealthy: { icon: XCircle, color: 'text-red-500' },
};

function formatUptime(hours: number): string {
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await fetchHealthStatus();
      setHealth(data);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const overallStatus = health?.overall || 'unhealthy';
  const overallColor =
    overallStatus === 'healthy' ? 'text-emerald-500' :
    overallStatus === 'degraded' ? 'text-amber-500' : 'text-red-500';
  const overallBg =
    overallStatus === 'healthy' ? 'bg-emerald-500/10' :
    overallStatus === 'degraded' ? 'bg-amber-500/10' : 'bg-red-500/10';

  // Build services array from individual fields
  const services: { name: string; health: ServiceHealth }[] = health
    ? [
        { name: 'database', health: health.database },
        { name: 'storage', health: health.storage },
        { name: 'api', health: health.api },
      ]
    : [];

  const renderServiceCard = (svc: { name: string; health: ServiceHealth }) => {
    const meta = SERVICE_META[svc.name] || { icon: Activity, label: svc.name };
    const statusMeta = STATUS_ICON[svc.health.status] || STATUS_ICON.unhealthy;
    const Icon = meta.icon;
    const StatusIcon = statusMeta.icon;

    return (
      <div key={svc.name} className="card p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-surface-100 dark:bg-surface-800">
              <Icon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div>
              <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{meta.label}</h4>
              <p className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>{svc.health.status}</p>
            </div>
          </div>
          <StatusIcon className={`w-6 h-6 ${statusMeta.color}`} />
        </div>
        {svc.health.latency !== undefined && svc.health.latency > 0 && (
          <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-primary)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Latency</span>
            <span className={`text-sm font-medium ${svc.health.latency > 500 ? 'text-amber-500' : 'text-emerald-500'}`}>
              {svc.health.latency}ms
            </span>
          </div>
        )}
        {svc.health.message && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{svc.health.message}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Platform Health</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Real-time system status and diagnostics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <Clock className="w-3 h-3" />
            {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="btn-secondary text-sm px-3 py-2 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : health ? (
        <>
          {/* Overall Status Banner */}
          <div className={`card p-6 ${overallBg}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Activity className={`w-10 h-10 ${overallColor}`} />
                <div>
                  <h2 className={`text-xl font-bold capitalize ${overallColor}`}>
                    System {overallStatus}
                  </h2>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {services.filter(s => s.health.status === 'healthy').length} of {services.length} services operational
                  </p>
                </div>
              </div>
              {health.systemInfo?.dbResponseTime !== undefined && (
                <div className="text-right">
                  <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {health.systemInfo.dbResponseTime}<span className="text-sm font-normal ml-0.5">ms</span>
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>DB Response Time</p>
                </div>
              )}
            </div>
          </div>

          {/* Service Cards */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest mb-3 px-1" style={{ color: 'var(--text-muted)' }}>
              Services
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {services.map(renderServiceCard)}
            </div>
          </div>

          {/* System Info */}
          {health.systemInfo && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest mb-3 px-1" style={{ color: 'var(--text-muted)' }}>
                System Information
              </h3>
              <div className="card overflow-hidden">
                <div className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Users</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{health.systemInfo.totalUsers}</span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Societies</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{health.systemInfo.totalSocieties}</span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Events</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{health.systemInfo.totalEvents}</span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Uptime</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{formatUptime(health.systemInfo.uptimeHours)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
