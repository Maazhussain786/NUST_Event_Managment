'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  UserCog,
  Shield,
  Clock,
  Plus,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { StatusBadge } from '../_components/StatusBadge';
import { PageLoader, ErrorState, EmptyState } from '../_components/Shared';
import { fetchAdministrators, addAdministrator, fetchUsers } from '../api';
import type { Administrator, AdminUser } from '../types';

export default function AdministratorsPage() {
  const [admins, setAdmins] = useState<Administrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPromote, setShowPromote] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promotionMsg, setPromotionMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAdministrators();
      setAdmins(data.administrators);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load administrators');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openPromoteModal = async () => {
    setShowPromote(true);
    setPromotionMsg('');
    setUserSearch('');
    try {
      const allUsers = await fetchUsers();
      setUsers(allUsers.filter(u => u.user_type === 'STUDENT'));
    } catch {
      setUsers([]);
    }
  };

  const handlePromote = async (userId: string) => {
    setPromoting(true);
    setPromotionMsg('');
    try {
      const res = await addAdministrator(userId);
      setPromotionMsg(res.message || 'User promoted successfully');
      setShowPromote(false);
      await load();
    } catch (err: unknown) {
      setPromotionMsg(err instanceof Error ? err.message : 'Promotion failed');
    } finally {
      setPromoting(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Administrators</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Manage platform administrators and their activity
          </p>
        </div>
        <button onClick={openPromoteModal} className="btn-primary text-sm py-2.5 px-4 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Administrator
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-brand-500">{admins.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Total Admins</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {admins.filter(a => a.status === 'ACTIVE').length}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Active</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {admins.reduce((sum, a) => sum + parseInt(a.action_count || '0'), 0)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Total Actions</p>
        </div>
      </div>

      {promotionMsg && (
        <div className="card p-4 text-sm font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20">
          {promotionMsg}
        </div>
      )}

      {/* Admin List */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : admins.length === 0 ? (
        <EmptyState message="No administrators found" />
      ) : (
        <div className="space-y-2">
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            <div className="col-span-4">Administrator</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Actions Taken</div>
            <div className="col-span-2">Last Active</div>
            <div className="col-span-2">Since</div>
          </div>

          {admins.map((admin) => (
            <div key={admin.id} className="card px-5 py-4">
              <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center space-y-2 md:space-y-0">
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-brand-500/15 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-brand-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {admin.full_name}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{admin.email}</p>
                  </div>
                </div>

                <div className="col-span-2">
                  <StatusBadge status={admin.status} />
                </div>

                <div className="col-span-2">
                  <span className="flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    <UserCog className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    {admin.action_count || '0'}
                  </span>
                </div>

                <div className="col-span-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(admin.last_active_at ?? admin.last_action_at ?? admin.updated_at ?? admin.created_at)}
                  </span>
                </div>

                <div className="col-span-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {formatDate(admin.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Promote Modal */}
      {showPromote && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <div className="card p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Promote User to Administrator
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Select a student to grant SuperAdmin privileges.
            </p>

            <div className="card p-3 mb-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  This action grants full platform control. This cannot be undone from this interface.
                </p>
              </div>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users by name or email..."
                className="input-field pl-10"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>No eligible users found</p>
              ) : (
                filteredUsers.slice(0, 20).map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{u.full_name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{u.email}</p>
                    </div>
                    <button
                      disabled={promoting}
                      onClick={() => handlePromote(u.id)}
                      className="btn-primary text-xs py-1.5 px-3 shrink-0 disabled:opacity-50"
                    >
                      Promote
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end mt-4 pt-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
              <button onClick={() => setShowPromote(false)} className="btn-secondary text-sm py-2.5 px-4">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
