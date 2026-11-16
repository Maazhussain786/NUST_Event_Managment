'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { Section, Btn, Modal, Field, TextInput, TextArea, Select, Empty, Loading, useApi, apiCall, fmtDate, labelize } from '../kit';
import type { TabProps } from './types';
import { activeTeams } from './types';

interface PlanItem {
  id: string; day_date: string; start_time: string; end_time: string; title: string; venue: string | null;
  description: string | null; team_id: string | null; team_name: string | null; updated_by_name: string | null;
}
interface PlanChange { id: string; action: string; created_at: string; changed_by_name: string | null; new_value: { title?: string } | null; old_value: { title?: string } | null }

/** Event plan: days, venues and time slots (FR-EVT-04), with visible change history (FR-EVT-05). */
export default function PlanTab({ ws }: TabProps) {
  const { data, loading, reload } = useApi<{ items: PlanItem[]; changes: PlanChange[]; can_edit: boolean }>(`/api/events/${ws.event.id}/plan`);
  const [editing, setEditing] = useState<PlanItem | 'new' | null>(null);

  if (loading && !data) return <Loading />;
  const items = data?.items ?? [];
  const days = Array.from(new Set(items.map((i) => i.day_date)));

  const remove = async (item: PlanItem) => {
    if (!window.confirm(`Remove "${item.title}" from the plan?`)) return;
    try {
      await apiCall('DELETE', `/api/events/${ws.event.id}/plan/${item.id}`);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Schedule" description="Visible to everyone on the event. Changes notify the team."
        actions={data?.can_edit && <Btn onClick={() => setEditing('new')}>Add slot</Btn>}>
        {items.length === 0 ? <Empty>No plan yet.</Empty> : (
          <div className="space-y-4">
            {days.map((day) => (
              <div key={day}>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{fmtDate(day)}</p>
                <div className="divide-y divide-border rounded-xl border border-border">
                  {items.filter((i) => i.day_date === day).map((i) => (
                    <div key={i.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                      <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{i.start_time.slice(0, 5)}–{i.end_time.slice(0, 5)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{i.title}</p>
                        <p className="text-xs text-muted-foreground">{[i.venue, i.team_name].filter(Boolean).join(' · ')}</p>
                        {i.description && <p className="mt-0.5 text-xs text-muted-foreground">{i.description}</p>}
                      </div>
                      {data?.can_edit && (
                        <span className="flex shrink-0 gap-1">
                          <button aria-label="Edit" onClick={() => setEditing(i)} className="rounded p-1 hover:bg-accent"><Pencil className="h-3.5 w-3.5" /></button>
                          <button aria-label="Remove" onClick={() => remove(i)} className="rounded p-1 hover:bg-accent hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Change history" description="Every change to the plan is logged.">
        {(data?.changes ?? []).length === 0 ? <Empty>No changes yet.</Empty> : (
          <ul className="space-y-1 text-sm">
            {data!.changes.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                <span className="text-foreground">{c.changed_by_name ?? 'Someone'}</span>
                <span>{labelize(c.action).toLowerCase()}</span>
                <span className="text-foreground">“{c.new_value?.title ?? c.old_value?.title}”</span>
                <span>· {fmtDate(c.created_at, true)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {editing && <PlanItemModal ws={ws} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={reload} />}
    </div>
  );
}

function PlanItemModal({ ws, item, onClose, onDone }: { ws: TabProps['ws']; item: PlanItem | null; onClose: () => void; onDone: () => Promise<void> }) {
  const firstDay = new Date(ws.event.event_start).toLocaleDateString('en-CA');
  const [form, setForm] = useState({
    day_date: item?.day_date ?? firstDay,
    start_time: item?.start_time.slice(0, 5) ?? '09:00',
    end_time: item?.end_time.slice(0, 5) ?? '10:00',
    title: item?.title ?? '',
    venue: item?.venue ?? '',
    description: item?.description ?? '',
    team_id: item?.team_id ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    try {
      const body = { ...form, team_id: form.team_id || null };
      if (item) await apiCall('PATCH', `/api/events/${ws.event.id}/plan/${item.id}`, body);
      else await apiCall('POST', `/api/events/${ws.event.id}/plan`, body);
      toast.success('Plan saved');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={item ? 'Edit slot' : 'Add slot'} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy}>Save</Btn></>}>
      <Field label="Activity"><TextInput value={form.title} onChange={set('title')} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Day"><TextInput type="date" value={form.day_date} onChange={set('day_date')} /></Field>
        <Field label="Start"><TextInput type="time" value={form.start_time} onChange={set('start_time')} /></Field>
        <Field label="End"><TextInput type="time" value={form.end_time} onChange={set('end_time')} /></Field>
      </div>
      <Field label="Venue"><TextInput value={form.venue} onChange={set('venue')} /></Field>
      <Field label="Responsible team">
        <Select value={form.team_id} onChange={set('team_id')} placeholder="None" options={activeTeams(ws).map((t) => ({ value: t.id, label: t.portfolio_name }))} />
      </Field>
      <Field label="Notes"><TextArea value={form.description} onChange={set('description')} /></Field>
    </Modal>
  );
}
