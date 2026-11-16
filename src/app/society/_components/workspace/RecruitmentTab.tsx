'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Copy } from 'lucide-react';
import { Section, Btn, Modal, Field, TextInput, TextArea, Select, Pill, Empty, Loading, useApi, apiCall, fmtDate, toLocalInput, labelize } from '../kit';
import type { TabProps } from './types';
import { activeTeams, ledTeamIds } from './types';

interface FormSummary {
  id: string; team_id: string | null; team_name: string | null; target_role: 'EXECUTIVE' | 'TEAM_LEAD'; title: string;
  status: string; closes_at: string | null; application_count: number; in_progress_count: number; selected_count: number;
}
interface Question { id: string; label: string; type: string; required: boolean; options?: string[] }
interface Interview { id: string; scheduled_at: string; mode: string; location: string | null; meeting_link: string | null; status: string; score: string | null; notes: string | null; interviewer_name: string | null }
interface Application {
  id: string; status: string; answers: Record<string, unknown>; reviewer_notes: string | null; full_name: string; email: string;
  cms_id: string | null; preferred_team_name: string | null; submitted_at: string; interviews: Interview[];
}
interface ApplicationsResponse { form: { id: string; title: string; status: string; questions: Question[]; target_role: string }; can_manage: boolean; applications: Application[] }

const QUESTION_TYPES = ['short_text', 'long_text', 'single_choice', 'multi_choice', 'number', 'url'];

