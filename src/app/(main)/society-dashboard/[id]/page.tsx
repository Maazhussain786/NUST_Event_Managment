'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Loader2, Users, Settings, Mail, Layers,
  Plus, Trash2, Crown, ChevronRight, Copy, CheckCircle2, AlertCircle,
  Shield, UserMinus, Send, Eye, X, ExternalLink
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';

type Tab = 'overview' | 'wings' | 'members' | 'invites' | 'settings';

interface SocietyInfo {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  status: string;
}

interface Wing {
  id: string;
  name: string;
  description: string;
  member_count: number;
  vp_name: string | null;
  portfolios?: Portfolio[];
}

interface Portfolio {
  id: string;
  name: string;
  description: string;
  member_count: number;
  director_name: string | null;
}

interface Member {
  id: string;
  membership_id: string;
  full_name: string;
  email: string;
  role_name: string;
  hierarchy_level: number;
  wing_name: string | null;
  portfolio_name: string | null;
}

interface Invite {
  id: string;
  token: string;
  role_name: string;
  invited_email: string;
  status: string;
  expires_at: string;
  wing_name: string | null;
  portfolio_name: string | null;
  invited_by_name: string;
  created_at: string;
}

interface SocietySettings {
  event_creation_role: string;
  chat_management_role: string;
  content_upload_role: string;
  ticketing_enabled: boolean;
  transfer_policy: string;
  transfer_deadline_hours: number;
}

interface MyRole {
  role_name: string;
  hierarchy_level: number;
  wing_id: string | null;
  portfolio_id: string | null;
}

const ROLE_COLORS: Record<string, string> = {
  'President': 'bg-amber-500/10 text-amber-600',
  'Vice President': 'bg-blue-500/10 text-blue-600',
  'Director': 'bg-purple-500/10 text-purple-600',
  'Deputy Director': 'bg-green-500/10 text-green-600',
  'Member': 'bg-surface-200 dark:bg-surface-700 text-muted',
};

