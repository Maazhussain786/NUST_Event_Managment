export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// PATCH /api/societies/[id]/members/[membershipId] — reassign member role
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; membershipId: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, membershipId } = params;
    const { roleId, wingId, portfolioId, reason } = await req.json();

    if (!roleId) {
      return NextResponse.json({ error: 'roleId is required' }, { status: 400 });
    }

    await client.query('BEGIN');

    // Get requester's hierarchy level
    const myMembership = await client.query(
      `SELECT r.hierarchy_level, r.name as role_name
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE
       ORDER BY r.hierarchy_level DESC LIMIT 1`,
      [user.userId, societyId]
    );

    const myLevel = user.userType === 'SUPER_ADMIN' ? 999 : (myMembership.rows[0]?.hierarchy_level || 0);

    // VP+ (level >= 8) required for role changes
    if (myLevel < 8 && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'VP+ required for role changes' }, { status: 403 });
    }

    // Get target membership details
    const target = await client.query(
      `SELECT sm.*, r.hierarchy_level, r.name as role_name, r.id as current_role_id
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.id = $1 AND sm.society_id = $2`,
      [membershipId, societyId]
    );

    if (target.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
    }

    const targetMember = target.rows[0];

    // Cannot modify equal or higher ranked member
    if (targetMember.hierarchy_level >= myLevel && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Cannot modify equal or higher rank' }, { status: 403 });
    }

    // Special protection: cannot change President role (use transfer-presidency instead)
    if (targetMember.role_name === 'President') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Use transfer-presidency endpoint to change President' }, { status: 403 });
    }

    // Get new role details
    const newRole = await client.query(
      `SELECT id, name, hierarchy_level FROM roles WHERE id = $1 AND society_id = $2`,
      [roleId, societyId]
    );

    if (newRole.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const newRoleData = newRole.rows[0];

    // Cannot promote above own level
    if (newRoleData.hierarchy_level >= myLevel && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Cannot promote above your own rank' }, { status: 403 });
    }

    // Cannot assign President role via this endpoint
    if (newRoleData.name === 'President') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Use transfer-presidency endpoint to assign President' }, { status: 403 });
    }

    // Validate wing/portfolio requirements based on role
    const newRoleName = newRoleData.name;
    const finalWingId = wingId || null;
    const finalPortfolioId = portfolioId || null;

    if (newRoleName === 'Vice President' && !finalWingId) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Vice President requires wing_id' }, { status: 400 });
    }

    if ((newRoleName === 'Director' || newRoleName === 'Deputy Director') && (!finalWingId || !finalPortfolioId)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Director/Deputy Director requires wing_id and portfolio_id' }, { status: 400 });
    }

    // Validate wing exists and belongs to society
    if (finalWingId) {
      const wing = await client.query(
        `SELECT id FROM wings WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL`,
        [finalWingId, societyId]
      );
      if (wing.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Invalid or deleted wing' }, { status: 400 });
      }
    }

    // Validate portfolio exists and belongs to wing
    if (finalPortfolioId) {
      const portfolio = await client.query(
        `SELECT id FROM portfolios WHERE id = $1 AND wing_id = $2 AND deleted_at IS NULL`,
        [finalPortfolioId, finalWingId]
      );
      if (portfolio.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Invalid portfolio or portfolio does not belong to selected wing' }, { status: 400 });
      }
    }

    // Check role limits for the new scope
    const roleLimits: Record<string, number> = {
      'Vice President': 1,  // per wing
      'Director': 1,        // per portfolio
      'Deputy Director': 2, // per portfolio
    };

    const limit = roleLimits[newRoleName];
    if (limit) {
      let countQuery = '';
      let countParams: (string | null)[] = [];

      if (newRoleName === 'Vice President') {
        countQuery = `SELECT COUNT(*) c FROM society_memberships sm
          JOIN roles r ON sm.role_id = r.id
          WHERE sm.society_id = $1 AND sm.wing_id = $2 AND r.name = 'Vice President'
          AND sm.is_active = TRUE AND sm.id != $3`;
        countParams = [societyId, finalWingId, membershipId];
      } else if (newRoleName === 'Director') {
        countQuery = `SELECT COUNT(*) c FROM society_memberships sm
          JOIN roles r ON sm.role_id = r.id
          WHERE sm.society_id = $1 AND sm.portfolio_id = $2 AND r.name = 'Director'
          AND sm.is_active = TRUE AND sm.id != $3`;
        countParams = [societyId, finalPortfolioId, membershipId];
      } else if (newRoleName === 'Deputy Director') {
        countQuery = `SELECT COUNT(*) c FROM society_memberships sm
          JOIN roles r ON sm.role_id = r.id
          WHERE sm.society_id = $1 AND sm.portfolio_id = $2 AND r.name = 'Deputy Director'
          AND sm.is_active = TRUE AND sm.id != $3`;
        countParams = [societyId, finalPortfolioId, membershipId];
      }

      if (countQuery) {
        const currentCount = await client.query(countQuery, countParams);
        if (parseInt(currentCount.rows[0].c) >= limit) {
          await client.query('ROLLBACK');
          return NextResponse.json({
            error: `Role limit reached: max ${limit} ${newRoleName}(s) allowed in this scope`
          }, { status: 409 });
        }
      }
    }

    // Record role history (table may not exist yet if migration hasn't run)
    try {
      await client.query(
        `INSERT INTO role_history
         (membership_id, previous_role_id, new_role_id, previous_wing_id, new_wing_id,
          previous_portfolio_id, new_portfolio_id, changed_by, change_type, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          membershipId,
          targetMember.current_role_id,
          roleId,
          targetMember.wing_id,
          finalWingId,
          targetMember.portfolio_id,
          finalPortfolioId,
          user.userId,
          newRoleData.hierarchy_level > targetMember.hierarchy_level ? 'PROMOTION' :
          newRoleData.hierarchy_level < targetMember.hierarchy_level ? 'DEMOTION' : 'REASSIGNMENT',
          reason || null
        ]
      );
    } catch {
      // role_history table may not exist yet - continue without recording
      console.warn('role_history table not found, skipping history record');
    }

    // Update the membership
    await client.query(
      `UPDATE society_memberships
       SET role_id = $1, wing_id = $2, portfolio_id = $3, updated_at = NOW()
       WHERE id = $4`,
      [roleId, finalWingId, finalPortfolioId, membershipId]
    );

    // Record in audit log
    await client.query(
      `INSERT INTO audit_logs (user_id, society_id, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.userId,
        societyId,
        'ROLE_UPDATED',
        'membership',
        membershipId,
        JSON.stringify({
          member_user_id: targetMember.user_id,
          old_role: targetMember.role_name,
          new_role: newRoleName,
          old_wing_id: targetMember.wing_id,
          new_wing_id: finalWingId,
          old_portfolio_id: targetMember.portfolio_id,
          new_portfolio_id: finalPortfolioId,
          reason: reason || null
        })
      ]
    );

    // Notify the member of their role change
    await client.query(
      `INSERT INTO notifications (user_id, title, body, link)
       VALUES ($1, $2, $3, $4)`,
      [
        targetMember.user_id,
        'Role Updated',
        `Your role has been changed from ${targetMember.role_name} to ${newRoleName}.`,
        `/society/${societyId}`
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `Role changed from ${targetMember.role_name} to ${newRoleName}`,
      previousRole: targetMember.role_name,
      newRole: newRoleName
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Role reassignment error:', err);
    return NextResponse.json({ error: 'Failed to reassign role' }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE /api/societies/[id]/members/[membershipId] — remove member
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; membershipId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId, membershipId } = params;

    // Get requester role
    const myMembership = await query(
      `SELECT r.name, r.hierarchy_level FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE
       ORDER BY r.hierarchy_level DESC LIMIT 1`,
      [user.userId, societyId]
    );
    if (myMembership.rows.length === 0 && user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const myLevel = user.userType === 'SUPER_ADMIN' ? 999 : myMembership.rows[0].hierarchy_level;

    // Get target membership role
    const target = await query(
      `SELECT sm.user_id, r.hierarchy_level, r.name as role_name
       FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.id = $1 AND sm.society_id = $2`,
      [membershipId, societyId]
    );
    if (target.rows.length === 0) {
      return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
    }

    // Can only remove lower-ranked members
    if (target.rows[0].hierarchy_level >= myLevel) {
      return NextResponse.json({ error: 'Cannot remove an equal or higher-ranked member' }, { status: 403 });
    }

    await query(
      'UPDATE society_memberships SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
      [membershipId]
    );

    // Notify removed member
    await query(
      `INSERT INTO notifications (user_id, title, body, link)
       VALUES ($1, $2, $3, $4)`,
      [
        target.rows[0].user_id,
        'Membership Removed',
        `Your ${target.rows[0].role_name} role has been removed.`,
        '/societies',
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Member remove error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
