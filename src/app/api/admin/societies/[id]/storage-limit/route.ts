/**
 * PATCH /api/admin/societies/[id]/storage-limit
 *
 * SuperAdmin-only: Update the storage quota for a society.
 *
 * Body: { storage_limit_bytes: number }
 *
 * Validation:
 *   - storage_limit_bytes must be > 0
 *   - storage_limit_bytes must be >= current storage_used_bytes (can't shrink below usage)
 *   - Only SUPER_ADMIN can call this
 *
 * Logs audit action: STORAGE_LIMIT_UPDATED
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const societyId = params.id;
    const body = await req.json();
    const { storage_limit_bytes } = body;

    if (!storage_limit_bytes || typeof storage_limit_bytes !== 'number' || storage_limit_bytes <= 0) {
      return NextResponse.json(
        { error: 'storage_limit_bytes must be a positive number' },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    // Lock society_settings row
    const settingsResult = await client.query(
      `SELECT ss.storage_used_bytes, ss.storage_quota_bytes
       FROM society_settings ss
       WHERE ss.society_id = $1
       FOR UPDATE`,
      [societyId]
    );

    if (settingsResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society settings not found' }, { status: 404 });
    }

    const currentUsed = parseInt(settingsResult.rows[0].storage_used_bytes || '0', 10);
    const oldQuota = parseInt(settingsResult.rows[0].storage_quota_bytes || '524288000', 10);

    // Can't set limit below current usage
    if (storage_limit_bytes < currentUsed) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        {
          error: `Cannot set storage limit below current usage. Current usage: ${currentUsed} bytes (${(currentUsed / (1024 * 1024)).toFixed(2)} MB)`,
          currentUsed,
          requestedLimit: storage_limit_bytes,
        },
        { status: 409 }
      );
    }

    // Update quota
    await client.query(
      `UPDATE society_settings SET storage_quota_bytes = $1 WHERE society_id = $2`,
      [storage_limit_bytes, societyId]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, new_value, metadata)
       VALUES ('STORAGE_LIMIT_UPDATED', $1, $2, 'society_settings', $3, $4, $5, $6)`,
      [
        user.userId,
        societyId,
        societyId,
        JSON.stringify({ storage_quota_bytes: oldQuota }),
        JSON.stringify({ storage_quota_bytes: storage_limit_bytes }),
        JSON.stringify({
          old_limit_mb: (oldQuota / (1024 * 1024)).toFixed(2),
          new_limit_mb: (storage_limit_bytes / (1024 * 1024)).toFixed(2),
          current_used_bytes: currentUsed,
          current_used_mb: (currentUsed / (1024 * 1024)).toFixed(2),
        }),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      societyId,
      previousLimit: oldQuota,
      newLimit: storage_limit_bytes,
      currentUsed,
      newLimitMb: (storage_limit_bytes / (1024 * 1024)).toFixed(2),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Storage limit update error:', error);
    return NextResponse.json({ error: 'Failed to update storage limit' }, { status: 500 });
  } finally {
    client.release();
  }
}
