'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Section, Btn, Modal, Field, TextInput, TextArea, Select, Pill, Empty, Loading, Table, Td, useApi, apiCall, money, fmtDate } from '../kit';
import type { TabProps } from './types';

interface Deal {
  id: string; sponsor_id: string; sponsor_name: string; amount: string; status: string; deliverables: string | null;
  deliverables_status: string; received_on: string | null; payment_reference: string | null; verified_at: string | null; verified_by_name: string | null;
}
interface Sponsor { id: string; name: string }

/** Event sponsorship deals (FR-SPN-02/03). The society-wide directory lives under Sponsors. */
export default function SponsorsTab({ ws }: TabProps) {
  const { data, loading, reload } = useApi<{ sponsorships: Deal[]; can_manage: boolean; can_verify: boolean }>(`/api/events/${ws.event.id}/sponsorships`);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);

  const verify = async (deal: Deal) => {
    try {
      await apiCall('PATCH', `/api/events/${ws.event.id}/sponsorships/${deal.id}`, { action: 'VERIFY' });
      toast.success('Received money verified');
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Section title="Sponsorships for this event" description="Confirmed amounts appear automatically in Finance."
      actions={<>
        <Link href={`/society/${ws.event.society_id}/sponsors`} className="inline-flex h-9 items-center rounded-xl border border-border px-3.5 text-[13px] font-semibold hover:bg-accent">Sponsor directory</Link>
        {data?.can_manage && <Btn onClick={() => setAdding(true)}>Record deal</Btn>}
      </>}>
      {loading && !data ? <Loading /> : (data?.sponsorships ?? []).length === 0 ? <Empty>No sponsorships recorded.</Empty> : (
        <Table head={['Sponsor', 'Amount', 'Status', 'Deliverables', 'Received', '']}>
          {data!.sponsorships.map((d) => (
            <tr key={d.id}>
              <Td className="font-medium">{d.sponsor_name}</Td>
              <Td>{money(d.amount)}</Td>
              <Td><Pill status={d.status} /> {d.verified_at && <Pill tone="green">Verified</Pill>}</Td>
              <Td>{d.deliverables ?? '—'} <span className="block text-xs text-muted-foreground"><Pill status={d.deliverables_status} /></span></Td>
              <Td>{d.received_on ? fmtDate(d.received_on) : '—'}</Td>
              <Td>
                <span className="flex gap-1">
                  {data!.can_manage && !d.verified_at && <Btn size="xs" variant="secondary" onClick={() => setEditing(d)}>Update</Btn>}
                  {data!.can_manage && d.verified_at && <Btn size="xs" variant="secondary" onClick={() => setEditing(d)}>Deliverables</Btn>}
                  {data!.can_verify && d.status === 'RECEIVED' && !d.verified_at && <Btn size="xs" onClick={() => verify(d)}>Verify</Btn>}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {adding && <DealModal ws={ws} onClose={() => setAdding(false)} onDone={reload} />}
      {editing && <DealModal ws={ws} deal={editing} onClose={() => setEditing(null)} onDone={reload} />}
    </Section>
  );
}

function DealModal({ ws, deal, onClose, onDone }: { ws: TabProps['ws']; deal?: Deal; onClose: () => void; onDone: () => Promise<void> }) {
  const sponsors = useApi<{ sponsors: Sponsor[] }>(deal ? null : `/api/societies/${ws.event.society_id}/sponsors`);
  const [form, setForm] = useState({
    sponsor_id: deal?.sponsor_id ?? '',
    amount: deal?.amount ?? '',
    status: deal?.status ?? 'PROPOSED',
    deliverables: deal?.deliverables ?? '',
    deliverables_status: deal?.deliverables_status ?? 'PENDING',
    received_on: deal?.received_on ?? '',
    payment_reference: deal?.payment_reference ?? '',
  });
  const [busy, setBusy] = useState(false);
  const locked = Boolean(deal?.verified_at);
  const statusOptions = !deal
    ? ['PROPOSED', 'CONFIRMED']
    : ({ PROPOSED: ['PROPOSED', 'CONFIRMED', 'DECLINED'], CONFIRMED: ['CONFIRMED', 'RECEIVED', 'DECLINED'], RECEIVED: ['RECEIVED'], DECLINED: ['DECLINED', 'PROPOSED'] } as Record<string, string[]>)[deal.status];

  const submit = async () => {
    setBusy(true);
    try {
      if (deal) {
        const body: Record<string, unknown> = { deliverables: form.deliverables, deliverables_status: form.deliverables_status, payment_reference: form.payment_reference };
        if (!locked) Object.assign(body, { amount: form.amount, status: form.status, received_on: form.received_on || null });
        await apiCall('PATCH', `/api/events/${ws.event.id}/sponsorships/${deal.id}`, body);
      } else {
        await apiCall('POST', `/api/events/${ws.event.id}/sponsorships`, { sponsor_id: form.sponsor_id, amount: form.amount, status: form.status, deliverables: form.deliverables });
      }
      toast.success('Saved');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={deal ? `Update — ${deal.sponsor_name}` : 'Record sponsorship deal'} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy}>Save</Btn></>}>
      {!deal && (
        <Field label="Sponsor" hint="Add new sponsors in the sponsor directory first.">
          <Select value={form.sponsor_id} onChange={(e) => setForm({ ...form, sponsor_id: e.target.value })} placeholder="Choose…"
            options={(sponsors.data?.sponsors ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Amount (Rs)"><TextInput type="number" min="0" value={form.amount} disabled={locked} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="Status"><Select value={form.status} disabled={locked} onChange={(e) => setForm({ ...form, status: e.target.value })} options={statusOptions.map((s) => ({ value: s, label: s }))} /></Field>
      </div>
      {form.status === 'RECEIVED' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Received on"><TextInput type="date" value={form.received_on} disabled={locked} onChange={(e) => setForm({ ...form, received_on: e.target.value })} /></Field>
          <Field label="Payment reference"><TextInput value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })} /></Field>
        </div>
      )}
      <Field label="Deliverables (what we owe the sponsor)"><TextArea value={form.deliverables} onChange={(e) => setForm({ ...form, deliverables: e.target.value })} /></Field>
      {deal && (
        <Field label="Deliverables status">
          <Select value={form.deliverables_status} onChange={(e) => setForm({ ...form, deliverables_status: e.target.value })}
            options={['PENDING', 'IN_PROGRESS', 'DELIVERED'].map((s) => ({ value: s, label: s }))} />
        </Field>
      )}
    </Modal>
  );
}
