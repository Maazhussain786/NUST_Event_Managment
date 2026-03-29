'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  AlertTriangle,
  Info,
  CheckCircle,
  Megaphone,
  Loader2,
  Send,
  Clock3,
  XCircle,
  PlayCircle,
} from 'lucide-react';
import {
  fetchSocietyNotifications,
  markNotificationRead,
  fetchEventBroadcasts,
  createEventBroadcast,
  updateEventBroadcast,
  fetchSocietyEvents,
  SocietyApiError,
} from '../../../api';
import { PageLoader, ErrorState, EmptyState, StatusBadge } from '../../../_components/Shared';
import type {
  SocietyNotification,
  SocietyEventBroadcast,
  SocietyEvent,
  EventBroadcastTargetScope,
  EventBroadcastSeverity,
  EventBroadcastUpdateType,
} from '../../../types';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  info: <Info size={16} className="text-blue-500" />,
  warning: <AlertTriangle size={16} className="text-amber-500" />,
  success: <CheckCircle size={16} className="text-green-500" />,
  error: <AlertTriangle size={16} className="text-red-500" />,
};

interface BroadcastComposerState {
  eventId: string;
  title: string;
  message: string;
  updateType: EventBroadcastUpdateType;
  severity: EventBroadcastSeverity;
  targetScope: EventBroadcastTargetScope;
  includePush: boolean;
  includeInApp: boolean;
  scheduledAt: string;
}

const DEFAULT_COMPOSER: BroadcastComposerState = {
  eventId: '',
  title: '',
  message: '',
  updateType: 'GENERAL',
  severity: 'IMPORTANT',
  targetScope: 'ALL_PARTICIPANTS',
  includePush: true,
  includeInApp: true,
  scheduledAt: '',
};

function statusColor(status: string): string {
  if (status === 'SENT') return 'text-green-600';
  if (status === 'PARTIAL') return 'text-amber-600';
  if (status === 'FAILED') return 'text-red-600';
  if (status === 'CANCELLED') return 'text-muted';
  return 'text-brand-500';
}

