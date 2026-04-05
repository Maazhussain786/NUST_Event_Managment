'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ScanLine, UserCheck, Users, Search, QrCode,
  Clock, Check, AlertTriangle, ArrowLeft, Calendar,
} from 'lucide-react';
import { fetchEntryStats, manualCheckIn, SocietyApiError } from '../../../../../api';
import { PageLoader, ErrorState, EmptyState, StatCard } from '../../../../../_components/Shared';
import type { EntryStats } from '../../../../../types';
import { SmartImage } from '@/components/SmartImage';

export default function EventEntryControlPage() {
  const { societyId, eventId } = useParams<{ societyId: string; eventId: string }>();
  const router = useRouter();
  const [stats, setStats] = useState<EntryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [eventTitle, setEventTitle] = useState<string>('');

  // Load event info
  useEffect(() => {
    fetch(`/api/events/${eventId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.title) setEventTitle(data.title);
        else if (data?.event?.title) setEventTitle(data.event.title);
      })
      .catch((err) => console.error('Failed to fetch event:', err));
  }, [eventId]);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchEntryStats(societyId, eventId);
      setStats(data);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        if (err.status === 403) { setError('Access denied — you need entry control permissions'); return; }
        setError(err.message);
      } else {
        setError('Failed to load entry data');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, eventId, router]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleManualCheckIn = async () => {
    if (!manualEmail.trim()) return;
    try {
      setChecking(true);
      await manualCheckIn(societyId, { eventId, userEmail: manualEmail.trim() });
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

  const filteredScans = stats?.recentScans.filter((r) => {
    const name = String(r.user_name || '').toLowerCase();
    const email = String(r.user_email || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return !q || name.includes(q) || email.includes(q);
  }) || [];

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  return (
    <div className="space-y-4">
      {/* Back + Event header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => router.push(`/society/${societyId}/events`)}
          className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
        >
          <ArrowLeft size={18} className="text-secondary" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-primary truncate">
            {eventTitle || 'Event Entry Control'}
          </h2>
          <p className="text-xs text-muted flex items-center gap-1">
            <Calendar size={12} /> Entry Management
          </p>
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={loadStats} />
      ) : stats ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
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

          {/* QR Scanner link */}
          <Link
            href={`/society/${societyId}/events/${eventId}/entry/scan`}
            className="card p-5 text-center block hover:border-brand-500/30 transition-colors border border-transparent"
          >
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-brand-500/10 flex items-center justify-center">
              <QrCode size={32} className="text-brand-500" />
            </div>
            <p className="text-sm text-primary font-semibold">Scan QR Code</p>
            <p className="text-xs text-muted mt-1">
              Open camera scanner to check in attendees
            </p>
          </Link>

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
                      <SmartImage src={record.user_avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center text-xs font-bold">
                        {String(record.user_name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{record.user_name || 'Unknown Attendee'}</p>
                      <p className="text-xs text-muted">{record.user_email || 'No email available'}</p>
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


