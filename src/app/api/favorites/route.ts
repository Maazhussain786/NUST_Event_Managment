export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { CONTAINERS, extractBlobName, generateReadUrl } from "@/lib/blob";

// GET /api/favorites — list user's favorite societies
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await query(
      `SELECT s.id, s.name, s.description, s.logo_url, s.status,
              fs.created_at as favorited_at
       FROM favorite_societies fs
       JOIN societies s ON s.id = fs.society_id
       WHERE fs.user_id = $1
       ORDER BY fs.created_at DESC`,
      [user.userId],
    );

    const rows = result.rows.map((row) => {
      const logoBlob = row.logo_url
        ? extractBlobName(row.logo_url, CONTAINERS.SOCIETY_MEDIA)
        : null;

      return {
        ...row,
        logo_url: logoBlob
          ? generateReadUrl(CONTAINERS.SOCIETY_MEDIA, logoBlob, 24 * 60)
          : row.logo_url,
      };
    });

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Favorites GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch favorites" },
      { status: 500 },
    );
  }
}

// POST /api/favorites — toggle favorite (add or remove)
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { societyId } = await req.json();
    if (!societyId)
      return NextResponse.json(
        { error: "societyId required" },
        { status: 400 },
      );

    // Check if already favorited
    const existing = await query(
      "SELECT id FROM favorite_societies WHERE user_id = $1 AND society_id = $2",
      [user.userId, societyId],
    );

    if (existing.rows.length > 0) {
      // Remove favorite
      await query(
        "DELETE FROM favorite_societies WHERE user_id = $1 AND society_id = $2",
        [user.userId, societyId],
      );
      return NextResponse.json({ favorited: false });
    } else {
      // Add favorite
      await query(
        "INSERT INTO favorite_societies (user_id, society_id) VALUES ($1, $2)",
        [user.userId, societyId],
      );
      return NextResponse.json({ favorited: true });
    }
  } catch (error) {
    console.error("Favorites POST error:", error);
    return NextResponse.json(
      { error: "Failed to toggle favorite" },
      { status: 500 },
    );
  }
}
