'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { Section, Btn, Modal, Field, TextInput, TextArea, Select, Pill, Empty, Loading, useApi, apiCall, fmtDate, toLocalInput } from '../kit';
import type { TabProps } from './types';
import { activeTeams } from './types';

interface Duty {
  id: string; team_id: string | null; team_name: string | null; title: string; description: string | null;
  location: string | null; starts_at: string | null; ends_at: string | null; status: 'PENDING' | 'IN_PROGRESS' | 'DONE';
  assignee_id: string; assignee_name: string; assigned_by_name: string; can_edit: boolean; can_update_status: boolean;
}
interface DutiesResponse { duties: Duty[]; can_create_for_any_team: boolean; creatable_team_ids: string[] }

/** Duties (FR-DUTY-01..05): Team Leads assign, the whole team sees team duties, assignees update status. */
export default function DutiesTab({ ws }: TabProps) {
  const [teamFilter, setTeamFilter] = useState('');
  const [mine, setMine] = useState(false);
  const url = `/api/events/${ws.event.id}/duties?${new URLSearchParams({ ...(teamFilter ? { team_id: teamFilter } : {}), ...(mine ? { mine: '1' } : {}) })}`;
  const { data, loading, reload } = useApi<DutiesResponse>(url);
  const [editing, setEditing] = useState<Duty | 'new' | null>(null);

  const canCreate = ws.me.editable && (data?.can_create_for_any_team || (data?.creatable_team_ids.length ?? 0) > 0);
  const setStatus = async (duty: Duty, status: string) => {
    try {
      await apiCall('PATCH', `/api/events/${ws.event.id}/duties/${duty.id}`, { status });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const remove = async (duty: Duty) => {
    if (!window.confirm(`Remove duty "${duty.title}"?`)) return;
    try {
      await apiCall('DELETE', `/api/events/${ws.event.id}/duties/${duty.id}`);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Section
      title="Duties"
      description="Team duties are visible to everyone on the team; Admins and the Event Head see all."
      actions={<>
        <Select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} placeholder="All teams" className="h-9 w-40 py-1"
          options={activeTeams(ws).map((t) => ({ value: t.id, label: t.portfolio_name }))} />
        <Btn variant={mine ? 'primary' : 'secondary'} onClick={() => setMine((m) => !m)}>Mine</Btn>
        {canCreate && <Btn onClick={() => setEditing('new')}>Assign duty</Btn>}
      </>}
    >
      {loading && !data ? <Loading /> : (data?.duties ?? []).length === 0 ? <Empty>No duties.</Empty> : (
        <div className="space-y-2">
          {data!.duties.map((d) => (
            <div key={d.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{d.title}</p>
                <p className="text-xs text-muted-foreground">
                  {[d.assignee_name, d.team_name, d.location, d.starts_at && `${fmtDate(d.starts_at, true)}${d.ends_at ? ` → ${fmtDate(d.ends_at, true)}` : ''}`]
                    .filter(Boolean).join(' · ')}
                </p>
                {d.description && <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>}
              </div>
              <div className="flex items-center gap-1.5">
                {d.can_update_status ? (
                  <Select value={d.status} onChange={(e) => setStatus(d, e.target.value)} className="h-8 w-36 py-0 text-xs"
                    options={[{ value: 'PENDING', label: 'Pending' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'DONE', label: 'Done' }]} />
                ) : <Pill status={d.status} />}
                {d.can_edit && (
                  <>
                    <button aria-label="Edit" onClick={() => setEditing(d)} className="rounded p-1 hover:bg-accent"><Pencil className="h-3.5 w-3.5" /></button>
                    <button aria-label="Remove" onClick={() => remove(d)} className="rounded p-1 hover:bg-accent hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && data && (
        <DutyModal ws={ws} duty={editing === 'new' ? null : editing} anyTeam={data.can_create_for_any_team}
          teamIds={data.creatable_team_ids} onClose={() => setEditing(null)} onDone={reload} />
      )}
    </Section>
  );
}

function DutyModal({ ws, duty, anyTeam, teamIds, onClose, onDone }: {
  ws: TabProps['ws']; duty: Duty | null; anyTeam: boolean; teamIds: string[]; onClose: () => void; onDone: () => Promise<void>;
}) {
  const teams = activeTeams(ws).filter((t) => anyTeam || teamIds.includes(t.id));
  const [form, setForm] = useState({
    title: duty?.title ?? '',
    description: duty?.description ?? '',
    location: duty?.location ?? '',
    starts_at: toLocalInput(duty?.starts_at),
    ends_at: toLocalInput(duty?.ends_at),
    team_id: duty?.team_id ?? teams[0]?.id ?? '',
    assignee_id: duty?.assignee_id ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const team = ws.teams.find((t) => t.id === form.team_id);
  const people = team ? team.members : [];

  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        ...form,
        team_id: form.team_id || null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      };
      if (duty) await apiCall('PATCH', `/api/events/${ws.event.id}/duties/${duty.id}`, body);
      else await apiCall('POST', `/api/events/${ws.event.id}/duties`, body);
      toast.success('Duty saved; the assignee was notified');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={duty ? 'Edit duty' : 'Assign duty'} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy} disabled={!form.title || !form.assignee_id}>Save</Btn></>}>
      <Field label="Duty"><TextInput value={form.title} onChange={set('title')} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Team">
          <Select value={form.team_id} onChange={(e) => setForm((f) => ({ ...f, team_id: e.target.value, assignee_id: '' }))}
            options={teams.map((t) => ({ value: t.id, label: t.portfolio_name }))} />
        </Field>
        <Field label="Assignee">
          <Select value={form.assignee_id} onChange={set('assignee_id')} placeholder="Choose…"
            options={people.map((m) => ({ value: m.user_id, label: `${m.full_name}${m.team_role === 'TEAM_LEAD' ? ' (TL)' : ''}` }))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Starts"><TextInput type="datetime-local" value={form.starts_at} onChange={set('starts_at')} /></Field>
        <Field label="Ends"><TextInput type="datetime-local" value={form.ends_at} onChange={set('ends_at')} /></Field>
      </div>
      <Field label="Location"><TextInput value={form.location} onChange={set('location')} /></Field>
      <Field label="Details"><TextArea value={form.description} onChange={set('description')} /></Field>
    </Modal>
  );
}
