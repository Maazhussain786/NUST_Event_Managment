'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Ticket, Check, X, RotateCcw, Filter, Eye,
  CheckSquare, Image, AlertTriangle,
} from 'lucide-react';
import { fetchPendingTickets, reviewTicket, bulkReviewTickets, SocietyApiError } from '../../../api';
import { PageLoader, ErrorState, EmptyState, StatusBadge, StatCard, ConfirmDialog } from '../../../_components/Shared';
import type { PendingTicket, TicketStatus } from '../../../types';

const FILTER_TABS: { label: string; value: string }[] = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Needs Reupload', value: 'NEEDS_REUPLOAD' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'All', value: '' },
];

export default function TicketApprovalsPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [tickets, setTickets] = useState<PendingTicket[]>([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('PENDING');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ id: string; action: 'REJECT' | 'NEEDS_REUPLOAD' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [bulkAction, setBulkAction] = useState<'APPROVE' | 'REJECT' | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPendingTickets(societyId, filter || undefined);
      setTickets(data.tickets);
      setStats(data.stats);
      setSelected(new Set());
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        if (err.status === 403) { setError('Access denied'); return; }
        setError(err.message);
      } else {
        setError('Failed to load tickets');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, filter, router]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (ticketId: string, action: 'APPROVE' | 'REJECT' | 'NEEDS_REUPLOAD', reason?: string) => {
    try {
      setActing(ticketId);
      await reviewTicket(societyId, ticketId, { action, reason });
      setToast(`Ticket ${action.toLowerCase()}d successfully`);
      load();
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 409) {
          setToast('Conflict: ticket already processed. Refreshing...');
          load();
          return;
        }
        setToast(err.message);
      } else {
        setToast('Action failed');
      }
    } finally {
      setActing(null);
      setRejectDialog(null);
      setRejectReason('');
    }
  };

  const handleBulk = async (action: 'APPROVE' | 'REJECT') => {
    if (selected.size === 0) return;
    try {
      setActing('bulk');
      const result = await bulkReviewTickets(societyId, {
        ticketIds: Array.from(selected),
        action,
        reason: action === 'REJECT' ? rejectReason || undefined : undefined,
      });
      setToast(`${result.processed} tickets ${action.toLowerCase()}d${result.failed > 0 ? `, ${result.failed} failed` : ''}`);
      load();
    } catch (err) {
      if (err instanceof SocietyApiError) setToast(err.message);
      else setToast('Bulk action failed');
    } finally {
      setActing(null);
      setBulkAction(null);
      setRejectReason('');
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === tickets.length) setSelected(new Set());
    else setSelected(new Set(tickets.map(t => t.id)));
  };

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Pending" value={stats.pending} icon={Ticket} accent="amber" />
        <StatCard label="Approved" value={stats.approved} icon={Check} accent="green" />
        <StatCard label="Rejected" value={stats.rejected} icon={X} accent="red" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        <Filter size={16} className="text-muted flex-shrink-0" />
        {FILTER_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`chip text-xs whitespace-nowrap ${filter === tab.value ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="card p-3 flex items-center gap-3 bg-brand-500/5">
          <span className="text-sm text-primary font-medium">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setBulkAction('APPROVE')}
              disabled={acting === 'bulk'}
              className="bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-600 disabled:opacity-50"
            >
              Approve All
            </button>
            <button
              onClick={() => setBulkAction('REJECT')}
              disabled={acting === 'bulk'}
              className="bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              Reject All
            </button>
          </div>
        </div>
      )}

      {/* Tickets list */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tickets.length === 0 ? (
        <EmptyState message={`No ${filter.toLowerCase().replace(/_/g, ' ')} tickets`} />
      ) : (
        <div className="space-y-2">
          {/* Select all */}
          {filter === 'PENDING' && tickets.length > 1 && (
            <button onClick={toggleAll} className="text-xs text-brand-500 hover:underline flex items-center gap-1 mb-1">
              <CheckSquare size={14} /> {selected.size === tickets.length ? 'Deselect all' : 'Select all'}
            </button>
          )}

          {tickets.map(ticket => (
            <div key={ticket.id} className="card p-4">
              <div className="flex items-start gap-3">
                {/* Checkbox for pending */}
                {(ticket.status === 'PENDING' || ticket.status === 'PENDING_VERIFICATION') && (
                  <input
                    type="checkbox"
                    checked={selected.has(ticket.id)}
                    onChange={() => toggleSelect(ticket.id)}
                    className="mt-1 accent-brand-500"
                  />
                )}

                {/* User info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-primary truncate">{ticket.user_name}</p>
                    <StatusBadge status={ticket.status} />
                  </div>
                  <p className="text-xs text-muted mb-1">{ticket.user_email}</p>
                  <p className="text-xs text-secondary">
                    <span className="font-medium">Event:</span> {ticket.event_title}
                    <span className="mx-2">•</span>
                    <span className="font-medium">Amount:</span> Rs. {Number(ticket.amount).toLocaleString()}
                    <span className="mx-2">•</span>
                    <span className="font-medium">Ref:</span> {ticket.payment_reference}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Purchased: {new Date(ticket.purchased_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </p>
                  {ticket.rejection_reason && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertTriangle size={12} /> {ticket.rejection_reason}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {ticket.payment_proof_url && (
                    <button
                      onClick={() => setProofUrl(ticket.payment_proof_url)}
                      className="btn-ghost text-xs px-2 py-1.5 flex items-center gap-1"
                      title="View proof"
                    >
                      <Image size={14} />
                    </button>
                  )}

                  {(ticket.status === 'PENDING' || ticket.status === 'PENDING_VERIFICATION') && (
                    <>
                      <button
                        onClick={() => handleReview(ticket.id, 'APPROVE')}
                        disabled={acting === ticket.id}
                        className="bg-green-500 text-white text-xs px-2.5 py-1.5 rounded-lg hover:bg-green-600 disabled:opacity-50"
                        title="Approve"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setRejectDialog({ id: ticket.id, action: 'REJECT' })}
                        disabled={acting === ticket.id}
                        className="bg-red-500 text-white text-xs px-2.5 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50"
                        title="Reject"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => setRejectDialog({ id: ticket.id, action: 'NEEDS_REUPLOAD' })}
                        disabled={acting === ticket.id}
                        className="btn-ghost text-xs px-2.5 py-1.5"
                        title="Request reupload"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject reason dialog */}
      {rejectDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-primary mb-2">
              {rejectDialog.action === 'REJECT' ? 'Reject Ticket' : 'Request Reupload'}
            </h3>
            <p className="text-sm text-secondary mb-3">Provide a reason (optional):</p>
            <textarea
              className="input-field min-h-[80px] mb-4"
              placeholder="Enter reason..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setRejectDialog(null); setRejectReason(''); }} className="btn-ghost text-sm px-4 py-2">
                Cancel
              </button>
              <button
                onClick={() => handleReview(rejectDialog.id, rejectDialog.action, rejectReason || undefined)}
                disabled={acting === rejectDialog.id}
                className="bg-red-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {acting === rejectDialog.id ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action confirm */}
      <ConfirmDialog
        open={bulkAction !== null}
        title={`Bulk ${bulkAction || ''}`}
        message={`${bulkAction === 'APPROVE' ? 'Approve' : 'Reject'} ${selected.size} tickets?`}
        confirmText={bulkAction === 'APPROVE' ? 'Approve All' : 'Reject All'}
        variant={bulkAction === 'APPROVE' ? 'primary' : 'danger'}
        loading={acting === 'bulk'}
        onConfirm={() => handleBulk(bulkAction!)}
        onCancel={() => setBulkAction(null)}
      />

      {/* Proof viewer */}
      {proofUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setProofUrl(null)}>
          <img src={proofUrl} alt="Payment proof" className="max-w-full max-h-[80vh] rounded-lg object-contain" />
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
