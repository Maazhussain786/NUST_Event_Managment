export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { query, getClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONTAINERS, extractBlobName, generateReadUrl } from "@/lib/blob";

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
 * GET /api/societies/[id]/posts?page=1&limit=20
 * Fetch society posts with images and author info.
 * Public — no auth needed.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id: societyId } = params;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "20")),
    );
    const offset = (page - 1) * limit;

    // Get posts with author info
    const postsResult = await query(
      `SELECT p.id, p.society_id, p.author_id, p.content, p.post_type,
              p.shared_event_id, p.is_pinned, p.like_count, p.comment_count,
              p.created_at, p.updated_at,
              u.full_name AS author_name,
              u.avatar_url AS author_avatar,
              COALESCE(
                (SELECT r.name FROM society_memberships sm
                 JOIN roles r ON sm.role_id = r.id
                 WHERE sm.user_id = p.author_id AND sm.society_id = p.society_id AND sm.is_active = TRUE
                 LIMIT 1),
                'Member'
              ) AS author_role,
              e.title AS shared_event_title,
              e.banner_url AS shared_event_banner,
              e.event_start AS shared_event_date
       FROM society_posts p
       JOIN users u ON p.author_id = u.id
       LEFT JOIN events e ON p.shared_event_id = e.id
       WHERE p.society_id = $1 AND p.is_deleted = FALSE AND p.deleted_at IS NULL
       ORDER BY p.is_pinned DESC, p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [societyId, limit, offset],
    );

    // Get images for all posts
    const postIds = postsResult.rows.map((p) => p.id);
    let images: Record<string, any[]> = {};

    if (postIds.length > 0) {
      const imgResult = await query(
        `SELECT id, post_id, file_url, file_name, file_size_bytes, mime_type, display_order
         FROM society_post_images
         WHERE post_id = ANY($1)
         ORDER BY display_order`,
        [postIds],
      );
      for (const img of imgResult.rows) {
        if (!images[img.post_id]) images[img.post_id] = [];
        images[img.post_id].push({
          ...img,
          file_url: signMediaUrl(img.file_url),
        });
      }
    }

    // Get total count for pagination
    const countResult = await query(
      `SELECT COUNT(*) AS total FROM society_posts WHERE society_id = $1 AND is_deleted = FALSE AND deleted_at IS NULL`,
      [societyId],
    );

    const posts = postsResult.rows.map((p) => ({
      ...p,
      author_avatar: signMediaUrl(p.author_avatar),
      shared_event_banner: signMediaUrl(p.shared_event_banner),
      images: images[p.id] || [],
    }));

    return NextResponse.json({
      posts,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        hasMore: offset + posts.length < parseInt(countResult.rows[0].total),
      },
    });
  } catch (error) {
    console.error("Fetch posts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch posts" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/societies/[id]/posts
 * Create a new society post.
 * Requires MANAGE_CONTENT or CREATE_POST privilege.
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
    const { content, post_type, shared_event_id, is_pinned, image_urls } = body;

    // Validate
    if (
      !content?.trim() &&
      (!image_urls || image_urls.length === 0) &&
      !shared_event_id
    ) {
      return NextResponse.json(
        { error: "Post must have content, images, or a shared event" },
        { status: 400 },
      );
    }

    await client.query("BEGIN");

    // Auth check: President/VP fallback + privilege checks (if function available).
    let canCreate = user.userType === "SUPER_ADMIN";

    if (!canCreate) {
      const memberRole = await client.query(
        `SELECT r.hierarchy_level
         FROM society_memberships sm
         JOIN roles r ON r.id = sm.role_id
         WHERE sm.user_id = $1
           AND sm.society_id = $2
           AND sm.is_active = TRUE
           AND sm.suspended_at IS NULL
         ORDER BY r.hierarchy_level DESC
         LIMIT 1`,
        [user.userId, societyId],
      );

      const hierarchyLevel = Number(memberRole.rows[0]?.hierarchy_level || 0);
      if (hierarchyLevel >= 8) {
        canCreate = true;
      }
    }

    if (!canCreate) {
      try {
        const privCheck = await client.query(
          `SELECT fn_has_privilege($1, $2, 'MANAGE_CONTENT') AS has_manage,
                  fn_has_privilege($1, $2, 'CREATE_POST') AS has_create`,
          [user.userId, societyId],
        );
        canCreate =
          Boolean(privCheck.rows[0]?.has_manage) ||
          Boolean(privCheck.rows[0]?.has_create);
      } catch {
        // Keep fallback-only behavior if privilege function/config is unavailable.
      }
    }

    if (!canCreate) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const allowedPostTypes = new Set([
      "TEXT",
      "IMAGE",
      "GALLERY",
      "EVENT_SHARE",
    ]);
    const normalizedPostType = allowedPostTypes.has(post_type)
      ? post_type
      : "TEXT";

    // Insert post
    const postResult = await client.query(
      `INSERT INTO society_posts (society_id, author_id, content, post_type, shared_event_id, is_pinned)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        societyId,
        user.userId,
        content?.trim() || null,
        normalizedPostType,
        shared_event_id || null,
        is_pinned || false,
      ],
    );

    const postId = postResult.rows[0].id;

    // Insert images if any
    if (image_urls && image_urls.length > 0) {
      for (let i = 0; i < image_urls.length; i++) {
        const img = image_urls[i];
        await client.query(
          `INSERT INTO society_post_images (post_id, file_url, file_name, file_size_bytes, mime_type, display_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            postId,
            img.file_url,
            img.file_name || "image",
            img.file_size_bytes || 0,
            img.mime_type || "image/jpeg",
            i,
          ],
        );
      }
    }

    await client.query("COMMIT");

    // Audit after COMMIT so logging issues never abort post creation.
    try {
      await query(
        `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value)
         VALUES ('POST_CREATED', $1, $2, 'post', $3, $4)`,
        [
          user.userId,
          societyId,
          postId,
          JSON.stringify({ post_type: normalizedPostType, is_pinned }),
        ],
      );
    } catch (auditError) {
      console.error("Post audit log failed (non-blocking):", auditError);
    }

    return NextResponse.json(
      { success: true, postId, created_at: postResult.rows[0].created_at },
      { status: 201 },
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create post error:", error);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
