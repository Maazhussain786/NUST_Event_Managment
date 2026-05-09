export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getMongoDb } from "@/lib/mongo";
import { CONTAINERS, resolveMediaUrl } from "@/lib/blob";
import { getJsonCache, setJsonCache } from "@/lib/redis-cache";

const SOCIETY_PUBLIC_CACHE_TTL_SECONDS = 300;

function signMediaUrl(
  url: string | null | undefined,
  containerHint?:
    | (typeof CONTAINERS)[keyof typeof CONTAINERS]
    | Array<(typeof CONTAINERS)[keyof typeof CONTAINERS]>,
): string | null | undefined {
  if (!url) return url;
  return (
    resolveMediaUrl(url, {
      container:
        containerHint || [
          CONTAINERS.EVENT_MEDIA,
          CONTAINERS.SOCIETY_MEDIA,
          CONTAINERS.PROFILE_PICTURES,
          CONTAINERS.POST_ATTACHMENTS,
          CONTAINERS.NOTE_ATTACHMENTS,
        ],
      expiresInMinutes: 24 * 60,
    }) || null
  );
}

type SocietyPublicData = {
  society: {
    id: string;
    logo_url?: string | null;
    status?: string | null;
    [key: string]: unknown;
  };
  profile: {
    cover_url?: string | null;
    is_public?: boolean | null;
    [key: string]: unknown;
  } | null;
  events: Array<{ banner_url?: string | null; [key: string]: unknown }>;
  team: Array<{ avatar_url?: string | null; [key: string]: unknown }>;
  gallery: Array<{ file_url?: string | null; [key: string]: unknown }>;
  wings: Array<Record<string, unknown>>;
};

type SocietyPublicDoc = SocietyPublicData & {
  _id: string;
  updatedAt: Date;
};

function hydrateSocietyPublic(data: SocietyPublicData) {
  return {
    society: {
      ...data.society,
      logo_url: signMediaUrl(data.society.logo_url, CONTAINERS.SOCIETY_MEDIA),
    },
    profile: data.profile
      ? {
          ...data.profile,
          cover_url: signMediaUrl(data.profile.cover_url, CONTAINERS.SOCIETY_MEDIA),
        }
      : null,
    events: data.events.map((row) => ({
      ...row,
      banner_url: signMediaUrl(row.banner_url, CONTAINERS.EVENT_MEDIA),
    })),
    team: data.team.map((row) => ({
      ...row,
      avatar_url: signMediaUrl(row.avatar_url, CONTAINERS.PROFILE_PICTURES),
    })),
    gallery: data.gallery.map((row) => ({
      ...row,
      file_url: signMediaUrl(row.file_url),
    })),
    wings: data.wings,
  };
}

function buildSocietyPublicDoc(id: string, data: SocietyPublicData): SocietyPublicDoc {
  return {
    _id: id,
    ...data,
    updatedAt: new Date(),
  };
}

