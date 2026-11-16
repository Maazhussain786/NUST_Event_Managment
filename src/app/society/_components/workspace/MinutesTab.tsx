'use client';

import Link from 'next/link';
import { Section, Pill, Empty, Loading, useApi, fmtDate } from '../kit';
import type { TabProps } from './types';
import { leadsAnyTeam } from './types';

interface MinutesRow { id: string; title: string; meeting_date: string; status: string; team_name: string | null; author_name: string }

/** Minutes of this event (FR-MIN-01..06). Writing and approval happen on the Minutes screen. */
export default function MinutesTab({ ws }: TabProps) {
  const { data, loading } = useApi<{ minutes: MinutesRow[] }>(`/api/societies/${ws.event.society_id}/minutes?event_id=${ws.event.id}`);
  const canWrite = ws.me.editable && (ws.me.can.create_minutes || ws.me.is_event_head || leadsAnyTeam(ws));
  return (
    <Section title="Minutes" description="Minutes go to the Faculty Sponsor for approval, then to the Admins."
      actions={canWrite && (
        <Link href={`/society/${ws.event.society_id}/minutes/new?event=${ws.event.id}`}
          className="inline-flex h-9 items-center rounded-xl bg-brand-500 px-3.5 text-[13px] font-semibold text-white hover:bg-brand-600">
          Write minutes
        </Link>
      )}>
      {loading && !data ? <Loading /> : (data?.minutes ?? []).length === 0 ? <Empty>No minutes for this event yet.</Empty> : (
        <div className="space-y-2">
          {data!.minutes.map((m) => (
            <Link key={m.id} href={`/society/${ws.event.society_id}/minutes/${m.id}`} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm hover:bg-accent/50">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.title}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(m.meeting_date)} · {m.team_name ?? 'Whole event'} · {m.author_name}</p>
              </div>
              <Pill status={m.status} />
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}
