'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Section, Pill, Empty, Loading, Notice, Select, useApi, fmtDate } from '../../../_components/kit';

interface MinutesRow {
  id: string; title: string; meeting_date: string; status: string; event_title: string | null; team_name: string | null;
  author_name: string; submitted_at: string | null;
}
interface MinutesList { minutes: MinutesRow[]; can: { approve: boolean; review: boolean; create_society_level: boolean } }

const STATUSES = ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'FORWARDED', 'PRINCIPAL_APPROVED', 'PRINCIPAL_REJECTED'];

/** Minutes sheets (FR-MIN-01..06) with the Faculty Sponsor's approval queue. */
export default function MinutesPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const [status, setStatus] = useState('');
  const { data, loading, error } = useApi<MinutesList>(`/api/societies/${societyId}/minutes${status ? `?status=${status}` : ''}`);

  if (loading && !data) return <Loading />;
  if (!data) return <Notice tone="red">{error}</Notice>;
  const queue = data.can.approve ? data.minutes.filter((m) => m.status === 'SUBMITTED') : data.can.review ? data.minutes.filter((m) => m.status === 'APPROVED') : [];

  return (
    <div className="space-y-4">
      {queue.length > 0 && (
        <Section title={data.can.approve ? 'Waiting for your approval' : 'Approved — ready to forward'}>
          <List rows={queue} societyId={societyId} />
        </Section>
      )}
      <Section title="Minutes"
        description="Team Leads and Event Heads write minutes from their event workspace; society-level minutes can be written here."
        actions={<>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" className="h-9 w-48 py-1"
            options={STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ').toLowerCase() }))} />
          {data.can.create_society_level && (
            <Link href={`/society/${societyId}/minutes/new`} className="inline-flex h-9 items-center rounded-xl bg-brand-500 px-3.5 text-[13px] font-semibold text-white hover:bg-brand-600">
              Write minutes
            </Link>
          )}
        </>}>
        {data.minutes.length === 0 ? <Empty>No minutes yet.</Empty> : <List rows={data.minutes} societyId={societyId} />}
      </Section>
    </div>
  );
}

function List({ rows, societyId }: { rows: MinutesRow[]; societyId: string }) {
  return (
    <div className="space-y-2">
      {rows.map((m) => (
        <Link key={m.id} href={`/society/${societyId}/minutes/${m.id}`} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm hover:bg-accent/50">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{m.title}</p>
            <p className="text-xs text-muted-foreground">
              {fmtDate(m.meeting_date)} · {[m.event_title, m.team_name].filter(Boolean).join(' / ') || 'Society meeting'} · {m.author_name}
            </p>
          </div>
          <Pill status={m.status} />
        </Link>
      ))}
    </div>
  );
}
