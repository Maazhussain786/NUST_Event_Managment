"use client";

import { useState, useEffect, useCallback } from "react";
import {
  GraduationCap,
  Pin,
  Lock,
  Unlock,
  Plus,
  Calendar,
  MapPin,
  ChevronDown,
  ChevronUp,
  Star,
  Users,
  X,
  Pencil,
  Trash2,
  Loader2,
  Upload,
} from "lucide-react";
import {
  PageLoader,
  ErrorState,
  EmptyState,
  StatusBadge,
} from "../_components/Shared";
import { StatCard } from "../_components/StatCard";
import type { UniversityEvent, AdminSociety } from "../types";
import {
  fetchUniversityEvents,
  createUniversityEvent,
  patchUniversityEvent,
  deleteUniversityEvent,
  uploadUniversityEventBanner,
  fetchSocieties,
} from "../api";

export default function UniversityEventsPage() {
  const [events, setEvents] = useState<UniversityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    society_id: "",
    event_start: "",
    event_end: "",
    location: "",
    ticket_price: "",
    max_tickets: "",
    is_pinned: false,
    priority_rank: "0",
  });
  const [submitting, setSubmitting] = useState(false);
  const [createBannerFile, setCreateBannerFile] = useState<File | null>(null);
  const [createBannerPreview, setCreateBannerPreview] = useState("");

  const [editEvent, setEditEvent] = useState<UniversityEvent | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    event_start: "",
    event_end: "",
    location: "",
    ticket_price: "",
    max_tickets: "",
  });
  const [updating, setUpdating] = useState(false);
  const [editBannerFile, setEditBannerFile] = useState<File | null>(null);
  const [editBannerPreview, setEditBannerPreview] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [societies, setSocieties] = useState<AdminSociety[]>([]);

  useEffect(() => {
    return () => {
      if (createBannerPreview.startsWith("blob:")) {
        URL.revokeObjectURL(createBannerPreview);
      }
      if (editBannerPreview.startsWith("blob:")) {
        URL.revokeObjectURL(editBannerPreview);
      }
    };
  }, [createBannerPreview, editBannerPreview]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchUniversityEvents();
      setEvents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let active = true;
    fetchSocieties("APPROVED")
      .then((rows) => {
        if (!active) return;
        setSocieties(rows);
      })
      .catch(() => {
        if (!active) return;
        setSocieties([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const resetCreateForm = () => {
    setForm({
      title: "",
      description: "",
      society_id: "",
      event_start: "",
      event_end: "",
      location: "",
      ticket_price: "",
      max_tickets: "",
      is_pinned: false,
      priority_rank: "0",
    });
    setCreateBannerFile(null);
    setCreateBannerPreview("");
  };

  const handleCreate = async () => {
    if (!form.title || !form.event_start || !form.event_end) return;
    if (
      new Date(form.event_end).getTime() <= new Date(form.event_start).getTime()
    ) {
      alert("End date/time must be after start date/time");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createUniversityEvent({
        title: form.title,
        description: form.description || undefined,
        society_id: form.society_id || undefined,
        event_start: form.event_start,
        event_end: form.event_end,
        location: form.location || undefined,
        ticket_price: form.ticket_price ? Number(form.ticket_price) : undefined,
        max_tickets: form.max_tickets ? Number(form.max_tickets) : undefined,
        is_pinned: form.is_pinned,
        priority_rank: Number(form.priority_rank) || 0,
      });

      if (createBannerFile) {
        await uploadUniversityEventBanner(created.id, createBannerFile);
      }

      setShowCreate(false);
      resetCreateForm();
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  };

  const togglePin = async (id: string, current: boolean) => {
    try {
      await patchUniversityEvent(id, { is_pinned: !current });
      await load();
    } catch {
      /* noop */
    }
  };

  const toggleLock = async (id: string, current: boolean) => {
    try {
      await patchUniversityEvent(id, { is_locked: !current });
      await load();
    } catch {
      /* noop */
    }
  };

  const cancelEvent = async (id: string) => {
    if (!confirm("Cancel this university event?")) return;
    try {
      await patchUniversityEvent(id, { status: "CANCELLED" });
      await load();
    } catch {
      /* noop */
    }
  };

  const openEdit = (ev: UniversityEvent) => {
    const toLocalInput = (iso: string | null) => {
      if (!iso) return "";
      const d = new Date(iso);
      const tz = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - tz).toISOString().slice(0, 16);
    };

    setEditEvent(ev);
    setEditForm({
      title: ev.title || "",
      description: ev.description || "",
      event_start: toLocalInput(ev.event_start),
      event_end: toLocalInput(ev.event_end),
      location: ev.location || "",
      ticket_price: ev.ticket_price ? String(ev.ticket_price) : "",
      max_tickets: ev.max_tickets ? String(ev.max_tickets) : "",
    });
    setEditBannerFile(null);
    setEditBannerPreview("");
  };

  const handleUpdate = async () => {
    if (
      !editEvent ||
      !editForm.title.trim() ||
      !editForm.event_start ||
      !editForm.event_end
    )
      return;
    if (
      new Date(editForm.event_end).getTime() <=
      new Date(editForm.event_start).getTime()
    ) {
      alert("End date/time must be after start date/time");
      return;
    }

    setUpdating(true);
    try {
      await patchUniversityEvent(editEvent.id, {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        event_start: editForm.event_start,
        event_end: editForm.event_end,
        location: editForm.location.trim(),
        ticket_price: editForm.ticket_price ? Number(editForm.ticket_price) : 0,
        max_tickets: editForm.max_tickets
          ? Number(editForm.max_tickets)
          : undefined,
      });

      if (editBannerFile) {
        await uploadUniversityEventBanner(editEvent.id, editBannerFile);
      }

      setEditEvent(null);
      setEditBannerFile(null);
      setEditBannerPreview("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update event");
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Delete this university event from platform listing? This also marks it cancelled.",
      )
    )
      return;
    setDeletingId(id);
    try {
      await deleteUniversityEvent(id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete event");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return "—";
    return new Date(value).toLocaleString("en-PK", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const pinnedCount = events.filter((e) => e.is_pinned).length;
  const activeCount = events.filter((e) => e.status === "APPROVED").length;
  const totalRegs = events.reduce(
    (s, e) => s + Number(e.registration_count || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            University Events
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            NUST official events — pinned, prioritized, and platform-managed
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Create Event
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total University Events"
          value={events.length}
          icon={GraduationCap}
          accent="purple"
        />
        <StatCard
          label="Active / Pinned"
          value={`${activeCount} / ${pinnedCount}`}
          icon={Pin}
          accent="brand"
        />
        <StatCard
          label="Total Registrations"
          value={totalRegs}
          icon={Users}
          accent="blue"
        />
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Create University Event
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
                placeholder="Event Title *"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <textarea
                className="input-field w-full"
                rows={3}
                placeholder="Description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />

              <select
                className="input-field w-full"
                value={form.society_id}
                onChange={(e) =>
                  setForm({ ...form, society_id: e.target.value })
                }
              >
                <option value="">Select host society (optional)</option>
                {societies.map((soc) => (
                  <option key={soc.id} value={soc.id}>
                    {soc.name}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Start *
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field w-full"
                    value={form.event_start}
                    onChange={(e) =>
                      setForm({ ...form, event_start: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    End *
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field w-full"
                    value={form.event_end}
                    onChange={(e) =>
                      setForm({ ...form, event_end: e.target.value })
                    }
                  />
                </div>
              </div>

              <input
                className="input-field w-full"
                placeholder="Venue / Location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />

              <label
                className="text-xs font-medium block"
                style={{ color: "var(--text-secondary)" }}
              >
                Banner File Upload
              </label>
              <input
                type="file"
                accept="image/*"
                className="input-field w-full"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setCreateBannerFile(file);
                  if (createBannerPreview.startsWith("blob:"))
                    URL.revokeObjectURL(createBannerPreview);
                  setCreateBannerPreview(file ? URL.createObjectURL(file) : "");
                }}
              />

              {createBannerPreview && (
                <img
                  src={createBannerPreview}
                  alt="Banner preview"
                  className="w-full h-32 rounded-xl object-cover border"
                  style={{ borderColor: "var(--border-default)" }}
                />
              )}

              <div className="grid grid-cols-3 gap-3">
                <input
                  type="number"
                  className="input-field w-full"
                  placeholder="Price (PKR)"
                  value={form.ticket_price}
                  onChange={(e) =>
                    setForm({ ...form, ticket_price: e.target.value })
                  }
                />
                <input
                  type="number"
                  className="input-field w-full"
                  placeholder="Max tickets"
                  value={form.max_tickets}
                  onChange={(e) =>
                    setForm({ ...form, max_tickets: e.target.value })
                  }
                />
                <input
                  type="number"
                  className="input-field w-full"
                  placeholder="Priority"
                  value={form.priority_rank}
                  onChange={(e) =>
                    setForm({ ...form, priority_rank: e.target.value })
                  }
                />
              </div>

              <label
                className="flex items-center gap-2 text-sm cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                <input
                  type="checkbox"
                  checked={form.is_pinned}
                  onChange={(e) =>
                    setForm({ ...form, is_pinned: e.target.checked })
                  }
                />
                Pin to top of all events
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={
                    submitting ||
                    !form.title ||
                    !form.event_start ||
                    !form.event_end
                  }
                  className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {submitting ? "Creating..." : "Create Event"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Edit University Event
              </h2>
              <button onClick={() => setEditEvent(null)}>
                <X
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
              </button>
            </div>

            <div className="space-y-3">
              <input
                className="input-field w-full"
                placeholder="Event Title *"
                value={editForm.title}
                onChange={(e) =>
                  setEditForm({ ...editForm, title: e.target.value })
                }
              />
              <textarea
                className="input-field w-full"
                rows={3}
                placeholder="Description"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Start *
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field w-full"
                    value={editForm.event_start}
                    onChange={(e) =>
                      setEditForm({ ...editForm, event_start: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    End *
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field w-full"
                    value={editForm.event_end}
                    onChange={(e) =>
                      setEditForm({ ...editForm, event_end: e.target.value })
                    }
                  />
                </div>
              </div>

              <input
                className="input-field w-full"
                placeholder="Venue / Location"
                value={editForm.location}
                onChange={(e) =>
                  setEditForm({ ...editForm, location: e.target.value })
                }
              />

              <label
                className="text-xs font-medium block"
                style={{ color: "var(--text-secondary)" }}
              >
                Replace Banner File
              </label>
              <input
                type="file"
                accept="image/*"
                className="input-field w-full"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setEditBannerFile(file);
                  if (editBannerPreview.startsWith("blob:"))
                    URL.revokeObjectURL(editBannerPreview);
                  setEditBannerPreview(file ? URL.createObjectURL(file) : "");
                }}
              />

              {(editBannerPreview || editEvent.banner_url) && (
                <img
                  src={editBannerPreview || editEvent.banner_url || ""}
                  alt="Banner preview"
                  className="w-full h-32 rounded-xl object-cover border"
                  style={{ borderColor: "var(--border-default)" }}
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  className="input-field w-full"
                  placeholder="Price (PKR)"
                  value={editForm.ticket_price}
                  onChange={(e) =>
                    setEditForm({ ...editForm, ticket_price: e.target.value })
                  }
                />
                <input
                  type="number"
                  className="input-field w-full"
                  placeholder="Max tickets"
                  value={editForm.max_tickets}
                  onChange={(e) =>
                    setEditForm({ ...editForm, max_tickets: e.target.value })
                  }
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEditEvent(null)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={
                    updating ||
                    !editForm.title ||
                    !editForm.event_start ||
                    !editForm.event_end
                  }
                  className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
                >
                  {updating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {updating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <EmptyState message="No university events yet. Create the first one!" />
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <div key={ev.id} className="card p-4">
              <div className="flex items-start gap-4">
                <div className="w-20 h-16 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {ev.banner_url ? (
                    <img
                      src={ev.banner_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <GraduationCap className="w-6 h-6 text-purple-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      className="text-sm font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {ev.title}
                    </h3>
                    <StatusBadge status={ev.status} />
                    {ev.is_pinned && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">
                        <Pin className="w-3 h-3" /> Pinned
                      </span>
                    )}
                    {ev.is_locked && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">
                        <Lock className="w-3 h-3" /> Locked
                      </span>
                    )}
                    {Number(ev.priority_rank) > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-500">
                        <Star className="w-3 h-3" /> P{ev.priority_rank}
                      </span>
                    )}
                  </div>

                  {ev.description && (
                    <p
                      className="text-sm mt-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {ev.description}
                    </p>
                  )}

                  <div
                    className="flex items-center gap-4 mt-1.5 text-xs flex-wrap"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />{" "}
                      {formatDateTime(ev.event_start)}
                    </span>
                    <span className="flex items-center gap-1">
                      End: {formatDateTime(ev.event_end)}
                    </span>
                    {ev.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {ev.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {ev.registration_count}{" "}
                      registered
                    </span>
                    <span>
                      Price: Rs. {Number(ev.ticket_price || 0).toLocaleString()}
                    </span>
                    <span>Max tickets: {ev.max_tickets || "Unlimited"}</span>
                    <span>Created by: {ev.created_by_name || "System"}</span>
                    <span>Created: {formatDateTime(ev.created_at)}</span>
                    {ev.society_name && <span>{ev.society_name}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => togglePin(ev.id, ev.is_pinned)}
                    className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
                    title={ev.is_pinned ? "Unpin" : "Pin"}
                  >
                    {ev.is_pinned ? (
                      <ChevronDown className="w-4 h-4 text-amber-500" />
                    ) : (
                      <ChevronUp
                        className="w-4 h-4"
                        style={{ color: "var(--text-muted)" }}
                      />
                    )}
                  </button>
                  <button
                    onClick={() => toggleLock(ev.id, ev.is_locked)}
                    className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
                    title={ev.is_locked ? "Unlock" : "Lock"}
                  >
                    {ev.is_locked ? (
                      <Unlock className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Lock
                        className="w-4 h-4"
                        style={{ color: "var(--text-muted)" }}
                      />
                    )}
                  </button>
                  {ev.status === "APPROVED" && (
                    <button
                      onClick={() => cancelEvent(ev.id)}
                      className="text-[11px] font-medium px-2 py-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(ev)}
                    className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
                    title="Edit event"
                  >
                    <Pencil
                      className="w-4 h-4"
                      style={{ color: "var(--text-muted)" }}
                    />
                  </button>
                  <button
                    disabled={deletingId === ev.id}
                    onClick={() => handleDelete(ev.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 disabled:opacity-50"
                    title="Delete event"
                  >
                    {deletingId === ev.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
