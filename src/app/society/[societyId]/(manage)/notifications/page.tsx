'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Bell, Check, Clock, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { fetchSocietyNotifications, markNotificationRead, SocietyApiError } from '../../../api';
import { PageLoader, ErrorState, EmptyState } from '../../../_components/Shared';
import type { SocietyNotification } from '../../../types';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  'info': <Info size={16} className="text-blue-500" />,
  'warning': <AlertTriangle size={16} className="text-amber-500" />,
  'success': <CheckCircle size={16} className="text-green-500" />,
  'error': <AlertTriangle size={16} className="text-red-500" />,
};

export default function NotificationsPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [notifications, setNotifications] = useState<SocietyNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSocietyNotifications(societyId);
      setNotifications(data);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        setError(err.message);
      } else {
        setError('Failed to load notifications');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, router]);

  useEffect(() => { load(); }, [load]);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(societyId, id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch {
      // Silently fail
    }
  };

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`chip text-xs ${filter === 'all' ? 'active' : ''}`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`chip text-xs ${filter === 'unread' ? 'active' : ''}`}
          >
            Unread ({unreadCount})
          </button>
        </div>
      </div>

      {/* Notifications */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState message={filter === 'unread' ? 'No unread notifications' : 'No notifications'} />
      ) : (
        <div className="space-y-2">
          {filtered.map(notif => (
            <div
              key={notif.id}
              className={`card p-4 transition-colors ${!notif.is_read ? 'border-l-2 border-l-brand-500' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">
                  {TYPE_ICONS[notif.type] || <Bell size={16} className="text-muted" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${notif.is_read ? 'text-secondary' : 'text-primary font-medium'}`}>
                    {notif.title}
                  </p>
                  <p className="text-xs text-muted mt-0.5">{notif.body}</p>
                  <p className="text-xs text-muted mt-1">
                    {new Date(notif.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </p>
                </div>
                {!notif.is_read && (
                  <button
                    onClick={() => handleMarkRead(notif.id)}
                    className="btn-ghost text-xs px-2 py-1 flex-shrink-0"
                    title="Mark as read"
                  >
                    <Check size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
