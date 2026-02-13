import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/favorites/check?societyId=xxx
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ favorited: false });

    const societyId = req.nextUrl.searchParams.get('societyId');
    if (!societyId) return NextResponse.json({ favorited: false });

    const result = await query(
      'SELECT id FROM favorite_societies WHERE user_id = $1 AND society_id = $2',
      [user.userId, societyId]
    );

    return NextResponse.json({ favorited: result.rows.length > 0 });
  } catch {
    return NextResponse.json({ favorited: false });
  }
}
