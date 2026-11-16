'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Section, Btn, Modal, Field, TextInput, TextArea, Select, Pill, Empty, Loading, Table, Td, useApi, apiCall, fmtDate, toLocalInput } from '../kit';
import type { TabProps } from './types';

interface Request {
  id: string; team_id: string; team_name: string; item_id: string; item_name: string; unit: string; quantity_available: number;
  quantity: number; needed_from: string | null; needed_until: string | null; purpose: string | null; status: string;
  quantity_issued: number; quantity_returned: number; review_note: string | null; requested_by: string; requested_by_name: string;
}
interface Item { id: string; name: string; unit: string; quantity_available: number; quantity_total: number }

/** Item requests for this event (FR-LOG-02..04). Stock itself is managed under Inventory. */
export default function InventoryTab({ ws }: TabProps) {
  const { data, loading, reload } = useApi<{ requests: Request[]; can_manage: boolean; requestable_team_ids: string[] }>(`/api/events/${ws.event.id}/inventory-requests`);
  const [requesting, setRequesting] = useState(false);
  const [returning, setReturning] = useState<Request | null>(null);

  const act = async (r: Request, action: string) => {
    const note = action === 'REJECT' ? window.prompt('Reason for rejecting?') : undefined;
    if (action === 'REJECT' && !note) return;
    try {
      await apiCall('PATCH', `/api/events/${ws.event.id}/inventory-requests/${r.id}`, { action, note });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const canRequest = ws.me.editable && (data?.requestable_team_ids.length ?? 0) > 0;
  return (
    <Section title="Item requests" description="Team Leads request items; Logistics approves, issues and receives them back."
      actions={<>
        <Link href={`/society/${ws.event.society_id}/inventory`} className="inline-flex h-9 items-center rounded-xl border border-border px-3.5 text-[13px] font-semibold hover:bg-accent">Inventory</Link>
        {canRequest && <Btn onClick={() => setRequesting(true)}>Request items</Btn>}
      </>}>
      {loading && !data ? <Loading /> : (data?.requests ?? []).length === 0 ? <Empty>No item requests.</Empty> : (
        <Table head={['Item', 'Team', 'Qty', 'When', 'Status', '']}>
          {data!.requests.map((r) => (
            <tr key={r.id}>
              <Td>
                <span className="font-medium">{r.item_name}</span>
                <span className="block text-xs text-muted-foreground">{r.purpose}{r.review_note ? ` · “${r.review_note}”` : ''}</span>
              </Td>
              <Td>{r.team_name}<span className="block text-xs text-muted-foreground">{r.requested_by_name}</span></Td>
              <Td>{r.quantity} {r.unit}{r.status === 'RETURNED' ? <span className="block text-xs text-muted-foreground">{r.quantity_returned} back</span> : null}</Td>
              <Td className="text-xs">{r.needed_from ? `${fmtDate(r.needed_from, true)}` : '—'}</Td>
              <Td><Pill status={r.status} /></Td>
              <Td>
                <span className="flex flex-wrap gap-1">
                  {data!.can_manage && r.status === 'PENDING' && (
                    <>
                      <Btn size="xs" onClick={() => act(r, 'APPROVE')}>Approve</Btn>
                      <Btn size="xs" variant="danger" onClick={() => act(r, 'REJECT')}>Reject</Btn>
                    </>
                  )}
                  {data!.can_manage && r.status === 'APPROVED' && <Btn size="xs" onClick={() => act(r, 'ISSUE')}>Issue</Btn>}
                  {data!.can_manage && r.status === 'ISSUED' && <Btn size="xs" onClick={() => setReturning(r)}>Receive back</Btn>}
                  {ws.me.editable && ['PENDING', 'APPROVED'].includes(r.status) && (data!.can_manage || r.requested_by === ws.me.user_id) && (
                    <Btn size="xs" variant="ghost" onClick={() => act(r, 'CANCEL')}>Cancel</Btn>
                  )}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {requesting && data && <RequestModal ws={ws} teamIds={data.requestable_team_ids} onClose={() => setRequesting(false)} onDone={reload} />}
      {returning && <ReturnModal ws={ws} request={returning} onClose={() => setReturning(null)} onDone={reload} />}
    </Section>
  );
}

function RequestModal({ ws, teamIds, onClose, onDone }: { ws: TabProps['ws']; teamIds: string[]; onClose: () => void; onDone: () => Promise<void> }) {
  const items = useApi<{ items: Item[] }>(`/api/societies/${ws.event.society_id}/inventory`);
  const teams = ws.teams.filter((t) => teamIds.includes(t.id));
  const [form, setForm] = useState({ team_id: teams[0]?.id ?? '', item_id: '', quantity: '1', needed_from: toLocalInput(ws.event.event_start), needed_until: toLocalInput(ws.event.event_end), purpose: '' });
  const [busy, setBusy] = useState(false);
  const item = items.data?.items.find((i) => i.id === form.item_id);
  const submit = async () => {
    setBusy(true);
    try {
      await apiCall('POST', `/api/events/${ws.event.id}/inventory-requests`, {
        ...form, quantity: Number(form.quantity),
        needed_from: form.needed_from ? new Date(form.needed_from).toISOString() : null,
        needed_until: form.needed_until ? new Date(form.needed_until).toISOString() : null,
      });
      toast.success('Request sent to Logistics');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title="Request items" onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy} disabled={!form.item_id}>Request</Btn></>}>
      <Field label="Team"><Select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })} options={teams.map((t) => ({ value: t.id, label: t.portfolio_name }))} /></Field>
      <Field label="Item" hint={item ? `${item.quantity_available} of ${item.quantity_total} ${item.unit} available now` : undefined}>
        <Select value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })} placeholder="Choose…"
          options={(items.data?.items ?? []).map((i) => ({ value: i.id, label: `${i.name} (${i.quantity_available} available)` }))} />
      </Field>
      <Field label="Quantity"><TextInput type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Needed from"><TextInput type="datetime-local" value={form.needed_from} onChange={(e) => setForm({ ...form, needed_from: e.target.value })} /></Field>
        <Field label="Until"><TextInput type="datetime-local" value={form.needed_until} onChange={(e) => setForm({ ...form, needed_until: e.target.value })} /></Field>
      </div>
      <Field label="Purpose"><TextArea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></Field>
    </Modal>
  );
}