async function fetchSocietyPublicFromPostgres(
  id: string,
): Promise<SocietyPublicData | null> {
  const societyResult = await query(
    `SELECT s.id, s.name, s.description, s.logo_url, s.status,
            s.is_nust_wide, s.created_at,
            ns.full_name AS school_name, ns.abbreviation AS school_abbr,
            COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE) AS member_count,
            COALESCE(AVG(r.score), 0)::numeric(3,2) AS avg_rating,
            COUNT(DISTINCT r.id) AS rating_count
     FROM societies s
     LEFT JOIN nust_schools ns ON s.school_id = ns.id
     LEFT JOIN society_memberships sm ON s.id = sm.society_id AND sm.is_active = TRUE
     LEFT JOIN ratings r ON r.target_type = 'SOCIETY' AND r.target_id = s.id
     WHERE s.id = $1 AND s.status = 'APPROVED'
     GROUP BY s.id, ns.full_name, ns.abbreviation`,
    [id],
  );

  if (societyResult.rows.length === 0) {
    return null;
  }

  const profileResult = await query(
    `SELECT tagline, cover_url, mission, established_year, faculty_advisor,
            contact_email, contact_phone, office_location, social_links,
            primary_color, accent_color, pin_announcement, featured_event_id, is_public
     FROM society_profiles WHERE society_id = $1`,
    [id],
  );

  const eventsResult = await query(
    `SELECT e.id, e.title, e.description, e.banner_url, e.location,
            e.event_start, e.event_end, e.ticket_price, e.visibility,
            COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
     FROM events e
     LEFT JOIN tickets t ON e.id = t.event_id
     WHERE e.society_id = $1 AND e.is_cancelled = FALSE
           AND e.visibility = 'PUBLIC'
     GROUP BY e.id
     ORDER BY e.event_start DESC
     LIMIT 12`,
    [id],
  );

  const teamResult = await query(
    `SELECT sm.id AS membership_id, u.id AS user_id, u.full_name, u.avatar_url,
            r.name AS role_name, r.hierarchy_level,
            w.name AS wing_name, p.name AS portfolio_name
     FROM society_memberships sm
     JOIN users u ON sm.user_id = u.id
     JOIN roles r ON sm.role_id = r.id
     LEFT JOIN wings w ON sm.wing_id = w.id
     LEFT JOIN portfolios p ON sm.portfolio_id = p.id
     WHERE sm.society_id = $1 AND sm.is_active = TRUE AND r.hierarchy_level >= 3
     ORDER BY r.hierarchy_level DESC, u.full_name ASC`,
    [id],
  );

  const galleryResult = await query(
    `SELECT c.id, c.title, c.description, c.file_url, c.file_type,
            c.created_at, u.full_name AS uploaded_by
     FROM content c
     JOIN users u ON c.uploaded_by = u.id
     WHERE c.society_id = $1 AND c.scope = 'SOCIETY'
     ORDER BY c.created_at DESC
     LIMIT 24`,
    [id],
  );

  const wingsResult = await query(
    `SELECT w.id, w.name, w.description,
            COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE) AS member_count
     FROM wings w
     LEFT JOIN society_memberships sm ON sm.wing_id = w.id AND sm.is_active = TRUE
     WHERE w.society_id = $1
     GROUP BY w.id
     ORDER BY w.name`,
    [id],
  );

  return {
    society: societyResult.rows[0],
    profile: profileResult.rows[0] || null,
    events: eventsResult.rows,
    team: teamResult.rows,
    gallery: galleryResult.rows,
    wings: wingsResult.rows,
  };
}

// GET /api/societies/[id]/public — public society profile (no auth)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    const redisKey = `cache:society:public:${id}`;
    const redisCached = await getJsonCache<SocietyPublicData>(redisKey);
    if (redisCached) {
      if (redisCached.society?.status && redisCached.society.status !== "APPROVED") {
        return NextResponse.json({ error: "Society not found" }, { status: 404 });
      }
      if (redisCached.profile && redisCached.profile.is_public === false) {
        return NextResponse.json(
          { error: "This society page is private" },
          { status: 403 },
        );
      }

      return NextResponse.json(hydrateSocietyPublic(redisCached));
    }

    const db = await getMongoDb();

    if (db) {
      try {
        const cached = await db
          .collection<SocietyPublicDoc>("society_public_read")
          .findOne({ _id: id });

        if (cached) {
          if (cached.society?.status && cached.society.status !== "APPROVED") {
            return NextResponse.json({ error: "Society not found" }, { status: 404 });
          }
          if (cached.profile && cached.profile.is_public === false) {
            return NextResponse.json(
              { error: "This society page is private" },
              { status: 403 },
            );
          }

          await setJsonCache(redisKey, cached, SOCIETY_PUBLIC_CACHE_TTL_SECONDS);
          return NextResponse.json(hydrateSocietyPublic(cached));
        }
      } catch (error) {
        console.error('Mongo read failed:', error);
      }
    }

    const data = await fetchSocietyPublicFromPostgres(id);
    if (!data) {
      return NextResponse.json({ error: "Society not found" }, { status: 404 });
    }

    if (data.profile && data.profile.is_public === false) {
      return NextResponse.json(
        { error: "This society page is private" },
        { status: 403 },
      );
    }

    if (db) {
      try {
        const doc = buildSocietyPublicDoc(id, data);
        await db
          .collection<SocietyPublicDoc>("society_public_read")
          .updateOne({ _id: id }, { $set: doc }, { upsert: true });
      } catch (error) {
        console.error('Mongo write failed:', error);
      }
    }

    await setJsonCache(redisKey, data, SOCIETY_PUBLIC_CACHE_TTL_SECONDS);

    return NextResponse.json(hydrateSocietyPublic(data));
  } catch (error: unknown) {
    console.error("Public society fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch society" },
      { status: 500 },
    );
  }
}
