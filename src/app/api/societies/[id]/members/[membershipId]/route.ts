export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { ApiErrors, writeAuditLog } from '@/lib/api-utils';
import { getSocietyAccess, can, outranks, forbidden, setChangeContext, TIER_LABELS, type SocietyTier } from '@/lib/rbac';
import { notifyUser } from '@/lib/notify';

/**
 * PATCH /api/societies/[id]/members/[membershipId] — change a member's society role.
 * Requires MANAGE_ROLES, a reason (FR-ROLE-06), and outranking both the member
 * and the new role. President changes go through transfer-presidency; the
 * Faculty Sponsor is assigned by a super admin.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; membershipId: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const { id: societyId, membershipId } = params;
    const body = await req.json().catch(() => ({}));
    const roleId = body.roleId;
    const wingId = body.wingId || null;
    const reason = String(body.reason || '').trim();

    if (!roleId) return ApiErrors.validation('roleId is required');
    if (reason.length < 3) return ApiErrors.validation('Please give a reason for this role change.');

    await client.query('BEGIN');
    const access = await getSocietyAccess(user, societyId, client);
    if (!access) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Society');
    }
    if (!can(access, 'MANAGE_ROLES')) {
      await client.query('ROLLBACK');
      return forbidden('You do not have permission to change roles.');
    }

    const target = await client.query(
      `SELECT sm.id, sm.user_id, sm.role_id, sm.wing_id, r.name AS role_name, r.tier, r.hierarchy_level
       FROM society_memberships sm JOIN roles r ON r.id = sm.role_id
       WHERE sm.id = $1 AND sm.society_id = $2 AND sm.is_active
       FOR UPDATE OF sm`,
      [membershipId, societyId],
    );
    const member = target.rows[0];
    if (!member) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Active membership');
    }
    if (member.user_id === user.userId && !access.isSuperAdmin) {
      await client.query('ROLLBACK');
      return forbidden('You cannot change your own role.');
    }
    if (!outranks(access, member.hierarchy_level, member.tier)) {
      await client.query('ROLLBACK');
      return forbidden('You can only change roles of members ranked below you.');
    }
    if (member.role_name === 'President') {
      await client.query('ROLLBACK');
      return forbidden('Use "Transfer presidency" to change the President.');
    }

    const roleResult = await client.query(
      'SELECT id, name, tier, hierarchy_level, max_holders FROM roles WHERE id = $1 AND society_id = $2',
      [roleId, societyId],
    );
    const newRole = roleResult.rows[0];
    if (!newRole) {
      await client.query('ROLLBACK');
      return ApiErrors.validation('Invalid role');
    }
    const newTier = newRole.tier as SocietyTier;
    if (newRole.name === 'President') {
      await client.query('ROLLBACK');
      return forbidden('Use "Transfer presidency" to assign the President.');
    }
    if (newTier === 'FACULTY_SPONSOR' && !access.isSuperAdmin) {
      await client.query('ROLLBACK');
      return forbidden('Only platform administrators assign the Faculty Sponsor.');
    }
    if (!access.isSuperAdmin && newRole.hierarchy_level >= access.level) {
      await client.query('ROLLBACK');
      return forbidden('You can only assign roles ranked below your own.');
    }

    // Placement: only Officer roles may be tied to a wing (e.g. VP of a wing).
    if (wingId && newTier !== 'OFFICER') {
      await client.query('ROLLBACK');
      return ApiErrors.validation(`${TIER_LABELS[newTier]} roles are society-wide and cannot be tied to a wing.`);
    }
    if (wingId) {
      const wing = await client.query(
        'SELECT 1 FROM wings WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL',
        [wingId, societyId],
      );
      if (wing.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiErrors.validation('Invalid or deleted wing');
      }
    }

    if (newRole.max_holders) {
      const holders = await client.query(
        `SELECT COUNT(*)::int AS c FROM society_memberships
         WHERE society_id = $1 AND role_id = $2 AND is_active AND id <> $3`,
        [societyId, roleId, membershipId],
      );
      if (holders.rows[0].c >= newRole.max_holders) {
        await client.query('ROLLBACK');
        return ApiErrors.conflict(`${newRole.name} already has its maximum of ${newRole.max_holders} holder(s).`);
      }
    }

    await setChangeContext(client, { actorId: user.userId, reason, source: 'DIRECT' });
    await client.query(
      `UPDATE society_memberships
       SET role_id = $1, wing_id = $2, portfolio_id = NULL, assigned_by = $3, updated_at = NOW()
       WHERE id = $4`,
      [roleId, wingId, user.userId, membershipId],
    );

    await writeAuditLog(
      {
        action: 'ROLE_UPDATED',
        performedBy: user.userId,
        societyId,
        targetType: 'society_membership',
        targetId: membershipId,
        oldValue: { role: member.role_name, wing_id: member.wing_id },
        newValue: { role: newRole.name, wing_id: wingId },
        metadata: { member_user_id: member.user_id, reason },
      },
      client,
    );

    await client.query('COMMIT');

    await notifyUser(member.user_id, {
      title: 'Your role was updated',
      body: `Your role changed from ${member.role_name} to ${newRole.name}. Reason: ${reason}`,
      link: `/society/${societyId}/dashboard`,
      email: true,
    });

    return NextResponse.json({
      success: true,
      message: `Role changed from ${member.role_name} to ${newRole.name}`,
      previousRole: member.role_name,
      newRole: newRole.name,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return ApiErrors.serverError('Role reassignment error:', err);
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/societies/[id]/members/[membershipId] — remove a member.
 * Requires MANAGE_MEMBERS and outranking the member. Also ends their event-team places.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string; membershipId: string } }) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();
    const { id: societyId, membershipId } = params;
    const reason = (req.nextUrl.searchParams.get('reason') || '').trim() || null;

    await client.query('BEGIN');
    const access = await getSocietyAccess(user, societyId, client);
    if (!access) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Society');
    }
    if (!can(access, 'MANAGE_MEMBERS')) {
      await client.query('ROLLBACK');
      return forbidden('You do not have permission to remove members.');
    }

    const target = await client.query(
      `SELECT sm.user_id, r.name AS role_name, r.tier, r.hierarchy_level
       FROM society_memberships sm JOIN roles r ON r.id = sm.role_id
       WHERE sm.id = $1 AND sm.society_id = $2 AND sm.is_active
       FOR UPDATE OF sm`,
      [membershipId, societyId],
    );
    const member = target.rows[0];
    if (!member) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Membership');
    }
    if (member.user_id === user.userId) {
      await client.query('ROLLBACK');
      return forbidden('You cannot remove yourself.');
    }
    if (member.role_name === 'President' || !outranks(access, member.hierarchy_level, member.tier)) {
      await client.query('ROLLBACK');
      return forbidden('You can only remove members ranked below you.');
    }

    await setChangeContext(client, { actorId: user.userId, reason, source: 'DIRECT' });
    await client.query(
      'UPDATE society_memberships SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
      [membershipId],
    );
    await client.query(
      `UPDATE event_team_members SET removed_at = NOW(), removed_by = $3, removal_reason = $4
       WHERE society_id = $1 AND user_id = $2 AND removed_at IS NULL`,
      [societyId, member.user_id, user.userId, reason || 'Removed from society'],
    );
    await writeAuditLog(
      {
        action: 'MEMBER_REMOVED',
        performedBy: user.userId,
        societyId,
        targetType: 'society_membership',
        targetId: membershipId,
        oldValue: { role: member.role_name },
        metadata: { member_user_id: member.user_id, reason },
      },
      client,
    );
    await client.query('COMMIT');

    await notifyUser(member.user_id, {
      title: 'Membership removed',
      body: `Your ${member.role_name} membership has been removed.${reason ? ` Reason: ${reason}` : ''}`,
      link: '/societies',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return ApiErrors.serverError('Member remove error:', error);
  } finally {
    client.release();
  }
}
