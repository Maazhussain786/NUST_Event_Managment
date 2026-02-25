'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Calendar,
  Search,
  CheckCircle2,
  XCircle,
  MapPin,
  Users,
  Clock,
  Ticket,
} from 'lucide-react';
import { StatusBadge } from '../_components/StatusBadge';
import { PageLoader, ErrorState, EmptyState } from '../_components/Shared';
import { fetchEvents, patchEvent } from '../api';
import type { AdminEvent, EventStatus } from '../types';

const STATUS_TABS: { label: string; value: EventStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function EventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EventStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reasonModal, setReasonModal] = useState<{ id: string; action: string } | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchEvents(activeTab === 'ALL' ? undefined : activeTab);
      setEvents(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: string, actionReason?: string) => {
    setActionLoading(id);
    try {
      await patchEvent(id, action, actionReason);
      setReasonModal(null);
      setReason('');
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = events.filter((e) =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    (e.society_name && e.society_name.toLowerCase().includes(search.toLowerCase()))
  );

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Events</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Review and manage all platform events
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`chip ${activeTab === tab.value ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events or societies..."
          className="input-field pl-10"
        />
      </div>

      {/* Content */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState message="No events found" />
      ) : (
        <div className="space-y-3">
          {filtered.map((evt) => (
            <div key={evt.id} className="card p-5">
              <div className="flex items-start gap-4">
                {/* Banner or fallback */}
                <div className="w-16 h-16 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center shrink-0 overflow-hidden">
                  {evt.banner_url ? (
                    <img src={evt.banner_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Calendar className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{evt.title}</h3>
                    <StatusBadge status={evt.status} />
                  </div>
                  <p className="text-xs mt-1 line-clamp-1" style={{ color: 'var(--text-secondary)' }}>
                    {evt.description}
                  </p>

                  {/* Society */}
                  {evt.society_name && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {evt.society_logo && (
                        <img src={evt.society_logo} alt="" className="w-4 h-4 rounded-full object-cover" />
                      )}
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {evt.society_name}
                      </span>
                    </div>
                  )}

                  {/* Meta */}
                  <div className="flex items-center gap-4 mt-2 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatDate(evt.start_date)} {formatTime(evt.start_date)}
                    </span>
                    {evt.venue && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {evt.venue}
                      </span>
                    )}
                    {evt.capacity && (
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {evt.capacity}
                      </span>
                    )}
                    {evt.ticket_price !== null && evt.ticket_price !== undefined && Number(evt.ticket_price) > 0 && (
                      <span className="flex items-center gap-1">
                        <Ticket className="w-3 h-3" /> Rs. {Number(evt.ticket_price).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {evt.status === 'PENDING' && (
                    <>
                      <button
                        disabled={actionLoading === evt.id}
                        onClick={() => handleAction(evt.id, 'APPROVED')}
                        className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400
                          hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                        title="Approve"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        disabled={actionLoading === evt.id}
                        onClick={() => { setReasonModal({ id: evt.id, action: 'REJECTED' }); setReason(''); }}
                        className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400
                          hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                        title="Reject"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {evt.status === 'APPROVED' && (
                    <button
                      disabled={actionLoading === evt.id}
                      onClick={() => { setReasonModal({ id: evt.id, action: 'CANCELLED' }); setReason(''); }}
                      className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400
                        hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                      title="Cancel Event"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reason Modal */}
      {reasonModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <div className="card p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              {reasonModal.action === 'REJECTED' ? 'Reject Event' : 'Cancel Event'}
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Provide a reason for this action.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason..."
              rows={3}
              className="input-field mb-4 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setReasonModal(null); setReason(''); }}
                className="btn-secondary text-sm py-2.5 px-4"
              >
                Cancel
              </button>
              <button
                disabled={!reason.trim() || actionLoading === reasonModal.id}
                onClick={() => handleAction(reasonModal.id, reasonModal.action, reason)}
                className="btn-primary text-sm py-2.5 px-4 disabled:opacity-50"
              >
                {actionLoading === reasonModal.id ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
