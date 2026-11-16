'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Printer, Paperclip } from 'lucide-react';
import { Section, Btn, Modal, Field, TextInput, TextArea, Select, Pill, Empty, Loading, Notice, Table, Td, useApi, apiCall, money, fmtDate, labelize } from '../kit';
import type { TabProps } from './types';

interface Balance { team_id: string | null; team_name: string; allocated: number; spent: number; verified: number; pending: number; remaining: number; over_budget: boolean }
interface FinanceResponse {
  full_view: boolean;
  teams: Balance[];
  totals: Record<string, number> | null;
  allocations: Array<{ id: string; team_name: string | null; amount: string; note: string | null; created_at: string; allocated_by_name: string }>;
  can: { allocate: boolean; verify: boolean; log_expense_for: string[] };
}
interface Expense {
  id: string; team_id: string; team_name: string; amount: string; category: string; spent_on: string; description: string;
  receipt_url: string | null; status: string; review_note: string | null; submitted_by_name: string; reviewed_by_name: string | null; can_review: boolean;
}

/** Finance (FR-FIN-01..07). */
export default function FinanceTab({ ws }: TabProps) {
  const fin = useApi<FinanceResponse>(`/api/events/${ws.event.id}/finance`);
  const exp = useApi<{ expenses: Expense[]; categories: string[] }>(`/api/events/${ws.event.id}/finance/expenses`);
  const [allocating, setAllocating] = useState(false);
  const [logging, setLogging] = useState(false);
  const reloadAll = async () => { await Promise.all([fin.reload(), exp.reload()]); };

  if (fin.loading && !fin.data) return <Loading />;
  if (!fin.data) return <Notice tone="amber">{fin.error}</Notice>;
  const f = fin.data;
  const editable = ws.me.editable;
  const over = f.teams.filter((t) => t.over_budget);

  const review = async (e: Expense, action: 'VERIFY' | 'REJECT') => {
    const note = action === 'REJECT' ? window.prompt('Why is this expense rejected?') : null;
    if (action === 'REJECT' && !note) return;
    try {
      await apiCall('PATCH', `/api/events/${ws.event.id}/finance/expenses/${e.id}`, { action, note });
      await reloadAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-4 print:space-y-2" id="finance-report">
      {over.length > 0 && <Notice tone="red">Over budget: {over.map((t) => t.team_name).join(', ')} (FR-FIN-06).</Notice>}

      {f.totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Allocated', f.totals.allocated], ['Spent', f.totals.spent], ['Remaining', f.totals.remaining], ['Verified spend', f.totals.verified],
            ['Sponsorship committed', f.totals.sponsorship_committed], ['Sponsorship received', f.totals.sponsorship_received], ['Ticket revenue', f.totals.ticket_revenue], ['Budget outline', f.totals.budget_total],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-2xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={Number(value) < 0 ? 'text-lg font-bold text-red-600' : 'text-lg font-bold'}>{money(value as number)}</p>
            </div>
          ))}
        </div>
      )}

      <Section title="Teams" description="Allocated vs spent vs remaining (spent includes expenses awaiting verification)."
        actions={<span className="flex flex-wrap gap-2 print:hidden">
          {f.can.allocate && editable && <Btn onClick={() => setAllocating(true)}>Allocate funds</Btn>}
          {f.can.log_expense_for.length > 0 && editable && <Btn variant="secondary" onClick={() => setLogging(true)}>Log expense</Btn>}
          {f.full_view && (
            <>
              <Btn variant="secondary" onClick={() => window.open(`/api/events/${ws.event.id}/finance/export?type=summary`)}><Download className="h-3.5 w-3.5" /> Summary CSV</Btn>
              <Btn variant="secondary" onClick={() => window.open(`/api/events/${ws.event.id}/finance/export?type=expenses`)}><Download className="h-3.5 w-3.5" /> Expenses CSV</Btn>
              <Btn variant="secondary" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print / PDF</Btn>
            </>
          )}
        </span>}>
        <Table head={['Team', 'Allocated', 'Spent', 'Verified', 'Remaining']}>
          {f.teams.map((t) => (
            <tr key={t.team_id ?? 'pool'}>
              <Td>{t.team_name} {t.over_budget && <Pill tone="red">Over</Pill>}</Td>
              <Td>{money(t.allocated)}</Td>
              <Td>{money(t.spent)}</Td>
              <Td>{money(t.verified)}</Td>
              <Td className={t.remaining < 0 ? 'font-semibold text-red-600' : ''}>{money(t.remaining)}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Expenses" description="Logged by Team Leads; verified by Finance. Reviewed entries cannot be changed.">
        {exp.loading && !exp.data ? <Loading /> : (exp.data?.expenses ?? []).length === 0 ? <Empty>No expenses logged.</Empty> : (
          <Table head={['Date', 'Team', 'What', 'Amount', 'Status', '']}>
            {exp.data!.expenses.map((e) => (
              <tr key={e.id}>
                <Td>{fmtDate(e.spent_on)}</Td>
                <Td>{e.team_name}</Td>
                <Td>
                  <span className="font-medium">{e.description}</span>
                  <span className="block text-xs text-muted-foreground">{labelize(e.category)} · by {e.submitted_by_name}{e.review_note ? ` · “${e.review_note}”` : ''}</span>
                  {e.receipt_url && <a href={e.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600"><Paperclip className="h-3 w-3" /> Receipt</a>}
                </Td>
                <Td>{money(e.amount)}</Td>
                <Td><Pill status={e.status} /></Td>
                <Td className="print:hidden">
                  {e.can_review && (
                    <span className="flex gap-1">
                      <Btn size="xs" onClick={() => review(e, 'VERIFY')}>Verify</Btn>
                      <Btn size="xs" variant="danger" onClick={() => review(e, 'REJECT')}>Reject</Btn>
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Allocations" description="Append-only: corrections are recorded as negative adjustments.">
        {f.allocations.length === 0 ? <Empty>Nothing allocated yet.</Empty> : (
          <Table head={['Date', 'Team', 'Amount', 'Note', 'By']}>
            {f.allocations.map((a) => (
              <tr key={a.id}>
                <Td>{fmtDate(a.created_at)}</Td><Td>{a.team_name ?? 'Event pool'}</Td><Td>{money(a.amount)}</Td><Td>{a.note ?? ''}</Td><Td>{a.allocated_by_name}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {allocating && <AllocateModal ws={ws} teams={f.teams} onClose={() => setAllocating(false)} onDone={reloadAll} />}
      {logging && <ExpenseModal ws={ws} teamIds={f.can.log_expense_for} categories={exp.data?.categories ?? []} onClose={() => setLogging(false)} onDone={reloadAll} />}
    </div>
  );
}

function AllocateModal({ ws, teams, onClose, onDone }: { ws: TabProps['ws']; teams: Balance[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ team_id: '', amount: '', note: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await apiCall('POST', `/api/events/${ws.event.id}/finance/allocations`, { ...form, team_id: form.team_id || null });
      toast.success('Allocation recorded');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title="Allocate funds" onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy} disabled={!form.amount}>Allocate</Btn></>}>
      <Field label="To">
        <Select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })} placeholder="Event pool (not yet assigned)"
          options={teams.filter((t) => t.team_id).map((t) => ({ value: t.team_id as string, label: t.team_name }))} />
      </Field>
      <Field label="Amount (Rs)" hint="Use a negative amount to correct an earlier allocation."><TextInput type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
      <Field label="Note"><TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
    </Modal>
  );
}

function ExpenseModal({ ws, teamIds, categories, onClose, onDone }: {
  ws: TabProps['ws']; teamIds: string[]; categories: string[]; onClose: () => void; onDone: () => Promise<void>;
}) {
  const teams = ws.teams.filter((t) => teamIds.includes(t.id) && t.is_active);
  const [form, setForm] = useState({ team_id: teams[0]?.id ?? '', amount: '', category: categories[0] ?? 'MISC', spent_on: new Date().toLocaleDateString('en-CA'), description: '', receipt_url: '' });
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/upload/receipt?eventId=${ws.event.id}`, { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setForm((f) => ({ ...f, receipt_url: data.url }));
      toast.success('Receipt attached');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const submit = async () => {
    setBusy(true);
    try {
      const res = await apiCall<{ over_budget: boolean }>('POST', `/api/events/${ws.event.id}/finance/expenses`, { ...form, receipt_url: form.receipt_url || null });
      if (res.over_budget) toast.warning('Logged — this team is now over its allocation. Finance and Admins were alerted.');
      else toast.success('Expense logged; Finance will verify it');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title="Log team expense" onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy} disabled={!form.amount || !form.description || uploading}>Log</Btn></>}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Team"><Select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })} options={teams.map((t) => ({ value: t.id, label: t.portfolio_name }))} /></Field>
        <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={categories.map((c) => ({ value: c, label: labelize(c) }))} /></Field>
        <Field label="Amount (Rs)"><TextInput type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="Date"><TextInput type="date" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} /></Field>
      </div>
      <Field label="Description"><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Receipt (image or PDF)" hint={form.receipt_url ? 'Attached ✓' : uploading ? 'Uploading…' : undefined}>
        <input type="file" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} className="text-sm" />
      </Field>
    </Modal>
  );
}
