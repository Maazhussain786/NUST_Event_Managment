'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ScrollText,
  ChevronDown,
  ChevronRight,
  Filter,
  Calendar,
  User,
  Building2,
  Clock,
} from 'lucide-react';
import { PageLoader, ErrorState, EmptyState } from '../_components/Shared';
import { fetchAuditLogs } from '../api';
import type { AuditLogResponse } from '../types';

const ACTION_OPTIONS: { label: string; value: string }[] = [
  { label: 'Society Approved', value: 'SOCIETY_APPROVED' },
  { label: 'Society Rejected', value: 'SOCIETY_REJECTED' },
  { label: 'Society Suspended', value: 'SOCIETY_SUSPENDED' },
  { label: 'Society Reactivated', value: 'SOCIETY_REACTIVATED' },
  { label: 'Society Deactivated', value: 'SOCIETY_DEACTIVATED' },
  { label: 'Member Added', value: 'MEMBER_ADDED' },
  { label: 'Member Removed', value: 'MEMBER_REMOVED' },
  { label: 'Member Suspended', value: 'MEMBER_SUSPENDED' },
  { label: 'Member Reactivated', value: 'MEMBER_REACTIVATED' },
  { label: 'Role Assigned', value: 'ROLE_ASSIGNED' },
  { label: 'Role Revoked', value: 'ROLE_REVOKED' },
  { label: 'Presidency Transferred', value: 'PRESIDENCY_TRANSFERRED' },
  { label: 'Event Created', value: 'EVENT_CREATED' },
  { label: 'Event Updated', value: 'EVENT_UPDATED' },
  { label: 'Event Cancelled', value: 'EVENT_CANCELLED' },
  { label: 'Event Registered', value: 'EVENT_REGISTERED' },
  { label: 'QR Scanned', value: 'QR_SCANNED' },
  { label: 'Payment Verified', value: 'PAYMENT_VERIFIED' },
  { label: 'Payment Rejected', value: 'PAYMENT_REJECTED' },
  { label: 'Ticket Approved', value: 'TICKET_APPROVED' },
  { label: 'Ticket Rejected', value: 'TICKET_REJECTED' },
  { label: 'Media Uploaded', value: 'MEDIA_UPLOADED' },
  { label: 'Media Deleted', value: 'MEDIA_DELETED' },
  { label: 'Storage Limit Updated', value: 'STORAGE_LIMIT_UPDATED' },
  { label: 'SuperAdmin Override', value: 'SUPERADMIN_OVERRIDE' },
];

export default function AuditLogsPage() {
  const [response, setResponse] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [societyId, setSocietyId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const limit = 30;

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAuditLogs({
        page,
        limit,
        action: action || undefined,
        userId: userId || undefined,
        societyId: societyId || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      });
      setResponse(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, action, userId, societyId, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const handleApplyFilters = () => {
    setPage(1);
    load();
  };

  const handleClearFilters = () => {
    setAction('');
    setUserId('');
    setSocietyId('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const actionColor = (action: string) => {
    if (action.includes('CREATED') || action.includes('APPROVED') || action.includes('COMPLETED') || action.includes('REACTIVATED'))
      return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
    if (action.includes('DELETED') || action.includes('REJECTED') || action.includes('CANCELLED') || action.includes('SUSPENDED') || action.includes('REMOVED'))
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    if (action.includes('UPDATED') || action.includes('TRANSFERRED') || action.includes('ASSIGNED'))
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    return 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Audit Logs</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Track all platform actions and changes
          </p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="btn-secondary text-sm py-2.5 px-4 flex items-center gap-2"
        >
          <Filter className="w-4 h-4" />
          Filters
          <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Action */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Action</label>
              <select value={action} onChange={(e) => setAction(e.target.value)} className="input-field text-sm">
                <option value="">All actions</option>
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* User ID */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>User ID</label>
              <input type="text" value={userId} onChange={(e) => setUserId(e.target.value)}
                placeholder="Filter by user UUID" className="input-field text-sm" />
            </div>

            {/* Society ID */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Society ID</label>
              <input type="text" value={societyId} onChange={(e) => setSocietyId(e.target.value)}
                placeholder="Filter by society UUID" className="input-field text-sm" />
            </div>

            {/* From */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="input-field text-sm" />
            </div>

            {/* To */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>To Date</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="input-field text-sm" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleApplyFilters} className="btn-primary text-sm py-2 px-4">Apply</button>
            <button onClick={handleClearFilters} className="btn-secondary text-sm py-2 px-4">Clear</button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !response || response.logs.length === 0 ? (
        <EmptyState message="No audit logs found" />
      ) : (
        <>
          <div className="space-y-2">
            {response.logs.map((log) => {
              const isOpen = expanded.has(log.id);
              return (
                <div key={log.id} className="card overflow-hidden">
                  <button
                    onClick={() => toggleExpand(log.id)}
                    className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    ) : (
                      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    )}

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${actionColor(log.action)}`}>
                      {log.action.replace(/_/g, ' ')}
                    </span>

                    <div className="flex-1 min-w-0 flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {log.performed_by_name && (
                        <span className="flex items-center gap-1 shrink-0">
                          <User className="w-3 h-3" /> {log.performed_by_name}
                        </span>
                      )}
                      {log.society_name && (
                        <span className="flex items-center gap-1 shrink-0">
                          <Building2 className="w-3 h-3" /> {log.society_name}
                        </span>
                      )}
                    </div>

                    <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                      <Clock className="w-3 h-3" /> {formatTimestamp(log.created_at)}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 pt-0 border-t" style={{ borderColor: 'var(--border-primary)' }}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 text-sm">
                        {log.performed_by_email && (
                          <Detail label="Performed By" value={`${log.performed_by_name || ''} (${log.performed_by_email})`} />
                        )}
                        {log.target_type && (
                          <Detail label="Target" value={`${log.target_type} / ${log.target_id || '—'}`} />
                        )}
                        {log.old_value && (
                          <DetailJSON label="Old Value" value={log.old_value} />
                        )}
                        {log.new_value && (
                          <DetailJSON label="New Value" value={log.new_value} />
                        )}
                        {log.metadata && (
                          <DetailJSON label="Metadata" value={log.metadata} />
                        )}
                        <Detail label="IP Address" value={log.ip_address || '—'} />
                        <Detail label="Log ID" value={log.id} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {response.pagination && response.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between card p-4">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Page {response.pagination.page} of {response.pagination.totalPages} ({response.pagination.total} total)
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="btn-secondary text-xs py-2 px-3 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={page >= response.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn-secondary text-xs py-2 px-3 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  );
}

function DetailJSON({ label, value }: { label: string; value: unknown }) {
  let display: string;
  try {
    display = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    display = String(value);
  }
  return (
    <div className="col-span-full">
      <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <pre className="text-xs p-3 rounded-lg bg-surface-50 dark:bg-surface-900 overflow-x-auto" style={{ color: 'var(--text-primary)' }}>
        {display}
      </pre>
    </div>
  );
}