function ReturnModal({ ws, request, onClose, onDone }: { ws: TabProps['ws']; request: Request; onClose: () => void; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ returned: String(request.quantity_issued), damaged: '0', lost: '0', note: '' });
  const [busy, setBusy] = useState(false);
  const sum = Number(form.returned) + Number(form.damaged) + Number(form.lost);
  const submit = async () => {
    setBusy(true);
    try {
      await apiCall('PATCH', `/api/events/${ws.event.id}/inventory-requests/${request.id}`, {
        action: 'RETURN', returned: Number(form.returned), damaged: Number(form.damaged), lost: Number(form.lost), note: form.note || null,
      });
      toast.success('Items received back');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Receive back — ${request.item_name}`} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy} disabled={sum !== request.quantity_issued}>Save</Btn></>}>
      <p className="text-sm text-muted-foreground">{request.quantity_issued} were issued. Split them into returned, damaged and lost.</p>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Returned OK"><TextInput type="number" min="0" value={form.returned} onChange={(e) => setForm({ ...form, returned: e.target.value })} /></Field>
        <Field label="Damaged"><TextInput type="number" min="0" value={form.damaged} onChange={(e) => setForm({ ...form, damaged: e.target.value })} /></Field>
        <Field label="Lost"><TextInput type="number" min="0" value={form.lost} onChange={(e) => setForm({ ...form, lost: e.target.value })} /></Field>
      </div>
      {sum !== request.quantity_issued && <p className="text-xs text-red-600">These add up to {sum}, not {request.quantity_issued}.</p>}
      <Field label="Note (required for damage or loss)"><TextArea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
    </Modal>
  );
}
