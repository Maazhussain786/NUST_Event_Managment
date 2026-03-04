'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ScanLine, Clock, ChevronRight, MapPin, Users,
} from 'lucide-react';
import { fetchSocietyEvents, SocietyApiError } from '../../../api';
import { PageLoader, ErrorState, EmptyState } from '../../../_components/Shared';
import type { SocietyEvent } from '../../../types';

/**
 * Entry Control — Event Picker
 *
 * Lists events that support entry control (Upcoming + Ongoing).
 * Each event links to its own entry management page at:
 *   /society/[id]/events/[eventId]/entry
 */
export default function EntryControlPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [events, setEvents] = useState<SocietyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [upcoming, ongoing] = await Promise.all([
          fetchSocietyEvents(societyId, 'UPCOMING'),
          fetchSocietyEvents(societyId, 'ONGOING'),
        ]);
        setEvents([...ongoing, ...upcoming]);
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
    }
    load();
  }, [societyId, router]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-primary mb-1">Entry Control</h2>
        <p className="text-xs text-muted">Select an event to manage check-ins and QR scanning</p>
      </div>

      {events.length === 0 ? (
        <EmptyState message="No upcoming or ongoing events to manage entry for" />
      ) : (
        <div className="space-y-3">
          {events.map(evt => (
            <Link
              key={evt.id}
              href={`/society/${societyId}/events/${evt.id}/entry`}
              className="card p-4 flex items-center gap-4 hover:border-brand-500/30 transition-colors border border-transparent"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                <ScanLine size={24} className="text-brand-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary truncate">{evt.title}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(evt.event_start).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                  {evt.venue && (
                    <span className="text-xs text-muted flex items-center gap-1">
                      <MapPin size={12} /> {evt.venue}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    evt.status === 'ONGOING'
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  }`}>
                    {evt.status}
                  </span>
                  <span className="text-xs text-muted flex items-center gap-1">
                    <Users size={12} /> {evt.participants_count} registered
                  </span>
                </div>
              </div>
              <ChevronRight size={18} className="text-muted flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
