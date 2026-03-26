export const dynamic = 'force-dynamic';

/**
 * GET /api/me
 * Returns the current user's profile with a fresh signed avatar URL.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { CONTAINERS, resolveMediaUrl } from '@/lib/blob';

export async function GET() {
  try {
    const authUser = await getCurrentUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await query(
      'SELECT id, email, full_name, user_type, avatar_url FROM users WHERE id = $1',
      [authUser.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = result.rows[0];

    let avatarUrl: string | null = null;
    if (user.avatar_url) {
      try {
        avatarUrl = resolveMediaUrl(user.avatar_url, {
          container: CONTAINERS.PROFILE_PICTURES,
          expiresInMinutes: 60 * 24,
        });
      } catch {
        avatarUrl = null;
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        userType: user.user_type,
        avatarUrl,
      },
    });
  } catch (error) {
    console.error('GET /api/me error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
