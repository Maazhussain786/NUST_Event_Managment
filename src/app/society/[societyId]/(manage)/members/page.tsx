'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Search, UserMinus,
  Crown, ArrowUpDown, Pencil, Send, X,
} from 'lucide-react';
import {
  fetchMembers,
  fetchMyRole,
  removeMember,
  fetchWings,
  fetchSocietyInvites,
  createSocietyInvite,
  SocietyApiError,
  type SocietyInvite,
} from '../../../api';
import { PageLoader, ErrorState, EmptyState, StatusBadge, ConfirmDialog } from '../../../_components/Shared';
import { RoleEditDialog } from '../../../_components/RoleEditDialog';
import type { SocietyMember, RoleName, MyRole, Wing } from '../../../types';

const ROLE_COLORS: Record<string, string> = {
  'President': 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  'Vice President': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'Director': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'Deputy Director': 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  'Member': 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};

export default function MembersPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [members, setMembers] = useState<SocietyMember[]>([]);
  const [myRole, setMyRole] = useState<MyRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [removeTarget, setRemoveTarget] = useState<SocietyMember | null>(null);
  const [editTarget, setEditTarget] = useState<SocietyMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'hierarchy' | 'name' | 'date'>('hierarchy');
  const [wings, setWings] = useState<Wing[]>([]);
  const [invites, setInvites] = useState<SocietyInvite[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<RoleName | ''>('');
  const [inviteWingId, setInviteWingId] = useState('');
  const [invitePortfolioId, setInvitePortfolioId] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const isPresident = myRole?.role_name === 'President';
  const canManageAssignments = isPresident;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, roleData] = await Promise.all([
        fetchMembers(societyId),
        fetchMyRole(societyId),
      ]);
      setMembers(data);
      setMyRole(roleData.role);

      if (roleData.role?.role_name === 'President') {
        const [wingsData, invitesData] = await Promise.all([
          fetchWings(societyId),
          fetchSocietyInvites(societyId),
        ]);
        setWings(wingsData);
        setInvites(invitesData);
      } else {
        setWings([]);
        setInvites([]);
      }
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        setError(err.message);
      } else {
        setError('Failed to load members');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, router]);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      setRemoving(true);
      await removeMember(societyId, removeTarget.membership_id);
      setToast(`${removeTarget.full_name} removed`);
      setRemoveTarget(null);
      load();
    } catch (err) {
      if (err instanceof SocietyApiError) setToast(err.message);
      else setToast('Failed to remove member');
    } finally {
      setRemoving(false);
    }
  };

  const handleRoleUpdateSuccess = () => {
    setToast('Role updated successfully');
    load();
  };

  const resetInviteForm = () => {
    setInviteEmail('');
    setInviteRole('');
    setInviteWingId('');
    setInvitePortfolioId('');
    setInviteError(null);
  };

  const handleCreateInvite = async () => {
    if (!canManageAssignments) {
      setInviteError('Only President can send governance invites.');
      return;
    }

    const email = inviteEmail.trim().toLowerCase();
    if (!email || !inviteRole) {
      setInviteError('Email and role are required.');
      return;
    }

    if (inviteRole === 'Vice President' && !inviteWingId) {
      setInviteError('Vice President invite requires a wing.');
      return;
    }

    if ((inviteRole === 'Director' || inviteRole === 'Deputy Director') && (!inviteWingId || !invitePortfolioId)) {
      setInviteError('Director/Deputy Director invite requires wing and portfolio.');
      return;
    }

    setInviteSubmitting(true);
    setInviteError(null);
    try {
      await createSocietyInvite({
        societyId,
        email,
        roleName: inviteRole,
        wingId: inviteWingId || undefined,
        portfolioId: ['Director', 'Deputy Director'].includes(inviteRole) ? (invitePortfolioId || undefined) : undefined,
      });

      setToast(`Invite sent to ${email}`);
      setShowInviteModal(false);
      resetInviteForm();
      const latestInvites = await fetchSocietyInvites(societyId);
      setInvites(latestInvites);
    } catch (err) {
      if (err instanceof SocietyApiError) setInviteError(err.message);
      else setInviteError('Failed to create invite');
    } finally {
      setInviteSubmitting(false);
    }
  };

  // Check if current user can edit a member's role
  const canEditRole = (member: SocietyMember): boolean => {
    if (!canManageAssignments || !myRole) return false;
    // Cannot edit equal or higher ranked members
    if (member.hierarchy_level >= myRole.hierarchy_level) return false;
    // Cannot edit President (use transfer-presidency)
    if (member.role_name === 'President') return false;
    return true;
  };

  // Check if current user can remove a member
  const canRemove = (member: SocietyMember): boolean => {
    if (!canManageAssignments || !myRole) return false;
    if (member.hierarchy_level >= myRole.hierarchy_level) return false;
    if (member.role_name === 'President') return false;
    return true;
  };

  // Filter & sort
  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    const matchesSearch = !q || m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
    const matchesRole = !roleFilter || m.role_name === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (sortBy === 'name') filtered.sort((a, b) => a.full_name.localeCompare(b.full_name));
  else if (sortBy === 'date') filtered.sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime());
  // hierarchy is default from API

  const roles = Array.from(new Set(members.map(m => m.role_name)));
  const invitePortfolios = wings.find(w => w.id === inviteWingId)?.portfolios || [];

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute -translate-y-1/2 left-3 top-1/2 text-muted" />
          <input
            className="input-field pl-9"
            placeholder="Search members..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {canManageAssignments && (
            <button
              onClick={() => {
                resetInviteForm();
                setShowInviteModal(true);
              }}
              className="flex items-center gap-1 px-3 py-2 text-sm btn-primary"
              title="Invite member"
            >
              <Send size={14} /> Invite Member
            </button>
          )}
          <select
            className="text-sm input-field"
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            <option value="">All Roles</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button
            onClick={() => setSortBy(sortBy === 'hierarchy' ? 'name' : sortBy === 'name' ? 'date' : 'hierarchy')}
            className="flex items-center gap-1 px-3 py-2 text-sm btn-ghost"
            title={`Sort by ${sortBy}`}
          >
            <ArrowUpDown size={14} /> {sortBy === 'hierarchy' ? 'Rank' : sortBy === 'name' ? 'Name' : 'Date'}
          </button>
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-muted">
        {filtered.length} member{filtered.length !== 1 ? 's' : ''} {roleFilter ? `(${roleFilter})` : ''}
      </p>

      {canManageAssignments && (
        <div className="p-3 border rounded-lg border-surface-300/70 dark:border-surface-700">
          <p className="text-xs text-muted mb-2">Recent Invites</p>
          {invites.length === 0 ? (
            <p className="text-xs text-muted">No invites sent yet.</p>
          ) : (
            <div className="space-y-2">
              {invites.slice(0, 5).map((invite) => (
                <div key={invite.id} className="flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    <p className="truncate text-primary">{invite.invited_email}</p>
                    <p className="text-muted">
                      {invite.role_name}
                      {invite.wing_name ? ` • ${invite.wing_name}` : ''}
                      {invite.portfolio_name ? ` • ${invite.portfolio_name}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={invite.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Members list */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState message="No members found" />
      ) : (
        <div className="space-y-2">
          {filtered.map(member => (
            <div key={member.membership_id} className="p-4 card">
              <div className="flex items-center gap-3">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" className="flex-shrink-0 object-cover w-10 h-10 rounded-full" />
                ) : (
                  <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 text-sm font-bold rounded-full bg-brand-500/10 text-brand-500">
                    {member.full_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate text-primary">{member.full_name}</p>
                    {member.role_name === 'President' && <Crown size={14} className="flex-shrink-0 text-amber-500" />}
                  </div>
                  <p className="text-xs text-muted">{member.email}</p>
                  <div className="flex flex-wrap mt-1 gap-x-3 gap-y-1">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[member.role_name] || ROLE_COLORS.Member}`}>
                      {member.role_name}
                    </span>
                    {member.wing_name && (
                      <span className="text-[11px] text-muted">
                        {member.wing_name}{member.portfolio_name ? ` → ${member.portfolio_name}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {/* Edit role button (VP+ only, for lower-ranked members) */}
                  {canEditRole(member) && (
                    <button
                      onClick={() => setEditTarget(member)}
                      className="btn-ghost text-xs px-2 py-1.5 text-brand-500 hover:bg-brand-500/10"
                      title="Edit role"
                    >
                      <Pencil size={16} />
                    </button>
                  )}

                  {/* Remove action (only if you outrank them) */}
                  {canRemove(member) && (
                    <button
                      onClick={() => setRemoveTarget(member)}
                      className="btn-ghost text-xs px-2 py-1.5 text-red-500 hover:bg-red-500/10"
                      title="Remove member"
                    >
                      <UserMinus size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Role Edit Dialog */}
      <RoleEditDialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        member={editTarget}
        societyId={societyId}
        myLevel={myRole?.hierarchy_level || 0}
        onSuccess={handleRoleUpdateSuccess}
      />

      {/* Remove confirm */}
      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove Member"
        message={`Remove ${removeTarget?.full_name} from this society? This action can be undone by re-inviting them.`}
        confirmText="Remove"
        variant="danger"
        loading={removing}
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Invite modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl bg-surface-0 dark:bg-surface-900 border border-surface-300 dark:border-surface-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-primary">Invite Member</h3>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  resetInviteForm();
                }}
                className="btn-ghost p-1"
                aria-label="Close invite modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-primary mb-1">Email</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="member@seecs.edu.pk"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-primary mb-1">Role</label>
                <select
                  className="input-field"
                  value={inviteRole}
                  onChange={(e) => {
                    const nextRole = e.target.value as RoleName | '';
                    setInviteRole(nextRole);
                    if (nextRole === 'Member') {
                      setInvitePortfolioId('');
                    }
                    if (nextRole !== 'Director' && nextRole !== 'Deputy Director') {
                      setInvitePortfolioId('');
                    }
                  }}
                >
                  <option value="">Select role...</option>
                  <option value="Vice President">Vice President</option>
                  <option value="Director">Director</option>
                  <option value="Deputy Director">Deputy Director</option>
                  <option value="Member">Member</option>
                </select>
              </div>

              {(inviteRole === 'Vice President' || inviteRole === 'Director' || inviteRole === 'Deputy Director' || inviteRole === 'Member') && (
                <div>
                  <label className="block text-xs font-medium text-primary mb-1">
                    Wing{inviteRole === 'Member' ? ' (optional)' : ''}
                  </label>
                  <select
                    className="input-field"
                    value={inviteWingId}
                    onChange={(e) => {
                      setInviteWingId(e.target.value);
                      setInvitePortfolioId('');
                    }}
                  >
                    <option value="">{inviteRole === 'Member' ? 'No wing' : 'Select wing...'}</option>
                    {wings.map((wing) => (
                      <option key={wing.id} value={wing.id}>{wing.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {(inviteRole === 'Director' || inviteRole === 'Deputy Director') && inviteWingId && (
                <div>
                  <label className="block text-xs font-medium text-primary mb-1">Portfolio</label>
                  <select
                    className="input-field"
                    value={invitePortfolioId}
                    onChange={(e) => setInvitePortfolioId(e.target.value)}
                  >
                    <option value="">Select portfolio...</option>
                    {invitePortfolios.map((portfolio) => (
                      <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {inviteError && (
                <div className="text-xs text-red-500 bg-red-500/10 rounded-md px-2 py-1.5">
                  {inviteError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  className="btn-ghost text-xs px-3 py-2"
                  onClick={() => {
                    setShowInviteModal(false);
                    resetInviteForm();
                  }}
                  disabled={inviteSubmitting}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary text-xs px-3 py-2"
                  onClick={handleCreateInvite}
                  disabled={inviteSubmitting || !inviteEmail.trim() || !inviteRole}
                >
                  {inviteSubmitting ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
