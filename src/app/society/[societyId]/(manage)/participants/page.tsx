'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  UserCheck, Search, Download, Filter, Calendar,
  CheckCircle, XCircle,
} from 'lucide-react';
import { fetchParticipants, fetchSocietyEvents, SocietyApiError } from '../../../api';
import { PageLoader, ErrorState, EmptyState, StatusBadge } from '../../../_components/Shared';
import type { EventParticipant, SocietyEvent } from '../../../types';
import { SmartImage } from '@/components/SmartImage';

export default function ParticipantsPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEventId = searchParams.get('eventId') || '';
  const [events, setEvents] = useState<SocietyEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState(initialEventId);
  const initializedSelectionRef = useRef(false);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Load events
  useEffect(() => {
    fetchSocietyEvents(societyId)
      .then(evts => {
        setEvents(evts);
        if (!initializedSelectionRef.current) {
          if (initialEventId && evts.some((evt) => evt.id === initialEventId)) {
            setSelectedEvent(initialEventId);
          } else {
            // Default should remain "All Events".
            setSelectedEvent('');
          }
          initializedSelectionRef.current = true;
        }
      })
      .catch((err) => console.error('Failed to fetch society events:', err));
  }, [societyId, initialEventId]);

  // If currently selected event disappears from list, fall back to All Events.
  useEffect(() => {
    if (selectedEvent && events.length > 0 && !events.some((evt) => evt.id === selectedEvent)) {
      setSelectedEvent('');
    }
  }, [events, selectedEvent]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchParticipants(societyId, selectedEvent || undefined);
      setParticipants(data.participants);
      setTotal(data.total);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        if (err.status === 403) { setError('Access denied'); return; }
        setError(err.message);
      } else {
        setError('Failed to load participants');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, selectedEvent, router]);

  useEffect(() => { load(); }, [load]);

  const filtered = participants.filter(p => {
    const q = search.toLowerCase();
    return !q || p.user_name.toLowerCase().includes(q) || p.user_email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Event filter */}
      <div className="card p-4">
        <label className="text-xs font-medium text-muted mb-2 block">Filter by Event</label>
        <select
          className="input-field"
          value={selectedEvent}
          onChange={e => setSelectedEvent(e.target.value)}
        >
          <option value="">All Events</option>
          {events.map(evt => (
            <option key={evt.id} value={evt.id}>{evt.title}</option>
          ))}
        </select>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className="input-field pl-9"
          placeholder="Search participants..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <p className="text-xs text-muted">{filtered.length} of {total} participants</p>

      {/* Participants list */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState message="No participants found" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-themed">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Participant</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Checked In</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Registered</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-themed/50 hover:bg-secondary/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {p.user_avatar ? (
                          <SmartImage src={p.user_avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center text-xs font-bold">
                            {p.user_name[0]}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-primary">{p.user_name}</p>
                          <p className="text-xs text-muted">{p.user_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-secondary truncate max-w-[150px]">{p.event_title}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        p.registration_type === 'TICKET'
                          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      }`}>
                        {p.registration_type}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3">
                      {p.checked_in ? (
                        <div className="flex items-center gap-1 text-green-500">
                          <CheckCircle size={14} />
                          <span className="text-xs">
                            {p.check_in_time
                              ? new Date(p.check_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                              : 'Yes'}
                          </span>
                        </div>
                      ) : (
                        <XCircle size={14} className="text-muted" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {new Date(p.registered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


