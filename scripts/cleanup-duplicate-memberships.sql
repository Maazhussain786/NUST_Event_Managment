-- Deactivate duplicate active memberships for the same user + society + scope.
-- Keeps the highest role (hierarchy_level) and latest assignment.

WITH ranked AS (
  SELECT
    sm.id,
    sm.user_id,
    sm.society_id,
    COALESCE(sm.wing_id, '00000000-0000-0000-0000-000000000000'::uuid) AS wing_key,
    COALESCE(sm.portfolio_id, '00000000-0000-0000-0000-000000000000'::uuid) AS portfolio_key,
    r.hierarchy_level,
    sm.assigned_at,
    ROW_NUMBER() OVER (
      PARTITION BY
        sm.user_id,
        sm.society_id,
        COALESCE(sm.wing_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(sm.portfolio_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY r.hierarchy_level DESC, sm.assigned_at DESC, sm.id DESC
    ) AS rn
  FROM society_memberships sm
  JOIN roles r ON r.id = sm.role_id
  WHERE sm.is_active = TRUE
)
UPDATE society_memberships sm
SET is_active = FALSE,
    updated_at = NOW()
FROM ranked r
WHERE sm.id = r.id
  AND r.rn > 1;

-- Optional: review how many were deactivated
-- SELECT COUNT(*) FROM society_memberships WHERE is_active = FALSE;