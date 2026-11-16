'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { UserPlus, X } from 'lucide-react';
import { Section, Btn, Modal, Field, TextInput, Pill, Empty, useApi, apiCall, labelize } from '../kit';
import type { TabProps, WorkspaceTeam } from './types';
import { ledTeamIds } from './types';

interface Portfolio { id: string; name: string; function_key: string; is_event_specific: boolean; applies_to: string | null }

/** Portfolios / teams of the event (FR-TEAM-01..05), Team Lead + Event Head assignment (FR-ROLE-04/05). */
export default function TeamsTab({ ws, reload }: TabProps) {
  const canManage = ws.me.can.manage_teams && ws.me.editable;
  const myLed = ledTeamIds(ws);
  const [activating, setActivating] = useState(false);
  const [addTo, setAddTo] = useState<{ team: WorkspaceTeam; role: 'TEAM_LEAD' | 'EXECUTIVE' } | null>(null);
  const [headOpen, setHeadOpen] = useState(false);

  const removeMember = async (team: WorkspaceTeam, memberId: string, name: string) => {
    const reason = window.prompt(`Why remove ${name} from ${team.portfolio_name}?`);
    if (reason === null) return;
    try {
      await apiCall('DELETE', `/api/events/${ws.event.id}/teams/${team.id}/members/${memberId}?reason=${encodeURIComponent(reason)}`);
      toast.success('Removed');
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleTeam = async (team: WorkspaceTeam) => {
    try {
      await apiCall('PATCH', `/api/events/${ws.event.id}/teams/${team.id}`, { is_active: !team.is_active });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Section
        title="Event Head"
        actions={canManage && <Btn variant="secondary" onClick={() => setHeadOpen(true)}>{ws.event.event_head_id ? 'Change' : 'Assign'}</Btn>}
      >
        <p className="text-sm">{ws.event.event_head_name ?? 'Not assigned'}</p>
      </Section>

      <Section
        title="Teams"
        description="Each portfolio active for this event is a team with Team Leads and Executives."
        actions={canManage && <Btn onClick={() => setActivating(true)}>Activate portfolios</Btn>}
      >
        {ws.teams.length === 0 ? (
          <Empty>No portfolios are active for this event yet.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {ws.teams.map((team) => {
              const leads = team.members.filter((m) => m.team_role === 'TEAM_LEAD');
              const execs = team.members.filter((m) => m.team_role === 'EXECUTIVE');
              const canAddExec = (canManage || myLed.includes(team.id)) && team.is_active && ws.me.editable;
              return (
                <div key={team.id} className={team.is_active ? 'rounded-xl border border-border p-3' : 'rounded-xl border border-dashed border-border p-3 opacity-60'}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{team.portfolio_name}</p>
                      <p className="text-xs text-muted-foreground">{labelize(team.function_key)}{team.is_active ? '' : ' · inactive'}</p>
                    </div>
                    {canManage && (
                      <Btn size="xs" variant="ghost" onClick={() => toggleTeam(team)}>{team.is_active ? 'Deactivate' : 'Activate'}</Btn>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    {[...leads, ...execs].map((m) => {
                      const canRemove = canManage || (m.team_role === 'EXECUTIVE' && myLed.includes(team.id) && m.user_id !== ws.me.user_id);
                      return (
                        <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate">
                            {m.full_name} <span className="text-xs text-muted-foreground">{m.email}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <Pill status={m.team_role}>{m.team_role === 'TEAM_LEAD' ? 'Team Lead' : 'Executive'}</Pill>
                            {canRemove && ws.me.editable && (
                              <button aria-label={`Remove ${m.full_name}`} onClick={() => removeMember(team, m.id, m.full_name)} className="rounded p-0.5 text-muted-foreground hover:text-red-600">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    {team.members.length === 0 && <p className="text-xs text-muted-foreground">No one yet.</p>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canManage && team.is_active && (
                      <Btn size="xs" variant="secondary" onClick={() => setAddTo({ team, role: 'TEAM_LEAD' })}>
                        <UserPlus className="h-3.5 w-3.5" /> Team Lead
                      </Btn>
                    )}
                    {canAddExec && (
                      <Btn size="xs" variant="secondary" onClick={() => setAddTo({ team, role: 'EXECUTIVE' })}>
                        <UserPlus className="h-3.5 w-3.5" /> Executive
                      </Btn>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {activating && <ActivateModal ws={ws} onClose={() => setActivating(false)} onDone={reload} />}
      {addTo && <AddMemberModal ws={ws} team={addTo.team} role={addTo.role} onClose={() => setAddTo(null)} onDone={reload} />}
      {headOpen && <EventHeadModal ws={ws} onClose={() => setHeadOpen(false)} onDone={reload} />}
    </div>
  );
}

function ActivateModal({ ws, onClose, onDone }: { ws: TabProps['ws']; onClose: () => void; onDone: TabProps['reload'] }) {
  const { data } = useApi<{ portfolios: Portfolio[] }>(`/api/societies/${ws.event.society_id}/portfolios`);
  const existing = new Set(ws.teams.filter((t) => t.is_active).map((t) => t.portfolio_id));
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await apiCall('POST', `/api/events/${ws.event.id}/teams`, { portfolio_ids: picked });
      toast.success('Portfolios activated');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title="Activate portfolios for this event" onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy} disabled={picked.length === 0}>Activate {picked.length || ''}</Btn></>}>
      <p className="text-sm text-muted-foreground">Event-specific portfolios show which events they usually apply to (FR-TEAM-03).</p>
      <div className="space-y-1">
        {(data?.portfolios ?? []).filter((p) => !existing.has(p.id)).map((p) => (
          <label key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
            <input type="checkbox" checked={picked.includes(p.id)}
              onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))} />
            <span className="flex-1">{p.name}</span>
            {p.is_event_specific && <span className="text-xs text-muted-foreground">{p.applies_to}</span>}
          </label>
        ))}
      </div>
    </Modal>
  );
}

function AddMemberModal({ ws, team, role, onClose, onDone }: {
  ws: TabProps['ws']; team: WorkspaceTeam; role: 'TEAM_LEAD' | 'EXECUTIVE'; onClose: () => void; onDone: TabProps['reload'];
}) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await apiCall('POST', `/api/events/${ws.event.id}/teams/${team.id}/members`, { email, team_role: role, reason });
      toast.success('Added to the team');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Add ${role === 'TEAM_LEAD' ? 'Team Lead' : 'Executive'} — ${team.portfolio_name}`} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy} disabled={!email}>Add</Btn></>}>
      <Field label="SEECS email" hint="The person must already have an account.">
        <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@seecs.edu.pk" />
      </Field>
      <Field label="Reason (recorded in the role history)">
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Selected after interview" />
      </Field>
    </Modal>
  );
}

function EventHeadModal({ ws, onClose, onDone }: { ws: TabProps['ws']; onClose: () => void; onDone: TabProps['reload'] }) {
  const [email, setEmail] = useState(ws.event.event_head_email ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (clear: boolean) => {
    setBusy(true);
    try {
      await apiCall('PUT', `/api/events/${ws.event.id}/event-head`, clear ? { user_id: null, reason } : { email, reason });
      toast.success(clear ? 'Event Head removed' : 'Event Head assigned');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title="Event Head" onClose={onClose}
      footer={<>
        {ws.event.event_head_id && <Btn variant="danger" onClick={() => save(true)} busy={busy}>Remove</Btn>}
        <Btn onClick={() => save(false)} busy={busy} disabled={!email}>Save</Btn>
      </>}>
      <Field label="SEECS email"><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Reason"><TextInput value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}