export default function NotificationsPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();

  const [tab, setTab] = useState<'inbox' | 'broadcasts'>('broadcasts');

  const [notifications, setNotifications] = useState<SocietyNotification[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const [broadcasts, setBroadcasts] = useState<SocietyEventBroadcast[]>([]);
  const [events, setEvents] = useState<SocietyEvent[]>([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(true);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [canManageBroadcasts, setCanManageBroadcasts] = useState(false);
  const [updateTypes, setUpdateTypes] = useState<EventBroadcastUpdateType[]>([
    'GENERAL',
    'SCHEDULE_CHANGE',
    'VENUE_CHANGE',
    'DELAY',
    'EARLY_START',
    'IMPORTANT',
  ]);
  const [severities, setSeverities] = useState<EventBroadcastSeverity[]>([
    'INFO',
    'IMPORTANT',
    'URGENT',
  ]);
  const [targetScopes, setTargetScopes] = useState<EventBroadcastTargetScope[]>([
    'ALL_PARTICIPANTS',
    'TICKET_HOLDERS',
    'REGISTRATIONS_ONLY',
  ]);

  const [composer, setComposer] = useState<BroadcastComposerState>(DEFAULT_COMPOSER);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastActionId, setBroadcastActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    try {
      setLoadingInbox(true);
      setInboxError(null);
      const data = await fetchSocietyNotifications(societyId);
      setNotifications(data);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) {
          router.push('/login');
          return;
        }
        setInboxError(err.message);
      } else {
        setInboxError('Failed to load notifications');
      }
    } finally {
      setLoadingInbox(false);
    }
  }, [societyId, router]);

  const loadBroadcasts = useCallback(async () => {
    try {
      setLoadingBroadcasts(true);
      setBroadcastError(null);

      const [broadcastRes, eventsRes] = await Promise.all([
        fetchEventBroadcasts(societyId),
        fetchSocietyEvents(societyId, 'ALL'),
      ]);

      setBroadcasts(broadcastRes.broadcasts || []);
      setCanManageBroadcasts(Boolean(broadcastRes.permissions?.canManage));

      if (broadcastRes.options) {
        if (Array.isArray(broadcastRes.options.updateTypes) && broadcastRes.options.updateTypes.length > 0) {
          setUpdateTypes(broadcastRes.options.updateTypes);
        }
        if (Array.isArray(broadcastRes.options.severities) && broadcastRes.options.severities.length > 0) {
          setSeverities(broadcastRes.options.severities);
        }
        if (Array.isArray(broadcastRes.options.targetScopes) && broadcastRes.options.targetScopes.length > 0) {
          setTargetScopes(broadcastRes.options.targetScopes);
        }
      }

      const activeEvents = eventsRes.filter(
        (event) => event.status !== 'CANCELLED' && event.status !== 'ARCHIVED',
      );
      setEvents(activeEvents);

      if (activeEvents.length > 0) {
        setComposer((prev) =>
          prev.eventId ? prev : { ...prev, eventId: activeEvents[0].id },
        );
      }
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) {
          router.push('/login');
          return;
        }
        setBroadcastError(err.message);
      } else {
        setBroadcastError('Failed to load event updates');
      }
    } finally {
      setLoadingBroadcasts(false);
    }
  }, [societyId, router]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    loadBroadcasts();
  }, [loadBroadcasts]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(societyId, id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
    } catch {
      // no-op
    }
  };

  const handleSendBroadcast = async () => {
    if (!composer.eventId) {
      setToast('Please select an event');
      return;
    }
    if (!composer.title.trim()) {
      setToast('Title is required');
      return;
    }
    if (!composer.message.trim()) {
      setToast('Message is required');
      return;
    }
    if (!composer.includePush && !composer.includeInApp) {
      setToast('Select at least one channel');
      return;
    }

    try {
      setSendingBroadcast(true);
      const response = await createEventBroadcast(societyId, {
        eventId: composer.eventId,
        title: composer.title.trim(),
        message: composer.message.trim(),
        updateType: composer.updateType,
        severity: composer.severity,
        targetScope: composer.targetScope,
        includePush: composer.includePush,
        includeInApp: composer.includeInApp,
        scheduledAt: composer.scheduledAt ? new Date(composer.scheduledAt).toISOString() : null,
      });

      setToast(response.dispatched ? 'Event update sent' : 'Event update scheduled');
      setComposer((prev) => ({
        ...DEFAULT_COMPOSER,
        eventId: prev.eventId,
        updateType: prev.updateType,
        severity: prev.severity,
        targetScope: prev.targetScope,
      }));
      await loadBroadcasts();
    } catch (err) {
      if (err instanceof SocietyApiError) {
        setToast(err.message);
      } else {
        setToast('Failed to send event update');
      }
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleBroadcastAction = async (
    broadcastId: string,
    action: 'CANCEL' | 'SEND_NOW',
  ) => {
    try {
      setBroadcastActionId(broadcastId);
      await updateEventBroadcast(societyId, broadcastId, action);
      setToast(action === 'CANCEL' ? 'Scheduled update cancelled' : 'Update sent');
      await loadBroadcasts();
    } catch (err) {
      if (err instanceof SocietyApiError) {
        setToast(err.message);
      } else {
        setToast('Failed to update broadcast');
      }
    } finally {
      setBroadcastActionId(null);
    }
  };

  const filteredInbox =
    filter === 'unread' ? notifications.filter((item) => !item.is_read) : notifications;
  const unreadCount = notifications.filter((item) => !item.is_read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('broadcasts')}
            className={`chip text-xs ${tab === 'broadcasts' ? 'active' : ''}`}
          >
            Event Updates ({broadcasts.length})
          </button>
          <button
            onClick={() => setTab('inbox')}
            className={`chip text-xs ${tab === 'inbox' ? 'active' : ''}`}
          >
            Inbox ({notifications.length})
          </button>
        </div>
      </div>

      {tab === 'inbox' ? (
        <>
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

          {loadingInbox ? (
            <PageLoader />
          ) : inboxError ? (
            <ErrorState message={inboxError} onRetry={loadInbox} />
          ) : filteredInbox.length === 0 ? (
            <EmptyState message={filter === 'unread' ? 'No unread notifications' : 'No notifications'} />
          ) : (
            <div className="space-y-2">
              {filteredInbox.map((notif) => (
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
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
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
        </>
      ) : loadingBroadcasts ? (
        <PageLoader />
      ) : broadcastError ? (
        <ErrorState message={broadcastError} onRetry={loadBroadcasts} />
      ) : (
        <div className="space-y-4">
          {canManageBroadcasts ? (
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Megaphone size={16} className="text-brand-500" />
                <h3 className="text-sm font-semibold text-primary">Send Event Update</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">Event</label>
                  <select
                    className="input-field"
                    value={composer.eventId}
                    onChange={(e) =>
                      setComposer((prev) => ({ ...prev, eventId: e.target.value }))
                    }
                  >
                    <option value="">Select event</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Type</label>
                  <select
                    className="input-field"
                    value={composer.updateType}
                    onChange={(e) =>
                      setComposer((prev) => ({
                        ...prev,
                        updateType: e.target.value as EventBroadcastUpdateType,
                      }))
                    }
                  >
                    {updateTypes.map((type) => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">Severity</label>
                  <select
                    className="input-field"
                    value={composer.severity}
                    onChange={(e) =>
                      setComposer((prev) => ({
                        ...prev,
                        severity: e.target.value as EventBroadcastSeverity,
                      }))
                    }
                  >
                    {severities.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Audience</label>
                  <select
                    className="input-field"
                    value={composer.targetScope}
                    onChange={(e) =>
                      setComposer((prev) => ({
                        ...prev,
                        targetScope: e.target.value as EventBroadcastTargetScope,
                      }))
                    }
                  >
                    {targetScopes.map((scope) => (
                      <option key={scope} value={scope}>
                        {scope.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted mb-1 block">Title</label>
                <input
                  className="input-field"
                  value={composer.title}
                  onChange={(e) =>
                    setComposer((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="e.g. Event delayed by 1 hour"
                  maxLength={300}
                />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Message</label>
                <textarea
                  className="input-field min-h-[88px]"
                  value={composer.message}
                  onChange={(e) =>
                    setComposer((prev) => ({ ...prev, message: e.target.value }))
                  }
                  placeholder="Write the update participants should receive..."
                  maxLength={4000}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">Schedule (optional)</label>
                  <input
                    type="datetime-local"
                    className="input-field"
                    value={composer.scheduledAt}
                    onChange={(e) =>
                      setComposer((prev) => ({ ...prev, scheduledAt: e.target.value }))
                    }
                  />
                </div>
                <div className="flex items-center gap-4 pt-6">
                  <label className="inline-flex items-center gap-2 text-xs text-secondary">
                    <input
                      type="checkbox"
                      checked={composer.includeInApp}
                      onChange={(e) =>
                        setComposer((prev) => ({ ...prev, includeInApp: e.target.checked }))
                      }
                    />
                    In-app
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-secondary">
                    <input
                      type="checkbox"
                      checked={composer.includePush}
                      onChange={(e) =>
                        setComposer((prev) => ({ ...prev, includePush: e.target.checked }))
                      }
                    />
                    Push
                  </label>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSendBroadcast}
                  disabled={sendingBroadcast}
                  className="btn-primary text-xs px-3 py-2 flex items-center gap-1.5"
                >
                  {sendingBroadcast ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {sendingBroadcast
                    ? 'Sending...'
                    : composer.scheduledAt
                      ? 'Schedule Update'
                      : 'Send Update'}
                </button>
              </div>
            </div>
          ) : (
            <div className="card p-4 text-xs text-muted">
              You can view event update history, but you do not have permission to send updates.
            </div>
          )}

          {broadcasts.length === 0 ? (
            <EmptyState message="No event updates sent yet" />
          ) : (
            <div className="space-y-2">
              {broadcasts.map((broadcast) => {
                const isPendingAction = broadcastActionId === broadcast.id;
                const canCancel =
                  canManageBroadcasts &&
                  (broadcast.status === 'SCHEDULED' || broadcast.status === 'PENDING');

                return (
                  <div key={broadcast.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-primary truncate">{broadcast.title}</p>
                          <StatusBadge status={broadcast.status} />
                          <span className={`text-[11px] font-medium ${statusColor(broadcast.status)}`}>
                            {broadcast.severity}
                          </span>
                        </div>
                        <p className="text-xs text-muted mt-1">{broadcast.message}</p>
                        <div className="text-[11px] text-muted mt-2 flex flex-wrap gap-x-3 gap-y-1">
                          <span>Event: {broadcast.event_title || 'Unknown event'}</span>
                          <span>Audience: {broadcast.target_scope.replace(/_/g, ' ')}</span>
                          <span>Recipients: {broadcast.recipient_count}</span>
                          <span>In-app: {broadcast.in_app_delivered_count}</span>
                          <span>Push sent: {broadcast.push_sent_count}</span>
                          <span>Push failed: {broadcast.push_failed_count}</span>
                          <span>
                            Created:{' '}
                            {new Date(broadcast.created_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                          {broadcast.scheduled_at && (
                            <span className="inline-flex items-center gap-1">
                              <Clock3 size={12} />
                              Scheduled:{' '}
                              {new Date(broadcast.scheduled_at).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                        {broadcast.last_error ? (
                          <p className="text-[11px] text-red-500 mt-1">{broadcast.last_error}</p>
                        ) : null}
                      </div>
                      {canCancel ? (
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleBroadcastAction(broadcast.id, 'SEND_NOW')}
                            disabled={isPendingAction}
                            className="btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                          >
                            {isPendingAction ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <PlayCircle size={13} />
                            )}
                            Send now
                          </button>
                          <button
                            onClick={() => handleBroadcastAction(broadcast.id, 'CANCEL')}
                            disabled={isPendingAction}
                            className="btn-ghost text-xs px-2 py-1 flex items-center gap-1 text-red-500"
                          >
                            <XCircle size={13} />
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-surface-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
