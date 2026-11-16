'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Section, Btn, Modal, Field, TextInput, TextArea, Select, Pill, Empty, Loading, Notice, Table, Td, useApi, apiCall, money, fmtDate, labelize } from '../../../_components/kit';

interface Sponsor {
  id: string; name: string; industry: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  website: string | null; notes: string | null; committed_total: string; received_total: string; deal_count: number; last_contact: string | null;
}
interface SponsorDetail {
  sponsor: Sponsor;
  interactions: Array<{ id: string; interaction_type: string; summary: string; occurred_on: string; event_title: string | null; logged_by_name: string }>;
  deals: Array<{ id: string; event_title: string; amount: string; status: string; deliverables_status: string; verified_at: string | null }>;
  can_manage: boolean;
}

const TYPES = ['CALL', 'EMAIL', 'MEETING', 'PROPOSAL', 'OFFER', 'FOLLOW_UP', 'OTHER'];

/** Sponsor directory with contacts and history (FR-SPN-01/02). */
export default function SponsorsPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const { data, loading, error, reload } = useApi<{ sponsors: Sponsor[]; can_manage: boolean }>(`/api/societies/${societyId}/sponsors`);
  const [editing, setEditing] = useState<Sponsor | 'new' | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (!data) return <Notice tone="amber">{error}</Notice>;
  return (
    <Section title="Sponsors" description="Directory shared by all events. Deals are recorded inside each event."
      actions={data.can_manage && <Btn onClick={() => setEditing('new')}>Add sponsor</Btn>}>
      {data.sponsors.length === 0 ? <Empty>No sponsors yet.</Empty> : (
        <Table head={['Sponsor', 'Contact', 'Committed', 'Received', 'Last contact']}>
          {data.sponsors.map((s) => (
            <tr key={s.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setViewing(s.id)}>
              <Td><span className="font-medium">{s.name}</span><span className="block text-xs text-muted-foreground">{s.industry}</span></Td>
              <Td className="text-xs">{[s.contact_name, s.contact_email, s.contact_phone].filter(Boolean).join(' · ') || '—'}</Td>
              <Td>{money(s.committed_total)}</Td>
              <Td>{money(s.received_total)}</Td>
              <Td>{fmtDate(s.last_contact)}</Td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <SponsorModal societyId={societyId} sponsor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={reload} />}
      {viewing && <SponsorDetailModal societyId={societyId} sponsorId={viewing} onClose={() => setViewing(null)}
        onEdit={(s) => { setViewing(null); setEditing(s); }} />}
    </Section>
  );
}

function SponsorModal({ societyId, sponsor, onClose, onDone }: { societyId: string; sponsor: Sponsor | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({
    name: sponsor?.name ?? '', industry: sponsor?.industry ?? '', contact_name: sponsor?.contact_name ?? '',
    contact_email: sponsor?.contact_email ?? '', contact_phone: sponsor?.contact_phone ?? '', website: sponsor?.website ?? '', notes: sponsor?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    try {
      if (sponsor) await apiCall('PATCH', `/api/societies/${societyId}/sponsors/${sponsor.id}`, form);
      else await apiCall('POST', `/api/societies/${societyId}/sponsors`, form);
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
    <Modal open title={sponsor ? `Edit ${sponsor.name}` : 'Add sponsor'} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy} disabled={!form.name}>Save</Btn></>}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Name"><TextInput value={form.name} onChange={set('name')} /></Field>
        <Field label="Industry"><TextInput value={form.industry} onChange={set('industry')} /></Field>
        <Field label="Contact person"><TextInput value={form.contact_name} onChange={set('contact_name')} /></Field>
        <Field label="Contact email"><TextInput type="email" value={form.contact_email} onChange={set('contact_email')} /></Field>
        <Field label="Phone"><TextInput value={form.contact_phone} onChange={set('contact_phone')} /></Field>
        <Field label="Website"><TextInput value={form.website} onChange={set('website')} placeholder="https://" /></Field>
      </div>
      <Field label="Notes"><TextArea value={form.notes} onChange={set('notes')} /></Field>
    </Modal>
  );
}

function SponsorDetailModal({ societyId, sponsorId, onClose, onEdit }: { societyId: string; sponsorId: string; onClose: () => void; onEdit: (s: Sponsor) => void }) {
  const { data, reload } = useApi<SponsorDetail>(`/api/societies/${societyId}/sponsors/${sponsorId}`);
  const [log, setLog] = useState({ interaction_type: 'CALL', summary: '', occurred_on: new Date().toLocaleDateString('en-CA') });
  const [busy, setBusy] = useState(false);
  const addLog = async () => {
    setBusy(true);
    try {
      await apiCall('POST', `/api/societies/${societyId}/sponsors/${sponsorId}/interactions`, log);
      setLog((l) => ({ ...l, summary: '' }));
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open wide title={data?.sponsor.name ?? 'Sponsor'} onClose={onClose}
      footer={data?.can_manage ? <Btn variant="secondary" onClick={() => data && onEdit(data.sponsor)}>Edit details</Btn> : undefined}>
      {!data ? <Loading /> : (
        <>
          <p className="text-sm text-muted-foreground">{[data.sponsor.contact_name, data.sponsor.contact_email, data.sponsor.contact_phone, data.sponsor.website].filter(Boolean).join(' · ')}</p>
          {data.sponsor.notes && <p className="whitespace-pre-wrap text-sm">{data.sponsor.notes}</p>}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Deals</p>
            {data.deals.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
              <ul className="space-y-1 text-sm">
                {data.deals.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.event_title}</span> {money(d.amount)} <Pill status={d.status} /> {d.verified_at && <Pill tone="green">Verified</Pill>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">History</p>
            {data.can_manage && (
              <div className="mb-2 grid gap-2 sm:grid-cols-[140px_140px_1fr_auto]">
                <Select value={log.interaction_type} onChange={(e) => setLog({ ...log, interaction_type: e.target.value })} options={TYPES.map((t) => ({ value: t, label: labelize(t) }))} />
                <TextInput type="date" value={log.occurred_on} onChange={(e) => setLog({ ...log, occurred_on: e.target.value })} />
                <TextInput value={log.summary} placeholder="What happened?" onChange={(e) => setLog({ ...log, summary: e.target.value })} />
                <Btn onClick={addLog} busy={busy} disabled={!log.summary}>Log</Btn>
              </div>
            )}
            {data.interactions.length === 0 ? <p className="text-sm text-muted-foreground">No interactions logged.</p> : (
              <ul className="space-y-1.5 text-sm">
                {data.interactions.map((i) => (
                  <li key={i.id}>
                    <span className="text-xs text-muted-foreground">{fmtDate(i.occurred_on)} · {labelize(i.interaction_type)} · {i.logged_by_name}{i.event_title ? ` · ${i.event_title}` : ''}</span>
                    <p>{i.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
