import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { getSocietyAccess, isSocietyAdmin, TIER_LABELS } from '@/lib/rbac';
import SocietyShell from '../../_components/SocietyShell';

export const dynamic = 'force-dynamic';

export default async function SocietyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ societyId: string }>;
}) {
  const { societyId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const access = await getSocietyAccess(user, societyId);
  if (!access) redirect('/home');

  // Suspended / deactivated societies — only platform admins may look inside.
  if (['SUSPENDED', 'DEACTIVATED', 'REJECTED'].includes(access.societyStatus) && !access.isSuperAdmin) redirect('/home');
  // Active (non-suspended) members only, plus platform admins.
  if (!access.isMember && !access.isSuperAdmin) redirect(`/societies/${societyId}`);

  const [society, standing] = await Promise.all([
    query(`SELECT name, logo_url FROM societies WHERE id = $1`, [societyId]),
    query(
      `SELECT
         COALESCE(ARRAY(
           SELECT DISTINCT p.function_key
           FROM event_team_members etm
           JOIN event_teams et ON et.id = etm.team_id AND et.is_active
           JOIN events e ON e.id = et.event_id AND e.deleted_at IS NULL AND e.archived_at IS NULL
           JOIN portfolios p ON p.id = et.portfolio_id
           WHERE etm.society_id = $1 AND etm.user_id = $2 AND etm.removed_at IS NULL), '{}') AS functions,
         EXISTS (SELECT 1 FROM event_team_members etm
                 JOIN events e ON e.id = etm.event_id AND e.deleted_at IS NULL AND e.archived_at IS NULL
                 WHERE etm.society_id = $1 AND etm.user_id = $2 AND etm.removed_at IS NULL) AS on_team,
         EXISTS (SELECT 1 FROM events WHERE society_id = $1 AND event_head_id = $2
                 AND deleted_at IS NULL AND archived_at IS NULL) AS event_head`,
      [societyId, user.userId],
    ),
  ]);

  const roleName = access.roleName ?? (access.isSuperAdmin ? 'Platform admin' : 'Member');
  const tierLabel = access.tier ? TIER_LABELS[access.tier] : null;

  return (
    <SocietyShell
      societyId={societyId}
      societyName={society.rows[0]?.name ?? 'Society'}
      societyLogo={society.rows[0]?.logo_url ?? null}
      roleName={tierLabel && tierLabel !== roleName ? `${roleName} · ${tierLabel}` : roleName}
      hierarchyLevel={access.level}
      access={{
        privileges: Array.from(access.privileges),
        isAdmin: isSocietyAdmin(access),
        onTeam: Boolean(standing.rows[0]?.on_team),
        isEventHead: Boolean(standing.rows[0]?.event_head),
        teamFunctions: standing.rows[0]?.functions ?? [],
      }}
    >
      {children}
    </SocietyShell>
  );
}
