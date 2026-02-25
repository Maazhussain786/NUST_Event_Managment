'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  User,
  Shield,
  GraduationCap,
  Building2,
} from 'lucide-react';
import { PageLoader, ErrorState, EmptyState } from '../_components/Shared';
import { fetchUsers } from '../api';
import type { AdminUser } from '../types';

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'SUPER_ADMIN' | 'STUDENT'>('ALL');

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

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.user_type === roleFilter;
    return matchesSearch && matchesRole;
  });

  const superAdminCount = users.filter(u => u.user_type === 'SUPER_ADMIN').length;
  const studentCount = users.filter(u => u.user_type === 'STUDENT').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Users</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          View all platform users and their roles
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
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
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
        {(['ALL', 'SUPER_ADMIN', 'STUDENT'] as const).map((role) => (
          <button
            key={role}
            onClick={() => setRoleFilter(role)}
            className={`chip ${roleFilter === role ? 'active' : ''}`}
          >
            {role === 'ALL' ? 'All' : role === 'SUPER_ADMIN' ? 'Admins' : 'Students'}
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
            <div className="col-span-4">User</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-1">Societies</div>
            <div className="col-span-2">Joined</div>
          </div>

          {filtered.map((user) => (
            <div key={user.id} className="card px-5 py-4">
              <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center space-y-2 md:space-y-0">
                {/* User */}
                <div className="col-span-4 flex items-center gap-3 min-w-0">
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
                <div className="col-span-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    user.user_type === 'SUPER_ADMIN'
                      ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  }`}>
                    {user.user_type === 'SUPER_ADMIN' ? (
                      <><Shield className="w-3 h-3" /> Admin</>
                    ) : (
                      <><GraduationCap className="w-3 h-3" /> Student</>
                    )}
                  </span>
                </div>

                {/* Societies */}
                <div className="col-span-1">
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <Building2 className="w-3 h-3" /> {user.society_count || 0}
                  </span>
                </div>

                {/* Joined */}
                <div className="col-span-2">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
