'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Section, Btn, Modal, Field, TextInput, TextArea, Pill, Empty, Loading, Notice, Table, Td, useApi, apiCall, fmtDate, labelize } from '../../../_components/kit';

interface Role {
  id: string; name: string; description: string | null; hierarchy_level: number; is_system_role: boolean;
  tier: 'FACULTY_SPONSOR' | 'ADMIN' | 'OFFICER' | 'MEMBER'; tier_label: string; max_holders: number | null; holder_count: number;
}
interface RolePrivileges {
  role_name: string; tier: string; full_access: boolean; editable: boolean;
  privileges: Array<{ privilege_key: string; label: string; description: string; module: string | null; faculty_sponsor_only: boolean; granted: boolean }>;
}
interface MyPerms { can_define_officer_permissions: boolean; privileges: string[] }
interface Change {
  id: string; scope_type: string; change_type: string; from_role: string | null; to_role: string | null; source: string; reason: string | null;
  created_at: string; user_name: string; changed_by_name: string | null; scope_name: string | null;
}

const TIER_TONE = { FACULTY_SPONSOR: 'violet', ADMIN: 'blue', OFFICER: 'green', MEMBER: 'gray' } as const;

/**
 * Roles & permissions (FR-ROLE-01..06). The Faculty Sponsor defines Officer roles and
 * exactly what each may do; Faculty Sponsor and Admin roles always have full access.
 */
