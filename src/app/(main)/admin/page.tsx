'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Users, Calendar, Building2, Shield, Clock,
  CheckCircle2, XCircle, AlertTriangle, Loader2, ChevronRight,
  UserCheck, BarChart3, Eye
} from 'lucide-react';
import { useRouter } from 'next/navigation';

type Tab = 'overview' | 'events' | 'societies' | 'users';

interface Stats {
  totalUsers: number;
  totalSocieties: number;
  totalEvents: number;
  pendingEvents: number;
  pendingSocieties: number;
}

interface AdminEvent {
  id: string;
  title: string;
  description: string;
  start_date: string;
  venue: string;
  status: string;
  capacity: number;
  ticket_price: number | null;
  banner_url: string | null;
  society_name: string;
  society_logo: string | null;
  created_by_name: string;
  created_at: string;
}

interface AdminSociety {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  category: string | null;
  status: string;
  created_at: string;
  member_count: string;
  event_count: string;
  president_name?: string;
  contact_number?: string;
  created_by_name?: string;
  created_by_email?: string;
}

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  user_type: string;
  status: string;
  created_at: string;
  society_count: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [societies, setSocieties] = useState<AdminSociety[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('PENDING');
  const [societyFilter, setSocietyFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null); // socId

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/stats');
      if (r.ok) setStats(await r.json());
    } catch (e) { console.error(e); }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/events?status=${eventFilter}`);
      if (r.ok) setEvents(await r.json());
    } catch (e) { console.error(e); }
  }, [eventFilter]);

  const fetchSocieties = useCallback(async () => {
    try {
      const url = societyFilter ? `/api/admin/societies?status=${societyFilter}` : '/api/admin/societies';
      const r = await fetch(url);
      if (r.ok) setSocieties(await r.json());
    } catch (e) { console.error(e); }
  }, [societyFilter]);

  const fetchUsers = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/users');
      if (r.ok) setUsers(await r.json());
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    Promise.all([fetchStats()]).finally(() => setLoading(false));
  }, [fetchStats]);

  useEffect(() => { if (tab === 'events') fetchEvents(); }, [tab, fetchEvents]);
  useEffect(() => { if (tab === 'societies') fetchSocieties(); }, [tab, fetchSocieties]);
  useEffect(() => { if (tab === 'users') fetchUsers(); }, [tab, fetchUsers]);

  const handleEventAction = async (eventId: string, action: string) => {
    setActionLoading(eventId);
    try {
      await fetch(`/api/admin/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      fetchEvents();
      fetchStats();
    } catch (e) { console.error(e); }
    setActionLoading(null);
  };

  const handleSocietyAction = async (socId: string, action: string, reason?: string) => {
    setActionLoading(socId);
    try {
      await fetch(`/api/admin/societies/${socId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      fetchSocieties();
      fetchStats();
      setShowRejectModal(null);
      setRejectionReason('');
    } catch (e) { console.error(e); }
    setActionLoading(null);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });

  const tabs: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'events', label: 'Events', icon: Calendar },
    { key: 'societies', label: 'Societies', icon: Building2 },
    { key: 'users', label: 'Users', icon: Users },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg-primary)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-12 pb-2">
        <button onClick={() => router.back()} className="p-2 rounded-xl" style={{ background: 'var(--bg-card)' }}>
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-primary">Admin Panel</h1>
          <p className="text-xs text-muted">Super Admin Dashboard</p>
        </div>
        <Shield className="w-6 h-6 text-brand-500" />
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2 px-5 pb-2 mt-4 overflow-x-auto no-scrollbar">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              tab === t.key
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                : 'text-muted hover:text-primary'
            }`}
            style={tab !== t.key ? { background: 'var(--bg-card)' } : {}}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-5 pb-32 mt-4">
        <AnimatePresence mode="wait">
          {/* OVERVIEW TAB */}
          {tab === 'overview' && stats && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                  { label: 'Societies', value: stats.totalSocieties, icon: Building2, color: 'text-green-500', bg: 'bg-green-500/10' },
                  { label: 'Total Events', value: stats.totalEvents, icon: Calendar, color: 'text-purple-500', bg: 'bg-purple-500/10' },
                  { label: 'Pending Events', value: stats.pendingEvents, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="p-4 card"
                  >
                    <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
                      <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                    <p className="text-2xl font-bold text-primary">{stat.value}</p>
                    <p className="mt-1 text-xs text-muted">{stat.label}</p>
                  </motion.div>
                ))}
              </div>

              {/* Quick Actions */}
              <h2 className="mt-6 mb-3 text-xs font-semibold tracking-wider uppercase text-muted">Quick Actions</h2>
              <div className="space-y-2">
                {stats.pendingEvents > 0 && (
                  <button onClick={() => { setTab('events'); setEventFilter('PENDING'); }}
                    className="flex items-center w-full gap-3 p-4 card">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10">
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-primary">{stats.pendingEvents} events need approval</p>
                      <p className="text-xs text-muted">Review and approve pending events</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted" />
                  </button>
                )}
                {stats.pendingSocieties > 0 && (
                  <button onClick={() => { setTab('societies'); setSocietyFilter('PENDING'); }}
                    className="flex items-center w-full gap-3 p-4 card">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-orange-500/10">
                      <Building2 className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-primary">{stats.pendingSocieties} societies pending</p>
                      <p className="text-xs text-muted">Review new society applications</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted" />
                  </button>
                )}
                <button onClick={() => setTab('users')} className="flex items-center w-full gap-3 p-4 card">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10">
                    <UserCheck className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-primary">Manage Users</p>
                    <p className="text-xs text-muted">View and manage all registered users</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted" />
                </button>
              </div>
            </motion.div>
          )}

          {/* EVENTS TAB */}
          {tab === 'events' && (
            <motion.div key="events" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
                {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map(s => (
                  <button
                    key={s}
                    onClick={() => setEventFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      eventFilter === s ? 'bg-brand-500 text-white' : 'text-muted'
                    }`}
                    style={eventFilter !== s ? { background: 'var(--bg-card)' } : {}}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {events.length === 0 ? (
                <div className="py-16 text-center">
                  <Calendar className="w-12 h-12 mx-auto mb-3 text-surface-400" />
                  <p className="text-sm text-muted">No {eventFilter.toLowerCase()} events</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((ev, i) => (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-4 card"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center flex-shrink-0 overflow-hidden font-bold w-14 h-14 rounded-xl bg-brand-500/10 text-brand-500">
                          {ev.banner_url ? (
                            <img src={ev.banner_url} alt="" className="object-cover w-full h-full" />
                          ) : (
                            ev.title.charAt(0)
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold truncate text-primary">{ev.title}</h3>
                          <p className="text-xs text-muted">{ev.society_name}</p>
                          <p className="text-muted text-[11px] mt-1">{formatDate(ev.start_date)} · {ev.venue}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-200 dark:bg-surface-700 text-muted">
                              {ev.capacity} cap
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500">
                              PKR {ev.ticket_price || 'Free'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      {eventFilter === 'PENDING' && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleEventAction(ev.id, 'APPROVED')}
                            disabled={actionLoading === ev.id}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-500/10 text-green-600 text-xs font-medium hover:bg-green-500/20 transition-colors"
                          >
                            {actionLoading === ev.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Approve
                          </button>
                          <button
                            onClick={() => handleEventAction(ev.id, 'REJECTED')}
                            disabled={actionLoading === ev.id}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/10 text-red-500 text-xs font-medium hover:bg-red-500/20 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                          <button
                            onClick={() => router.push(`/events/${ev.id}`)}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-muted hover:text-primary transition-colors"
                            style={{ background: 'var(--bg-input)' }}
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* SOCIETIES TAB */}
          {tab === 'societies' && (
            <motion.div key="societies" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
                {['', 'APPROVED', 'PENDING', 'SUSPENDED'].map(s => (
                  <button
                    key={s}
                    onClick={() => setSocietyFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      societyFilter === s ? 'bg-brand-500 text-white' : 'text-muted'
                    }`}
                    style={societyFilter !== s ? { background: 'var(--bg-card)' } : {}}
                  >
                    {s || 'ALL'}
                  </button>
                ))}
              </div>

              {societies.length === 0 ? (
                <div className="py-16 text-center">
                  <Building2 className="w-12 h-12 mx-auto mb-3 text-surface-400" />
                  <p className="text-sm text-muted">No societies found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {societies.map((soc, i) => (
                    <motion.div
                      key={soc.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-4 card"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-12 h-12 overflow-hidden font-bold rounded-xl bg-brand-500/10 text-brand-500">
                          {soc.logo_url ? (
                            <img src={soc.logo_url} alt="" className="object-cover w-full h-full" />
                          ) : (
                            soc.name.charAt(0)
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold truncate text-primary">{soc.name}</h3>
                          <p className="text-xs text-muted">
                            {soc.category ? `${soc.category} · ` : ''}
                            {soc.member_count} members · {soc.event_count} events
                          </p>
                          {soc.status === 'PENDING' && soc.president_name && (
                            <p className="text-muted text-[10px] mt-0.5">
                              By: {soc.created_by_name || soc.president_name}
                              {soc.created_by_email ? ` (${soc.created_by_email})` : ''}
                            </p>
                          )}
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${
                          soc.status === 'APPROVED' ? 'bg-green-500/10 text-green-600' :
                          soc.status === 'PENDING' ? 'bg-amber-500/10 text-amber-600' :
                          soc.status === 'SUSPENDED' ? 'bg-red-500/10 text-red-500' :
                          'bg-surface-200 text-muted'
                        }`}>
                          {soc.status}
                        </span>
                      </div>

                      <div className="flex gap-2 mt-3">
                        {soc.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleSocietyAction(soc.id, 'APPROVED')}
                              disabled={actionLoading === soc.id}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-500/10 text-green-600 text-xs font-medium"
                            >
                              {actionLoading === soc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              Approve
                            </button>
                            <button
                              onClick={() => setShowRejectModal(soc.id)}
                              disabled={actionLoading === soc.id}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/10 text-red-500 text-xs font-medium"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </>
                        )}
                        {soc.status === 'APPROVED' && (
                          <>
                            <button
                              onClick={() => router.push(`/society/${soc.id}/dashboard`)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-brand-500/10 text-brand-500 text-xs font-medium"
                            >
                              <Shield className="w-3.5 h-3.5" /> Manage
                            </button>
                            <button
                              onClick={() => handleSocietyAction(soc.id, 'SUSPENDED')}
                              disabled={actionLoading === soc.id}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500/10 text-amber-600 text-xs font-medium"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" /> Suspend
                            </button>
                          </>
                        )}
                        {soc.status === 'SUSPENDED' && (
                          <button
                            onClick={() => handleSocietyAction(soc.id, 'APPROVED')}
                            disabled={actionLoading === soc.id}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-500/10 text-green-600 text-xs font-medium"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Reactivate
                          </button>
                        )}
                        <button
                          onClick={() => router.push(`/societies/${soc.id}`)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-muted"
                          style={{ background: 'var(--bg-input)' }}
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* USERS TAB */}
          {tab === 'users' && (
            <motion.div key="users" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {users.length === 0 ? (
                <div className="py-16 text-center">
                  <Users className="w-12 h-12 mx-auto mb-3 text-surface-400" />
                  <p className="text-sm text-muted">No users found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map((u, i) => (
                    <motion.div
                      key={u.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-center gap-3 p-4 card"
                    >
                      <div className="flex items-center justify-center w-10 h-10 text-sm font-bold rounded-xl bg-brand-500/10 text-brand-500">
                        {u.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium truncate text-primary">{u.full_name}</h3>
                        <p className="text-xs truncate text-muted">{u.email}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${
                          u.user_type === 'SUPER_ADMIN' ? 'bg-brand-500/10 text-brand-500' : 'bg-surface-200 dark:bg-surface-700 text-muted'
                        }`}>
                          {u.user_type}
                        </span>
                        <p className="text-muted text-[10px] mt-1">{u.society_count} societies</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Rejection Reason Modal */}
      <AnimatePresence>
        {showRejectModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-5" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="w-full max-w-sm p-6 rounded-2xl" style={{ background: 'var(--bg-card)' }}>
              <h3 className="mb-1 text-lg font-bold text-primary">Reject Society</h3>
              <p className="mb-4 text-xs text-muted">Provide a reason for the applicant</p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Reason for rejection (optional)..."
                rows={3}
                className="w-full px-4 py-3 mb-4 text-sm resize-none input-field"
              />
              <div className="flex gap-2">
                <button onClick={() => { setShowRejectModal(null); setRejectionReason(''); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-muted" style={{ background: 'var(--bg-input)' }}>
                  Cancel
                </button>
                <button onClick={() => handleSocietyAction(showRejectModal, 'REJECTED', rejectionReason)}
                  disabled={actionLoading === showRejectModal}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-500 text-white flex items-center justify-center gap-1.5">
                  {actionLoading === showRejectModal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  Reject
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
