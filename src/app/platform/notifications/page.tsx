"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  Plus,
  Send,
  Trash2,
  X,
  Users,
  Target,
  AlertTriangle,
  Clock,
  Eye,
  Pencil,
} from "lucide-react";
import {
  ErrorState,
  EmptyState,
  StatusBadge,
} from "../_components/Shared";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "../_components/StatCard";
import type { PlatformNotification, PushReminderStats } from "../types";
import {
  fetchNotifications,
  createNotification,
  updateNotification,
  deleteNotification,
  fetchPushReminderStats,
  runPushReminderDryRun,
  runPushReminderDispatch,
  retryPushReminderDispatch,
} from "../api";

function NotificationsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-56 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-44 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
             <div className="flex justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="w-4 h-4" />
             </div>
             <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>

      <div className="card p-4 space-y-4">
         <div className="flex items-start justify-between gap-4">
            <div>
               <Skeleton className="h-6 w-48 mb-2" />
               <Skeleton className="h-4 w-96" />
            </div>
            <div className="flex items-center gap-2">
               <Skeleton className="h-10 w-24 rounded-lg" />
               <Skeleton className="h-10 w-32 rounded-lg" />
               <Skeleton className="h-10 w-32 rounded-lg" />
            </div>
         </div>
      </div>

      <div className="space-y-3">
         {[1, 2, 3, 4].map(i => (
           <div key={i} className="card p-4 flex gap-4">
             <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
             <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                   <Skeleton className="h-5 w-40" />
                   <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <div className="flex gap-4 mt-2">
                   <Skeleton className="h-3 w-20" />
                   <Skeleton className="h-3 w-24" />
                   <Skeleton className="h-3 w-28" />
                   <Skeleton className="h-3 w-32" />
                </div>
             </div>
             <div className="flex gap-2">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <Skeleton className="w-8 h-8 rounded-lg" />
             </div>
           </div>
         ))}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<PlatformNotification[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "",
    body: "",
    priority: "NORMAL",
    target_type: "ALL",
    target_id: "",
    scheduled_at: "",
    expires_at: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [editNotification, setEditNotification] =
    useState<PlatformNotification | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    body: "",
    priority: "NORMAL",
    target_type: "ALL",
    target_id: "",
    scheduled_at: "",
    expires_at: "",
  });
  const [updating, setUpdating] = useState(false);
  const [pushStats, setPushStats] = useState<PushReminderStats | null>(null);
  const [pushLoading, setPushLoading] = useState(true);
  const [dispatchingPush, setDispatchingPush] = useState(false);
  const [dryRunningPush, setDryRunningPush] = useState(false);
  const [retryingPush, setRetryingPush] = useState(false);
  const [pushOperationMessage, setPushOperationMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchNotifications();
      setNotifications(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadPushStats = useCallback(async () => {
    try {
      setPushLoading(true);
      const data = await fetchPushReminderStats(7);
      setPushStats(data);
    } catch (e) {
      setPushOperationMessage(
        e instanceof Error ? e.message : "Failed to load push reminder stats",
      );
    } finally {
      setPushLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPushStats();
  }, [loadPushStats]);

  const handleCreate = async () => {
    if (!form.title || !form.body) return;
    setSubmitting(true);
    try {
      await createNotification({
        title: form.title,
        body: form.body,
        priority: form.priority,
        target_type: form.target_type,
        target_id: form.target_id || undefined,
        scheduled_at: form.scheduled_at || undefined,
        expires_at: form.expires_at || undefined,
      });
      setShowCreate(false);
      setForm({
        title: "",
        body: "",
        priority: "NORMAL",
        target_type: "ALL",
        target_id: "",
        scheduled_at: "",
        expires_at: "",
      });
      load();
    } catch {
      /* noop */
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deactivate this notification?")) return;
    try {
      await deleteNotification(id);
      load();
    } catch {
      /* noop */
    }
  };

  const handleDispatchPush = async () => {
    setDispatchingPush(true);
    setPushOperationMessage("");
    try {
      const res = await runPushReminderDispatch();
      const payload = res?.result as
        | {
            dispatchedCount?: number;
            push?: { sentCount?: number; failedCount?: number };
          }
        | undefined;

      setPushOperationMessage(
        `Dispatch completed: ${payload?.dispatchedCount || 0} reminders, ${payload?.push?.sentCount || 0} sent, ${payload?.push?.failedCount || 0} failed.`,
      );
      await loadPushStats();
    } catch (e) {
      setPushOperationMessage(
        e instanceof Error ? e.message : "Dispatch failed",
      );
    } finally {
      setDispatchingPush(false);
    }
  };

  const handleRetryPush = async () => {
    setRetryingPush(true);
    setPushOperationMessage("");
    try {
      const res = await retryPushReminderDispatch({
        statuses: ["FAILED", "NO_TOKENS", "PARTIAL"],
        lookbackHours: 24,
        limit: 1000,
      });
      const payload = res?.result as
        | {
            deletedCount?: number;
            dispatch?: {
              dispatchedCount?: number;
              push?: { sentCount?: number; failedCount?: number };
            };
          }
        | undefined;
      setPushOperationMessage(
        `Retry completed: reset ${payload?.deletedCount || 0} entries, dispatched ${payload?.dispatch?.dispatchedCount || 0}, sent ${payload?.dispatch?.push?.sentCount || 0}, failed ${payload?.dispatch?.push?.failedCount || 0}.`,
      );
      await loadPushStats();
    } catch (e) {
      setPushOperationMessage(
        e instanceof Error ? e.message : "Retry failed",
      );
    } finally {
      setRetryingPush(false);
    }
  };

  const handleDryRunPush = async () => {
    setDryRunningPush(true);
    setPushOperationMessage("");
    try {
      const res = await runPushReminderDryRun();
      const payload = res?.result as
        | {
            candidateCount?: number;
            breakdown?: Record<string, number>;
          }
        | undefined;
      const breakdown = payload?.breakdown || {};
      setPushOperationMessage(
        `Dry run: ${payload?.candidateCount || 0} candidates (${Object.entries(breakdown)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")}).`,
      );
    } catch (e) {
      setPushOperationMessage(
        e instanceof Error ? e.message : "Dry run failed",
      );
    } finally {
      setDryRunningPush(false);
    }
  };

  const toLocalInput = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 16);
  };

  const openEdit = (n: PlatformNotification) => {
    setEditNotification(n);
    setEditForm({
      title: n.title || "",
      body: n.body || "",
      priority: n.priority || "NORMAL",
      target_type: n.target_type || "ALL",
      target_id: n.target_id || "",
      scheduled_at: toLocalInput(n.scheduled_at),
      expires_at: toLocalInput(n.expires_at),
    });
  };

  const handleUpdate = async () => {
    if (!editNotification || !editForm.title || !editForm.body) return;
    setUpdating(true);
    try {
      await updateNotification(editNotification.id, {
        title: editForm.title,
        body: editForm.body,
        priority: editForm.priority,
        target_type: editForm.target_type,
        target_id: editForm.target_id || undefined,
        scheduled_at: editForm.scheduled_at || undefined,
        expires_at: editForm.expires_at || undefined,
      });
      setEditNotification(null);
      await load();
    } catch {
      /* noop */
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <NotificationsSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const activeCount = notifications.filter((n) => n.is_active).length;
  const urgentCount = notifications.filter(
    (n) => n.priority === "URGENT" || n.priority === "HIGH",
  ).length;
  const totalReads = notifications.reduce(
    (s, n) => s + Number(n.read_count || 0),
    0,
  );

  const priorityColor: Record<string, string> = {
    LOW: "text-gray-500",
    NORMAL: "text-blue-500",
    HIGH: "text-amber-500",
    URGENT: "text-red-500",
  };

  const priorityBg: Record<string, string> = {
    LOW: "bg-gray-100 dark:bg-gray-800/50",
    NORMAL: "bg-blue-100 dark:bg-blue-900/30",
    HIGH: "bg-amber-100 dark:bg-amber-900/30",
    URGENT: "bg-red-100 dark:bg-red-900/30",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Notification Engine
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Broadcast in-app notifications to users, societies, or all
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Notification
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Active Notifications"
          value={activeCount}
          icon={Bell}
          accent="brand"
        />
        <StatCard
          label="High / Urgent"
          value={urgentCount}
          icon={AlertTriangle}
          accent="red"
        />
        <StatCard
          label="Total Reads"
          value={totalReads}
          icon={Eye}
          accent="blue"
        />
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Push Reminder Operations
            </h2>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Monitor event reminder delivery and run safe dispatch/retry actions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDryRunPush}
              disabled={dryRunningPush}
              className="btn-secondary"
            >
              {dryRunningPush ? "Checking..." : "Dry Run"}
            </button>
            <button
              onClick={handleDispatchPush}
              disabled={dispatchingPush}
              className="btn-primary"
            >
              {dispatchingPush ? "Dispatching..." : "Run Dispatch"}
            </button>
            <button
              onClick={handleRetryPush}
              disabled={retryingPush}
              className="btn-secondary"
            >
              {retryingPush ? "Retrying..." : "Retry Failures"}
            </button>
          </div>
        </div>

        {pushOperationMessage && (
          <div className="rounded-lg border border-border bg-surface-50 dark:bg-surface-900/40 px-3 py-2 text-xs">
            {pushOperationMessage}
          </div>
        )}

        {pushLoading ? (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading push stats...
          </div>
        ) : pushStats ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-lg border border-border p-2 text-xs">
                <div style={{ color: "var(--text-muted)" }}>Active Tokens</div>
                <div className="text-base font-semibold">{pushStats.tokens.active}</div>
              </div>
              <div className="rounded-lg border border-border p-2 text-xs">
                <div style={{ color: "var(--text-muted)" }}>Inactive Tokens</div>
                <div className="text-base font-semibold">{pushStats.tokens.inactive}</div>
              </div>
              <div className="rounded-lg border border-border p-2 text-xs">
                <div style={{ color: "var(--text-muted)" }}>Expo Tokens</div>
                <div className="text-base font-semibold">{pushStats.tokens.expo}</div>
              </div>
              <div className="rounded-lg border border-border p-2 text-xs">
                <div style={{ color: "var(--text-muted)" }}>FCM Tokens</div>
                <div className="text-base font-semibold">{pushStats.tokens.fcm}</div>
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-surface-100 dark:bg-surface-900/50">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Reminder Type</th>
                    <th className="text-left px-2 py-2 font-medium">Status</th>
                    <th className="text-right px-2 py-2 font-medium">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {pushStats.summary.length === 0 ? (
                    <tr>
                      <td className="px-2 py-3" colSpan={3}>
                        No reminder records in lookback window.
                      </td>
                    </tr>
                  ) : (
                    pushStats.summary.map((row) => (
                      <tr key={`${row.notification_type}-${row.dispatch_status}`} className="border-t border-border">
                        <td className="px-2 py-2">{row.notification_type}</td>
                        <td className="px-2 py-2">{row.dispatch_status}</td>
                        <td className="px-2 py-2 text-right font-medium">{row.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                <Send className="w-5 h-5 inline mr-2" /> Send Notification
              </h2>
              <button onClick={() => setShowCreate(false)}>
                <X
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="input-field w-full"
                placeholder="Notification Title *"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <textarea
                className="input-field w-full"
                rows={3}
                placeholder="Message body *"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Priority
                  </label>
                  <select
                    className="input-field w-full"
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: e.target.value })
                    }
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Target
                  </label>
                  <select
                    className="input-field w-full"
                    value={form.target_type}
                    onChange={(e) =>
                      setForm({ ...form, target_type: e.target.value })
                    }
                  >
                    <option value="ALL">All Users</option>
                    <option value="SOCIETY">Specific Society</option>
                    <option value="EVENT">Specific Event</option>
                    <option value="USER">Specific User</option>
                  </select>
                </div>
              </div>
              {form.target_type !== "ALL" && (
                <input
                  className="input-field w-full"
                  placeholder="Target ID (UUID)"
                  value={form.target_id}
                  onChange={(e) =>
                    setForm({ ...form, target_id: e.target.value })
                  }
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Schedule (optional)
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field w-full"
                    value={form.scheduled_at}
                    onChange={(e) =>
                      setForm({ ...form, scheduled_at: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Expires (optional)
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field w-full"
                    value={form.expires_at}
                    onChange={(e) =>
                      setForm({ ...form, expires_at: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={submitting || !form.title || !form.body}
                  className="btn-primary flex-1"
                >
                  {submitting ? "Sending..." : "Send Notification"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                <Pencil className="w-5 h-5 inline mr-2" /> Edit Notification
              </h2>
              <button onClick={() => setEditNotification(null)}>
                <X
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="input-field w-full"
                placeholder="Notification Title *"
                value={editForm.title}
                onChange={(e) =>
                  setEditForm({ ...editForm, title: e.target.value })
                }
              />
              <textarea
                className="input-field w-full"
                rows={3}
                placeholder="Message body *"
                value={editForm.body}
                onChange={(e) =>
                  setEditForm({ ...editForm, body: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Priority
                  </label>
                  <select
                    className="input-field w-full"
                    value={editForm.priority}
                    onChange={(e) =>
                      setEditForm({ ...editForm, priority: e.target.value })
                    }
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Target
                  </label>
                  <select
                    className="input-field w-full"
                    value={editForm.target_type}
                    onChange={(e) =>
                      setEditForm({ ...editForm, target_type: e.target.value })
                    }
                  >
                    <option value="ALL">All Users</option>
                    <option value="SOCIETY">Specific Society</option>
                    <option value="EVENT">Specific Event</option>
                    <option value="USER">Specific User</option>
                  </select>
                </div>
              </div>
              {editForm.target_type !== "ALL" && (
                <input
                  className="input-field w-full"
                  placeholder="Target ID (UUID)"
                  value={editForm.target_id}
                  onChange={(e) =>
                    setEditForm({ ...editForm, target_id: e.target.value })
                  }
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Schedule (optional)
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field w-full"
                    value={editForm.scheduled_at}
                    onChange={(e) =>
                      setEditForm({ ...editForm, scheduled_at: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Expires (optional)
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field w-full"
                    value={editForm.expires_at}
                    onChange={(e) =>
                      setEditForm({ ...editForm, expires_at: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEditNotification(null)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={updating || !editForm.title || !editForm.body}
                  className="btn-primary flex-1"
                >
                  {updating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <EmptyState message="No notifications sent yet" />
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`card p-4 ${!n.is_active ? "opacity-50" : ""}`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${priorityBg[n.priority] || priorityBg.NORMAL}`}
                >
                  <Bell
                    className={`w-5 h-5 ${priorityColor[n.priority] || ""}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      className="text-sm font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {n.title}
                    </h3>
                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${priorityBg[n.priority] || ""} ${priorityColor[n.priority] || ""}`}
                    >
                      {n.priority}
                    </span>
                    {!n.is_active && <StatusBadge status="DEACTIVATED" />}
                  </div>
                  <p
                    className="text-xs mt-1 line-clamp-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {n.body}
                  </p>
                  <div
                    className="flex items-center gap-3 mt-1.5 text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span className="flex items-center gap-1">
                      <Target className="w-3 h-3" />{" "}
                      {n.target_label || n.target_type}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {n.read_count}/
                      {n.total_target} read
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {n.sender_name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />{" "}
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                {n.is_active && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(n)}
                      className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-slate-500"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-red-400"
                      title="Deactivate"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
