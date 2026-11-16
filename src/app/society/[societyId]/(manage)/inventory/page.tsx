'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Section, Btn, Modal, Field, TextInput, TextArea, Select, Pill, Empty, Loading, Notice, Table, Td, useApi, apiCall, fmtDate, labelize } from '../../../_components/kit';

interface Item {
  id: string; name: string; category: string | null; unit: string; quantity_total: number; quantity_available: number; quantity_issued: number;
  condition: string; location: string | null; ownership: string; owner_name: string | null; return_due: string | null;
  low_stock_threshold: number; low_stock: boolean; damaged_total: number; lost_total: number; pending_requests: number; notes: string | null;
}
interface ItemDetail { item: Item; transactions: Array<{ id: string; txn_type: string; quantity: number; note: string | null; created_at: string; event_title: string | null; performed_by_name: string }>; can_manage: boolean }

/** Inventory (FR-LOG-01..05): owned, borrowed and rented items, stock movements, damage/loss and low stock. */
export default function InventoryPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const { data, loading, error, reload } = useApi<{ items: Item[]; can_manage: boolean }>(`/api/societies/${societyId}/inventory`);
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (!data) return <Notice tone="amber">{error}</Notice>;
  const low = data.items.filter((i) => i.low_stock);
  const dueSoon = data.items.filter((i) => i.ownership !== 'OWNED' && i.return_due && new Date(i.return_due) < new Date(Date.now() + 7 * 86400_000));

  return (
    <div className="space-y-4">
      {low.length > 0 && <Notice tone="amber">Low stock: {low.map((i) => `${i.name} (${i.quantity_available})`).join(', ')}</Notice>}
      {dueSoon.length > 0 && <Notice tone="red">Borrowed/rented items due back within a week: {dueSoon.map((i) => `${i.name} (${fmtDate(i.return_due)})`).join(', ')}</Notice>}
      <Section title="Inventory" description="Shared by all events. Teams request items from inside each event."
        actions={data.can_manage && <Btn onClick={() => setEditing('new')}>Add item</Btn>}>
        {data.items.length === 0 ? <Empty>No items yet.</Empty> : (
          <Table head={['Item', 'Available', 'Out', 'Damaged / lost', 'Ownership', 'Location']}>
            {data.items.map((i) => (
              <tr key={i.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setViewing(i.id)}>
                <Td>
                  <span className="font-medium">{i.name}</span> {i.low_stock && <Pill tone="amber">Low</Pill>} {i.condition !== 'GOOD' && <Pill tone="red">{labelize(i.condition)}</Pill>}
                  <span className="block text-xs text-muted-foreground">{i.category}{i.pending_requests ? ` · ${i.pending_requests} request(s) waiting` : ''}</span>
                </Td>
                <Td>{i.quantity_available} / {i.quantity_total} {i.unit}</Td>
                <Td>{i.quantity_issued}</Td>
                <Td>{i.damaged_total} / {i.lost_total}</Td>
                <Td>{labelize(i.ownership)}{i.owner_name ? <span className="block text-xs text-muted-foreground">{i.owner_name}{i.return_due ? ` · due ${fmtDate(i.return_due)}` : ''}</span> : null}</Td>
                <Td>{i.location ?? '—'}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      {editing && <ItemModal societyId={societyId} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={reload} />}
      {viewing && <ItemDetailModal societyId={societyId} itemId={viewing} onClose={() => setViewing(null)} onChanged={reload}
        onEdit={(i) => { setViewing(null); setEditing(i); }} />}
    </div>
  );
}

function ItemModal({ societyId, item, onClose, onDone }: { societyId: string; item: Item | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({
    name: item?.name ?? '', category: item?.category ?? '', unit: item?.unit ?? 'pcs', quantity: '0', condition: item?.condition ?? 'GOOD',
    location: item?.location ?? '', ownership: item?.ownership ?? 'OWNED', owner_name: item?.owner_name ?? '', return_due: item?.return_due ?? '',
    low_stock_threshold: String(item?.low_stock_threshold ?? 0), notes: item?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    try {
      const body = { ...form, quantity: Number(form.quantity), low_stock_threshold: Number(form.low_stock_threshold), return_due: form.return_due || null };
      if (item) await apiCall('PATCH', `/api/societies/${societyId}/inventory/${item.id}`, body);
      else await apiCall('POST', `/api/societies/${societyId}/inventory`, body);
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
    <Modal open title={item ? `Edit ${item.name}` : 'Add item'} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy} disabled={!form.name}>Save</Btn></>}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Name"><TextInput value={form.name} onChange={set('name')} /></Field>
        <Field label="Category"><TextInput value={form.category} onChange={set('category')} placeholder="e.g. Audio, Furniture" /></Field>
        {!item && <Field label="Quantity"><TextInput type="number" min="0" value={form.quantity} onChange={set('quantity')} /></Field>}
        <Field label="Unit"><TextInput value={form.unit} onChange={set('unit')} /></Field>
        <Field label="Condition"><Select value={form.condition} onChange={set('condition')} options={['GOOD', 'NEEDS_REPAIR', 'DAMAGED'].map((c) => ({ value: c, label: labelize(c) }))} /></Field>
        <Field label="Location"><TextInput value={form.location} onChange={set('location')} /></Field>
        <Field label="Ownership"><Select value={form.ownership} onChange={set('ownership')} options={['OWNED', 'BORROWED', 'RENTED'].map((c) => ({ value: c, label: labelize(c) }))} /></Field>
        <Field label="Low-stock alert at"><TextInput type="number" min="0" value={form.low_stock_threshold} onChange={set('low_stock_threshold')} /></Field>
        {form.ownership !== 'OWNED' && (
          <>
            <Field label="Borrowed / rented from"><TextInput value={form.owner_name} onChange={set('owner_name')} /></Field>
            <Field label="Return by"><TextInput type="date" value={form.return_due} onChange={set('return_due')} /></Field>
          </>
        )}
      </div>
      <Field label="Notes"><TextArea value={form.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
}

function ItemDetailModal({ societyId, itemId, onClose, onChanged, onEdit }: {
  societyId: string; itemId: string; onClose: () => void; onChanged: () => Promise<void>; onEdit: (i: Item) => void;
}) {
  const { data, reload } = useApi<ItemDetail>(`/api/societies/${societyId}/inventory/${itemId}`);
  const [move, setMove] = useState({ txn_type: 'ADD', quantity: '1', note: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await apiCall('PATCH', `/api/societies/${societyId}/inventory/${itemId}`, { ...move, quantity: Number(move.quantity) });
      setMove({ txn_type: 'ADD', quantity: '1', note: '' });
      await Promise.all([reload(), onChanged()]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open wide title={data?.item.name ?? 'Item'} onClose={onClose}
      footer={data?.can_manage ? <Btn variant="secondary" onClick={() => data && onEdit(data.item)}>Edit details</Btn> : undefined}>
      {!data ? <Loading /> : (
        <>
          <p className="text-sm">{data.item.quantity_available} of {data.item.quantity_total} {data.item.unit} available · {labelize(data.item.condition)} · {data.item.location ?? 'no location'}</p>
          {data.can_manage && (
            <div className="grid gap-2 rounded-xl border border-border p-2 sm:grid-cols-[150px_100px_1fr_auto]">
              <Select value={move.txn_type} onChange={(e) => setMove({ ...move, txn_type: e.target.value })}
                options={[['ADD', 'Add stock'], ['REMOVE', 'Remove / return to owner'], ['DAMAGE', 'Mark damaged'], ['LOSS', 'Mark lost'], ['REPAIR', 'Repaired (add back)']].map(([v, l]) => ({ value: v, label: l }))} />
              <TextInput type="number" min="1" value={move.quantity} onChange={(e) => setMove({ ...move, quantity: e.target.value })} />
              <TextInput value={move.note} placeholder="Note" onChange={(e) => setMove({ ...move, note: e.target.value })} />
              <Btn onClick={submit} busy={busy}>Record</Btn>
            </div>
          )}
          <p className="text-xs font-semibold uppercase text-muted-foreground">Movement log</p>
          <ul className="space-y-1 text-sm">
            {data.transactions.map((t) => (
              <li key={t.id} className="flex flex-wrap gap-x-2">
                <Pill tone={['ADD', 'RETURN', 'REPAIR'].includes(t.txn_type) ? 'green' : t.txn_type === 'ISSUE' ? 'blue' : 'red'}>{labelize(t.txn_type)} {t.quantity}</Pill>
                <span className="text-muted-foreground">{fmtDate(t.created_at, true)} · {t.performed_by_name}{t.event_title ? ` · ${t.event_title}` : ''}</span>
                {t.note && <span>“{t.note}”</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
