'use client';

import Link from 'next/link';
import { Section, Pill, Empty, Loading, Notice, useApi, fmtDate } from '@/app/society/_components/kit';

interface OpenForm {
  id: string; title: string; description: string | null; target_role: string; closes_at: string | null;
  society_name: string; event_title: string; team_name: string | null; question_count: number;
}
interface MyApplication {
  id: string; status: string; form_id: string; title: string; society_name: string; event_title: string;
  team_name: string | null; next_interview: string | null; updated_at: string;
}

/** Open recruitment across SEECS societies, and the status of my applications (FR-REC-02/03). */
export default function RecruitmentPage() {
  const { data, loading, error } = useApi<{ open: OpenForm[]; mine: MyApplication[] }>('/api/recruitment/open');
  if (loading && !data) return <Loading />;
  if (!data) return <Notice tone="red">{error}</Notice>;
  const appliedTo = new Set(data.mine.map((a) => a.form_id));

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Recruitment</h1>

      {data.mine.length > 0 && (
        <Section title="My applications">
          <div className="space-y-2">
            {data.mine.map((a) => (
              <Link key={a.id} href={`/recruitment/${a.form_id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm hover:bg-accent/50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.society_name} · {a.event_title}{a.team_name ? ` · ${a.team_name}` : ''}
                    {a.next_interview ? ` · interview ${fmtDate(a.next_interview, true)}` : ''}
                  </p>
                </div>
                <Pill status={a.status} />
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title="Open positions" description="Teams recruiting Executives and Team Leads for upcoming events.">
        {data.open.length === 0 ? <Empty>No open recruitment right now.</Empty> : (
          <div className="space-y-2">
            {data.open.map((f) => (
              <Link key={f.id} href={`/recruitment/${f.id}`} className="block rounded-xl border border-border p-3 text-sm hover:bg-accent/50">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex-1 font-medium">{f.title}</p>
                  <Pill tone={f.target_role === 'TEAM_LEAD' ? 'violet' : 'blue'}>{f.target_role === 'TEAM_LEAD' ? 'Team Lead' : 'Executive'}</Pill>
                  {appliedTo.has(f.id) && <Pill tone="green">Applied</Pill>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {f.society_name} · {f.event_title}{f.team_name ? ` · ${f.team_name}` : ''}{f.closes_at ? ` · closes ${fmtDate(f.closes_at, true)}` : ''}
                </p>
                {f.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{f.description}</p>}
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
