'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarOff, Plus, Trash2, X, Calendar, Shield, Filter,
} from 'lucide-react';
import { ErrorState, EmptyState } from '../_components/Shared';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '../_components/StatCard';
import type { BlackoutDate } from '../types';
import { fetchBlackoutDates, createBlackoutDate, deleteBlackoutDate } from '../api';

function BlackoutSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
             <div className="flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="w-4 h-4" />
             </div>
             <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
         <Skeleton className="h-4 w-32 mb-2" />
         {[1, 2].map(i => (
           <div key={i} className="card p-4 flex gap-4">
              <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                 <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24 rounded-full" />
                 </div>
                 <Skeleton className="h-4 w-64" />
                 <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="w-8 h-8 rounded-lg" />
           </div>
         ))}
      </div>
    </div>
  );
}

export default function BlackoutCalendarPage() {
  const [dates, setDates] = useState<BlackoutDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '', start_date: '', end_date: '', reason: '', scope: 'ALL',
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchBlackoutDates();
      setDates(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.title || !form.start_date || !form.end_date) return;
    setSubmitting(true);
    try {
      await createBlackoutDate({
        title: form.title,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason || undefined,
        scope: form.scope,
      });
      setShowCreate(false);
      setForm({ title: '', start_date: '', end_date: '', reason: '', scope: 'ALL' });
      load();
    } catch { /* noop */ } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this blackout period?')) return;
    try {
      await deleteBlackoutDate(id);
      load();
    } catch { /* noop */ }
  };

  if (loading) return <BlackoutSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const now = new Date();
  const activeBlackouts = dates.filter((d) => {
    const start = new Date(d.start_date);
    const end = new Date(d.end_date);
    return start <= now && end >= now;
  });
  const upcoming = dates.filter((d) => new Date(d.start_date) > now);
  const past = dates.filter((d) => new Date(d.end_date) < now);

  const scopeLabel: Record<string, string> = {
    ALL: 'All Activities',
    EVENTS: 'Events Only',
    REGISTRATIONS: 'Registrations Only',
  };

  const scopeColor: Record<string, string> = {
    ALL: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    EVENTS: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    REGISTRATIONS: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Blackout Calendar
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Define periods when events or registrations are restricted
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Blackout
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Active Now" value={activeBlackouts.length} icon={CalendarOff}
          accent={activeBlackouts.length > 0 ? 'red' : 'green'} />
        <StatCard label="Upcoming" value={upcoming.length} icon={Calendar} accent="amber" />
        <StatCard label="Total Defined" value={dates.length} icon={Shield} accent="blue" />
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Create Blackout Period
              </h2>
              <button onClick={() => setShowCreate(false)}>
                <X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>
            <div className="space-y-3">
              <input className="input-field w-full" placeholder="Title (e.g., Exam Week) *"
                value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Start Date *</label>
                  <input type="date" className="input-field w-full" value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>End Date *</label>
                  <input type="date" className="input-field w-full" value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Scope</label>
                <select className="input-field w-full" value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                  <option value="ALL">All Activities</option>
                  <option value="EVENTS">Events Only</option>
                  <option value="REGISTRATIONS">Registrations Only</option>
                </select>
              </div>
              <textarea className="input-field w-full" rows={2} placeholder="Reason (optional)"
                value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleCreate}
                  disabled={submitting || !form.title || !form.start_date || !form.end_date}
                  className="btn-primary flex-1">
                  {submitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Blackouts */}
      {activeBlackouts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            <Filter className="w-3.5 h-3.5 inline mr-1" /> Currently Active
          </h2>
          <div className="space-y-2">
            {activeBlackouts.map((d) => (
              <BlackoutCard key={d.id} date={d} scopeLabel={scopeLabel} scopeColor={scopeColor}
                onDelete={handleDelete} isActive />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Upcoming
          </h2>
          <div className="space-y-2">
            {upcoming.map((d) => (
              <BlackoutCard key={d.id} date={d} scopeLabel={scopeLabel} scopeColor={scopeColor}
                onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Past
          </h2>
          <div className="space-y-2">
            {past.map((d) => (
              <BlackoutCard key={d.id} date={d} scopeLabel={scopeLabel} scopeColor={scopeColor}
                onDelete={handleDelete} isPast />
            ))}
          </div>
        </div>
      )}

      {dates.length === 0 && <EmptyState message="No blackout periods defined" />}
    </div>
  );
}

function BlackoutCard({
  date, scopeLabel, scopeColor, onDelete, isActive, isPast,
}: {
  date: BlackoutDate;
  scopeLabel: Record<string, string>;
  scopeColor: Record<string, string>;
  onDelete: (id: string) => void;
  isActive?: boolean;
  isPast?: boolean;
}) {
  return (
    <div className={`card p-4 ${isActive ? 'ring-2 ring-red-400/40 dark:ring-red-600/40' : ''} ${isPast ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          isActive ? 'bg-red-100 dark:bg-red-900/30' : 'bg-surface-100 dark:bg-surface-800'
        }`}>
          <CalendarOff className={`w-5 h-5 ${isActive ? 'text-red-500' : ''}`}
            style={isActive ? undefined : { color: 'var(--text-muted)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{date.title}</h3>
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${scopeColor[date.scope] || ''}`}>
              {scopeLabel[date.scope] || date.scope}
            </span>
            {isActive && (
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                ACTIVE NOW
              </span>
            )}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {new Date(date.start_date).toLocaleDateString()} — {new Date(date.end_date).toLocaleDateString()}
            {date.reason && ` • ${date.reason}`}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Created by {date.created_by_name}
          </p>
        </div>
        {!isPast && (
          <button onClick={() => onDelete(date.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-red-400 shrink-0"
            title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
