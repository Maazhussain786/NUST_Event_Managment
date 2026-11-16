'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Archive, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApi, apiCall, Loading, Notice, Pill, Btn, fmtDate } from '../../../../../_components/kit';
import type { Workspace } from '../../../../../_components/workspace/types';
import { leadsAnyTeam } from '../../../../../_components/workspace/types';
import OverviewTab from '../../../../../_components/workspace/OverviewTab';
import TeamsTab from '../../../../../_components/workspace/TeamsTab';
import PlanTab from '../../../../../_components/workspace/PlanTab';
import RecruitmentTab from '../../../../../_components/workspace/RecruitmentTab';
import DutiesTab from '../../../../../_components/workspace/DutiesTab';
import FinanceTab from '../../../../../_components/workspace/FinanceTab';
import SponsorsTab from '../../../../../_components/workspace/SponsorsTab';
import InventoryTab from '../../../../../_components/workspace/InventoryTab';
import MinutesTab from '../../../../../_components/workspace/MinutesTab';

/** Event workspace (SRS 2.1: each event is an isolated workspace). */
export default function EventWorkspacePage() {
  const { societyId, eventId } = useParams<{ societyId: string; eventId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { data: ws, error, status, loading, reload } = useApi<Workspace>(`/api/events/${eventId}/workspace`);

  const tabs = useMemo(() => {
    if (!ws) return [];
    const c = ws.me.can;
    const onTeam = ws.me.teams.length > 0;
    const list: Array<{ key: string; label: string; show: boolean }> = [
      { key: 'overview', label: 'Overview', show: true },
      { key: 'teams', label: 'Teams', show: true },
      { key: 'plan', label: 'Plan', show: true },
      { key: 'duties', label: 'Duties', show: true },
      { key: 'recruitment', label: 'Recruitment', show: c.view_all_recruitment || leadsAnyTeam(ws) },
      { key: 'finance', label: 'Finance', show: c.view_all_finance || leadsAnyTeam(ws) },
      { key: 'sponsors', label: 'Sponsors', show: c.view_sponsors },
      { key: 'inventory', label: 'Inventory', show: c.manage_inventory || onTeam || ws.me.is_event_head || c.is_admin },
      { key: 'minutes', label: 'Minutes', show: true },
    ];
    return list.filter((t) => t.show);
  }, [ws]);

  if (loading && !ws) return <Loading />;
  if (status === 403 || status === 404) {
    return <Notice tone="amber">{error}. You need to be on this event&apos;s team (or an Admin) to open its workspace.</Notice>;
  }
  if (error || !ws) return <Notice tone="red">{error || 'Could not load the workspace.'}</Notice>;

  const active = tabs.find((t) => t.key === search.get('tab'))?.key ?? 'overview';
  const setTab = (key: string) => router.replace(`?tab=${key}`, { scroll: false });

  const archive = async () => {
    const archived = !ws.event.archived_at;
    if (archived && !window.confirm('Archive this event? Its workspace becomes read-only; records are kept for audit.')) return;
    try {
      await apiCall('POST', `/api/events/${eventId}/archive`, { archived });
      toast.success(archived ? 'Event archived' : 'Event restored');
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const props = { ws, reload };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/society/${societyId}/events`} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Events
          </Link>
          <h1 className="truncate text-xl font-bold">{ws.event.title}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtDate(ws.event.event_start, true)} – {fmtDate(ws.event.event_end, true)}
            {ws.event.location ? ` · ${ws.event.location}` : ''}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Pill status={ws.event.status} />
            {ws.me.is_event_head && <Pill tone="violet">Event Head</Pill>}
            {ws.me.teams.map((t) => (
              <Pill key={t.teamId} tone={t.teamRole === 'TEAM_LEAD' ? 'violet' : 'blue'}>
                {t.portfolioName} · {t.teamRole === 'TEAM_LEAD' ? 'Team Lead' : 'Executive'}
              </Pill>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {ws.me.can.check_in && (
            <Btn variant="secondary" onClick={() => router.push(`/society/${societyId}/events/${eventId}/entry`)}>
              <ScanLine className="h-4 w-4" /> Entry
            </Btn>
          )}
          {ws.me.can.archive && (
            <Btn variant="secondary" onClick={archive}>
              <Archive className="h-4 w-4" /> {ws.event.archived_at ? 'Restore' : 'Archive'}
            </Btn>
          )}
        </div>
      </div>

      {!ws.me.editable && <Notice tone="amber">This event is archived. Everything is read-only.</Notice>}

      <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active === t.key ? 'border-brand-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === 'overview' && <OverviewTab {...props} />}
      {active === 'teams' && <TeamsTab {...props} />}
      {active === 'plan' && <PlanTab {...props} />}
      {active === 'duties' && <DutiesTab {...props} />}
      {active === 'recruitment' && <RecruitmentTab {...props} />}
      {active === 'finance' && <FinanceTab {...props} />}
      {active === 'sponsors' && <SponsorsTab {...props} />}
      {active === 'inventory' && <InventoryTab {...props} />}
      {active === 'minutes' && <MinutesTab {...props} />}
    </div>
  );
}
