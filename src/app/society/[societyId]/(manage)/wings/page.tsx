'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Network, Plus, Trash2, ChevronDown, ChevronRight,
  Users, Shield, ToggleLeft, ToggleRight,
} from 'lucide-react';
import {
  fetchWings, createWing, deleteWing, createPortfolio,
  fetchRolePrivileges, updatePrivilege, fetchMembers,
  SocietyApiError,
} from '../../../api';
import { PageLoader, ErrorState, EmptyState, ConfirmDialog } from '../../../_components/Shared';
import type { Wing, RolePrivileges, SocietyMember } from '../../../types';

export default function WingsPortfoliosPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [wings, setWings] = useState<Wing[]>([]);
  const [members, setMembers] = useState<SocietyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedWings, setExpandedWings] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Create wing
  const [showCreateWing, setShowCreateWing] = useState(false);
  const [wingForm, setWingForm] = useState({ name: '', description: '' });
  const [creatingWing, setCreatingWing] = useState(false);

  // Create portfolio
  const [createPortfolioFor, setCreatePortfolioFor] = useState<string | null>(null);
  const [portfolioForm, setPortfolioForm] = useState({ name: '', description: '' });
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'wing'; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Privileges
  const [privilegeView, setPrivilegeView] = useState<RolePrivileges | null>(null);
  const [privilegeLoading, setPrivilegeLoading] = useState(false);
  const [togglingPrivilege, setTogglingPrivilege] = useState<string | null>(null);

  // Tab: structure or privileges
  const [tab, setTab] = useState<'structure' | 'privileges'>('structure');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [wingsData, membersData] = await Promise.all([
        fetchWings(societyId),
        fetchMembers(societyId),
      ]);
      setWings(wingsData);
      setMembers(membersData);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        setError(err.message);
      } else {
        setError('Failed to load');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, router]);

  useEffect(() => { load(); }, [load]);

  const toggleWing = (id: string) => {
    const next = new Set(expandedWings);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedWings(next);
  };

  const handleCreateWing = async () => {
    if (!wingForm.name.trim()) return;
    try {
      setCreatingWing(true);
      await createWing(societyId, {
        name: wingForm.name.trim(),
        description: wingForm.description.trim() || undefined,
      });
      setToast('Wing created');
      setShowCreateWing(false);
      setWingForm({ name: '', description: '' });
      load();
    } catch (err) {
      if (err instanceof SocietyApiError) setToast(err.message);
      else setToast('Failed to create wing');
    } finally {
      setCreatingWing(false);
    }
  };

  const handleCreatePortfolio = async () => {
    if (!portfolioForm.name.trim() || !createPortfolioFor) return;
    try {
      setCreatingPortfolio(true);
      await createPortfolio(societyId, createPortfolioFor, {
        name: portfolioForm.name.trim(),
        description: portfolioForm.description.trim() || undefined,
      });
      setToast('Portfolio created');
      setCreatePortfolioFor(null);
      setPortfolioForm({ name: '', description: '' });
      load();
    } catch (err) {
      if (err instanceof SocietyApiError) setToast(err.message);
      else setToast('Failed to create portfolio');
    } finally {
      setCreatingPortfolio(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteWing(societyId, deleteTarget.id);
      setToast(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      if (err instanceof SocietyApiError) setToast(err.message);
      else setToast('Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const loadPrivileges = async (membershipId: string) => {
    try {
      setPrivilegeLoading(true);
      const data = await fetchRolePrivileges(societyId, membershipId);
      setPrivilegeView(data);
    } catch (err) {
      if (err instanceof SocietyApiError) setToast(err.message);
      else setToast('Failed to load privileges');
    } finally {
      setPrivilegeLoading(false);
    }
  };

  const handleTogglePrivilege = async (privilegeKey: string, granted: boolean) => {
    if (!privilegeView) return;
    try {
      setTogglingPrivilege(privilegeKey);
      await updatePrivilege(societyId, {
        membershipId: privilegeView.membership_id,
        privilegeKey,
        granted: !granted,
      });
      // Update locally
      setPrivilegeView({
        ...privilegeView,
        privileges: privilegeView.privileges.map(p =>
          p.privilege_key === privilegeKey ? { ...p, granted: !granted } : p
        ),
      });
      setToast(`Privilege ${!granted ? 'granted' : 'revoked'}`);
    } catch (err) {
      if (err instanceof SocietyApiError) setToast(err.message);
      else setToast('Failed to update privilege');
    } finally {
      setTogglingPrivilege(null);
    }
  };

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-themed pb-2">
        <button
          onClick={() => setTab('structure')}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${tab === 'structure' ? 'bg-brand-500/10 text-brand-500' : 'text-muted hover:text-primary'}`}
        >
          <Network size={16} className="inline mr-1.5" />
          Structure
        </button>
        <button
          onClick={() => setTab('privileges')}
          className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${tab === 'privileges' ? 'bg-brand-500/10 text-brand-500' : 'text-muted hover:text-primary'}`}
        >
          <Shield size={16} className="inline mr-1.5" />
          Permissions
        </button>
      </div>

      {tab === 'structure' ? (
        <>
          {/* Create wing button */}
          <div className="flex justify-end">
            <button onClick={() => setShowCreateWing(true)} className="btn-primary text-sm px-3 py-2 flex items-center gap-1.5">
              <Plus size={16} /> New Wing
            </button>
          </div>

          {/* Wings tree */}
          {wings.length === 0 ? (
            <EmptyState message="No wings created yet" />
          ) : (
            <div className="space-y-2">
              {wings.map(wing => (
                <div key={wing.id} className="card overflow-hidden">
                  {/* Wing header */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/50 transition-colors"
                    onClick={() => toggleWing(wing.id)}
                  >
                    {expandedWings.has(wing.id)
                      ? <ChevronDown size={18} className="text-muted" />
                      : <ChevronRight size={18} className="text-muted" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-primary">{wing.name}</h3>
                        <span className="text-xs text-muted">{wing.member_count} members</span>
                      </div>
                      {wing.vp_name && (
                        <p className="text-xs text-muted mt-0.5">VP: {wing.vp_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); setCreatePortfolioFor(wing.id); }}
                        className="btn-ghost text-xs px-2 py-1"
                        title="Add portfolio"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'wing', id: wing.id, name: wing.name }); }}
                        className="btn-ghost text-xs px-2 py-1 text-red-500"
                        title="Delete wing"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Portfolios */}
                  {expandedWings.has(wing.id) && (
                    <div className="border-t border-themed">
                      {wing.portfolios.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-muted text-center">No portfolios</div>
                      ) : (
                        wing.portfolios.map(portfolio => (
                          <div key={portfolio.id} className="flex items-center gap-3 px-4 py-3 pl-12 border-b border-themed/50 last:border-0">
                            <div className="h-2 w-2 rounded-full bg-brand-500" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-primary">{portfolio.name}</p>
                              <p className="text-xs text-muted">
                                {portfolio.member_count} members
                                {portfolio.director_name && ` • Director: ${portfolio.director_name}`}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Permissions tab */
        <div className="space-y-3">
          <p className="text-xs text-muted">Select a member to view and manage their privileges.</p>
          <div className="grid gap-2">
            {members
              .filter(m => m.role_name !== 'President') // President has all privileges
              .map(member => (
                <button
                  key={member.membership_id}
                  onClick={() => loadPrivileges(member.membership_id)}
                  className={`card p-3 text-left transition-colors hover:border-brand-500/30
                    ${privilegeView?.membership_id === member.membership_id ? 'border-brand-500' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center text-xs font-bold">
                      {member.full_name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-primary">{member.full_name}</p>
                      <p className="text-xs text-muted">{member.role_name}</p>
                    </div>
                  </div>
                </button>
              ))}
          </div>

          {/* Privilege matrix */}
          {privilegeLoading ? (
            <PageLoader />
          ) : privilegeView ? (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-3">
                Privileges for {privilegeView.user_name} ({privilegeView.role_name})
              </h3>
              <div className="space-y-2">
                {privilegeView.privileges.map(priv => (
                  <div key={priv.privilege_key} className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/50">
                    <div>
                      <p className="text-sm text-primary">{priv.label}</p>
                      <p className="text-xs text-muted">{priv.description}</p>
                    </div>
                    <button
                      onClick={() => handleTogglePrivilege(priv.privilege_key, priv.granted)}
                      disabled={togglingPrivilege === priv.privilege_key}
                      className="flex-shrink-0"
                    >
                      {priv.granted ? (
                        <ToggleRight size={28} className="text-green-500" />
                      ) : (
                        <ToggleLeft size={28} className="text-muted" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Create wing dialog */}
      {showCreateWing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-primary mb-4">Create Wing</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Name *</label>
                <input className="input-field" value={wingForm.name} onChange={e => setWingForm({ ...wingForm, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Description</label>
                <textarea className="input-field min-h-[60px]" value={wingForm.description} onChange={e => setWingForm({ ...wingForm, description: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setShowCreateWing(false)} className="btn-ghost text-sm px-4 py-2">Cancel</button>
              <button onClick={handleCreateWing} disabled={creatingWing} className="btn-primary text-sm px-4 py-2">
                {creatingWing ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create portfolio dialog */}
      {createPortfolioFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-primary mb-4">Create Portfolio</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Name *</label>
                <input className="input-field" value={portfolioForm.name} onChange={e => setPortfolioForm({ ...portfolioForm, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Description</label>
                <textarea className="input-field min-h-[60px]" value={portfolioForm.description} onChange={e => setPortfolioForm({ ...portfolioForm, description: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setCreatePortfolioFor(null)} className="btn-ghost text-sm px-4 py-2">Cancel</button>
              <button onClick={handleCreatePortfolio} disabled={creatingPortfolio} className="btn-primary text-sm px-4 py-2">
                {creatingPortfolio ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Wing"
        message={`Delete "${deleteTarget?.name}"? All portfolios under this wing will also be removed.`}
        confirmText="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
