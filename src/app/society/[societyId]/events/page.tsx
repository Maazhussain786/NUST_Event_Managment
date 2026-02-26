'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Calendar, Plus, Eye, Users as UsersIcon,
  Clock, MapPin, Ticket, Filter,
} from 'lucide-react';
import { fetchSocietyEvents, createSocietyEvent, SocietyApiError } from '../../api';
import { PageLoader, ErrorState, EmptyState, StatusBadge } from '../../_components/Shared';
import type { SocietyEvent, EventStatus } from '../../types';

const STATUS_TABS: { label: string; value: string }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Upcoming', value: 'UPCOMING' },
  { label: 'Ongoing', value: 'ONGOING' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function SocietyEventsPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [events, setEvents] = useState<SocietyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Create form state
  const [form, setForm] = useState({
    title: '', description: '', event_start: '', event_end: '',
    venue: '', visibility: 'PUBLIC', ticket_price: '',
    max_participants: '', registration_deadline: '', thumbnail_url: '',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSocietyEvents(societyId, filter);
      setEvents(data);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        if (err.status === 403) { setError('Access denied'); return; }
        setError(err.message);
      } else {
        setError('Failed to load events');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, filter, router]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.title || !form.event_start) {
      setToast('Title and start date are required');
      return;
    }
    try {
      setCreating(true);
      await createSocietyEvent(societyId, {
        title: form.title,
        description: form.description || undefined,
        event_start: form.event_start,
        event_end: form.event_end || undefined,
        venue: form.venue || undefined,
        visibility: form.visibility,
        ticket_price: form.ticket_price ? Number(form.ticket_price) : undefined,
        max_participants: form.max_participants ? Number(form.max_participants) : undefined,
        registration_deadline: form.registration_deadline || undefined,
        thumbnail_url: form.thumbnail_url || '/placeholder-event.jpg',
      });
      setToast('Event created successfully');
      setShowCreate(false);
      setForm({
        title: '', description: '', event_start: '', event_end: '',
        venue: '', visibility: 'PUBLIC', ticket_price: '',
        max_participants: '', registration_deadline: '', thumbnail_url: '',
      });
      load();
    } catch (err) {
      if (err instanceof SocietyApiError) {
        setToast(err.message);
      } else {
        setToast('Failed to create event');
      }
    } finally {
      setCreating(false);
    }
  };

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-muted" />
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={`chip text-xs whitespace-nowrap ${filter === tab.value ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm px-3 py-2 flex items-center gap-1.5">
          <Plus size={16} /> New
        </button>
      </div>

      {/* Events list */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : events.length === 0 ? (
        <EmptyState message="No events found" />
      ) : (
        <div className="space-y-3">
          {events.map(event => (
            <div key={event.id} className="card p-4 hover:border-brand-500/30 transition-colors">
              <div className="flex items-start gap-3">
                {event.banner_url ? (
                  <img src={event.banner_url} alt="" className="h-14 w-14 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 flex-shrink-0">
                    <Calendar size={22} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-primary truncate">{event.title}</h3>
                    <StatusBadge status={event.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(event.event_start).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                    {event.venue && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} /> {event.venue}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <UsersIcon size={12} /> {event.participants_count} registered
                    </span>
                    {event.ticket_price && Number(event.ticket_price) > 0 && (
                      <span className="flex items-center gap-1">
                        <Ticket size={12} /> Rs. {Number(event.ticket_price).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/society/${societyId}/participants?eventId=${event.id}`)}
                  className="btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                >
                  <Eye size={14} /> View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create event dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-semibold text-primary mb-4">Create Event</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Title *</label>
                <input className="input-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Description</label>
                <textarea className="input-field min-h-[80px]" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Start *</label>
                  <input type="datetime-local" className="input-field" value={form.event_start} onChange={e => setForm({ ...form, event_start: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">End</label>
                  <input type="datetime-local" className="input-field" value={form.event_end} onChange={e => setForm({ ...form, event_end: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Venue</label>
                <input className="input-field" value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Visibility</label>
                  <select className="input-field" value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value })}>
                    <option value="PUBLIC">Public</option>
                    <option value="MEMBERS_ONLY">Members Only</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Ticket Price</label>
                  <input type="number" className="input-field" placeholder="0 = free" value={form.ticket_price} onChange={e => setForm({ ...form, ticket_price: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Max Participants</label>
                  <input type="number" className="input-field" placeholder="Unlimited" value={form.max_participants} onChange={e => setForm({ ...form, max_participants: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Registration Deadline</label>
                  <input type="datetime-local" className="input-field" value={form.registration_deadline} onChange={e => setForm({ ...form, registration_deadline: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setShowCreate(false)} className="btn-ghost text-sm px-4 py-2" disabled={creating}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating} className="btn-primary text-sm px-4 py-2">
                {creating ? 'Creating...' : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
