/**
 * PATCH /api/admin/incidents/[id] — update incident status/severity or add a note
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { status, severity, note } = await req.json();

    // Update incident fields if provided
    if (status) {
      const validStatuses = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      const resolvedAt = status === 'RESOLVED' ? 'NOW()' : 'NULL';
      await query(
        `UPDATE platform_incidents
         SET status = $1, resolved_at = ${resolvedAt}, updated_at = NOW()
         WHERE id = $2`,
        [status, id]
      );
    }

    if (severity) {
      const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      if (!validSeverities.includes(severity)) {
        return NextResponse.json({ error: 'Invalid severity' }, { status: 400 });
      }
      await query(
        'UPDATE platform_incidents SET severity = $1, updated_at = NOW() WHERE id = $2',
        [severity, id]
      );
    }

    // Add note if provided
    if (note && note.trim()) {
      await query(
        `INSERT INTO platform_incident_notes (incident_id, note, created_by)
         VALUES ($1, $2, $3)`,
        [id, note.trim(), user.userId]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update incident error:', error);
    return NextResponse.json({ error: 'Failed to update incident' }, { status: 500 });
  }
}
