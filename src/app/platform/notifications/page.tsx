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
  PageLoader,
  ErrorState,
  EmptyState,
  StatusBadge,
} from "../_components/Shared";
import { StatCard } from "../_components/StatCard";
import type { PlatformNotification } from "../types";
import {
  fetchNotifications,
  createNotification,
  updateNotification,
  deleteNotification,
} from "../api";

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

  if (loading) return <PageLoader />;
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
