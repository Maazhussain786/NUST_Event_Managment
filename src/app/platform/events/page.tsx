"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  Search,
  CheckCircle2,
  XCircle,
  MapPin,
  Users,
  Clock,
  Ticket,
  Plus,
  Trash2,
  Loader2,
  X,
  Pencil,
  Pin,
  PinOff,
  Upload,
} from "lucide-react";
import { StatusBadge } from "../_components/StatusBadge";
import { PageLoader, ErrorState, EmptyState } from "../_components/Shared";
import {
  fetchEvents,
  patchEvent,
  createEvent,
  deleteEvent,
  fetchSocieties,
  uploadEventBanner,
  updateEvent,
} from "../api";
import type { AdminEvent, EventStatus, AdminSociety } from "../types";
import { SmartImage } from '@/components/SmartImage';

const STATUS_TABS: { label: string; value: EventStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default function EventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EventStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reasonModal, setReasonModal] = useState<{
    id: string;
    action: string;
  } | null>(null);
  const [reason, setReason] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createBannerFile, setCreateBannerFile] = useState<File | null>(null);
  const [createBannerPreview, setCreateBannerPreview] = useState("");

  const [editEvent, setEditEvent] = useState<AdminEvent | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    event_start: "",
    event_end: "",
    registration_deadline: "",
    location: "",
    ticket_price: "",
    max_tickets: "",
  });
  const [updating, setUpdating] = useState(false);
  const [editBannerFile, setEditBannerFile] = useState<File | null>(null);
  const [editBannerPreview, setEditBannerPreview] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingPinId, setTogglingPinId] = useState<string | null>(null);

  const [societies, setSocieties] = useState<AdminSociety[]>([]);
  const [defaultHostSocietyId, setDefaultHostSocietyId] = useState("");
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    event_start: "",
    event_end: "",
    registration_deadline: "",
    location: "",
    ticket_price: "",
    max_tickets: "",
    society_id: "",
    cohost_society_ids: [] as string[],
    include_nust_administration: true,
  });

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
      setError(null);
      const data = await fetchEvents(activeTab);
      setEvents(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let active = true;
    fetchSocieties("APPROVED")
      .then((rows) => {
        if (!active) return;
        setSocieties(rows);

        const nustAdmin = rows.find(
          (soc) => soc.name.trim().toLowerCase() === "nust administration",
        );
        const nextDefault = nustAdmin?.id || rows[0]?.id || "";
        setDefaultHostSocietyId(nextDefault);
        setCreateForm((prev) =>
          prev.society_id
            ? prev
            : {
                ...prev,
                society_id: nextDefault,
              },
        );
      })
      .catch(() => {
        if (!active) return;
        setSocieties([]);
        setDefaultHostSocietyId("");
      });

    return () => {
      active = false;
    };
  }, []);

  const handleAction = async (
    id: string,
    action: string,
    actionReason?: string,
  ) => {
    setActionLoading(id);
    try {
      await patchEvent(id, action, actionReason);
      setReasonModal(null);
      setReason("");
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreate = async () => {
    if (
      !createForm.title ||
      !createForm.event_start ||
      !createForm.event_end ||
      !createForm.society_id
    ) {
      return;
    }

    if (
      new Date(createForm.event_end).getTime() <=
      new Date(createForm.event_start).getTime()
    ) {
      alert("End date/time must be after start date/time");
      return;
    }

    setCreating(true);
    try {
      const created = await createEvent({
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        event_start: createForm.event_start,
        event_end: createForm.event_end,
        registration_deadline: createForm.registration_deadline || undefined,
        location: createForm.location.trim() || undefined,
        ticket_price: createForm.ticket_price
          ? Number(createForm.ticket_price)
          : 0,
        max_tickets: createForm.max_tickets
          ? Number(createForm.max_tickets)
          : undefined,
        society_id: createForm.society_id,
        cohost_society_ids: createForm.cohost_society_ids,
        include_nust_administration: createForm.include_nust_administration,
      });

      if (createBannerFile && created.id) {
        await uploadEventBanner(created.id, createBannerFile);
      }

      setShowCreate(false);
      setCreateForm({
        title: "",
        description: "",
        event_start: "",
        event_end: "",
        registration_deadline: "",
        location: "",
        ticket_price: "",
        max_tickets: "",
        society_id: defaultHostSocietyId,
        cohost_society_ids: [],
        include_nust_administration: true,
      });
      setCreateBannerFile(null);
      if (createBannerPreview.startsWith("blob:")) {
        URL.revokeObjectURL(createBannerPreview);
      }
      setCreateBannerPreview("");
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Delete this event? This will hide it from active platform listings.",
      )
    ) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteEvent(id);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete event");
    } finally {
      setDeletingId(null);
    }
  };

  const openEdit = (evt: AdminEvent) => {
    const toLocalInput = (iso: string | null) => {
      if (!iso) return "";
      const d = new Date(iso);
      const tz = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - tz).toISOString().slice(0, 16);
    };

    setEditEvent(evt);
    setEditForm({
      title: evt.title || "",
      description: evt.description || "",
      event_start: toLocalInput(evt.start_date),
      event_end: toLocalInput(evt.end_date || evt.start_date),
      registration_deadline: toLocalInput(evt.registration_deadline || null),
      location: evt.venue || "",
      ticket_price: evt.ticket_price ? String(evt.ticket_price) : "",
      max_tickets: evt.capacity ? String(evt.capacity) : "",
    });
    setEditBannerFile(null);
    if (editBannerPreview.startsWith("blob:")) {
      URL.revokeObjectURL(editBannerPreview);
    }
    setEditBannerPreview("");
  };

  const handleUpdate = async () => {
    if (!editEvent || !editForm.title || !editForm.event_start || !editForm.event_end) {
      return;
    }

    if (
      new Date(editForm.event_end).getTime() <=
      new Date(editForm.event_start).getTime()
    ) {
      alert("End date/time must be after start date/time");
      return;
    }

    setUpdating(true);
    try {
      await updateEvent(editEvent.id, {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        event_start: editForm.event_start,
        event_end: editForm.event_end,
        registration_deadline: editForm.registration_deadline || undefined,
        location: editForm.location.trim(),
        ticket_price: editForm.ticket_price ? Number(editForm.ticket_price) : 0,
        max_tickets: editForm.max_tickets ? Number(editForm.max_tickets) : 0,
      });

      if (editBannerFile) {
        const uploaded = await uploadEventBanner(editEvent.id, editBannerFile);
        if (uploaded.data?.url) {
          await updateEvent(editEvent.id, { banner_url: uploaded.data.url });
        }
      }

      setEditEvent(null);
      setEditBannerFile(null);
      if (editBannerPreview.startsWith("blob:")) {
        URL.revokeObjectURL(editBannerPreview);
      }
      setEditBannerPreview("");
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update event");
    } finally {
      setUpdating(false);
    }
  };

  const togglePin = async (eventId: string, currentPinned: boolean) => {
    setTogglingPinId(eventId);
    try {
      await patchEvent(eventId, currentPinned ? "UNPINNED" : "PINNED");
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update pin");
    } finally {
      setTogglingPinId(null);
    }
  };

  const filtered = events.filter(
    (e) =>
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      (e.society_name &&
        e.society_name.toLowerCase().includes(search.toLowerCase())),
  );

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Events
          </h1>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--text-secondary)" }}
          >
            Review and manage all platform events
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" /> Create Event
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`chip ${activeTab === tab.value ? "active" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events or societies..."
          className="input-field pl-10"
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState message="No events found" />
      ) : (
        <div className="space-y-3">
          {filtered.map((evt) => (
            <div key={evt.id} className="card p-5">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center shrink-0 overflow-hidden">
                  {evt.banner_url ? (
                    <SmartImage
                      src={evt.banner_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Calendar
                      className="w-6 h-6"
                      style={{ color: "var(--text-muted)" }}
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      className="text-sm font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {evt.title}
                    </h3>
                    <StatusBadge status={evt.status} />
                    {evt.is_pinned && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">
                        <Pin className="w-3 h-3" /> Pinned
                      </span>
                    )}
                  </div>
                  <p
                    className="text-xs mt-1 line-clamp-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {evt.description}
                  </p>

                  {evt.society_name && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {evt.society_logo && (
                        <SmartImage
                          src={evt.society_logo}
                          alt=""
                          className="w-4 h-4 rounded-full object-cover"
                        />
                      )}
                      <span
                        className="text-xs font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {evt.society_name}
                      </span>
                    </div>
                  )}

                  <div
                    className="flex items-center gap-4 mt-2 text-xs flex-wrap"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatDate(evt.start_date)}{" "}
                      {formatTime(evt.start_date)}
                    </span>
                    {evt.venue && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {evt.venue}
                      </span>
                    )}
                    {evt.capacity && (
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {evt.capacity}
                      </span>
                    )}
                    {evt.ticket_price !== null &&
                      evt.ticket_price !== undefined &&
                      Number(evt.ticket_price) > 0 && (
                        <span className="flex items-center gap-1">
                          <Ticket className="w-3 h-3" /> Rs. {Number(evt.ticket_price).toLocaleString()}
                        </span>
                      )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    disabled={togglingPinId === evt.id}
                    onClick={() => togglePin(evt.id, Boolean(evt.is_pinned))}
                    className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400
                      hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50"
                    title={evt.is_pinned ? "Unpin Event" : "Pin Event"}
                  >
                    {togglingPinId === evt.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : evt.is_pinned ? (
                      <PinOff className="w-4 h-4" />
                    ) : (
                      <Pin className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    onClick={() => openEdit(evt)}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300
                      hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title="Edit Event"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  {evt.status === "PENDING" && (
                    <>
                      <button
                        disabled={actionLoading === evt.id}
                        onClick={() => handleAction(evt.id, "APPROVED")}
                        className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400
                          hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                        title="Approve"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        disabled={actionLoading === evt.id}
                        onClick={() => {
                          setReasonModal({ id: evt.id, action: "REJECTED" });
                          setReason("");
                        }}
                        className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400
                          hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                        title="Reject"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {evt.status === "APPROVED" && (
                    <button
                      disabled={actionLoading === evt.id}
                      onClick={() => {
                        setReasonModal({ id: evt.id, action: "CANCELLED" });
                        setReason("");
                      }}
                      className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400
                        hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                      title="Cancel Event"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    disabled={deletingId === evt.id}
                    onClick={() => handleDelete(evt.id)}
                    className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400
                      hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                    title="Delete Event"
                  >
                    {deletingId === evt.id ? (
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

      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <div className="card p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Create Event
              </h3>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800"
              >
                <X
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
              </button>
            </div>

            <div className="space-y-3">
              <input
                className="input-field w-full"
                placeholder="Event title *"
                value={createForm.title}
                onChange={(e) =>
                  setCreateForm({ ...createForm, title: e.target.value })
                }
              />

              <textarea
                className="input-field w-full"
                rows={3}
                placeholder="Description"
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm({ ...createForm, description: e.target.value })
                }
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
                  if (createBannerPreview.startsWith("blob:")) {
                    URL.revokeObjectURL(createBannerPreview);
                  }
                  setCreateBannerPreview(file ? URL.createObjectURL(file) : "");
                }}
              />

              {createBannerPreview && (
                <SmartImage
                  src={createBannerPreview}
                  alt="Banner preview"
                  className="w-full h-32 rounded-xl object-cover border"
                  style={{ borderColor: "var(--border-default)" }}
                />
              )}

              <select
                className="input-field w-full"
                value={createForm.society_id}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    society_id: e.target.value,
                    cohost_society_ids: createForm.cohost_society_ids.filter(
                      (id) => id !== e.target.value,
                    ),
                  })
                }
              >
                <option value="">Select host society *</option>
                {societies.map((soc) => (
                  <option key={soc.id} value={soc.id}>
                    {soc.name}
                  </option>
                ))}
              </select>

              <label
                className="text-xs font-medium block"
                style={{ color: "var(--text-secondary)" }}
              >
                Additional co-host societies
              </label>
              <select
                multiple
                className="input-field w-full min-h-[96px]"
                value={createForm.cohost_society_ids}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions)
                    .map((opt) => opt.value)
                    .filter((value) => value !== createForm.society_id);
                  setCreateForm({ ...createForm, cohost_society_ids: values });
                }}
              >
                {societies
                  .filter((soc) => soc.id !== createForm.society_id)
                  .map((soc) => (
                    <option key={soc.id} value={soc.id}>
                      {soc.name}
                    </option>
                  ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={createForm.include_nust_administration}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      include_nust_administration: e.target.checked,
                    })
                  }
                />
                Add NUST Administration as co-host
              </label>

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
                    value={createForm.event_start}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        event_start: e.target.value,
                      })
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
                    value={createForm.event_end}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        event_end: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label
                  className="text-xs font-medium mb-1 block"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Registration Last Date
                </label>
                <input
                  type="datetime-local"
                  className="input-field w-full"
                  value={createForm.registration_deadline}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      registration_deadline: e.target.value,
                    })
                  }
                />
              </div>

              <input
                className="input-field w-full"
                placeholder="Venue / Location"
                value={createForm.location}
                onChange={(e) =>
                  setCreateForm({ ...createForm, location: e.target.value })
                }
              />

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  className="input-field w-full"
                  placeholder="Ticket price (PKR)"
                  value={createForm.ticket_price}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      ticket_price: e.target.value,
                    })
                  }
                />
                <input
                  type="number"
                  className="input-field w-full"
                  placeholder="Max tickets"
                  value={createForm.max_tickets}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      max_tickets: e.target.value,
                    })
                  }
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowCreate(false)}
                  className="btn-secondary text-sm py-2.5 px-4"
                >
                  Cancel
                </button>
                <button
                  disabled={
                    creating ||
                    !createForm.title ||
                    !createForm.event_start ||
                    !createForm.event_end ||
                    !createForm.society_id
                  }
                  onClick={handleCreate}
                  className="btn-primary text-sm py-2.5 px-4 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {creating ? "Creating..." : "Create Event"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editEvent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <div className="card p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-lg font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Edit Event
              </h3>
              <button
                onClick={() => setEditEvent(null)}
                className="p-1 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800"
              >
                <X
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
              </button>
            </div>

            <div className="space-y-3">
              <input
                className="input-field w-full"
                placeholder="Event title *"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
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

              <div>
                <label
                  className="text-xs font-medium mb-1 block"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Registration Last Date
                </label>
                <input
                  type="datetime-local"
                  className="input-field w-full"
                  value={editForm.registration_deadline}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      registration_deadline: e.target.value,
                    })
                  }
                />
              </div>

              <input
                className="input-field w-full"
                placeholder="Venue / Location"
                value={editForm.location}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
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
                  if (editBannerPreview.startsWith("blob:")) {
                    URL.revokeObjectURL(editBannerPreview);
                  }
                  setEditBannerPreview(file ? URL.createObjectURL(file) : "");
                }}
              />

              {(editBannerPreview || editEvent.banner_url) && (
                <SmartImage
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
                  placeholder="Ticket price (PKR)"
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

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setEditEvent(null)}
                  className="btn-secondary text-sm py-2.5 px-4"
                >
                  Cancel
                </button>
                <button
                  disabled={
                    updating ||
                    !editForm.title ||
                    !editForm.event_start ||
                    !editForm.event_end
                  }
                  onClick={handleUpdate}
                  className="btn-primary text-sm py-2.5 px-4 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {updating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {updating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reasonModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <div className="card p-6 w-full max-w-md">
            <h3
              className="text-lg font-bold mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              {reasonModal.action === "REJECTED"
                ? "Reject Event"
                : "Cancel Event"}
            </h3>
            <p
              className="text-sm mb-4"
              style={{ color: "var(--text-secondary)" }}
            >
              Provide a reason for this action.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason..."
              rows={3}
              className="input-field mb-4 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setReasonModal(null);
                  setReason("");
                }}
                className="btn-secondary text-sm py-2.5 px-4"
              >
                Cancel
              </button>
              <button
                disabled={!reason.trim() || actionLoading === reasonModal.id}
                onClick={() =>
                  handleAction(reasonModal.id, reasonModal.action, reason)
                }
                className="btn-primary text-sm py-2.5 px-4 disabled:opacity-50"
              >
                {actionLoading === reasonModal.id ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