export default function RolesPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const roles = useApi<Role[]>(`/api/societies/${societyId}/roles`);
  const perms = useApi<MyPerms>(`/api/societies/${societyId}/governance/my-permissions`);
  const canViewHistory = perms.data?.privileges.includes('MANAGE_ROLES') || perms.data?.privileges.includes('VIEW_AUDIT_LOGS');
  const history = useApi<{ changes: Change[] }>(canViewHistory ? `/api/societies/${societyId}/governance/role-changes` : null);
  const [selected, setSelected] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  if (roles.loading && !roles.data) return <Loading />;
  if (!roles.data) return <Notice tone="red">{roles.error}</Notice>;
  const canDefine = Boolean(perms.data?.can_define_officer_permissions);

  return (
    <div className="space-y-4">
      <Section title="Roles" description="Faculty Sponsor → Admin → Officers → Members. Team Leads, Executives and Event Heads are assigned per event."
        actions={canDefine && <Btn onClick={() => setCreating(true)}>New officer role</Btn>}>
        <div className="space-y-2">
          {roles.data.map((r) => (
            <button key={r.id} onClick={() => setSelected(r)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-left text-sm hover:bg-accent/50">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.description}</p>
              </div>
              <span className="text-xs text-muted-foreground">rank {r.hierarchy_level} · {r.holder_count}{r.max_holders ? ` / ${r.max_holders}` : ''} holder(s)</span>
              <Pill tone={TIER_TONE[r.tier]}>{r.tier_label}</Pill>
            </button>
          ))}
        </div>
      </Section>

      {canViewHistory && (
        <Section title="Role history" description="Every assignment, change and removal — who, when and why.">
          {history.loading && !history.data ? <Loading /> : (history.data?.changes ?? []).length === 0 ? <Empty>No role changes yet.</Empty> : (
            <Table head={['When', 'Person', 'Change', 'Where', 'By', 'Why']}>
              {history.data!.changes.map((c) => (
                <tr key={c.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDate(c.created_at, true)}</Td>
                  <Td>{c.user_name}</Td>
                  <Td>
                    <Pill status={c.change_type === 'REVOKED' || c.change_type === 'SUSPENDED' ? 'REJECTED' : c.change_type === 'ASSIGNED' ? 'APPROVED' : 'IN_PROGRESS'}>{labelize(c.change_type)}</Pill>
                    <span className="block text-xs text-muted-foreground">{[c.from_role, c.to_role].filter(Boolean).map((x) => labelize(x as string)).join(' → ')}</span>
                  </Td>
                  <Td className="text-xs">{c.scope_type === 'SOCIETY' ? 'Society' : c.scope_name ?? labelize(c.scope_type)}</Td>
                  <Td className="text-xs">{c.changed_by_name ?? '—'}<span className="block text-muted-foreground">{labelize(c.source)}</span></Td>
                  <Td className="text-xs">{c.reason ?? '—'}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      )}

      {selected && <RoleModal societyId={societyId} role={selected} canDefine={canDefine} onClose={() => setSelected(null)} onChanged={roles.reload} />}
      {creating && <CreateRoleModal societyId={societyId} onClose={() => setCreating(false)} onDone={roles.reload} />}
    </div>
  );
}

function RoleModal({ societyId, role, canDefine, onClose, onChanged }: {
  societyId: string; role: Role; canDefine: boolean; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const { data, reload } = useApi<RolePrivileges>(`/api/societies/${societyId}/governance/privileges/roles/${role.id}`);
  const [name, setName] = useState(role.name);
  const [level, setLevel] = useState(String(role.hierarchy_level));
  const [busy, setBusy] = useState(false);

  const toggle = async (key: string, granted: boolean) => {
    try {
      await apiCall('PATCH', `/api/societies/${societyId}/governance/privileges`, { roleId: role.id, privilegeKey: key, granted });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const saveRole = async () => {
    setBusy(true);
    try {
      await apiCall('PATCH', `/api/societies/${societyId}/roles/${role.id}`, { name, hierarchy_level: Number(level) });
      toast.success('Role updated');
      await onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const deleteRole = async () => {
    if (!window.confirm(`Delete the role "${role.name}"?`)) return;
    try {
      await apiCall('DELETE', `/api/societies/${societyId}/roles/${role.id}`);
      await onChanged();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const modules = data ? Array.from(new Set(data.privileges.map((p) => p.module ?? 'Other'))) : [];
  const editableRole = canDefine && role.tier === 'OFFICER';
  return (
    <Modal open wide title={role.name} onClose={onClose}
      footer={editableRole && !role.is_system_role && role.holder_count === 0 ? <Btn variant="danger" onClick={deleteRole}><Trash2 className="h-3.5 w-3.5" /> Delete role</Btn> : undefined}>
      {editableRole && (
        <div className="grid items-end gap-2 sm:grid-cols-[1fr_120px_auto]">
          <Field label="Role name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Rank (20–80)"><TextInput type="number" min="20" max="80" value={level} onChange={(e) => setLevel(e.target.value)} /></Field>
          <Btn onClick={saveRole} busy={busy}>Save</Btn>
        </div>
      )}
      {!data ? <Loading /> : data.full_access ? (
        <Notice tone="green">{role.tier === 'FACULTY_SPONSOR' ? 'The Faculty Sponsor has full authority, including approving minutes.' : 'Admins have full access to every module (minutes approval stays with the Faculty Sponsor).'}</Notice>
      ) : (
        <>
          {!data.editable && <Notice>Only the Faculty Sponsor can change these permissions.</Notice>}
          <div className="space-y-3">
            {modules.map((mod) => (
              <div key={mod}>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{mod}</p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {data.privileges.filter((p) => (p.module ?? 'Other') === mod).map((p) => (
                    <label key={p.privilege_key} className="flex items-start gap-2 rounded-lg px-2 py-1 text-sm hover:bg-accent/50" title={p.description}>
                      <input type="checkbox" className="mt-0.5" checked={p.granted} disabled={!data.editable || p.faculty_sponsor_only}
                        onChange={(e) => toggle(p.privilege_key, e.target.checked)} />
                      <span>{p.label}{p.faculty_sponsor_only && <span className="block text-[11px] text-muted-foreground">Faculty Sponsor only</span>}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

function CreateRoleModal({ societyId, onClose, onDone }: { societyId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ name: '', description: '', hierarchy_level: '60', max_holders: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await apiCall('POST', `/api/societies/${societyId}/roles`, {
        ...form, hierarchy_level: Number(form.hierarchy_level), max_holders: form.max_holders ? Number(form.max_holders) : null,
      });
      toast.success('Role created — open it to choose its permissions');
      await onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title="New officer role" onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit} busy={busy} disabled={!form.name}>Create</Btn></>}>
      <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Treasurer, Media Secretary" /></Field>
      <Field label="Description"><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rank (20–80)" hint="Higher ranks can manage lower ones."><TextInput type="number" min="20" max="80" value={form.hierarchy_level} onChange={(e) => setForm({ ...form, hierarchy_level: e.target.value })} /></Field>
        <Field label="Max holders" hint="Empty = no limit"><TextInput type="number" min="1" value={form.max_holders} onChange={(e) => setForm({ ...form, max_holders: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
