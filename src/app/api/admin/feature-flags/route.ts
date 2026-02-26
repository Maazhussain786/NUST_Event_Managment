export const dynamic = 'force-dynamic';

/**
 * GET   /api/admin/feature-flags — list all feature flags
 * PATCH /api/admin/feature-flags — toggle a feature flag
 *
 * Uses a `platform_config` table (created on first access if missing).
 * Feature flags are stored as key-value pairs with scope and category.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// Default feature flags returned when table doesn't exist
const DEFAULT_FLAGS = [
  { key: 'event_creation', label: 'Event Creation', description: 'Allow societies to create new events', enabled: true, scope: 'global' as const, category: 'Events' },
  { key: 'paid_events', label: 'Paid Events', description: 'Allow paid ticket events', enabled: true, scope: 'global' as const, category: 'Events' },
  { key: 'qr_checkin', label: 'QR Check-in', description: 'Enable QR code attendance scanning', enabled: true, scope: 'global' as const, category: 'Events' },
  { key: 'society_registration', label: 'Society Registration', description: 'Allow new society registration requests', enabled: true, scope: 'global' as const, category: 'Societies' },
  { key: 'media_uploads', label: 'Media Uploads', description: 'Allow media uploads to society galleries', enabled: true, scope: 'per_society' as const, category: 'Storage' },
  { key: 'public_profiles', label: 'Public Profiles', description: 'Enable public user profile pages', enabled: false, scope: 'global' as const, category: 'Users' },
  { key: 'chat_system', label: 'Chat System', description: 'Enable real-time chat within societies', enabled: true, scope: 'per_society' as const, category: 'Communication' },
  { key: 'notifications', label: 'Push Notifications', description: 'Enable push notification delivery', enabled: true, scope: 'global' as const, category: 'Communication' },
];

async function ensureTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS platform_feature_flags (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        enabled BOOLEAN NOT NULL DEFAULT true,
        scope TEXT NOT NULL DEFAULT 'global',
        category TEXT NOT NULL DEFAULT 'General',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Seed defaults if empty
    const count = await query('SELECT COUNT(*) AS c FROM platform_feature_flags');
    if (parseInt(count.rows[0].c) === 0) {
      for (const flag of DEFAULT_FLAGS) {
        await query(
          `INSERT INTO platform_feature_flags (key, label, description, enabled, scope, category)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (key) DO NOTHING`,
          [flag.key, flag.label, flag.description, flag.enabled, flag.scope, flag.category]
        );
      }
    }
  } catch {
    // Table creation failed — return defaults gracefully
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
      return NextResponse.json(DEFAULT_FLAGS);
    }

    const result = await query('SELECT * FROM platform_feature_flags ORDER BY category, key');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Feature flags error:', error);
    return NextResponse.json({ error: 'Failed to fetch feature flags' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { key, enabled } = await req.json();
    if (!key || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'key (string) and enabled (boolean) required' }, { status: 400 });
    }

    await ensureTable();
    await query(
      'UPDATE platform_feature_flags SET enabled = $1, updated_at = NOW() WHERE key = $2',
      [enabled, key]
    );

    // Audit
    await query(
      `INSERT INTO audit_logs (action, performed_by, target_type, target_id, new_value, metadata)
       VALUES ('SUPERADMIN_OVERRIDE', $1, 'FEATURE_FLAG', $2, $3, $4)`,
      [
        user.userId,
        key,
        JSON.stringify({ enabled }),
        JSON.stringify({ flagKey: key, toggledBy: user.email }),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feature flag update error:', error);
    return NextResponse.json({ error: 'Failed to update feature flag' }, { status: 500 });
  }
}
