'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Calendar, Plus, Eye, Users as UsersIcon,
  Clock, MapPin, Ticket, Filter, Edit3, Trash2,
  XCircle, MoreHorizontal, Loader2, X, Upload,
} from 'lucide-react';
import {
  fetchSocietyEvents, createSocietyEvent, editEvent, cancelEvent,
  deleteEvent, uploadSocietyMedia, SocietyApiError,
} from '../../../api';
import { PageLoader, ErrorState, EmptyState, StatusBadge } from '../../../_components/Shared';
import type { SocietyEvent, EventStatus } from '../../../types';

const STATUS_TABS: { label: string; value: string }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Upcoming', value: 'UPCOMING' },
  { label: 'Ongoing', value: 'ONGOING' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function SocietyEventsPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [events, setEvents] = useState<SocietyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Create form state
  const [form, setForm] = useState({
    title: '', description: '', event_start: '', event_end: '',
    venue: '', visibility: 'PUBLIC', ticket_price: '',
    max_participants: '', registration_deadline: '', thumbnail_url: '',
  });

  // Edit/Delete/Cancel state
  const [menuEvent, setMenuEvent] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<SocietyEvent | null>(null);
  const [editForm, setEditForm] = useState({
    title: '', description: '', event_start: '', event_end: '',
    venue: '', visibility: 'PUBLIC', ticket_price: '',
    max_participants: '', banner_url: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<SocietyEvent | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SocietyEvent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSocietyEvents(societyId, filter);
      setEvents(data);
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
  }, [societyId, filter, router]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.title || !form.event_start) {
      setToast('Title and start date are required');
      return;
    }
    try {
      setCreating(true);
      await createSocietyEvent(societyId, {
        title: form.title,
        description: form.description || undefined,
        event_start: form.event_start,
        event_end: form.event_end || undefined,
        venue: form.venue || undefined,
        visibility: form.visibility,
        ticket_price: form.ticket_price ? Number(form.ticket_price) : undefined,
        max_participants: form.max_participants ? Number(form.max_participants) : undefined,
        registration_deadline: form.registration_deadline || undefined,
        thumbnail_url: form.thumbnail_url || '/placeholder-event.jpg',
      });
      setToast('Event created successfully');
      setShowCreate(false);
      setForm({
        title: '', description: '', event_start: '', event_end: '',
        venue: '', visibility: 'PUBLIC', ticket_price: '',
        max_participants: '', registration_deadline: '', thumbnail_url: '',
      });
      load();
    } catch (err) {
      if (err instanceof SocietyApiError) {
        setToast(err.message);
      } else {
        setToast('Failed to create event');
      }
    } finally {
      setCreating(false);
    }
  };

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const openEdit = (evt: SocietyEvent) => {
    setEditingEvent(evt);
    setEditForm({
      title: evt.title,
      description: evt.description || '',
      event_start: evt.event_start ? new Date(evt.event_start).toISOString().slice(0, 16) : '',
      event_end: evt.event_end ? new Date(evt.event_end).toISOString().slice(0, 16) : '',
      venue: evt.venue || '',
      visibility: evt.visibility || 'PUBLIC',
      ticket_price: evt.ticket_price ? String(evt.ticket_price) : '',
      max_participants: evt.max_participants ? String(evt.max_participants) : '',
      banner_url: evt.banner_url || '',
    });
    setMenuEvent(null);
  };

  const handleEditEvent = async () => {
    if (!editingEvent) return;
    try {
      setSavingEdit(true);
      await editEvent(editingEvent.id, {
        title: editForm.title,
        description: editForm.description || undefined,
        event_start: editForm.event_start,
        event_end: editForm.event_end || undefined,
        location: editForm.venue || undefined,
        visibility: editForm.visibility as 'PUBLIC' | 'MEMBERS_ONLY',
        ticket_price: editForm.ticket_price ? Number(editForm.ticket_price) : undefined,
        max_participants: editForm.max_participants ? Number(editForm.max_participants) : undefined,
        banner_url: editForm.banner_url || undefined,
        version: editingEvent.version || 1,
      });
      setToast('Event updated');
      setEditingEvent(null);
      load();
    } catch (err) {
      setToast(err instanceof SocietyApiError ? err.message : 'Failed to update event');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelEvent = async () => {
    if (!confirmCancel) return;
    try {
      setCancelling(true);
      await cancelEvent(confirmCancel.id, cancelReason || undefined);
      setToast('Event cancelled');
      setConfirmCancel(null);
      setCancelReason('');
      load();
    } catch (err) {
      setToast(err instanceof SocietyApiError ? err.message : 'Failed to cancel event');
    } finally {
      setCancelling(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!confirmDelete) return;
    try {
      setDeleting(true);
      await deleteEvent(societyId, confirmDelete.id);
      setToast('Event deleted');
      setConfirmDelete(null);
      load();
    } catch (err) {
      setToast(err instanceof SocietyApiError ? err.message : 'Failed to delete — may have sold tickets');
    } finally {
      setDeleting(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingBanner(true);
      const result = await uploadSocietyMedia(societyId, 'gallery', file);
      setEditForm(prev => ({ ...prev, banner_url: result.url }));
    } catch (err) {
      setToast('Failed to upload banner');
    } finally {
      setUploadingBanner(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-muted" />
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={`chip text-xs whitespace-nowrap ${filter === tab.value ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm px-3 py-2 flex items-center gap-1.5">
          <Plus size={16} /> New
        </button>
      </div>

      {/* Events list */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : events.length === 0 ? (
        <EmptyState message="No events found" />
      ) : (
        <div className="space-y-3">
          {events.map(event => (
            <div key={event.id} className="card p-4 hover:border-brand-500/30 transition-colors">
              <div className="flex items-start gap-3">
                {event.banner_url ? (
                  <img src={event.banner_url} alt="" className="h-14 w-14 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 flex-shrink-0">
                    <Calendar size={22} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-primary truncate">{event.title}</h3>
                    <StatusBadge status={event.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(event.event_start).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                    {event.venue && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} /> {event.venue}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <UsersIcon size={12} /> {event.participants_count} registered
                    </span>
                    {event.ticket_price && Number(event.ticket_price) > 0 && (
                      <span className="flex items-center gap-1">
                        <Ticket size={12} /> Rs. {Number(event.ticket_price).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/society/${societyId}/participants?eventId=${event.id}`)}
                  className="btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                >
                  <Eye size={14} /> View
                </button>
                <div className="relative">
                  <button
                    onClick={() => setMenuEvent(menuEvent === event.id ? null : event.id)}
                    className="btn-ghost text-xs p-1.5"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {menuEvent === event.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuEvent(null)} />
                      <div className="absolute right-0 top-8 z-50 w-36 rounded-lg border border-themed bg-card shadow-xl py-1">
                        <button
                          onClick={() => openEdit(event)}
                          className="w-full text-left px-3 py-2 text-xs text-secondary hover:bg-secondary flex items-center gap-2"
                        >
                          <Edit3 size={12} /> Edit
                        </button>
                        {event.status !== 'CANCELLED' && (
                          <button
                            onClick={() => { setConfirmCancel(event); setMenuEvent(null); }}
                            className="w-full text-left px-3 py-2 text-xs text-amber-500 hover:bg-amber-500/5 flex items-center gap-2"
                          >
                            <XCircle size={12} /> Cancel
                          </button>
                        )}
                        <button
                          onClick={() => { setConfirmDelete(event); setMenuEvent(null); }}
                          className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-500/5 flex items-center gap-2"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create event dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-semibold text-primary mb-4">Create Event</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Title *</label>
                <input className="input-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Description</label>
                <textarea className="input-field min-h-[80px]" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Start *</label>
                  <input type="datetime-local" className="input-field" value={form.event_start} onChange={e => setForm({ ...form, event_start: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">End</label>
                  <input type="datetime-local" className="input-field" value={form.event_end} onChange={e => setForm({ ...form, event_end: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Venue</label>
                <input className="input-field" value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Visibility</label>
                  <select className="input-field" value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value })}>
                    <option value="PUBLIC">Public</option>
                    <option value="MEMBERS_ONLY">Members Only</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Ticket Price</label>
                  <input type="number" className="input-field" placeholder="0 = free" value={form.ticket_price} onChange={e => setForm({ ...form, ticket_price: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Max Participants</label>
                  <input type="number" className="input-field" placeholder="Unlimited" value={form.max_participants} onChange={e => setForm({ ...form, max_participants: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Registration Deadline</label>
                  <input type="datetime-local" className="input-field" value={form.registration_deadline} onChange={e => setForm({ ...form, registration_deadline: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setShowCreate(false)} className="btn-ghost text-sm px-4 py-2" disabled={creating}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating} className="btn-primary text-sm px-4 py-2">
                {creating ? 'Creating...' : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit event dialog */}
      {editingEvent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingEvent(null)}>
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-primary">Edit Event</h3>
              <button onClick={() => setEditingEvent(null)} className="text-muted hover:text-primary"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Title *</label>
                <input className="input-field" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Description</label>
                <textarea className="input-field min-h-[80px]" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Start *</label>
                  <input type="datetime-local" className="input-field" value={editForm.event_start} onChange={e => setEditForm({ ...editForm, event_start: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">End</label>
                  <input type="datetime-local" className="input-field" value={editForm.event_end} onChange={e => setEditForm({ ...editForm, event_end: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Venue</label>
                <input className="input-field" value={editForm.venue} onChange={e => setEditForm({ ...editForm, venue: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Banner Image</label>
                {editForm.banner_url ? (
                  <div className="relative group rounded-lg overflow-hidden">
                    <img src={editForm.banner_url} alt="" className="w-full h-32 object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-white/90 text-gray-800 text-xs font-medium hover:bg-white flex items-center gap-1.5">
                        <Upload size={12} /> Replace
                        <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} disabled={uploadingBanner} />
                      </label>
                      <button onClick={() => setEditForm({ ...editForm, banner_url: '' })} className="px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-medium hover:bg-red-600">
                        Remove
                      </button>
                    </div>
                    {uploadingBanner && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 size={20} className="animate-spin text-white" />
                      </div>
                    )}
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-themed cursor-pointer hover:border-brand-500/50">
                    {uploadingBanner ? <Loader2 size={20} className="animate-spin text-muted" /> : (
                      <>
                        <Upload size={18} className="text-muted mb-1" />
                        <span className="text-xs text-muted">Upload banner</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} disabled={uploadingBanner} />
                  </label>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Visibility</label>
                  <select className="input-field" value={editForm.visibility} onChange={e => setEditForm({ ...editForm, visibility: e.target.value })}>
                    <option value="PUBLIC">Public</option>
                    <option value="MEMBERS_ONLY">Members Only</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted mb-1 block">Ticket Price</label>
                  <input type="number" className="input-field" placeholder="0 = free" value={editForm.ticket_price} onChange={e => setEditForm({ ...editForm, ticket_price: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setEditingEvent(null)} className="btn-ghost text-sm px-4 py-2" disabled={savingEdit}>Cancel</button>
              <button onClick={handleEditEvent} disabled={savingEdit} className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5">
                {savingEdit ? <Loader2 size={14} className="animate-spin" /> : null}
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel event dialog */}
      {confirmCancel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmCancel(null)}>
          <div className="card w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-primary mb-2">Cancel Event?</h3>
            <p className="text-sm text-muted mb-3">"{confirmCancel.title}" will be cancelled. Ticket holders will be notified.</p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (optional)"
              className="input-field text-sm w-full min-h-[60px] mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmCancel(null)} className="btn-ghost text-sm px-4 py-2" disabled={cancelling}>No, Keep</button>
              <button onClick={handleCancelEvent} disabled={cancelling} className="bg-amber-500 hover:bg-amber-600 text-white text-sm px-4 py-2 rounded-lg font-medium">
                {cancelling ? 'Cancelling...' : 'Yes, Cancel Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete event dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="card w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-primary mb-2">Delete Event?</h3>
            <p className="text-sm text-muted mb-4">"{confirmDelete.title}" will be permanently deleted. This cannot be undone. Events with sold tickets cannot be deleted.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost text-sm px-4 py-2" disabled={deleting}>Cancel</button>
              <button onClick={handleDeleteEvent} disabled={deleting} className="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-lg font-medium">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
