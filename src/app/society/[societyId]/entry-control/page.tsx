'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ScanLine, UserCheck, Users, Search, QrCode,
  Clock, Check, AlertTriangle,
} from 'lucide-react';
import { fetchEntryStats, manualCheckIn, fetchSocietyEvents, SocietyApiError } from '../../api';
import { PageLoader, ErrorState, EmptyState, StatCard } from '../../_components/Shared';
import type { EntryStats, AttendanceRecord, SocietyEvent } from '../../types';

export default function EntryControlPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<SocietyEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState(searchParams.get('eventId') || '');
  const [stats, setStats] = useState<EntryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load events for dropdown
  useEffect(() => {
    fetchSocietyEvents(societyId, 'UPCOMING')
      .then(evts => {
        // Also fetch ongoing
        return fetchSocietyEvents(societyId, 'ONGOING').then(ongoing => [...ongoing, ...evts]);
      })
      .then(allEvents => {
        setEvents(allEvents);
        if (!selectedEvent && allEvents.length > 0) {
          setSelectedEvent(allEvents[0].id);
        }
      })
      .catch(() => {});
  }, [societyId, selectedEvent]);

  const loadStats = useCallback(async () => {
    if (!selectedEvent) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const data = await fetchEntryStats(societyId, selectedEvent);
      setStats(data);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        if (err.status === 403) { setError('Access denied'); return; }
        setError(err.message);
      } else {
        setError('Failed to load entry data');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, selectedEvent, router]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleManualCheckIn = async () => {
    if (!manualEmail.trim() || !selectedEvent) return;
    try {
      setChecking(true);
      await manualCheckIn(societyId, { eventId: selectedEvent, userEmail: manualEmail.trim() });
      setToast('Check-in successful!');
      setManualEmail('');
      loadStats();
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 409) {
          setToast('Already checked in');
        } else {
          setToast(err.message);
        }
      } else {
        setToast('Check-in failed');
      }
    } finally {
      setChecking(false);
    }
  };

  const filteredScans = stats?.recentScans.filter(r =>
    !searchQuery || r.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.user_email.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  return (
    <div className="space-y-4">
      {/* Event selector */}
      <div className="card p-4">
        <label className="text-xs font-medium text-muted mb-2 block">Select Event</label>
        <select
          className="input-field"
          value={selectedEvent}
          onChange={e => setSelectedEvent(e.target.value)}
        >
          <option value="">Choose an event...</option>
          {events.map(evt => (
            <option key={evt.id} value={evt.id}>
              {evt.title} ({evt.status})
            </option>
          ))}
        </select>
      </div>

      {!selectedEvent ? (
        <EmptyState message="Select an event to manage entry" />
      ) : loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={loadStats} />
      ) : stats ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Registered" value={stats.totalRegistered} icon={Users} accent="blue" />
            <StatCard label="Checked In" value={stats.totalCheckedIn} icon={UserCheck} accent="green" />
            <StatCard label="Ticketed" value={stats.totalTicketed} icon={ScanLine} accent="purple" />
          </div>

          {/* Check-in progress */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-primary">Check-in Progress</span>
              <span className="text-xs text-muted">
                {stats.totalCheckedIn} / {stats.totalRegistered + stats.totalTicketed}
              </span>
            </div>
            <div className="h-3 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{
                  width: `${(stats.totalRegistered + stats.totalTicketed) > 0
                    ? (stats.totalCheckedIn / (stats.totalRegistered + stats.totalTicketed) * 100)
                    : 0}%`
                }}
              />
            </div>
          </div>

          {/* Manual check-in */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
              <UserCheck size={16} /> Manual Check-in
            </h3>
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                placeholder="Enter attendee email..."
                value={manualEmail}
                onChange={e => setManualEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleManualCheckIn()}
              />
              <button
                onClick={handleManualCheckIn}
                disabled={checking || !manualEmail.trim()}
                className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
              >
                {checking ? (
                  <Clock size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                Check In
              </button>
            </div>
          </div>

          {/* QR scanner placeholder */}
          <div className="card p-4 text-center">
            <QrCode size={48} className="mx-auto text-muted mb-2" />
            <p className="text-sm text-secondary font-medium">QR Scanner</p>
            <p className="text-xs text-muted">
              Use the event check-in API endpoint for QR-based scanning via the mobile app
            </p>
          </div>

          {/* Recent check-ins */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-primary">Recent Check-ins</h3>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  className="input-field pl-8 text-xs w-48"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {filteredScans.length === 0 ? (
              <EmptyState message="No check-ins yet" />
            ) : (
              <div className="space-y-2">
                {filteredScans.map(record => (
                  <div key={record.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50">
                    {record.user_avatar ? (
                      <img src={record.user_avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center text-xs font-bold">
                        {record.user_name[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{record.user_name}</p>
                      <p className="text-xs text-muted">{record.user_email}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium
                        ${record.check_in_method === 'QR'
                          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}
                      >
                        {record.check_in_method}
                      </span>
                      <p className="text-xs text-muted mt-0.5">
                        {new Date(record.check_in_time).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
