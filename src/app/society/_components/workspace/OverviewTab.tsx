'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Section, money, Btn, TextInput, Field, apiCall } from '../kit';
import type { TabProps } from './types';
import { activeTeams } from './types';

export default function OverviewTab({ ws, reload }: TabProps) {
  const d = ws.summary.duties;
  const f = ws.summary.finance;
  const [budget, setBudget] = useState(ws.event.budget_total ?? '');
  const [saving, setSaving] = useState(false);
  const canSetBudget = (ws.me.can.allocate_funds || ws.me.can.is_admin) && ws.me.editable;

  const saveBudget = async () => {
    setSaving(true);
    try {
      await apiCall('PATCH', `/api/events/${ws.event.id}/workspace`, { budget_total: budget === '' ? null : budget });
      toast.success('Budget saved');
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const cards = [
    { label: 'Active teams', value: activeTeams(ws).length },
    { label: 'People on teams', value: new Set(ws.teams.flatMap((t) => t.members.map((m) => m.user_id))).size },
    { label: 'Duties open', value: (d.PENDING ?? 0) + (d.IN_PROGRESS ?? 0) },
    { label: 'Duties done', value: d.DONE ?? 0 },
    { label: 'Item requests waiting', value: ws.summary.pending_inventory_requests },
    { label: 'Minutes awaiting approval', value: ws.summary.minutes_awaiting_approval },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {f && (
        <Section title="Money" description="Allocated vs spent vs remaining across all teams (FR-FIN-05).">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Budget outline" value={ws.event.budget_total ? money(ws.event.budget_total) : '—'} />
            <Stat label="Allocated" value={money(f.allocated)} />
            <Stat label="Spent (logged)" value={money(f.spent)} />
            <Stat label="Remaining" value={money(f.remaining)} warn={f.remaining < 0} />
            <Stat label="Sponsorship committed" value={money(f.sponsorship)} />
          </div>
        </Section>
      )}

      <Section title="Event Head" description="Optional student lead overseeing this event (FR-ROLE-05). Assign on the Teams tab.">
        <p className="text-sm">
          {ws.event.event_head_name ? `${ws.event.event_head_name} (${ws.event.event_head_email})` : 'No Event Head assigned.'}
        </p>
      </Section>

      {canSetBudget && (
        <Section title="Budget outline" description="The overall budget planned for this event (FR-EVT-02).">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <Field label="Amount (Rs)">
                <TextInput type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </Field>
            </div>
            <Btn onClick={saveBudget} busy={saving}>Save</Btn>
          </div>
        </Section>
      )}

      {ws.event.description && (
        <Section title="About">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{ws.event.description}</p>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={warn ? 'text-lg font-bold text-red-600' : 'text-lg font-bold'}>{value}</p>
    </div>
  );
}