export default function SocietyDashboard() {
  const router = useRouter();
  const params = useParams();
  const societyId = params.id as string;

  const [tab, setTab] = useState<Tab>('overview');
  const [society, setSociety] = useState<SocietyInfo | null>(null);
  const [myRole, setMyRole] = useState<MyRole | null>(null);
  const [wings, setWings] = useState<Wing[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [settings, setSettings] = useState<SocietySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal states
  const [showCreateWing, setShowCreateWing] = useState(false);
  const [showCreatePortfolio, setShowCreatePortfolio] = useState<string | null>(null); // wingId
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copiedToken, setCopiedToken] = useState('');

  // Form states
  const [wingName, setWingName] = useState('');
  const [wingDesc, setWingDesc] = useState('');
  const [portfolioName, setPortfolioName] = useState('');
  const [portfolioDesc, setPortfolioDesc] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [inviteWingId, setInviteWingId] = useState('');
  const [invitePortfolioId, setInvitePortfolioId] = useState('');

  const isPresident = myRole?.role_name === 'President';
  const isVP = myRole?.role_name === 'Vice President';
  const isDirector = myRole?.role_name === 'Director';
  const canManage = isPresident || isVP || isDirector;

  const fetchSociety = useCallback(async () => {
    try {
      const r = await fetch(`/api/societies/${societyId}`);
      if (r.ok) { const d = await r.json(); setSociety(d); }
    } catch {}
  }, [societyId]);

  const fetchMyRole = useCallback(async () => {
    try {
      const r = await fetch('/api/my-societies');
      if (r.ok) {
        const data: any[] = await r.json();
        const match = data.find((s: any) => s.id === societyId);
        if (match) {
          setMyRole({
            role_name: match.role_name,
            hierarchy_level: match.hierarchy_level,
            wing_id: match.wing_id,
            portfolio_id: match.portfolio_id,
          });
        }
      }
    } catch {}
  }, [societyId]);

  const fetchWings = useCallback(async () => {
    try {
      const r = await fetch(`/api/societies/${societyId}/wings`);
      if (r.ok) {
        const wingsData: Wing[] = await r.json();
        // Fetch portfolios for each wing
        const withPortfolios = await Promise.all(
          wingsData.map(async (w) => {
            try {
              const pr = await fetch(`/api/societies/${societyId}/wings/${w.id}/portfolios`);
              if (pr.ok) { w.portfolios = await pr.json(); }
            } catch {}
            return w;
          })
        );
        setWings(withPortfolios);
      }
    } catch {}
  }, [societyId]);

  const fetchMembers = useCallback(async () => {
    try {
      const r = await fetch(`/api/societies/${societyId}/members`);
      if (r.ok) setMembers(await r.json());
    } catch {}
  }, [societyId]);

  const fetchInvites = useCallback(async () => {
    try {
      const r = await fetch(`/api/invites?societyId=${societyId}`);
      if (r.ok) { const d = await r.json(); setInvites(d.invites || d); }
    } catch {}
  }, [societyId]);

  const fetchSettings = useCallback(async () => {
    try {
      const r = await fetch(`/api/societies/${societyId}/settings`);
      if (r.ok) setSettings(await r.json());
    } catch {}
  }, [societyId]);

  useEffect(() => {
    Promise.all([fetchSociety(), fetchMyRole()]).finally(() => setLoading(false));
  }, [fetchSociety, fetchMyRole]);

  useEffect(() => { if (tab === 'wings') fetchWings(); }, [tab, fetchWings]);
  useEffect(() => { if (tab === 'members') fetchMembers(); }, [tab, fetchMembers]);
  useEffect(() => { if (tab === 'invites') fetchInvites(); }, [tab, fetchInvites]);
  useEffect(() => { if (tab === 'settings') fetchSettings(); }, [tab, fetchSettings]);

  const flash = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };
  const flashError = (msg: string) => { setError(msg); setTimeout(() => setError(''), 4000); };

  // ===== ACTIONS =====

  const createWing = async () => {
    if (!wingName.trim()) return;
    setActionLoading('create-wing');
    try {
      const r = await fetch(`/api/societies/${societyId}/wings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wingName, description: wingDesc }),
      });
      if (r.ok) { flash('Wing created'); setShowCreateWing(false); setWingName(''); setWingDesc(''); fetchWings(); }
      else { const d = await r.json(); flashError(d.error); }
    } catch { flashError('Failed to create wing'); }
    setActionLoading(null);
  };

  const deleteWing = async (wingId: string) => {
    if (!confirm('Delete this wing? All portfolios and members under it will be removed.')) return;
    setActionLoading(wingId);
    try {
      const r = await fetch(`/api/societies/${societyId}/wings/${wingId}`, { method: 'DELETE' });
      if (r.ok) { flash('Wing deleted'); fetchWings(); }
      else { const d = await r.json(); flashError(d.error); }
    } catch { flashError('Failed to delete wing'); }
    setActionLoading(null);
  };

  const createPortfolio = async (wingId: string) => {
    if (!portfolioName.trim()) return;
    setActionLoading('create-portfolio');
    try {
      const r = await fetch(`/api/societies/${societyId}/wings/${wingId}/portfolios`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: portfolioName, description: portfolioDesc }),
      });
      if (r.ok) { flash('Portfolio created'); setShowCreatePortfolio(null); setPortfolioName(''); setPortfolioDesc(''); fetchWings(); }
      else { const d = await r.json(); flashError(d.error); }
    } catch { flashError('Failed to create portfolio'); }
    setActionLoading(null);
  };

  const removeMember = async (membershipId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from the society?`)) return;
    setActionLoading(membershipId);
    try {
      const r = await fetch(`/api/societies/${societyId}/members/${membershipId}`, { method: 'DELETE' });
      if (r.ok) { flash(`${memberName} removed`); fetchMembers(); }
      else { const d = await r.json(); flashError(d.error); }
    } catch { flashError('Failed to remove member'); }
    setActionLoading(null);
  };

  const createInvite = async () => {
    if (!inviteEmail.trim() || !inviteRole) return;
    setActionLoading('create-invite');
    try {
      const r = await fetch('/api/invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societyId,
          roleName: inviteRole,
          invitedEmail: inviteEmail,
          wingId: inviteWingId || undefined,
          portfolioId: invitePortfolioId || undefined,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        flash('Invite sent!');
        setShowInviteModal(false);
        setInviteEmail('');
        setInviteRole('');
        setInviteWingId('');
        setInvitePortfolioId('');
        fetchInvites();
      } else {
        flashError(d.error);
      }
    } catch { flashError('Failed to create invite'); }
    setActionLoading(null);
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(''), 2000);
  };

  const saveSettings = async () => {
    if (!settings) return;
    setActionLoading('save-settings');
    try {
      const r = await fetch(`/api/societies/${societyId}/settings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (r.ok) { flash('Settings saved'); }
      else { const d = await r.json(); flashError(d.error); }
    } catch { flashError('Failed to save settings'); }
    setActionLoading(null);
  };

  // Determine available invite roles based on my role
  const getInvitableRoles = (): string[] => {
    if (isPresident) return ['Vice President'];
    if (isVP) return ['Director'];
    if (isDirector) return ['Deputy Director', 'Member'];
    return [];
  };

  // ===== RENDER =====

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!society) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-3" />
          <p className="text-primary font-semibold">Society not found</p>
          <button onClick={() => router.back()} className="text-brand-500 text-sm mt-3">Go back</button>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'overview', label: 'Overview', icon: Eye },
    { key: 'wings', label: 'Wings', icon: Layers },
    { key: 'members', label: 'Members', icon: Users },
    ...(canManage ? [{ key: 'invites' as Tab, label: 'Invites', icon: Mail }] : []),
    ...(isPresident ? [{ key: 'settings' as Tab, label: 'Settings', icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="px-5 pt-12 pb-2 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl" style={{ background: 'var(--bg-card)' }}>
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-primary truncate">{society.name}</h1>
          {myRole && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[myRole.role_name] || 'text-muted'}`}>
              {myRole.role_name}
            </span>
          )}
        </div>
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center overflow-hidden flex-shrink-0">
          {society.logo_url ? (
            <img src={society.logo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Crown className="w-5 h-5 text-brand-500" />
          )}
        </div>
      </div>

      {/* Toast messages */}
      <AnimatePresence>
        {successMsg && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="mx-5 mt-2 p-3 rounded-xl bg-green-500/10 text-green-600 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> {successMsg}
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="mx-5 mt-2 p-3 rounded-xl bg-red-500/10 text-red-500 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Bar */}
      <div className="px-5 mt-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
              tab === t.key ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'text-muted'
            }`}
            style={tab !== t.key ? { background: 'var(--bg-card)' } : {}}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-5 pb-32 mt-4">
        <AnimatePresence mode="wait">

          {/* ===== OVERVIEW TAB ===== */}
          {tab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Full Management Console CTA for President */}
              {isPresident && (
                <button
                  onClick={() => router.push(`/society/${societyId}/dashboard`)}
                  className="w-full mb-4 p-4 rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 text-white flex items-center gap-3 shadow-lg shadow-brand-500/25 active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Crown className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold">Full Management Console</p>
                    <p className="text-[11px] opacity-80">Profile, branding, events, analytics & more</p>
                  </div>
                  <ExternalLink className="w-4 h-4 opacity-70 flex-shrink-0" />
                </button>
              )}

              <div className="card p-5 mb-4">
                <h2 className="text-primary font-semibold mb-2">About</h2>
                <p className="text-muted text-sm leading-relaxed">{society.description}</p>
              </div>

              {myRole && (
                <div className="card p-4 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-brand-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-primary text-sm font-medium">Your Role</p>
                    <p className="text-muted text-xs">
                      {myRole.role_name}
                      {myRole.wing_id && ' (scoped to wing)'}
                      {myRole.portfolio_id && ' (scoped to portfolio)'}
                    </p>
                  </div>
                </div>
              )}

              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="card p-4 text-center">
                  <p className="text-2xl font-bold text-primary">{members.length || '—'}</p>
                  <p className="text-muted text-xs mt-1">Members</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-2xl font-bold text-primary">{wings.length || '—'}</p>
                  <p className="text-muted text-xs mt-1">Wings</p>
                </div>
              </div>

              {canManage && (
                <div className="mt-4 space-y-2">
                  <button onClick={() => setTab('invites')} className="w-full card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                      <Send className="w-5 h-5 text-brand-500" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-primary text-sm font-medium">Send Invites</p>
                      <p className="text-muted text-xs">Invite members to your team</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted" />
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* ===== WINGS TAB ===== */}
          {tab === 'wings' && (
            <motion.div key="wings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {isPresident && (
                <button onClick={() => setShowCreateWing(true)}
                  className="w-full card p-4 flex items-center gap-3 mb-4 border-2 border-dashed border-brand-500/30">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-brand-500" />
                  </div>
                  <p className="text-brand-500 text-sm font-medium">Create New Wing</p>
                </button>
              )}

              {wings.length === 0 ? (
                <div className="text-center py-16">
                  <Layers className="w-12 h-12 mx-auto text-surface-400 mb-3" />
                  <p className="text-muted text-sm">No wings created yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {wings.map((wing) => (
                    <div key={wing.id} className="card p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="text-primary text-sm font-semibold">{wing.name}</h3>
                          {wing.description && <p className="text-muted text-xs mt-0.5">{wing.description}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted text-xs">{wing.member_count} members</span>
                          {isPresident && (
                            <button onClick={() => deleteWing(wing.id)} disabled={actionLoading === wing.id}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-500 transition-colors">
                              {actionLoading === wing.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {wing.vp_name && (
                        <div className="flex items-center gap-1.5 mb-3">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-medium">VP</span>
                          <span className="text-muted text-xs">{wing.vp_name}</span>
                        </div>
                      )}

                      {/* Portfolios */}
                      {wing.portfolios && wing.portfolios.length > 0 && (
                        <div className="ml-3 border-l-2 pl-3 space-y-2 mt-2" style={{ borderColor: 'var(--border-card)' }}>
                          {wing.portfolios.map((p) => (
                            <div key={p.id} className="flex items-center justify-between py-1">
                              <div>
                                <p className="text-primary text-xs font-medium">{p.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-muted text-[10px]">{p.member_count} members</span>
                                  {p.director_name && (
                                    <span className="text-[10px] text-purple-500">Dir: {p.director_name}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add portfolio button */}
                      {(isPresident || (isVP && myRole?.wing_id === wing.id)) && (
                        <button onClick={() => setShowCreatePortfolio(wing.id)}
                          className="w-full mt-3 py-2 rounded-xl text-xs font-medium text-brand-500 hover:bg-brand-500/5 transition-colors flex items-center justify-center gap-1.5"
                          style={{ border: '1px dashed var(--border-card)' }}>
                          <Plus className="w-3.5 h-3.5" /> Add Portfolio
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ===== MEMBERS TAB ===== */}
          {tab === 'members' && (
            <motion.div key="members" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {members.length === 0 ? (
                <div className="text-center py-16">
                  <Users className="w-12 h-12 mx-auto text-surface-400 mb-3" />
                  <p className="text-muted text-sm">No members yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div key={m.membership_id} className="card p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 font-bold text-sm flex-shrink-0">
                        {m.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-primary text-sm font-medium truncate">{m.full_name}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[m.role_name] || 'text-muted'}`}>
                            {m.role_name}
                          </span>
                          {m.wing_name && (
                            <span className="text-muted text-[10px]">{m.wing_name}</span>
                          )}
                          {m.portfolio_name && (
                            <span className="text-muted text-[10px]">/ {m.portfolio_name}</span>
                          )}
                        </div>
                      </div>
                      {canManage && myRole && m.hierarchy_level < myRole.hierarchy_level && (
                        <button
                          onClick={() => removeMember(m.membership_id, m.full_name)}
                          disabled={actionLoading === m.membership_id}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          {actionLoading === m.membership_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ===== INVITES TAB ===== */}
          {tab === 'invites' && canManage && (
            <motion.div key="invites" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button onClick={() => setShowInviteModal(true)}
                className="w-full card p-4 flex items-center gap-3 mb-4 border-2 border-dashed border-brand-500/30">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                  <Send className="w-5 h-5 text-brand-500" />
                </div>
                <p className="text-brand-500 text-sm font-medium">Send New Invite</p>
              </button>

              {invites.length === 0 ? (
                <div className="text-center py-16">
                  <Mail className="w-12 h-12 mx-auto text-surface-400 mb-3" />
                  <p className="text-muted text-sm">No invites sent yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {invites.map((inv) => (
                    <div key={inv.id} className="card p-4">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-primary text-sm font-medium truncate">{inv.invited_email}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[inv.role_name] || 'text-muted'}`}>
                              {inv.role_name}
                            </span>
                            {inv.wing_name && <span className="text-muted text-[10px]">{inv.wing_name}</span>}
                            {inv.portfolio_name && <span className="text-muted text-[10px]">/ {inv.portfolio_name}</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            inv.status === 'PENDING' ? 'bg-amber-500/10 text-amber-600' :
                            inv.status === 'ACCEPTED' ? 'bg-green-500/10 text-green-600' :
                            'bg-red-500/10 text-red-500'
                          }`}>
                            {inv.status}
                          </span>
                        </div>
                      </div>
                      {inv.status === 'PENDING' && (
                        <button onClick={() => copyInviteLink(inv.token)}
                          className="mt-2 w-full py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5 text-muted hover:text-primary transition-colors"
                          style={{ background: 'var(--bg-input)' }}>
                          {copiedToken === inv.token ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedToken === inv.token ? 'Copied!' : 'Copy Invite Link'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ===== SETTINGS TAB ===== */}
          {tab === 'settings' && isPresident && settings && (
            <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="space-y-5">
                {/* Event Creation Role */}
                <div className="card p-4">
                  <label className="block text-sm font-medium text-primary mb-1.5">Min Role for Event Creation</label>
                  <select value={settings.event_creation_role}
                    onChange={(e) => setSettings({ ...settings, event_creation_role: e.target.value })}
                    className="input-field w-full py-2.5 px-4 text-sm appearance-none">
                    {['President', 'Vice President', 'Director', 'Deputy Director', 'Member'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <p className="text-muted text-xs mt-1">Anyone at or above this role can create events</p>
                </div>

                {/* Chat Management Role */}
                <div className="card p-4">
                  <label className="block text-sm font-medium text-primary mb-1.5">Min Role for Chat Management</label>
                  <select value={settings.chat_management_role}
                    onChange={(e) => setSettings({ ...settings, chat_management_role: e.target.value })}
                    className="input-field w-full py-2.5 px-4 text-sm appearance-none">
                    {['President', 'Vice President', 'Director', 'Deputy Director', 'Member'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Content Upload Role */}
                <div className="card p-4">
                  <label className="block text-sm font-medium text-primary mb-1.5">Min Role for Content Uploads</label>
                  <select value={settings.content_upload_role}
                    onChange={(e) => setSettings({ ...settings, content_upload_role: e.target.value })}
                    className="input-field w-full py-2.5 px-4 text-sm appearance-none">
                    {['President', 'Vice President', 'Director', 'Deputy Director', 'Member'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Ticketing */}
                <div className="card p-4 flex items-center justify-between">
                  <div>
                    <p className="text-primary text-sm font-medium">Ticketing Enabled</p>
                    <p className="text-muted text-xs">Allow ticket sales for events</p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, ticketing_enabled: !settings.ticketing_enabled })}
                    className={`w-12 h-7 rounded-full transition-colors flex items-center px-0.5 ${
                      settings.ticketing_enabled ? 'bg-brand-500' : 'bg-surface-300 dark:bg-surface-600'
                    }`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full shadow transition-transform ${
                      settings.ticketing_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Transfer Policy */}
                <div className="card p-4">
                  <label className="block text-sm font-medium text-primary mb-1.5">Ticket Transfer Policy</label>
                  <select value={settings.transfer_policy}
                    onChange={(e) => setSettings({ ...settings, transfer_policy: e.target.value })}
                    className="input-field w-full py-2.5 px-4 text-sm appearance-none">
                    <option value="ALLOWED">Allowed</option>
                    <option value="RESTRICTED">Restricted (deadline)</option>
                    <option value="DISABLED">Disabled</option>
                  </select>
                </div>

                {settings.transfer_policy === 'RESTRICTED' && (
                  <div className="card p-4">
                    <label className="block text-sm font-medium text-primary mb-1.5">Transfer Deadline (hours before event)</label>
                    <input type="number" value={settings.transfer_deadline_hours}
                      onChange={(e) => setSettings({ ...settings, transfer_deadline_hours: parseInt(e.target.value) || 24 })}
                      className="input-field w-full py-2.5 px-4 text-sm" min={1} max={168} />
                  </div>
                )}

                <button onClick={saveSettings}
                  disabled={actionLoading === 'save-settings'}
                  className="btn-primary w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                  {actionLoading === 'save-settings' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save Settings
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ===== MODALS ===== */}

      {/* Create Wing Modal */}
      <AnimatePresence>
        {showCreateWing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <motion.div initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
              className="w-full max-w-md rounded-t-3xl p-6" style={{ background: 'var(--bg-card)' }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-primary">Create Wing</h3>
                <button onClick={() => setShowCreateWing(false)} className="p-1.5 rounded-lg hover:bg-surface-200">
                  <X className="w-5 h-5 text-muted" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">Wing Name *</label>
                  <input value={wingName} onChange={(e) => setWingName(e.target.value)}
                    placeholder="e.g., Technical Wing" className="input-field w-full py-3 px-4 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">Description</label>
                  <input value={wingDesc} onChange={(e) => setWingDesc(e.target.value)}
                    placeholder="Brief description" className="input-field w-full py-3 px-4 text-sm" />
                </div>
                <button onClick={createWing} disabled={actionLoading === 'create-wing' || !wingName.trim()}
                  className="btn-primary w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                  {actionLoading === 'create-wing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Wing
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Portfolio Modal */}
      <AnimatePresence>
        {showCreatePortfolio && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <motion.div initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
              className="w-full max-w-md rounded-t-3xl p-6" style={{ background: 'var(--bg-card)' }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-primary">Create Portfolio</h3>
                <button onClick={() => setShowCreatePortfolio(null)} className="p-1.5 rounded-lg hover:bg-surface-200">
                  <X className="w-5 h-5 text-muted" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">Portfolio Name *</label>
                  <input value={portfolioName} onChange={(e) => setPortfolioName(e.target.value)}
                    placeholder="e.g., Web Development" className="input-field w-full py-3 px-4 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">Description</label>
                  <input value={portfolioDesc} onChange={(e) => setPortfolioDesc(e.target.value)}
                    placeholder="Brief description" className="input-field w-full py-3 px-4 text-sm" />
                </div>
                <button onClick={() => createPortfolio(showCreatePortfolio)}
                  disabled={actionLoading === 'create-portfolio' || !portfolioName.trim()}
                  className="btn-primary w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                  {actionLoading === 'create-portfolio' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create Portfolio
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <motion.div initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }}
              className="w-full max-w-md rounded-t-3xl p-6" style={{ background: 'var(--bg-card)' }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-primary">Send Invite</h3>
                <button onClick={() => setShowInviteModal(false)} className="p-1.5 rounded-lg hover:bg-surface-200">
                  <X className="w-5 h-5 text-muted" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">Email *</label>
                  <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="person@seecs.edu.pk" className="input-field w-full py-3 px-4 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">Role *</label>
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                    className="input-field w-full py-3 px-4 text-sm appearance-none">
                    <option value="">Select role...</option>
                    {getInvitableRoles().map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Wing selection for VP invite */}
                {inviteRole === 'Vice President' && wings.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-primary mb-1">Wing *</label>
                    <select value={inviteWingId} onChange={(e) => setInviteWingId(e.target.value)}
                      className="input-field w-full py-3 px-4 text-sm appearance-none">
                      <option value="">Select wing...</option>
                      {wings.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Wing + Portfolio selection for Director / Deputy Director */}
                {(inviteRole === 'Director' || inviteRole === 'Deputy Director') && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-primary mb-1">Wing *</label>
                      <select value={inviteWingId}
                        onChange={(e) => { setInviteWingId(e.target.value); setInvitePortfolioId(''); }}
                        className="input-field w-full py-3 px-4 text-sm appearance-none">
                        <option value="">Select wing...</option>
                        {wings.map(w => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                    {inviteWingId && (
                      <div>
                        <label className="block text-sm font-medium text-primary mb-1">Portfolio *</label>
                        <select value={invitePortfolioId} onChange={(e) => setInvitePortfolioId(e.target.value)}
                          className="input-field w-full py-3 px-4 text-sm appearance-none">
                          <option value="">Select portfolio...</option>
                          {wings.find(w => w.id === inviteWingId)?.portfolios?.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}

                {/* Member invite needs just wing */}
                {inviteRole === 'Member' && (
                  <div>
                    <label className="block text-sm font-medium text-primary mb-1">Wing (optional)</label>
                    <select value={inviteWingId} onChange={(e) => setInviteWingId(e.target.value)}
                      className="input-field w-full py-3 px-4 text-sm appearance-none">
                      <option value="">No specific wing</option>
                      {wings.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <button onClick={createInvite}
                  disabled={actionLoading === 'create-invite' || !inviteEmail.trim() || !inviteRole}
                  className="btn-primary w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                  {actionLoading === 'create-invite' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Invite
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
