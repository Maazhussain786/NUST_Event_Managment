'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Section, Btn, Field, TextInput, TextArea, Select, Pill, Loading, Notice, useApi, apiCall, fmtDate } from '@/app/society/_components/kit';

interface Question { id: string; label: string; type: string; required: boolean; options?: string[] }
interface FormResponse {
  form: {
    id: string; society_name: string | null; event_title: string; team_name: string | null; target_role: string; title: string;
    description: string | null; questions: Question[]; status: string; closes_at: string | null; accepting: boolean;
  };
  selectable_teams: Array<{ id: string; name: string }>;
  my_application: { id: string; status: string; answers: Record<string, unknown>; preferred_team_id: string | null } | null;
}

/** Apply to a recruitment form (FR-REC-02). */
export default function ApplyPage() {
  const { formId } = useParams<{ formId: string }>();
  const { data, loading, error, reload } = useApi<FormResponse>(`/api/recruitment/forms/${formId}`);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [team, setTeam] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (!data) return <div className="mx-auto max-w-2xl px-4 py-6"><Notice tone="amber">{error}</Notice></div>;
  const { form, my_application: mine } = data;
  const canApply = form.accepting && (!mine || mine.status === 'WITHDRAWN');

  const submit = async () => {
    setBusy(true);
    try {
      await apiCall('POST', `/api/recruitment/forms/${formId}/applications`, { answers, preferred_team_id: team || null });
      toast.success('Application submitted. You will be notified when it is reviewed.');
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const withdraw = async () => {
    if (!mine || !window.confirm('Withdraw your application?')) return;
    try {
      await apiCall('DELETE', `/api/recruitment/applications/${mine.id}`);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const set = (id: string, value: unknown) => setAnswers((a) => ({ ...a, [id]: value }));

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/recruitment" className="text-xs text-muted-foreground hover:text-foreground">← Recruitment</Link>
      <div>
        <h1 className="text-2xl font-bold">{form.title}</h1>
        <p className="text-sm text-muted-foreground">
          {form.society_name} · {form.event_title}{form.team_name ? ` · ${form.team_name}` : ''} · {form.target_role === 'TEAM_LEAD' ? 'Team Lead' : 'Executive'}
          {form.closes_at ? ` · closes ${fmtDate(form.closes_at, true)}` : ''}
        </p>
      </div>
      {form.description && <p className="whitespace-pre-wrap text-sm">{form.description}</p>}

      {mine && mine.status !== 'WITHDRAWN' && (
        <Notice tone="green">
          You applied. Status: <Pill status={mine.status} />
          {['SUBMITTED', 'SHORTLISTED', 'INTERVIEW_SCHEDULED'].includes(mine.status) && (
            <button onClick={withdraw} className="ml-2 text-xs underline">Withdraw</button>
          )}
        </Notice>
      )}
      {!form.accepting && !mine && <Notice tone="amber">This form is not accepting applications.</Notice>}

      {canApply && (
        <Section>
          <div className="space-y-3">
            {data.selectable_teams.length > 0 && (
              <Field label="Which portfolio do you want to lead? *">
                <Select value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Choose…" options={data.selectable_teams.map((t) => ({ value: t.id, label: t.name }))} />
              </Field>
            )}
            {form.questions.map((q) => (
              <Field key={q.id} label={`${q.label}${q.required ? ' *' : ''}`}>
                {q.type === 'long_text' ? <TextArea rows={4} onChange={(e) => set(q.id, e.target.value)} />
                  : q.type === 'single_choice' ? <Select placeholder="Choose…" onChange={(e) => set(q.id, e.target.value)} options={(q.options ?? []).map((o) => ({ value: o, label: o }))} />
                  : q.type === 'multi_choice' ? (
                    <div className="space-y-1">
                      {(q.options ?? []).map((o) => (
                        <label key={o} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" onChange={(e) => {
                            const cur = (answers[q.id] as string[] | undefined) ?? [];
                            set(q.id, e.target.checked ? [...cur, o] : cur.filter((x) => x !== o));
                          }} /> {o}
                        </label>
                      ))}
                    </div>
                  )
                  : <TextInput type={q.type === 'number' ? 'number' : q.type === 'url' ? 'url' : 'text'} onChange={(e) => set(q.id, e.target.value)} />}
              </Field>
            ))}
            <div className="flex justify-end"><Btn onClick={submit} busy={busy}>Submit application</Btn></div>
          </div>
        </Section>
      )}
    </div>
  );
}
