'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users2, CheckCircle, XCircle, Clock, Filter } from 'lucide-react';
import { PageLoader, ErrorState, EmptyState, StatusBadge } from '../_components/Shared';
import { StatCard } from '../_components/StatCard';
import type { CoHostRequest } from '../types';
import { fetchCoHostRequests, updateCoHostRequest } from '../api';

export default function CoHostRequestsPage() {
  const [requests, setRequests] = useState<CoHostRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [noteModal, setNoteModal] = useState<{ id: string; action: 'APPROVED' | 'REJECTED' } | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchCoHostRequests(statusFilter || undefined);
      setRequests(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDecision = async () => {
    if (!noteModal) return;
    setSubmitting(true);
    try {
      await updateCoHostRequest(noteModal.id, {
        action: noteModal.action,
        admin_note: adminNote || undefined,
      });
      setNoteModal(null);
      setAdminNote('');
      load();
    } catch { /* noop */ } finally { setSubmitting(false); }
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const pending = requests.filter((r) => r.status === 'PENDING').length;
  const approved = requests.filter((r) => r.status === 'APPROVED').length;
  const rejected = requests.filter((r) => r.status === 'REJECTED').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Co-Host Requests
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Manage inter-society event co-hosting requests
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Pending" value={pending} icon={Clock} accent="amber" />
        <StatCard label="Approved" value={approved} icon={CheckCircle} accent="green" />
        <StatCard label="Rejected" value={rejected} icon={XCircle} accent="red" />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        {['', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`chip ${statusFilter === s ? 'active' : ''}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Decision Modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              {noteModal.action === 'APPROVED' ? 'Approve' : 'Reject'} Co-Host Request
            </h2>
            <textarea className="input-field w-full" rows={3}
              placeholder="Admin note (optional)"
              value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setNoteModal(null); setAdminNote(''); }}
                className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleDecision} disabled={submitting}
                className={`flex-1 ${noteModal.action === 'APPROVED' ? 'btn-primary' : 'bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors'}`}>
                {submitting ? 'Processing...' : noteModal.action === 'APPROVED' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requests List */}
      {requests.length === 0 ? (
        <EmptyState message="No co-host requests found" />
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="card p-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                  <Users2 className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {req.event_title}
                    </h3>
                    <StatusBadge status={req.status} />
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-semibold">{req.requesting_society_name}</span>
                    {' → '}
                    <span className="font-semibold">{req.host_society_name}</span>
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Requested by {req.requested_by_name} • {new Date(req.created_at).toLocaleDateString()}
                    {req.reason && ` • "${req.reason}"`}
                  </p>
                  {req.admin_note && (
                    <p className="text-xs mt-1 italic" style={{ color: 'var(--text-muted)' }}>
                      Admin: {req.admin_note}
                    </p>
                  )}
                </div>
                {req.status === 'PENDING' && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setNoteModal({ id: req.id, action: 'APPROVED' })}
                      className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-500"
                      title="Approve">
                      <CheckCircle className="w-5 h-5" />
                    </button>
                    <button onClick={() => setNoteModal({ id: req.id, action: 'REJECTED' })}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500"
                      title="Reject">
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
