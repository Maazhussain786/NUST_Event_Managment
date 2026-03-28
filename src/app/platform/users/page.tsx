'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  User,
  Shield,
  GraduationCap,
  Building2,
  Ban,
  CheckCircle2,
  Eye,
  Loader2,
  X,
  Calendar,
  FileText,
} from 'lucide-react';
import { PageLoader, ErrorState, EmptyState, StatusBadge } from '../_components/Shared';
import { fetchUsers, fetchUserDetail, suspendUser, reactivateUser } from '../api';
import type { AdminUser, UserDetail } from '../types';
import { SmartImage } from '@/components/SmartImage';

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'SUPER_ADMIN' | 'STUDENT'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [suspendModal, setSuspendModal] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  // Detail drawer
  const [detailUser, setDetailUser] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchUsers();
      setUsers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSuspend = async (id: string) => {
    if (!suspendReason.trim()) return;
    setActionLoading(id);
    try {
      await suspendUser(id, suspendReason.trim());
      setSuspendModal(null);
      setSuspendReason('');
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Suspend failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (id: string) => {
    setActionLoading(id);
    try {
      await reactivateUser(id);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Reactivate failed');
    } finally {
      setActionLoading(null);
    }
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const data = await fetchUserDetail(id);
      setDetailUser(data);
    } catch {
      alert('Failed to load user details');
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.user_type === roleFilter;
    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const superAdminCount = users.filter(u => u.user_type === 'SUPER_ADMIN').length;
  const studentCount = users.filter(u => u.user_type === 'STUDENT').length;
  const suspendedCount = users.filter(u => u.status === 'SUSPENDED').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Users</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Manage all platform users — view profiles, suspend, and reactivate
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{users.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Total Users</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-brand-500">{superAdminCount}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Admins</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-blue-500">{studentCount}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Students</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{suspendedCount}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Suspended</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
          {(['ALL', 'SUPER_ADMIN', 'STUDENT'] as const).map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`chip ${roleFilter === role ? 'active' : ''}`}
            >
              {role === 'ALL' ? 'All Roles' : role === 'SUPER_ADMIN' ? 'Admins' : 'Students'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {(['ALL', 'ACTIVE', 'SUSPENDED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`chip ${statusFilter === st ? 'active' : ''}`}
            >
              {st === 'ALL' ? 'All Status' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="input-field pl-10"
        />
      </div>

      {/* Content */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState message="No users found" />
      ) : (
        <div className="space-y-2">
          {/* Table Header (Desktop) */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            <div className="col-span-3">User</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-1">Role</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Societies</div>
            <div className="col-span-1">Joined</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {filtered.map((user) => (
            <div key={user.id} className="card px-5 py-4">
              <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center space-y-2 md:space-y-0">
                {/* User */}
                <div className="col-span-3 flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center shrink-0 overflow-hidden">
                    <User className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {user.full_name}
                  </p>
                </div>

                {/* Email */}
                <div className="col-span-3">
                  <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{user.email}</p>
                </div>

                {/* Role */}
                <div className="col-span-1">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    user.user_type === 'SUPER_ADMIN'
                      ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  }`}>
                    {user.user_type === 'SUPER_ADMIN' ? (
                      <Shield className="w-3 h-3" />
                    ) : (
                      <GraduationCap className="w-3 h-3" />
                    )}
                  </span>
                </div>

                {/* Status */}
                <div className="col-span-1">
                  <StatusBadge status={user.status} />
                </div>

                {/* Societies */}
                <div className="col-span-1">
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <Building2 className="w-3 h-3" /> {user.society_count || 0}
                  </span>
                </div>

                {/* Joined */}
                <div className="col-span-1">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions */}
                <div className="col-span-2 flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => openDetail(user.id)}
                    className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                    title="View Details"
                  >
                    <Eye className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                  </button>
                  {user.user_type === 'STUDENT' && user.status !== 'SUSPENDED' && (
                    <button
                      disabled={actionLoading === user.id}
                      onClick={() => { setSuspendModal(user.id); setSuspendReason(''); }}
                      className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400
                        hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                      title="Suspend User"
                    >
                      {actionLoading === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                    </button>
                  )}
                  {user.status === 'SUSPENDED' && (
                    <button
                      disabled={actionLoading === user.id}
                      onClick={() => handleReactivate(user.id)}
                      className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400
                        hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                      title="Reactivate User"
                    >
                      {actionLoading === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Suspend Modal */}
      {suspendModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <div className="card p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Suspend User</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              This user will be suspended and unable to access the platform.
            </p>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Reason for suspension..."
              rows={3}
              className="input-field mb-4 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSuspendModal(null)} className="btn-secondary text-sm py-2.5 px-4">
                Cancel
              </button>
              <button
                disabled={!suspendReason.trim() || actionLoading === suspendModal}
                onClick={() => handleSuspend(suspendModal)}
                className="btn-primary text-sm py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === suspendModal ? 'Suspending...' : 'Suspend User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Drawer */}
      {(detailUser || detailLoading) && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/50">
          <div className="card w-full max-w-lg h-full overflow-y-auto rounded-none rounded-l-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>User Details</h3>
              <button onClick={() => setDetailUser(null)} className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800">
                <X className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            {detailLoading ? (
              <PageLoader />
            ) : detailUser ? (
              <>
                {/* Profile Header */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center overflow-hidden">
                    {detailUser.avatar_url ? (
                      <SmartImage src={detailUser.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                    )}
                  </div>
                  <div>
                    <h4 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{detailUser.full_name}</h4>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{detailUser.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={detailUser.status} />
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        detailUser.user_type === 'SUPER_ADMIN'
                          ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      }`}>
                        {detailUser.user_type}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Memberships */}
                {detailUser.memberships.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                      <Building2 className="w-3.5 h-3.5" /> Society Memberships
                    </h5>
                    <div className="space-y-1.5">
                      {detailUser.memberships.map((m) => (
                        <div key={m.society_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.society_name}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-100 dark:bg-surface-700" style={{ color: 'var(--text-secondary)' }}>
                            {m.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Events */}
                {detailUser.events.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                      <Calendar className="w-3.5 h-3.5" /> Event Registrations
                    </h5>
                    <div className="space-y-1.5">
                      {detailUser.events.slice(0, 10).map((ev) => (
                        <div key={ev.event_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{ev.event_title}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{ev.society_name}</p>
                          </div>
                          <StatusBadge status={ev.status} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Audit Logs */}
                {detailUser.auditLogs.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                      <FileText className="w-3.5 h-3.5" /> Recent Activity
                    </h5>
                    <div className="space-y-1.5">
                      {detailUser.auditLogs.slice(0, 15).map((log, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
                          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{log.action}</p>
                          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}


