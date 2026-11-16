'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loading, Notice, useApi } from '../../../../_components/kit';
import MinutesForm, { createMinutes } from '../../../../_components/MinutesForm';
import type { Workspace } from '../../../../_components/workspace/types';

/** Write a minutes sheet, optionally for an event (and one of its teams). */
export default function NewMinutesPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const eventId = useSearchParams().get('event');
  const router = useRouter();
  const ws = useApi<Workspace>(eventId ? `/api/events/${eventId}/workspace` : null);

  if (eventId && ws.loading) return <Loading />;
  if (eventId && !ws.data) return <Notice tone="red">{ws.error}</Notice>;

  // Admins / Event Head may write for any team; Team Leads for the teams they lead.
  const teams = ws.data
    ? ws.data.teams
        .filter((t) => t.is_active && (ws.data!.me.can.create_minutes || ws.data!.me.is_event_head ||
          ws.data!.me.teams.some((m) => m.teamId === t.id && m.teamRole === 'TEAM_LEAD')))
        .map((t) => ({ id: t.id, name: t.portfolio_name }))
    : undefined;
  const mustPickTeam = ws.data && !ws.data.me.can.create_minutes && !ws.data.me.is_event_head;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Write minutes</h1>
        <p className="text-sm text-muted-foreground">{ws.data ? `For ${ws.data.event.title}` : 'Society meeting'} · saved as a draft until you submit it.</p>
      </div>
      <MinutesForm
        teams={teams}
        initial={{ team_id: mustPickTeam ? teams?.[0]?.id ?? null : null }}
        submitLabel="Save draft"
        onSubmit={async (content) => {
          const id = await createMinutes(societyId, { ...content, event_id: eventId });
          toast.success('Draft saved');
          router.push(`/society/${societyId}/minutes/${id}`);
        }}
      />
    </div>
  );
}
