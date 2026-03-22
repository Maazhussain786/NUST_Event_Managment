export const dynamic = "force-dynamic";

/**
 * POST /api/upload/society-media
 *
 * Upload media to a society:
 * - logo (1:1, replaces old)
 * - cover (1:1, replaces old)
 * - gallery (1:N, max 200)
 *
 * Query params:
 *   ?societyId=<uuid>&type=logo|cover|gallery
 *
 * Permissions:
 *   President can upload everything.
 *   VP and Director can upload media.
 *   SuperAdmin has full control.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query, getClient } from "@/lib/db";
import {
  uploadBlob,
  deleteBlob,
  extractBlobName,
  CONTAINERS,
} from "@/lib/blob";
import {
  validateImageFile,
  validateMagicBytes,
  processImage,
  checkRateLimit,
  recordUpload,
  checkSocietyQuotaTx,
  updateSocietyStorageUsedTx,
  logQuotaExceeded,
  checkEntityMediaCount,
  generateBlobPath,
  LIMITS,
} from "@/lib/upload";
import { resolveEffectiveSocietyPrivilege } from "@/lib/api-utils";

type SocietyMediaType = "logo" | "cover" | "gallery";

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse params
    const { searchParams } = new URL(request.url);
    const societyId = searchParams.get("societyId");
    const mediaType = searchParams.get("type") as SocietyMediaType;
    const albumId = searchParams.get("albumId");

    if (!societyId) {
      return NextResponse.json(
        { error: "societyId is required" },
        { status: 400 },
      );
    }
    if (!mediaType || !["logo", "cover", "gallery"].includes(mediaType)) {
      return NextResponse.json(
        { error: "type must be: logo, cover, or gallery" },
        { status: 400 },
      );
    }

    // 3. Verify society exists
    const societyResult = await query(
      "SELECT id, name, logo_url FROM societies WHERE id = $1 AND deleted_at IS NULL",
      [societyId],
    );
    if (societyResult.rows.length === 0) {
      return NextResponse.json({ error: "Society not found" }, { status: 404 });
    }
    const society = societyResult.rows[0];

    if (albumId && mediaType !== "gallery") {
      return NextResponse.json(
        { error: "albumId can only be used with gallery uploads" },
        { status: 400 },
      );
    }

    if (albumId) {
      const albumResult = await query(
        `SELECT id FROM society_albums
         WHERE id = $1 AND society_id = $2 AND is_deleted = FALSE AND deleted_at IS NULL`,
        [albumId, societyId],
      );
      if (albumResult.rows.length === 0) {
        return NextResponse.json({ error: "Album not found" }, { status: 404 });
      }
    }

    // 4. Permission check
    if (user.userType !== "SUPER_ADMIN") {
      const effectiveUploadMedia = await resolveEffectiveSocietyPrivilege({
        userId: user.userId,
        societyId,
        privilegeName: "UPLOAD_MEDIA",
      });

      const effectiveUploadContent = await resolveEffectiveSocietyPrivilege({
        userId: user.userId,
        societyId,
        privilegeName: "UPLOAD_CONTENT",
      });

      const roleLevelMap: Record<string, number> = {
        President: 10,
        "Vice President": 8,
        Director: 5,
        "Deputy Director": 3,
        Member: 1,
      };

      const roleGateCheck = await query(
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

      const myRole = roleGateCheck.rows[0]?.role_name as string | undefined;
      const requiredRole =
        (roleGateCheck.rows[0]?.content_upload_role as string | undefined) ||
        "Deputy Director";
      const meetsRoleThreshold =
        (roleLevelMap[myRole || ""] || 0) >= (roleLevelMap[requiredRole] || 3);

      const hasAnyPrivilege =
        effectiveUploadMedia.allowed || effectiveUploadContent.allowed;
      const hasOverrideGrant =
        (effectiveUploadMedia.source === "override" &&
          effectiveUploadMedia.allowed) ||
        (effectiveUploadContent.source === "override" &&
          effectiveUploadContent.allowed);

      const canUpload =
        hasOverrideGrant || (hasAnyPrivilege && meetsRoleThreshold);

      if (!canUpload) {
        return NextResponse.json(
          {
            error: "You do not have permission to upload media to this society",
          },
          { status: 403 },
        );
      }
    }

    // 5. Rate limit
    const rateLimitError = checkRateLimit(user.userId, 0);
    if (rateLimitError) {
      return NextResponse.json({ error: rateLimitError }, { status: 429 });
    }

    // 6. Form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const caption = formData.get("caption") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 7. Validate image
    const validation = validateImageFile(file.name, file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 8. Buffer and magic bytes
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: "File content does not match its declared type" },
        { status: 400 },
      );
    }

    // 9. Gallery count limit
    if (mediaType === "gallery" && albumId) {
      const countError = await checkEntityMediaCount(
        "society_album_photos",
        "album_id",
        albumId,
        LIMITS.SOCIETY_GALLERY_MAX,
      );
      if (countError) {
        return NextResponse.json({ error: countError }, { status: 400 });
      }
    } else if (mediaType === "gallery") {
      const countError = await checkEntityMediaCount(
        "society_media",
        "society_id",
        societyId,
        LIMITS.SOCIETY_GALLERY_MAX,
        "GALLERY",
      );
      if (countError) {
        return NextResponse.json({ error: countError }, { status: 400 });
      }
    }

    // 10. Process image — before transaction
    const processed = await processImage(buffer, file.type);

    // 11. Transactional: quota check → upload → DB save → increment
    const client = await getClient();
    let blobUploaded: {
      url: string;
      blobName: string;
      sizeBytes: number;
    } | null = null;
    const oldBlobsToDelete: string[] = [];

    try {
      await client.query("BEGIN");

      // Lock society_settings row and check quota
      const quotaResult = await checkSocietyQuotaTx(
        client,
        societyId,
        processed.buffer.length,
      );
      if (!quotaResult.allowed) {
        await logQuotaExceeded(
          client,
          user.userId,
          societyId,
          processed.buffer.length,
          quotaResult.quota ?? 0,
          quotaResult.used ?? 0,
        );
        await client.query("COMMIT");
        return NextResponse.json({ error: quotaResult.error }, { status: 403 });
      }

      // Upload to blob
      const blobPath = generateBlobPath(
        "society",
        societyId,
        mediaType,
        file.name,
      );
      const result = await uploadBlob(
        CONTAINERS.SOCIETY_MEDIA,
        blobPath,
        processed.buffer,
        processed.mimeType,
        { uploadedBy: user.userId, societyId, mediaType },
      );
      blobUploaded = result;

      // DB operations
      const dbMediaType = mediaType.toUpperCase() as
        | "LOGO"
        | "COVER"
        | "GALLERY";

      if (mediaType === "logo" || mediaType === "cover") {
        // Soft-delete old media (trigger handles storage decrement)
        const oldMedia = await client.query(
          `SELECT id, file_url FROM society_media
           WHERE society_id = $1 AND media_type = $2 AND is_deleted = FALSE`,
          [societyId, dbMediaType],
        );

        for (const old of oldMedia.rows) {
          const oldBlob = extractBlobName(
            old.file_url,
            CONTAINERS.SOCIETY_MEDIA,
          );
          if (oldBlob) oldBlobsToDelete.push(oldBlob);
        }

        await client.query(
          `UPDATE society_media SET is_deleted = TRUE, updated_at = NOW()
           WHERE society_id = $1 AND media_type = $2 AND is_deleted = FALSE`,
          [societyId, dbMediaType],
        );

        if (mediaType === "logo") {
          await client.query(
            "UPDATE societies SET logo_url = $1, updated_at = NOW() WHERE id = $2",
            [result.url, societyId],
          );
        }
      }

      // Insert media in the right table.
      if (albumId && mediaType === "gallery") {
        const nextOrderResult = await client.query(
          `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
           FROM society_album_photos
           WHERE album_id = $1 AND society_id = $2 AND is_deleted = FALSE`,
          [albumId, societyId],
        );
        const nextOrder = Number(nextOrderResult.rows[0]?.next_order || 0);

        const photoResult = await client.query(
          `INSERT INTO society_album_photos
             (album_id, society_id, file_url, file_name, file_size_bytes, mime_type, caption, uploaded_by, display_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            albumId,
            societyId,
            result.url,
            file.name,
            result.sizeBytes,
            processed.mimeType,
            caption || null,
            user.userId,
            nextOrder,
          ],
        );

        await client.query(
          `UPDATE society_albums
           SET photo_count = photo_count + 1,
               cover_photo_id = COALESCE(cover_photo_id, $1),
               updated_at = NOW()
           WHERE id = $2 AND society_id = $3`,
          [photoResult.rows[0].id, albumId, societyId],
        );
      } else {
        await client.query(
          `INSERT INTO society_media
             (society_id, media_type, file_url, file_name, file_size_bytes, mime_type, caption, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            societyId,
            dbMediaType,
            result.url,
            file.name,
            result.sizeBytes,
            processed.mimeType,
            caption || null,
            user.userId,
          ],
        );
      }

      // Atomic storage increment
      await updateSocietyStorageUsedTx(client, societyId, result.sizeBytes);

      await client.query("COMMIT");

      // Delete old blobs AFTER commit to avoid data loss on rollback
      for (const oldBlob of oldBlobsToDelete) {
        try {
          await deleteBlob(CONTAINERS.SOCIETY_MEDIA, oldBlob);
        } catch {
          /* best-effort */
        }
      }

      recordUpload(user.userId, result.sizeBytes);

      return NextResponse.json({
        success: true,
        data: {
          url: result.url,
          mediaType,
          sizeBytes: result.sizeBytes,
          width: processed.width,
          height: processed.height,
        },
      });
    } catch (txError) {
      await client.query("ROLLBACK");
      if (blobUploaded) {
        try {
          await deleteBlob(CONTAINERS.SOCIETY_MEDIA, blobUploaded.blobName);
        } catch {
          /* best-effort */
        }
      }
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Society media upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload society media" },
      { status: 500 },
    );
  }
}
