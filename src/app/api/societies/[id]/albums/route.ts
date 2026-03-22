export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { query, getClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONTAINERS, extractBlobName, generateReadUrl } from "@/lib/blob";
import { resolveEffectiveSocietyPrivilege } from "@/lib/api-utils";

function signMediaUrl(
  url: string | null | undefined,
): string | null | undefined {
  if (!url) return url;

  const candidates = [
    CONTAINERS.SOCIETY_MEDIA,
    CONTAINERS.EVENT_MEDIA,
    CONTAINERS.POST_ATTACHMENTS,
    CONTAINERS.NOTE_ATTACHMENTS,
    CONTAINERS.PROFILE_PICTURES,
  ];

  for (const container of candidates) {
    const blobName = extractBlobName(url, container);
    if (blobName) {
      return generateReadUrl(container, blobName, 24 * 60);
    }
  }

  return url;
}

/**
 * GET /api/societies/[id]/albums
 * Fetch all albums for a society.
 * Public — no auth needed.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id: societyId } = params;

    const result = await query(
      `SELECT a.id, a.name, a.description, a.category, a.photo_count,
              a.created_at, a.updated_at,
              u.full_name AS created_by_name,
              cp.file_url AS cover_photo_url
       FROM society_albums a
       LEFT JOIN users u ON a.created_by = u.id
       LEFT JOIN society_album_photos cp ON a.cover_photo_id = cp.id
       WHERE a.society_id = $1 AND a.is_deleted = FALSE
       ORDER BY a.updated_at DESC`,
      [societyId],
    );

    const albums = result.rows.map((row) => ({
      ...row,
      cover_photo_url: signMediaUrl(row.cover_photo_url),
    }));

    return NextResponse.json({ albums });
  } catch (error) {
    console.error("Fetch albums error:", error);
    return NextResponse.json(
      { error: "Failed to fetch albums" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/societies/[id]/albums
 * Create a new album.
 * Requires MANAGE_CONTENT privilege.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: societyId } = params;
    const body = await req.json();
    const { name, description, category } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Album name is required" },
        { status: 400 },
      );
    }

    const validCategories = [
      "GENERAL",
      "EVENTS",
      "ACHIEVEMENTS",
      "TEAM",
      "OTHER",
    ];
    if (category && !validCategories.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    await client.query("BEGIN");

    const effectiveManageContent = await resolveEffectiveSocietyPrivilege(
      {
        userId: user.userId,
        societyId,
        privilegeName: "MANAGE_CONTENT",
      },
      client,
    );

    const effectiveUploadMedia = await resolveEffectiveSocietyPrivilege(
      {
        userId: user.userId,
        societyId,
        privilegeName: "UPLOAD_MEDIA",
      },
      client,
    );

    let meetsRoleThreshold = user.userType === "SUPER_ADMIN";
    let isPresidentMember = false;
    if (!meetsRoleThreshold) {
      const roleLevelMap: Record<string, number> = {
        President: 10,
        "Vice President": 8,
        Director: 5,
        "Deputy Director": 3,
        Member: 1,
      };

      const memberRole = await client.query(
        `SELECT r.name AS role_name,
                ss.content_upload_role
         FROM society_memberships sm
         JOIN roles r ON r.id = sm.role_id
         LEFT JOIN society_settings ss ON ss.society_id = sm.society_id
         WHERE sm.user_id = $1
           AND sm.society_id = $2
           AND sm.is_active = TRUE
           AND sm.suspended_at IS NULL
         ORDER BY r.hierarchy_level DESC
         LIMIT 1`,
        [user.userId, societyId],
      );

      const myRole = memberRole.rows[0]?.role_name as string | undefined;
      isPresidentMember = myRole === "President";
      const requiredRole =
        (memberRole.rows[0]?.content_upload_role as string | undefined) ||
        "Deputy Director";
      meetsRoleThreshold =
        (roleLevelMap[myRole || ""] || 0) >= (roleLevelMap[requiredRole] || 3);
    }

    const hasAnyPrivilege =
      effectiveManageContent.allowed || effectiveUploadMedia.allowed;
    const hasOverrideGrant =
      (effectiveManageContent.source === "override" &&
        effectiveManageContent.allowed) ||
      (effectiveUploadMedia.source === "override" &&
        effectiveUploadMedia.allowed);

    const canCreate =
      user.userType === "SUPER_ADMIN" ||
      isPresidentMember ||
      hasOverrideGrant ||
      (hasAnyPrivilege && meetsRoleThreshold);

    if (!canCreate) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await client.query(
      `INSERT INTO society_albums (society_id, name, description, category, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, category, created_at`,
      [
        societyId,
        name.trim(),
        description?.trim() || null,
        category || "GENERAL",
        user.userId,
      ],
    );

    await client.query("COMMIT");

    // Audit after COMMIT so logging issues don't block album creation.
    try {
      await query(
        `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value)
         VALUES ('ALBUM_CREATED', $1, $2, 'album', $3, $4)`,
        [
          user.userId,
          societyId,
          result.rows[0].id,
          JSON.stringify({ name: name.trim(), category }),
        ],
      );
    } catch (auditError) {
      console.error("Album audit log failed (non-blocking):", auditError);
    }

    return NextResponse.json(
      { success: true, album: result.rows[0] },
      { status: 201 },
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create album error:", error);
    return NextResponse.json(
      { error: "Failed to create album" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
