export const dynamic = 'force-dynamic';

/**
 * GET   /api/admin/system-config — list system configuration
 * PATCH /api/admin/system-config — update a config value
 *
 * Uses the same `platform_feature_flags` concept but for config values.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

const DEFAULT_CONFIG = [
  { key: 'max_societies_per_user', label: 'Max Societies per User', description: 'Maximum number of societies a user can join', value: '10', type: 'number' as const, unit: 'societies', category: 'Limits' },
  { key: 'max_events_per_society', label: 'Max Events per Society', description: 'Maximum concurrent events per society', value: '20', type: 'number' as const, unit: 'events', category: 'Limits' },
  { key: 'default_storage_quota_mb', label: 'Default Storage Quota', description: 'Default storage quota for new societies', value: '500', type: 'number' as const, unit: 'MB', category: 'Storage' },
  { key: 'max_ticket_price', label: 'Max Ticket Price', description: 'Maximum allowed ticket price', value: '5000', type: 'number' as const, unit: 'PKR', category: 'Finance' },
  { key: 'event_approval_required', label: 'Event Approval Required', description: 'Whether events require admin approval', value: 'true', type: 'boolean' as const, category: 'Events' },
  { key: 'society_approval_required', label: 'Society Approval Required', description: 'Whether new societies require admin approval', value: 'true', type: 'boolean' as const, category: 'Societies' },
  { key: 'audit_retention_days', label: 'Audit Log Retention', description: 'Number of days to retain audit logs', value: '365', type: 'number' as const, unit: 'days', category: 'System' },
  { key: 'platform_name', label: 'Platform Name', description: 'Displayed platform name', value: 'NUST Platform', type: 'string' as const, category: 'Branding' },
];

async function ensureTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS platform_system_config (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        value TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'string',
        unit TEXT,
        category TEXT NOT NULL DEFAULT 'General',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const count = await query('SELECT COUNT(*) AS c FROM platform_system_config');
    if (parseInt(count.rows[0].c) === 0) {
      for (const cfg of DEFAULT_CONFIG) {
        await query(
          `INSERT INTO platform_system_config (key, label, description, value, type, unit, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (key) DO NOTHING`,
          [cfg.key, cfg.label, cfg.description, cfg.value, cfg.type, cfg.unit || null, cfg.category]
        );
      }
    }
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

    const tableReady = await ensureTable();
    if (!tableReady) {
      return NextResponse.json(DEFAULT_CONFIG);
    }

    const result = await query('SELECT * FROM platform_system_config ORDER BY category, key');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('System config error:', error);
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { key, value } = await req.json();
    if (!key || value === undefined) {
      return NextResponse.json({ error: 'key and value are required' }, { status: 400 });
    }

    await ensureTable();

    // Get old value for audit
    const old = await query('SELECT value FROM platform_system_config WHERE key = $1', [key]);
    const oldValue = old.rows[0]?.value;

    await query(
      'UPDATE platform_system_config SET value = $1, updated_at = NOW() WHERE key = $2',
      [String(value), key]
    );

    // Audit
    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, old_value, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'SYSTEM_CONFIG', $2, $3, $4, $5)`,
      [
        user.userId,
        key,
        JSON.stringify({ value: oldValue }),
        JSON.stringify({ value: String(value) }),
        JSON.stringify({ configKey: key, updatedBy: user.email }),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Config update error:', error);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
