export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

const WING_PRIVILEGE_PROFILE: Array<{ pattern: RegExp; privileges: string[] }> = [
  {
    pattern: /(media|photo|video|design|creative|content|marketing|pr|public\s*relations)/i,
    privileges: ['UPLOAD_CONTENT', 'DELETE_CONTENT', 'VIEW_ANALYTICS', 'SEND_MESSAGE', 'VIEW_CHAT'],
  },
  {
    pattern: /(finance|treasury|accounts|payment|sponsor)/i,
    privileges: ['VERIFY_PAYMENTS', 'VIEW_ANALYTICS', 'SEND_MESSAGE', 'VIEW_CHAT'],
  },
  {
    pattern: /(event|operations|logistics|management)/i,
    privileges: ['CREATE_EVENT', 'EDIT_EVENT', 'CANCEL_EVENT', 'SCAN_QR', 'SEND_MESSAGE', 'VIEW_CHAT'],
  },
];

const FALLBACK_WING_PRIVILEGES = ['SEND_MESSAGE', 'VIEW_CHAT', 'UPLOAD_CONTENT'];

function resolveWingPrivileges(wingName: string): string[] {
  const selected = new Set<string>();
  for (const profile of WING_PRIVILEGE_PROFILE) {
    if (profile.pattern.test(wingName)) {
      for (const key of profile.privileges) selected.add(key);
    }
  }

  if (selected.size === 0) {
    for (const key of FALLBACK_WING_PRIVILEGES) selected.add(key);
  }
  return Array.from(selected);
}

async function assignWingDefaultPrivileges(societyId: string, wingName: string, grantedBy: string) {
  const privilegeKeys = resolveWingPrivileges(wingName);
  const roleRows = await query(
    `SELECT id, name FROM roles
     WHERE society_id = $1 AND name IN ('Vice President', 'Director', 'Deputy Director')`,
    [societyId]
  );

  const hasGrantedByColumn = await query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_name = 'role_privileges' AND column_name = 'granted_by'
     LIMIT 1`
  );

  for (const role of roleRows.rows as Array<{ id: string }>) {
    if (hasGrantedByColumn.rows.length > 0) {
      await query(
        `INSERT INTO role_privileges (role_id, privilege_id, granted_by)
         SELECT $1, p.id, $2
         FROM privileges p
         WHERE p.name = ANY($3::text[])
         ON CONFLICT (role_id, privilege_id) DO NOTHING`,
        [role.id, grantedBy, privilegeKeys]
      );
    } else {
      await query(
        `INSERT INTO role_privileges (role_id, privilege_id)
         SELECT $1, p.id
         FROM privileges p
         WHERE p.name = ANY($2::text[])
         ON CONFLICT (role_id, privilege_id) DO NOTHING`,
        [role.id, privilegeKeys]
      );
    }
  }
}

// GET /api/societies/[id]/wings — list wings
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: societyId } = params;

    // Verify requester is a member or SUPER_ADMIN
    if (user.userType !== 'SUPER_ADMIN') {
      const membership = await query(
        `SELECT 1 FROM society_memberships
         WHERE society_id = $1 AND user_id = $2 AND is_active = TRUE`,
        [societyId, user.userId]
      );
      if (membership.rows.length === 0) {
        return NextResponse.json({ error: 'Not a member of this society' }, { status: 403 });
      }
    }

    const result = await query(
      `SELECT w.id, w.name, w.description, w.created_at,
              u.full_name AS created_by_name,
              COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE AND sm.wing_id = w.id) AS member_count,
              (SELECT full_name FROM users u2
               JOIN society_memberships sm2 ON sm2.user_id = u2.id
               JOIN roles r ON sm2.role_id = r.id
               WHERE sm2.society_id = w.society_id AND sm2.wing_id = w.id
                 AND r.name = 'Vice President' AND sm2.is_active = TRUE
               LIMIT 1) AS vp_name
       FROM wings w
       LEFT JOIN users u ON w.created_by = u.id
       LEFT JOIN society_memberships sm ON sm.society_id = w.society_id
       WHERE w.society_id = $1 AND w.deleted_at IS NULL
       GROUP BY w.id, u.full_name
       ORDER BY w.created_at`,
      [societyId]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Wings fetch error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST /api/societies/[id]/wings — create wing (President only)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;

    // Check president
    const membership = await query(
      `SELECT r.name FROM society_memberships sm
       JOIN roles r ON sm.role_id = r.id
       WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active = TRUE`,
      [user.userId, societyId]
    );
    const isPresident = membership.rows.some((r: { name: string }) => r.name === 'President');
    const isSuperAdmin = user.userType === 'SUPER_ADMIN';
    if (!isPresident && !isSuperAdmin) {
      return NextResponse.json({ error: 'Only President can create wings' }, { status: 403 });
    }

    const { name, description } = await req.json();
    if (!name) return NextResponse.json({ error: 'Wing name required' }, { status: 400 });

    const result = await query(
      `INSERT INTO wings (society_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, name, description, created_at`,
      [societyId, name, description || '', user.userId]
    );

    await assignWingDefaultPrivileges(societyId, name, user.userId);

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Wing name already exists' }, { status: 409 });
    }
    console.error('Wing create error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
