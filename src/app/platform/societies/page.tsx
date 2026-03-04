'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Building2,
  Search,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Ban,
  RotateCcw,
  Users,
  Calendar,
} from 'lucide-react';
import { StatusBadge } from '../_components/StatusBadge';
import { PageLoader, ErrorState, EmptyState } from '../_components/Shared';
import { fetchSocieties, patchSociety, suspendSociety, reactivateSociety } from '../api';
import type { AdminSociety, SocietyStatus } from '../types';

const STATUS_TABS: { label: string; value: SocietyStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Info Requested', value: 'INFO_REQUESTED' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Suspended', value: 'SUSPENDED' },
  { label: 'Deactivated', value: 'DEACTIVATED' },
];

export default function SocietiesPage() {
  const [societies, setSocieties] = useState<AdminSociety[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SocietyStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reasonModal, setReasonModal] = useState<{ id: string; action: string } | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSocieties(activeTab === 'ALL' ? undefined : activeTab);
      setSocieties(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load societies');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: string, actionReason?: string) => {
    setActionLoading(id);
    try {
      if (action === 'SUSPEND') {
        await suspendSociety(id, actionReason || 'Suspended by SuperAdmin');
      } else if (action === 'REACTIVATE') {
        await reactivateSociety(id, actionReason);
      } else {
        await patchSociety(id, action, actionReason);
      }
      setReasonModal(null);
      setReason('');
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = societies.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.created_by_name && s.created_by_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Societies</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Manage society registrations, approvals, and status
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
          placeholder="Search societies..."
          className="input-field pl-10"
        />
      </div>

      {/* Content */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState message="No societies found" />
      ) : (
        <div className="space-y-3">
          {filtered.map((soc) => (
            <div key={soc.id} className="card p-5">
              <div className="flex items-start gap-4">
                {/* Logo */}
                <div className="w-12 h-12 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center shrink-0 overflow-hidden">
                  {soc.logo_url ? (
                    <img src={soc.logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/platform/societies/${soc.id}`}
                      className="text-sm font-bold hover:text-brand-500 transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {soc.name}
                    </Link>
                    <StatusBadge status={soc.status} />
                    {soc.category && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800"
                        style={{ color: 'var(--text-secondary)' }}>
                        {soc.category}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1 line-clamp-1" style={{ color: 'var(--text-secondary)' }}>
                    {soc.description}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {soc.member_count} members
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {soc.event_count} events
                    </span>
                    {soc.created_by_name && (
                      <span>by {soc.created_by_name}</span>
                    )}
                    <span>{new Date(soc.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {(soc.status === 'PENDING' || soc.status === 'INFO_REQUESTED') && (
                    <>
                      <button
                        disabled={actionLoading === soc.id}
                        onClick={() => handleAction(soc.id, 'APPROVED')}
                        className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400
                          hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                        title="Approve"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        disabled={actionLoading === soc.id}
                        onClick={() => { setReasonModal({ id: soc.id, action: 'REJECTED' }); setReason(''); }}
                        className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400
                          hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                        title="Reject"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {soc.status === 'APPROVED' && (
                    <button
                      disabled={actionLoading === soc.id}
                      onClick={() => { setReasonModal({ id: soc.id, action: 'SUSPEND' }); setReason(''); }}
                      className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400
                        hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50"
                      title="Suspend"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                  {(soc.status === 'SUSPENDED' || soc.status === 'DEACTIVATED') && (
                    <button
                      disabled={actionLoading === soc.id}
                      onClick={() => handleAction(soc.id, 'REACTIVATE')}
                      className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400
                        hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                      title="Reactivate"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  <Link
                    href={`/platform/societies/${soc.id}`}
                    className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
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
              {reasonModal.action === 'REJECTED' ? 'Reject Society' : 'Suspend Society'}
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Please provide a reason for this action.
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
