'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, Printer } from 'lucide-react';
import { Section, Btn, Pill, Loading, Notice, TextArea, Field, useApi, apiCall, fmtDate, labelize } from '../../../../_components/kit';
import MinutesForm, { type MinutesContent } from '../../../../_components/MinutesForm';

interface Detail {
  minutes: MinutesContent & {
    id: string; status: string; event_title: string | null; team_name: string | null; author_name: string;
    locked_at: string | null; submitted_at: string | null;
  };
  steps: Array<{ id: string; stage: string; action: string; comment: string | null; created_at: string; actor_name: string }>;
  actions: { edit: boolean; submit: boolean; delete: boolean; sponsor_decide: boolean; forward: boolean; principal_decide: boolean };
}

export default function MinutesDetailPage() {
  const { societyId, minutesId } = useParams<{ societyId: string; minutesId: string }>();
  const router = useRouter();
  const { data, loading, error, reload } = useApi<Detail>(`/api/societies/${societyId}/minutes/${minutesId}`);
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (!data) return <Notice tone="red">{error}</Notice>;
  const m = data.minutes;
  const a = data.actions;

  const act = async (action: string) => {
    setBusy(action);
    try {
      await apiCall('POST', `/api/societies/${societyId}/minutes/${minutesId}/actions`, { action, comment: comment || null });
      toast.success('Done');
      setComment('');
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (editing) {
    return (
      <div className="space-y-4">
        <Btn variant="ghost" onClick={() => setEditing(false)}>← Back</Btn>
        <MinutesForm initial={m} submitLabel="Save changes" onSubmit={async (content) => {
          await apiCall('PATCH', `/api/societies/${societyId}/minutes/${minutesId}`, content);
          toast.success('Saved');
          setEditing(false);
          await reload();
        }} />
      </div>
    );
  }

  const deciding = a.sponsor_decide || a.principal_decide;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{m.title}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtDate(m.meeting_date)}{m.venue ? ` · ${m.venue}` : ''} · {[m.event_title, m.team_name].filter(Boolean).join(' / ') || 'Society meeting'} · by {m.author_name}
          </p>
          <div className="mt-1 flex gap-1.5"><Pill status={m.status} />{m.locked_at && <Pill tone="gray"><Lock className="mr-1 h-3 w-3" /> Locked</Pill>}</div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Btn variant="secondary" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print</Btn>
          {a.edit && <Btn variant="secondary" onClick={() => setEditing(true)}>Edit</Btn>}
          {a.delete && (
            <Btn variant="danger" onClick={async () => {
              if (!window.confirm('Delete this draft?')) return;
              await apiCall('DELETE', `/api/societies/${societyId}/minutes/${minutesId}`);
              router.push(`/society/${societyId}/minutes`);
            }}>Delete draft</Btn>
          )}
          {a.submit && <Btn onClick={() => act('SUBMIT')} busy={busy === 'SUBMIT'}>Submit to Faculty Sponsor</Btn>}
          {a.forward && <Btn onClick={() => act('FORWARD')} busy={busy === 'FORWARD'}>Forward to Principal</Btn>}
        </div>
      </div>

      {deciding && (
        <Section title={a.sponsor_decide ? 'Your decision (Faculty Sponsor)' : 'Your decision (Principal)'} className="print:hidden">
          <Field label="Comment (required to reject or request changes)"><TextArea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
          <div className="mt-3 flex flex-wrap gap-2">
            {a.sponsor_decide && (
              <>
                <Btn onClick={() => act('APPROVE')} busy={busy === 'APPROVE'}>Approve</Btn>
                <Btn variant="secondary" onClick={() => act('REQUEST_CHANGES')} busy={busy === 'REQUEST_CHANGES'}>Request changes</Btn>
                <Btn variant="danger" onClick={() => act('REJECT')} busy={busy === 'REJECT'}>Reject</Btn>
              </>
            )}
            {a.principal_decide && (
              <>
                <Btn onClick={() => act('PRINCIPAL_APPROVE')} busy={busy === 'PRINCIPAL_APPROVE'}>Approve</Btn>
                <Btn variant="danger" onClick={() => act('PRINCIPAL_REJECT')} busy={busy === 'PRINCIPAL_REJECT'}>Reject</Btn>
              </>
            )}
          </div>
        </Section>
      )}

      <Section>
        <div className="space-y-4 text-sm">
          <Block title="Attendees">{m.attendees.length ? m.attendees.join(', ') : '—'}</Block>
          <Block title="Agenda">{m.agenda || '—'}</Block>
          <Block title="Decisions">{m.decisions || '—'}</Block>
          <Block title="Action items">
            {m.action_items.length === 0 ? '—' : (
              <ul className="list-disc space-y-1 pl-5">
                {m.action_items.map((i, k) => (
                  <li key={k}>{i.task}{i.owner ? ` — ${i.owner}` : ''}{i.due ? ` (due ${fmtDate(i.due)})` : ''}</li>
                ))}
              </ul>
            )}
          </Block>
        </div>
      </Section>

      <Section title="Approval history">
        {data.steps.length === 0 ? <p className="text-sm text-muted-foreground">Not submitted yet.</p> : (
          <ol className="space-y-2 text-sm">
            {data.steps.map((s) => (
              <li key={s.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{s.actor_name}</span>
                <span className="text-muted-foreground">({labelize(s.stage)})</span>
                <Pill status={s.action} />
                <span className="text-muted-foreground">{fmtDate(s.created_at, true)}</span>
                {s.comment && <span className="w-full text-muted-foreground">“{s.comment}”</span>}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      <div className="whitespace-pre-wrap">{children}</div>
    </div>
  );
}
