'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Section, Btn, Field, TextArea, Pill, Empty, Loading, Notice, useApi, apiCall, fmtDate, labelize } from '@/app/society/_components/kit';

interface Row { id: string; society_id: string; society_name: string; title: string; meeting_date: string; status: string; event_title: string | null; author_name: string; forwarded_at: string | null }
interface Detail {
  minutes: { title: string; meeting_date: string; venue: string | null; attendees: string[]; agenda: string; decisions: string; action_items: Array<{ task: string; owner: string | null; due: string | null }> };
  steps: Array<{ id: string; stage: string; action: string; comment: string | null; created_at: string; actor_name: string }>;
  actions: { principal_decide: boolean };
}

/** The Principal's inbox: approved minutes forwarded for final approval (FR-MIN-04). */
export default function PrincipalPage() {
  const { data, loading, error, reload } = useApi<{ minutes: Row[] }>('/api/principal/minutes');
  const [open, setOpen] = useState<Row | null>(null);
  if (loading && !data) return <Loading />;
  if (!data) return <div className="mx-auto max-w-3xl px-4 py-6"><Notice tone="amber">{error}</Notice></div>;
  const pending = data.minutes.filter((m) => m.status === 'FORWARDED');
  const decided = data.minutes.filter((m) => m.status !== 'FORWARDED');
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Minutes for the Principal</h1>
      {open ? (
        <MinutesDecision row={open} onBack={() => { setOpen(null); void reload(); }} />
      ) : (
        <>
          <Section title={`Waiting for you (${pending.length})`}>
            {pending.length === 0 ? <Empty>Nothing waiting.</Empty> : <List rows={pending} onOpen={setOpen} />}
          </Section>
          <Section title="Decided">{decided.length === 0 ? <Empty>None yet.</Empty> : <List rows={decided} onOpen={setOpen} />}</Section>
        </>
      )}
    </div>
  );
}

function List({ rows, onOpen }: { rows: Row[]; onOpen: (r: Row) => void }) {
  return (
    <div className="space-y-2">
      {rows.map((m) => (
        <button key={m.id} onClick={() => onOpen(m)} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left text-sm hover:bg-accent/50">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{m.title}</p>
            <p className="text-xs text-muted-foreground">{m.society_name}{m.event_title ? ` · ${m.event_title}` : ''} · {fmtDate(m.meeting_date)} · {m.author_name}</p>
          </div>
          <Pill status={m.status} />
        </button>
      ))}
    </div>
  );
}

function MinutesDecision({ row, onBack }: { row: Row; onBack: () => void }) {
  const { data } = useApi<Detail>(`/api/societies/${row.society_id}/minutes/${row.id}`);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (action: 'PRINCIPAL_APPROVE' | 'PRINCIPAL_REJECT') => {
    setBusy(true);
    try {
      await apiCall('POST', `/api/societies/${row.society_id}/minutes/${row.id}/actions`, { action, comment: comment || null });
      toast.success('Decision recorded');
      onBack();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!data) return <Loading />;
  const m = data.minutes;
  return (
    <div className="space-y-4">
      <Btn variant="ghost" onClick={onBack}>← Back</Btn>
      <Section title={m.title} description={`${row.society_name} · ${fmtDate(m.meeting_date)}${m.venue ? ` · ${m.venue}` : ''}`}>
        <div className="space-y-3 text-sm">
          <p><span className="text-xs font-semibold uppercase text-muted-foreground">Attendees</span><br />{m.attendees.join(', ') || '—'}</p>
          <p className="whitespace-pre-wrap"><span className="text-xs font-semibold uppercase text-muted-foreground">Agenda</span><br />{m.agenda || '—'}</p>
          <p className="whitespace-pre-wrap"><span className="text-xs font-semibold uppercase text-muted-foreground">Decisions</span><br />{m.decisions || '—'}</p>
          {m.action_items.length > 0 && (
            <ul className="list-disc pl-5">{m.action_items.map((i, k) => <li key={k}>{i.task}{i.owner ? ` — ${i.owner}` : ''}</li>)}</ul>
          )}
        </div>
      </Section>
      <Section title="History">
        <ol className="space-y-1 text-sm">
          {data.steps.map((s) => (
            <li key={s.id}>{s.actor_name} ({labelize(s.stage)}) <Pill status={s.action} /> {fmtDate(s.created_at, true)}{s.comment ? ` — “${s.comment}”` : ''}</li>
          ))}
        </ol>
      </Section>
      {data.actions.principal_decide && (
        <Section title="Your decision">
          <Field label="Comment (required to reject)"><TextArea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
          <div className="mt-3 flex gap-2">
            <Btn onClick={() => decide('PRINCIPAL_APPROVE')} busy={busy}>Approve</Btn>
            <Btn variant="danger" onClick={() => decide('PRINCIPAL_REJECT')} busy={busy}>Reject</Btn>
          </div>
        </Section>
      )}
    </div>
  );
}
