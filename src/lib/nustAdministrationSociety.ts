import { query } from "@/lib/db";

/**
 * The platform's own "society" used for university/school-wide events created by
 * super admins. For the SEECS deployment it is "SEECS Administration"; override with
 * PLATFORM_ADMIN_SOCIETY_NAME. An older "NUST Administration" row is renamed in place.
 */
const ADMIN_SOCIETY_NAME = process.env.PLATFORM_ADMIN_SOCIETY_NAME || "SEECS Administration";
const LEGACY_NAME = "NUST Administration";

type SocietyRow = { id: string };

export async function ensureNustAdministrationSociety(actorUserId: string): Promise<string> {
  const existing = await query(
    `SELECT id
     FROM societies
     WHERE deleted_at IS NULL
       AND LOWER(TRIM(name)) IN (LOWER($1), LOWER($2))
     ORDER BY
       CASE WHEN LOWER(TRIM(name)) = LOWER($1) THEN 0 ELSE 1 END,
       CASE WHEN status = 'APPROVED' THEN 0 ELSE 1 END,
       created_at ASC
     LIMIT 1`,
    [ADMIN_SOCIETY_NAME, LEGACY_NAME],
  );

  if (existing.rows.length > 0) {
    const societyId = (existing.rows[0] as SocietyRow).id;
    await query(
      `UPDATE societies
       SET name = $3,
           status = 'APPROVED',
           approved_by = COALESCE(approved_by, $2),
           approved_at = COALESCE(approved_at, NOW()),
           is_nust_wide = FALSE,
           updated_at = NOW()
       WHERE id = $1 AND (name <> $3 OR status <> 'APPROVED' OR is_nust_wide)`,
      [societyId, actorUserId, ADMIN_SOCIETY_NAME],
    );
    return societyId;
  }

  const inserted = await query(
    `INSERT INTO societies (name, description, status, created_by, approved_by, approved_at, is_nust_wide, school_id)
     VALUES ($1, $2, 'APPROVED', $3, $3, NOW(), FALSE, (SELECT id FROM nust_schools WHERE abbreviation = 'SEECS'))
     RETURNING id`,
    [ADMIN_SOCIETY_NAME, "Official administration profile managed by platform administrators.", actorUserId],
  );
  const societyId = (inserted.rows[0] as SocietyRow).id;
  await query("SELECT fn_seed_society_roles($1)", [societyId]);
  return societyId;
}
