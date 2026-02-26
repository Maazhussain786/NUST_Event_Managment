'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Users, Calendar, Ticket, ScanLine, Network, HardDrive,
  Wallet, TrendingUp, Clock, Activity,
} from 'lucide-react';
import { fetchGovernanceOverview, SocietyApiError } from '../../../api';
import { PageLoader, ErrorState, StatCard, StatusBadge } from '../../../_components/Shared';
import type { GovernanceOverview } from '../../../types';

export default function SocietyOverviewPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [data, setData] = useState<GovernanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const overview = await fetchGovernanceOverview(societyId);
      setData(overview);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        if (err.status === 403) { setError('You do not have access to this dashboard.'); return; }
        setError(err.message);
      } else {
        setError('Failed to load dashboard');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, router]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageLoader />;
  if (error || !data) return <ErrorState message={error || 'Failed to load'} onRetry={load} />;

  const { stats, upcomingEvents, recentActivity, myRole } = data;

  return (
    <div className="space-y-6">
      {/* Role banner */}
      <div className="card p-4 flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-brand-500/10 text-brand-500">
          <Activity size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-primary">
            Welcome back — you are the <span className="text-brand-500">{myRole.role_name}</span>
          </p>
          <p className="text-xs text-muted">
            Society is <StatusBadge status={data.society.status} />
          </p>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Members" value={stats.totalMembers} icon={Users} accent="blue" />
        <StatCard label="Events" value={stats.totalEvents} icon={Calendar} accent="purple" />
        <StatCard label="Upcoming" value={stats.upcomingEvents} icon={Clock} accent="amber" />
        <StatCard label="Ongoing" value={stats.ongoingEvents} icon={Activity} accent="green" />
        <StatCard label="Pending Tickets" value={stats.pendingTickets} icon={Ticket} accent="red" />
        <StatCard label="Total Check-ins" value={stats.totalCheckins} icon={ScanLine} accent="brand" />
        <StatCard label="Wings" value={stats.totalWings} icon={Network} accent="blue" />
        <StatCard
          label="Revenue"
          value={`Rs. ${Number(stats.totalRevenue || 0).toLocaleString()}`}
          icon={Wallet}
          accent="green"
        />
      </div>

      {/* Storage bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-primary flex items-center gap-2">
            <HardDrive size={16} className="text-muted" /> Storage Usage
          </span>
          <span className="text-xs text-muted">
            {stats.storagePercentUsed.toFixed(1)}% used
          </span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              stats.storagePercentUsed > 90 ? 'bg-red-500' :
              stats.storagePercentUsed > 70 ? 'bg-amber-500' : 'bg-brand-500'
            }`}
            style={{ width: `${Math.min(stats.storagePercentUsed, 100)}%` }}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming events */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-primary">Upcoming Events</h2>
            <button
              onClick={() => router.push(`/society/${societyId}/events`)}
              className="text-xs text-brand-500 hover:underline"
            >
              View all
            </button>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No upcoming events</p>
          ) : (
            <div className="space-y-3">
              {upcomingEvents.slice(0, 5).map(event => (
                <div key={event.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors">
                  <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                    <Calendar size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{event.title}</p>
                    <p className="text-xs text-muted">
                      {new Date(event.event_start).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <StatusBadge status={event.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-primary mb-4">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.slice(0, 8).map(log => (
                <div key={log.id} className="flex items-start gap-3 py-1">
                  <div className="h-2 w-2 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-primary">
                      <span className="font-medium">{log.performedByName || 'System'}</span>{' '}
                      <span className="text-muted">{formatAction(log.action)}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(log.createdAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      {myRole.hierarchy_level >= 5 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-primary mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push(`/society/${societyId}/events`)}
              className="btn-primary text-sm px-4 py-2"
            >
              Create Event
            </button>
            <button
              onClick={() => router.push(`/society/${societyId}/members`)}
              className="btn-secondary text-sm px-4 py-2"
            >
              Manage Members
            </button>
            {myRole.hierarchy_level >= 8 && (
              <button
                onClick={() => router.push(`/society/${societyId}/approvals`)}
                className="btn-secondary text-sm px-4 py-2"
              >
                Review Tickets
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}
