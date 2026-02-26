'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Shield, Filter, ChevronLeft, ChevronRight,
  User, Calendar, Settings, UserPlus, Trash2,
  Edit, Eye, Lock, Unlock, AlertTriangle,
} from 'lucide-react';
import { fetchAuditLogs, SocietyApiError } from '../../api';
import { PageLoader, ErrorState, EmptyState, StatusBadge } from '../../_components/Shared';
import type { SocietyAuditLog, SocietyAuditLogResponse, SocietyAuditAction } from '../../types';

const ACTION_FILTERS: { label: string; value: SocietyAuditAction | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Member Added', value: 'MEMBER_ADDED' },
  { label: 'Member Removed', value: 'MEMBER_REMOVED' },
  { label: 'Role Changed', value: 'ROLE_CHANGED' },
  { label: 'Event Created', value: 'EVENT_CREATED' },
  { label: 'Event Updated', value: 'EVENT_UPDATED' },
  { label: 'Event Cancelled', value: 'EVENT_CANCELLED' },
  { label: 'Settings Updated', value: 'SETTINGS_UPDATED' },
  { label: 'Wing Created', value: 'WING_CREATED' },
  { label: 'Wing Deleted', value: 'WING_DELETED' },
  { label: 'Privilege Updated', value: 'PRIVILEGE_UPDATED' },
  { label: 'Presidency Transferred', value: 'PRESIDENCY_TRANSFERRED' },
  { label: 'Ticket Approved', value: 'TICKET_APPROVED' },
  { label: 'Ticket Rejected', value: 'TICKET_REJECTED' },
  { label: 'Media Deleted', value: 'MEDIA_DELETED' },
];

function getActionIcon(action: string) {
  if (action.includes('MEMBER')) return <User size={14} />;
  if (action.includes('EVENT')) return <Calendar size={14} />;
  if (action.includes('SETTINGS')) return <Settings size={14} />;
  if (action.includes('WING') || action.includes('PRIVILEGE')) return <Lock size={14} />;
  if (action.includes('TICKET_APPROVED')) return <Unlock size={14} />;
  if (action.includes('TICKET_REJECTED')) return <AlertTriangle size={14} />;
  if (action.includes('PRESIDENCY')) return <Shield size={14} />;
  if (action.includes('DELETE') || action.includes('REMOVED') || action.includes('CANCELLED'))
    return <Trash2 size={14} />;
  if (action.includes('CREATED') || action.includes('ADDED'))
    return <UserPlus size={14} />;
  if (action.includes('UPDATED') || action.includes('CHANGED'))
    return <Edit size={14} />;
  return <Eye size={14} />;
}

function getActionColor(action: string): string {
  if (action.includes('DELETE') || action.includes('REMOVED') || action.includes('CANCELLED') || action.includes('REJECTED'))
    return 'text-red-400';
  if (action.includes('CREATED') || action.includes('ADDED') || action.includes('APPROVED'))
    return 'text-green-400';
  if (action.includes('UPDATED') || action.includes('CHANGED') || action.includes('TRANSFERRED'))
    return 'text-blue-400';
  return 'text-muted';
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

export default function AuditLogsPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [data, setData] = useState<SocietyAuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const limit = 20;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchAuditLogs(societyId, {
        page,
        limit,
        action: actionFilter || undefined,
      });
      setData(result);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        if (err.status === 403) { setError('Access denied'); return; }
        setError(err.message);
      } else {
        setError('Failed to load audit logs');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, page, actionFilter, router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setPage(1); }, [actionFilter]);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <EmptyState message="No data" />;

  const totalPages = Math.ceil(data.total / limit);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`btn-ghost text-sm flex items-center gap-1 ${showFilters ? 'text-[var(--brand)]' : ''}`}
          >
            <Filter size={14} /> Filters
          </button>
          {actionFilter && (
            <span className="chip active text-xs">{formatAction(actionFilter)}</span>
          )}
        </div>
        <span className="text-xs text-muted">
          {data.total} log{data.total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted uppercase mb-2">Action Type</p>
          <div className="flex flex-wrap gap-2">
            {ACTION_FILTERS.map(f => (
              <button
                key={f.value}
                className={`chip text-xs ${actionFilter === f.value ? 'active' : ''}`}
                onClick={() => setActionFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Log entries */}
      {data.logs.length === 0 ? (
        <EmptyState message="No audit logs found" />
      ) : (
        <div className="space-y-2">
          {data.logs.map(log => (
            <div key={log.id} className="card p-4 flex items-start gap-3">
              <div className={`mt-0.5 ${getActionColor(log.action)}`}>
                {getActionIcon(log.action)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-primary">
                    {formatAction(log.action)}
                  </span>
                  {log.targetType && (
                    <span className="text-xs text-muted bg-secondary px-2 py-0.5 rounded">
                      {log.targetType}
                    </span>
                  )}
                </div>
                {log.details && (
                  <p className="text-xs text-secondary mt-1">{log.details}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <User size={10} /> {log.performedByName || 'System'}
                  </span>
                  <span>
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                  {log.ipAddress && (
                    <span className="hidden sm:inline">IP: {log.ipAddress}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="btn-ghost text-sm flex items-center gap-1 disabled:opacity-30"
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <span className="text-xs text-muted">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="btn-ghost text-sm flex items-center gap-1 disabled:opacity-30"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
