import { query } from "@/lib/db";

const NUST_ADMIN_NAME = "NUST Administration";

type SocietyRow = {
  id: string;
};

export async function ensureNustAdministrationSociety(
  actorUserId: string,
): Promise<string> {
  await query(`
    ALTER TABLE societies
    ADD COLUMN IF NOT EXISTS is_nust_wide BOOLEAN NOT NULL DEFAULT TRUE
  `);

  const existing = await query<SocietyRow>(
    `SELECT id
     FROM societies
     WHERE deleted_at IS NULL
       AND LOWER(TRIM(name)) = LOWER($1)
     ORDER BY
       CASE WHEN status = 'APPROVED' THEN 0 ELSE 1 END,
       approved_at DESC NULLS LAST,
       created_at ASC
     LIMIT 1`,
    [NUST_ADMIN_NAME],
  );

  if (existing.rows.length > 0) {
    const societyId = existing.rows[0].id;
    await query(
      `UPDATE societies
       SET status = 'APPROVED',
           approved_by = COALESCE(approved_by, $2),
           approved_at = COALESCE(approved_at, NOW()),
           is_nust_wide = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [societyId, actorUserId],
    );
    return societyId;
  }

  const inserted = await query<SocietyRow>(
    `INSERT INTO societies (
      name,
      description,
      status,
      created_by,
      approved_by,
      approved_at,
      is_nust_wide
    ) VALUES (
      $1,
      $2,
      'APPROVED',
      $3,
      $3,
      NOW(),
      TRUE
    )
    RETURNING id`,
    [
      NUST_ADMIN_NAME,
      "Official NUST administration profile managed by super admins.",
      actorUserId,
    ],
  );

  return inserted.rows[0].id;
}
