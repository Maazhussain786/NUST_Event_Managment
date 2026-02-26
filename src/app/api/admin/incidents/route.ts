export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/incidents — list all incidents
 * POST /api/admin/incidents — create new incident
 *
 * Uses `platform_incidents` table (created on first access if missing).
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

async function ensureTables() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS platform_incidents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        severity TEXT NOT NULL DEFAULT 'LOW',
        status TEXT NOT NULL DEFAULT 'OPEN',
        created_by UUID NOT NULL REFERENCES users(id),
        assigned_to UUID REFERENCES users(id),
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS platform_incident_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_id UUID NOT NULL REFERENCES platform_incidents(id) ON DELETE CASCADE,
        note TEXT NOT NULL,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch {
    return false;
  }
  return true;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tableReady = await ensureTables();
    if (!tableReady) {
      return NextResponse.json([]);
    }

    const result = await query(`
      SELECT i.id, i.title, i.description, i.severity, i.status,
             uc.full_name AS created_by_name, uc.email AS created_by_email,
             ua.full_name AS assigned_to_name,
             i.resolved_at, i.created_at, i.updated_at,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', n.id,
                   'note', n.note,
                   'created_by_name', un.full_name,
                   'created_at', n.created_at
                 ) ORDER BY n.created_at DESC
               ) FILTER (WHERE n.id IS NOT NULL),
               '[]'
             ) AS notes
      FROM platform_incidents i
      LEFT JOIN users uc ON uc.id = i.created_by
      LEFT JOIN users ua ON ua.id = i.assigned_to
      LEFT JOIN platform_incident_notes n ON n.incident_id = i.id
      LEFT JOIN users un ON un.id = n.created_by
      GROUP BY i.id, uc.full_name, uc.email, ua.full_name
      ORDER BY
        CASE i.status WHEN 'OPEN' THEN 0 WHEN 'INVESTIGATING' THEN 1 WHEN 'RESOLVED' THEN 2 ELSE 3 END,
        CASE i.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
        i.created_at DESC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Incidents list error:', error);
    return NextResponse.json({ error: 'Failed to fetch incidents' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await ensureTables();

    const { title, description, severity } = await req.json();
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const sev = validSeverities.includes(severity) ? severity : 'LOW';

    const result = await query(
      `INSERT INTO platform_incidents (title, description, severity, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [title, description || null, sev, user.userId]
    );

    return NextResponse.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Create incident error:', error);
    return NextResponse.json({ error: 'Failed to create incident' }, { status: 500 });
  }
}
