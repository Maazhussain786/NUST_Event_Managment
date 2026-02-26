import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import SocietyShell from '../_components/SocietyShell';

export const dynamic = 'force-dynamic';

export default async function SocietyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ societyId: string }>;
}) {
  const { societyId } = await params;

  // ── Auth check ──────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // ── Society exists + status check ─────────────────────────────────────
  const societyResult = await query(
    `SELECT id, name, description, logo_url, status FROM societies WHERE id = $1`,
    [societyId]
  );

  if (societyResult.rows.length === 0) redirect('/home');

  const society = societyResult.rows[0];

  // Suspended / deactivated societies — block non-admins
  if (['SUSPENDED', 'DEACTIVATED', 'REJECTED'].includes(society.status)) {
    if (user.userType !== 'SUPER_ADMIN') redirect('/home');
  }

  // ── Membership + role check ───────────────────────────────────────────
  const memberResult = await query(
    `SELECT sm.id AS membership_id, r.name AS role_name, r.hierarchy_level,
            sm.wing_id, sm.portfolio_id
     FROM society_memberships sm
     JOIN roles r ON sm.role_id = r.id
     WHERE sm.society_id = $1 AND sm.user_id = $2 AND sm.is_active = TRUE`,
    [societyId, user.userId]
  );

  // Must be an active member (or SUPER_ADMIN bypass)
  if (memberResult.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
    redirect('/home');
  }

  const membership = memberResult.rows[0] || {
    membership_id: 'admin',
    role_name: 'President',
    hierarchy_level: 10,
    wing_id: null,
    portfolio_id: null,
  };

  return (
    <SocietyShell
      societyId={societyId}
      societyName={society.name}
      societyLogo={society.logo_url}
      roleName={membership.role_name}
      hierarchyLevel={Number(membership.hierarchy_level)}
    >
      {children}
    </SocietyShell>
  );
}