/** Recruitment (FR-REC-01..07): Forms -> Shortlisting -> Interviews -> Team Creation. */
export default function RecruitmentTab({ ws }: TabProps) {
  const { data, loading, reload } = useApi<{ forms: FormSummary[] }>(`/api/events/${ws.event.id}/recruitment`);
  const [creating, setCreating] = useState(false);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const canCreate = ws.me.editable && (ws.me.can.manage_any_recruitment || ledTeamIds(ws).length > 0);

  if (openForm) return <FormDetail ws={ws} formId={openForm} onBack={() => { setOpenForm(null); void reload(); }} />;

  return (
    <Section title="Recruitment" description="Team Leads recruit Executives; Admins can also run Team Lead selection."
      actions={canCreate && <Btn onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New form</Btn>}>
      {loading && !data ? <Loading /> : (data?.forms ?? []).length === 0 ? <Empty>No recruitment forms yet.</Empty> : (
        <div className="space-y-2">
          {data!.forms.map((f) => (
            <button key={f.id} onClick={() => setOpenForm(f.id)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-left text-sm hover:bg-accent/50">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{f.title}</p>
                <p className="text-xs text-muted-foreground">
                  {f.target_role === 'TEAM_LEAD' ? 'Team Lead selection' : `Executives · ${f.team_name}`}
                  {f.closes_at ? ` · closes ${fmtDate(f.closes_at, true)}` : ''}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{f.application_count} applied · {f.selected_count} selected</span>
              <Pill status={f.status} />
            </button>
          ))}
        </div>
      )}
      {creating && <CreateFormModal ws={ws} onClose={() => setCreating(false)} onDone={(id) => { void reload(); setOpenForm(id); }} />}
    </Section>
  );
}

function CreateFormModal({ ws, onClose, onDone }: { ws: TabProps['ws']; onClose: () => void; onDone: (id: string) => void }) {
  const myTeams = ws.me.can.manage_any_recruitment ? activeTeams(ws) : activeTeams(ws).filter((t) => ledTeamIds(ws).includes(t.id));
  const [role, setRole] = useState<'EXECUTIVE' | 'TEAM_LEAD'>('EXECUTIVE');
  const [teamId, setTeamId] = useState(myTeams[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [questions, setQuestions] = useState<Question[]>([
    { id: 'q1', label: 'Why do you want to join this team?', type: 'long_text', required: true },
  ]);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<Question>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const submit = async () => {
    setBusy(true);
    try {
      const res = await apiCall<{ form: { id: string } }>('POST', `/api/events/${ws.event.id}/recruitment`, {
        target_role: role, team_id: teamId || null, title, description,
        closes_at: closesAt ? new Date(closesAt).toISOString() : null,
        questions: questions.map((q, i) => ({ ...q, id: q.id || `q${i + 1}` })),
      });
      toast.success('Form created as a draft. Open it when ready.');
      onClose();
      onDone(res.form.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open wide title="New recruitment form" onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy} disabled={!title}>Create</Btn></>}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Recruiting">
          <Select value={role} onChange={(e) => setRole(e.target.value as 'EXECUTIVE' | 'TEAM_LEAD')}
            options={[{ value: 'EXECUTIVE', label: 'Executives for a team' },
              ...(ws.me.can.manage_any_recruitment ? [{ value: 'TEAM_LEAD', label: 'Team Leads' }] : [])]} />
        </Field>
        <Field label={role === 'TEAM_LEAD' ? 'Portfolio (leave empty to let applicants choose)' : 'Team'}>
          <Select value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder={role === 'TEAM_LEAD' ? 'Applicant chooses' : undefined}
            options={myTeams.map((t) => ({ value: t.id, label: t.portfolio_name }))} />
        </Field>
      </div>
      <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Media team — photographers" /></Field>
      <Field label="Description"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Closes (optional)"><TextInput type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} /></Field>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Questions</p>
        {questions.map((q, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-2">
            <div className="flex gap-2">
              <TextInput value={q.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Question" />
              <button aria-label="Remove question" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} className="rounded p-2 hover:bg-accent hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={q.type} onChange={(e) => update(i, { type: e.target.value })} className="h-8 w-40 py-0 text-xs"
                options={QUESTION_TYPES.map((t) => ({ value: t, label: labelize(t) }))} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} /> Required</label>
            </div>
            {(q.type === 'single_choice' || q.type === 'multi_choice') && (
              <TextInput value={(q.options ?? []).join(', ')} placeholder="Options, separated by commas"
                onChange={(e) => update(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} />
            )}
          </div>
        ))}
        <Btn size="xs" variant="secondary" onClick={() => setQuestions((qs) => [...qs, { id: `q${Date.now()}`, label: '', type: 'short_text', required: false }])}>
          <Plus className="h-3.5 w-3.5" /> Add question
        </Btn>
      </div>
    </Modal>
  );
}

function FormDetail({ ws, formId, onBack }: { ws: TabProps['ws']; formId: string; onBack: () => void }) {
  const { data, loading, reload } = useApi<ApplicationsResponse>(`/api/recruitment/forms/${formId}/applications`);
  const [scheduling, setScheduling] = useState<Application | null>(null);
  const [scoring, setScoring] = useState<Interview | null>(null);
  if (loading && !data) return <Loading />;
  if (!data) return <Empty>Could not load this form.</Empty>;
  const { form, can_manage: canManage } = data;
  const editable = canManage && ws.me.editable && form.status !== 'FINALIZED';

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const setStatus = (status: string) => act(() => apiCall('PATCH', `/api/recruitment/forms/${formId}`, { status }), `Form ${status.toLowerCase()}`);
  const review = (app: Application, action: string) => act(() => apiCall('PATCH', `/api/recruitment/applications/${app.id}`, { action }), 'Updated');
  const finalize = () => {
    if (!window.confirm('Finalize? Selected candidates join the team and everyone else is told they were not selected.')) return;
    void act(() => apiCall('POST', `/api/recruitment/forms/${formId}/finalize`), 'Recruitment finalized; the team was created');
  };
  const applyLink = typeof window !== 'undefined' ? `${window.location.origin}/recruitment/${formId}` : '';

  return (
    <div className="space-y-4">
      <Btn variant="ghost" onClick={onBack}>← All forms</Btn>
      <Section title={form.title} description={`${form.target_role === 'TEAM_LEAD' ? 'Team Lead selection' : 'Executive recruitment'} · ${data.applications.length} applications`}
        actions={<>
          <Pill status={form.status} />
          {form.status === 'OPEN' && (
            <Btn variant="secondary" onClick={() => { void navigator.clipboard.writeText(applyLink); toast.success('Application link copied'); }}>
              <Copy className="h-3.5 w-3.5" /> Copy apply link
            </Btn>
          )}
          {editable && (form.status === 'DRAFT' || form.status === 'CLOSED') && <Btn onClick={() => setStatus('OPEN')}>Open form</Btn>}
          {editable && form.status === 'OPEN' && <Btn variant="secondary" onClick={() => setStatus('CLOSED')}>Close form</Btn>}
          {editable && <Btn onClick={finalize}>Finalize team</Btn>}
        </>}>
        {data.applications.length === 0 ? <Empty>No applications yet.</Empty> : (
          <div className="space-y-3">
            {data.applications.map((app) => (
              <div key={app.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{app.full_name}</p>
                    <p className="text-xs text-muted-foreground">{app.email}{app.cms_id ? ` · CMS ${app.cms_id}` : ''}{app.preferred_team_name ? ` · wants ${app.preferred_team_name}` : ''}</p>
                  </div>
                  <Pill status={app.status} />
                </div>
                <dl className="mt-2 space-y-1">
                  {form.questions.map((q) => (
                    <div key={q.id}>
                      <dt className="text-xs text-muted-foreground">{q.label}</dt>
                      <dd className="whitespace-pre-wrap">{Array.isArray(app.answers[q.id]) ? (app.answers[q.id] as string[]).join(', ') : String(app.answers[q.id] ?? '—')}</dd>
                    </div>
                  ))}
                </dl>
                {app.interviews.length > 0 && (
                  <div className="mt-2 space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
                    {app.interviews.map((iv) => (
                      <div key={iv.id} className="flex flex-wrap items-center gap-2">
                        <span>Interview {fmtDate(iv.scheduled_at, true)} · {iv.mode === 'ONLINE' ? 'online' : iv.location ?? 'in person'}</span>
                        <Pill status={iv.status} />
                        {iv.score !== null && <span className="font-semibold">Score {iv.score}/10</span>}
                        {iv.notes && <span className="text-muted-foreground">“{iv.notes}”</span>}
                        {editable && iv.status === 'SCHEDULED' && <Btn size="xs" variant="secondary" onClick={() => setScoring(iv)}>Record result</Btn>}
                      </div>
                    ))}
                  </div>
                )}
                {editable && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {app.status === 'SUBMITTED' && <Btn size="xs" onClick={() => review(app, 'SHORTLIST')}>Shortlist</Btn>}
                    {['SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEWED'].includes(app.status) && (
                      <>
                        <Btn size="xs" variant="secondary" onClick={() => setScheduling(app)}>Schedule interview</Btn>
                        <Btn size="xs" onClick={() => review(app, 'SELECT')}>Select</Btn>
                      </>
                    )}
                    {['REJECTED', 'SELECTED'].includes(app.status) && <Btn size="xs" variant="secondary" onClick={() => review(app, 'RECONSIDER')}>Reconsider</Btn>}
                    {!['REJECTED', 'WITHDRAWN'].includes(app.status) && <Btn size="xs" variant="danger" onClick={() => review(app, 'REJECT')}>Reject</Btn>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
      {scheduling && <ScheduleModal app={scheduling} onClose={() => setScheduling(null)} onDone={reload} />}
      {scoring && <ScoreModal interview={scoring} onClose={() => setScoring(null)} onDone={reload} />}
    </div>
  );
}

function ScheduleModal({ app, onClose, onDone }: { app: Application; onClose: () => void; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ scheduled_at: toLocalInput(new Date(Date.now() + 86400_000).toISOString()), mode: 'IN_PERSON', location: '', meeting_link: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await apiCall('POST', `/api/recruitment/applications/${app.id}/interviews`, { ...form, scheduled_at: new Date(form.scheduled_at).toISOString() });
      toast.success('Interview scheduled; the candidate was emailed');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Interview — ${app.full_name}`} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy}>Schedule</Btn></>}>
      <Field label="When"><TextInput type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></Field>
      <Field label="Mode">
        <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} options={[{ value: 'IN_PERSON', label: 'In person' }, { value: 'ONLINE', label: 'Online' }]} />
      </Field>
      {form.mode === 'ONLINE'
        ? <Field label="Meeting link"><TextInput value={form.meeting_link} onChange={(e) => setForm({ ...form, meeting_link: e.target.value })} placeholder="https://" /></Field>
        : <Field label="Location"><TextInput value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>}
    </Modal>
  );
}

function ScoreModal({ interview, onClose, onDone }: { interview: Interview; onClose: () => void; onDone: () => Promise<void> }) {
  const [status, setStatus] = useState('COMPLETED');
  const [score, setScore] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await apiCall('PATCH', `/api/recruitment/interviews/${interview.id}`, { status, score: score === '' ? undefined : Number(score), notes });
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title="Interview result" onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy}>Save</Btn></>}>
      <Field label="Outcome">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}
          options={[{ value: 'COMPLETED', label: 'Completed' }, { value: 'NO_SHOW', label: 'No show' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
      </Field>
      <Field label="Score (0–10)"><TextInput type="number" min="0" max="10" step="0.5" value={score} onChange={(e) => setScore(e.target.value)} /></Field>
      <Field label="Evaluation notes"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Modal>
  );
}
