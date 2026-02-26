'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  BarChart3, Users, Calendar, TrendingUp,
  Award, Target, ScanLine,
} from 'lucide-react';
import { fetchAnalytics, SocietyApiError } from '../../../api';
import { PageLoader, ErrorState, EmptyState, StatCard } from '../../../_components/Shared';
import type { SocietyAnalytics } from '../../../types';

export default function AnalyticsPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [data, setData] = useState<SocietyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const analytics = await fetchAnalytics(societyId);
      setData(analytics);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        if (err.status === 403) { setError('Access denied'); return; }
        setError(err.message);
      } else {
        setError('Failed to load analytics');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, router]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageLoader />;
  if (error || !data) return <ErrorState message={error || 'Failed to load'} onRetry={load} />;

  return (
    <div className="space-y-6">
      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Registrations"
          value={Number(data.registrationStats.total || 0)}
          icon={Users}
          accent="blue"
        />
        <StatCard
          label="Active"
          value={Number(data.registrationStats.active || 0)}
          icon={Target}
          accent="green"
        />
        <StatCard
          label="Last 30 Days"
          value={Number(data.registrationStats.last30Days || 0)}
          icon={TrendingUp}
          accent="purple"
        />
        <StatCard
          label="Check-in Rate"
          value={`${Number(data.checkInRate || 0).toFixed(0)}%`}
          icon={ScanLine}
          accent="brand"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Member growth */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
            <Users size={16} className="text-muted" /> Member Growth
          </h2>
          {data.memberGrowth.length === 0 ? (
            <EmptyState message="No data yet" />
          ) : (
            <div className="space-y-2">
              {data.memberGrowth.map(item => {
                const max = Math.max(...data.memberGrowth.map(g => Number(g.count)));
                const percent = max > 0 ? (Number(item.count) / max) * 100 : 0;
                return (
                  <div key={item.month} className="flex items-center gap-3">
                    <span className="text-xs text-muted w-16">{item.month}</span>
                    <div className="flex-1 h-5 rounded bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded bg-blue-500 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-primary w-8 text-right">{item.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Events by month */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
            <Calendar size={16} className="text-muted" /> Events by Month
          </h2>
          {data.eventsByMonth.length === 0 ? (
            <EmptyState message="No data yet" />
          ) : (
            <div className="space-y-2">
              {data.eventsByMonth.map(item => {
                const max = Math.max(...data.eventsByMonth.map(g => Number(g.count)));
                const percent = max > 0 ? (Number(item.count) / max) * 100 : 0;
                return (
                  <div key={item.month} className="flex items-center gap-3">
                    <span className="text-xs text-muted w-16">{item.month}</span>
                    <div className="flex-1 h-5 rounded bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded bg-purple-500 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-primary w-8 text-right">{item.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Events by status */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-muted" /> Events by Status
        </h2>
        {data.eventsByStatus.length === 0 ? (
          <EmptyState message="No data" />
        ) : (
          <div className="flex flex-wrap gap-3">
            {data.eventsByStatus.map(item => (
              <div key={item.status} className="card p-3 min-w-[120px] text-center">
                <p className="text-2xl font-bold text-primary">{item.count}</p>
                <p className="text-xs text-muted mt-1">{item.status.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revenue by month */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-muted" /> Revenue by Month
        </h2>
        {data.revenueByMonth.length === 0 ? (
          <EmptyState message="No revenue data" />
        ) : (
          <div className="space-y-2">
            {data.revenueByMonth.map(item => {
              const max = Math.max(...data.revenueByMonth.map(g => Number(g.revenue)));
              const percent = max > 0 ? (Number(item.revenue) / max) * 100 : 0;
              return (
                <div key={item.month} className="flex items-center gap-3">
                  <span className="text-xs text-muted w-16">{item.month}</span>
                  <div className="flex-1 h-5 rounded bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded bg-green-500 transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-primary w-16 text-right">
                    Rs. {Number(item.revenue).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top events */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
          <Award size={16} className="text-muted" /> Top Events
        </h2>
        {data.topEvents.length === 0 ? (
          <EmptyState message="No events yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-themed">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Event</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Participants</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Revenue</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Rating</th>
                </tr>
              </thead>
              <tbody>
                {data.topEvents.map(evt => (
                  <tr key={evt.id} className="border-b border-themed/50 hover:bg-secondary/50">
                    <td className="px-4 py-3 text-primary font-medium truncate max-w-[200px]">{evt.title}</td>
                    <td className="px-4 py-3 text-right text-secondary">{evt.participants}</td>
                    <td className="px-4 py-3 text-right text-secondary">Rs. {Number(evt.revenue).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-secondary">{Number(evt.rating).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
