'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { Section, Pill, Empty, Loading, Notice, Select, useApi, apiCall, fmtDate } from '@/app/society/_components/kit';

interface Duty {
  id: string; title: string; description: string | null; location: string | null; starts_at: string | null; ends_at: string | null;
  status: string; event_id: string; society_id: string; event_title: string; society_name: string; team_name: string | null; assigned_by_name: string;
}
interface Team {
  team_id: string; team_role: string; event_id: string; event_title: string; event_start: string; society_id: string; society_name: string;
  team_name: string; members: Array<{ name: string; role: string; email: string }> | null;
  duties: Array<{ id: string; title: string; starts_at: string | null; status: string; assignee_name: string }>;
}
interface MyWork { duties: Duty[]; teams: Team[]; event_head_of: Array<{ id: string; title: string; event_start: string; society_id: string; society_name: string }> }

/** Personal dashboard (SRS 3.4): my duties, my teams and their schedules. */
export default function MyWorkPage() {
  const { data, loading, error, reload } = useApi<MyWork>('/api/my-work');
  if (loading && !data) return <Loading />;
  if (!data) return <div className="px-4 py-6"><Notice tone="red">{error}</Notice></div>;

  const setStatus = async (d: Duty, status: string) => {
    try {
      await apiCall('PATCH', `/api/events/${d.event_id}/duties/${d.id}`, { status });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const open = data.duties.filter((d) => d.status !== 'DONE');
  const done = data.duties.filter((d) => d.status === 'DONE');

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">My work</h1>

      {data.event_head_of.length > 0 && (
        <Section title="Events you head">
          <div className="flex flex-wrap gap-2">
            {data.event_head_of.map((e) => (
              <Link key={e.id} href={`/society/${e.society_id}/events/${e.id}/workspace`} className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent/50">
                <span className="font-medium">{e.title}</span> <span className="text-xs text-muted-foreground">{fmtDate(e.event_start)}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title={`My duties (${open.length} open)`}>
        {data.duties.length === 0 ? <Empty>No duties assigned to you.</Empty> : (
          <div className="space-y-2">
            {[...open, ...done].map((d) => (
              <div key={d.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.event_title}{d.team_name ? ` · ${d.team_name}` : ''}{d.location ? ` · ${d.location}` : ''}
                    {d.starts_at ? ` · ${fmtDate(d.starts_at, true)}` : ''} · from {d.assigned_by_name}
                  </p>
                  {d.description && <p className="mt-1 text-xs text-muted-foreground">{d.description}</p>}
                </div>
                <Select value={d.status} onChange={(e) => setStatus(d, e.target.value)} className="h-8 w-36 py-0 text-xs"
                  options={[{ value: 'PENDING', label: 'Pending' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'DONE', label: 'Done' }]} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {data.teams.map((t) => (
        <Section key={t.team_id} title={`${t.team_name} — ${t.event_title}`}
          description={`${t.society_name} · you are ${t.team_role === 'TEAM_LEAD' ? 'Team Lead' : 'Executive'}`}
          actions={<Link href={`/society/${t.society_id}/events/${t.event_id}/workspace`} className="text-sm font-semibold text-brand-600">Open workspace →</Link>}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Team</p>
              <ul className="space-y-0.5 text-sm">
                {(t.members ?? []).map((m) => (
                  <li key={m.email}>{m.name} <span className="text-xs text-muted-foreground">{m.role === 'TEAM_LEAD' ? 'Team Lead' : 'Executive'}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Team duties</p>
              {t.duties.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
                <ul className="space-y-1 text-sm">
                  {t.duties.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2">
                      <span>{d.title}</span><span className="text-xs text-muted-foreground">{d.assignee_name}{d.starts_at ? ` · ${fmtDate(d.starts_at, true)}` : ''}</span><Pill status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Section>
      ))}
    </div>
  );
}
