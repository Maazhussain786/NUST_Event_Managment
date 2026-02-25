'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Plus,
  MessageSquare,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  Send,
} from 'lucide-react';
import { PageLoader, ErrorState, EmptyState, StatusBadge } from '../_components/Shared';
import { fetchIncidents, createIncident, updateIncident } from '../api';
import type { Incident } from '../types';

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-500/20 text-red-500',
  HIGH: 'bg-orange-500/20 text-orange-500',
  MEDIUM: 'bg-amber-500/20 text-amber-500',
  LOW: 'bg-blue-500/20 text-blue-500',
};

const STATUS_OPTIONS = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'] as const;
const SEVERITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSeverity, setNewSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchIncidents();
      setIncidents(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createIncident({ title: newTitle.trim(), description: newDesc.trim(), severity: newSeverity });
      setNewTitle('');
      setNewDesc('');
      setNewSeverity('MEDIUM');
      setShowCreate(false);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      await updateIncident(id, { status });
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSeverityChange = async (id: string, severity: string) => {
    setUpdatingId(id);
    try {
      await updateIncident(id, { severity });
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAddNote = async (id: string) => {
    const note = noteText[id]?.trim();
    if (!note) return;
    setUpdatingId(id);
    try {
      await updateIncident(id, { note });
      setNoteText(prev => ({ ...prev, [id]: '' }));
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setUpdatingId(null);
    }
  };

  const openCount = incidents.filter(i => i.status === 'OPEN' || i.status === 'INVESTIGATING').length;
  const criticalCount = incidents.filter(i => i.severity === 'CRITICAL' && i.status !== 'CLOSED').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Incident Management</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Track and resolve platform incidents
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Report Incident
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{incidents.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Total</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-amber-500">{openCount}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Open</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{criticalCount}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Critical</p>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-lg space-y-4">
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Report New Incident</h3>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Title *</label>
              <input
                className="input-field w-full"
                placeholder="Brief incident title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Description</label>
              <textarea
                className="input-field w-full h-24 resize-none"
                placeholder="Describe the incident..."
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Severity</label>
              <div className="flex gap-2">
                {SEVERITY_OPTIONS.map(sev => (
                  <button
                    key={sev}
                    onClick={() => setNewSeverity(sev)}
                    className={`chip ${newSeverity === sev ? 'active' : ''}`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary text-sm px-4 py-2">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim() || creating}
                className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-50"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                <AlertTriangle className="w-4 h-4" />
                Create Incident
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incident List */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : incidents.length === 0 ? (
        <EmptyState message="No incidents reported" />
      ) : (
        <div className="space-y-2">
          {incidents.map((incident) => {
            const isExpanded = expandedId === incident.id;
            return (
              <div key={incident.id} className="card overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : incident.id)}
                  className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                >
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SEVERITY_COLORS[incident.severity]}`}>
                    {incident.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {incident.title}
                    </h4>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Created {new Date(incident.created_at).toLocaleDateString()}
                      {incident.notes?.length ? ` · ${incident.notes.length} note${incident.notes.length !== 1 ? 's' : ''}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={incident.status} />
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  )}
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t px-5 py-4 space-y-4" style={{ borderColor: 'var(--border-primary)' }}>
                    {incident.description && (
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{incident.description}</p>
                    )}

                    {/* Controls */}
                    <div className="flex flex-wrap gap-3">
                      <div>
                        <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Status</label>
                        <select
                          className="input-field text-xs py-1.5 px-2"
                          value={incident.status}
                          disabled={updatingId === incident.id}
                          onChange={e => handleStatusChange(incident.id, e.target.value)}
                        >
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Severity</label>
                        <select
                          className="input-field text-xs py-1.5 px-2"
                          value={incident.severity}
                          disabled={updatingId === incident.id}
                          onChange={e => handleSeverityChange(incident.id, e.target.value)}
                        >
                          {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      {updatingId === incident.id && (
                        <Loader2 className="w-4 h-4 animate-spin text-brand-500 self-end mb-2" />
                      )}
                    </div>

                    {/* Notes Timeline */}
                    {incident.notes && incident.notes.length > 0 && (
                      <div>
                        <h5 className="text-xs font-semibold flex items-center gap-1 mb-2" style={{ color: 'var(--text-secondary)' }}>
                          <MessageSquare className="w-3.5 h-3.5" /> Notes
                        </h5>
                        <div className="space-y-2 pl-4 border-l-2" style={{ borderColor: 'var(--border-primary)' }}>
                          {incident.notes.map((note, idx) => (
                            <div key={idx} className="text-xs">
                              <p style={{ color: 'var(--text-primary)' }}>{note.note}</p>
                              <p className="flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                <Clock className="w-3 h-3" />
                                {new Date(note.created_at).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Add Note */}
                    <div className="flex gap-2">
                      <input
                        className="input-field flex-1 text-sm"
                        placeholder="Add a note..."
                        value={noteText[incident.id] || ''}
                        onChange={e => setNoteText(prev => ({ ...prev, [incident.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddNote(incident.id); }}
                      />
                      <button
                        onClick={() => handleAddNote(incident.id)}
                        disabled={!noteText[incident.id]?.trim() || updatingId === incident.id}
                        className="btn-primary px-3 py-2 disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
