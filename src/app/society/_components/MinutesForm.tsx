'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Section, Btn, Field, TextInput, TextArea, Select, apiCall } from './kit';

export interface MinutesContent {
  title: string;
  meeting_date: string;
  venue: string;
  attendees: string[];
  agenda: string;
  decisions: string;
  action_items: Array<{ task: string; owner: string | null; due: string | null }>;
}

/** Create or edit a minutes sheet: date, attendees, agenda, decisions, action items (FR-MIN-01). */
export default function MinutesForm({ initial, teams, onSubmit, submitLabel }: {
  initial?: Partial<MinutesContent> & { team_id?: string | null };
  teams?: Array<{ id: string; name: string }>;
  onSubmit: (content: MinutesContent & { team_id?: string | null }) => Promise<void>;
  submitLabel: string;
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    meeting_date: initial?.meeting_date ?? new Date().toLocaleDateString('en-CA'),
    venue: initial?.venue ?? '',
    attendees: (initial?.attendees ?? []).join('\n'),
    agenda: initial?.agenda ?? '',
    decisions: initial?.decisions ?? '',
    team_id: initial?.team_id ?? '',
  });
  const [items, setItems] = useState(initial?.action_items?.length ? initial.action_items : [{ task: '', owner: null, due: null }]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit({
        title: form.title,
        meeting_date: form.meeting_date,
        venue: form.venue,
        attendees: form.attendees.split('\n').map((a) => a.trim()).filter(Boolean),
        agenda: form.agenda,
        decisions: form.decisions,
        action_items: items.filter((i) => i.task.trim()),
        team_id: form.team_id || null,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section>
      <div className="space-y-3">
        <Field label="Title"><TextInput value={form.title} onChange={set('title')} placeholder="e.g. Logistics weekly meeting" /></Field>
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Meeting date"><TextInput type="date" value={form.meeting_date} onChange={set('meeting_date')} /></Field>
          <Field label="Venue"><TextInput value={form.venue} onChange={set('venue')} /></Field>
          {teams && teams.length > 0 && (
            <Field label="Team"><Select value={form.team_id ?? ''} onChange={set('team_id')} placeholder="Whole event" options={teams.map((t) => ({ value: t.id, label: t.name }))} /></Field>
          )}
        </div>
        <Field label="Attendees" hint="One name per line"><TextArea rows={4} value={form.attendees} onChange={set('attendees')} /></Field>
        <Field label="Agenda"><TextArea rows={4} value={form.agenda} onChange={set('agenda')} /></Field>
        <Field label="Decisions"><TextArea rows={4} value={form.decisions} onChange={set('decisions')} /></Field>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Action items</p>
          {items.map((item, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_160px_150px_auto]">
              <TextInput value={item.task} placeholder="Task" onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, task: e.target.value } : x)))} />
              <TextInput value={item.owner ?? ''} placeholder="Owner" onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, owner: e.target.value || null } : x)))} />
              <TextInput type="date" value={item.due ?? ''} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, due: e.target.value || null } : x)))} />
              <button aria-label="Remove action item" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="rounded p-2 hover:bg-accent hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Btn size="xs" variant="secondary" onClick={() => setItems((xs) => [...xs, { task: '', owner: null, due: null }])}><Plus className="h-3.5 w-3.5" /> Add action item</Btn>
        </div>
        <div className="flex justify-end"><Btn onClick={submit} busy={busy} disabled={!form.title}>{submitLabel}</Btn></div>
      </div>
    </Section>
  );
}

export async function createMinutes(societyId: string, body: Record<string, unknown>): Promise<string> {
  const res = await apiCall<{ minutes: { id: string } }>('POST', `/api/societies/${societyId}/minutes`, body);
  return res.minutes.id;
}
