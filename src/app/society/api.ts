/* ============================================================================
 * Society Governance Dashboard — Centralized API Wrapper
 * ============================================================================
 * All society dashboard API calls go through this module.
 * - Uses native fetch() with credentials: 'include' for HttpOnly cookies
 * - Typed responses
 * - Consistent error handling (401, 403, 409, etc.)
 * ========================================================================== */

import type {
  GovernanceOverview,
  SocietyEvent,
  PendingTicket,
  EntryStats,
  AttendanceRecord,
  SocietyMember,
  Wing,
  RolePrivileges,
  SocietyFinance,
  SocietyStorageInfo,
  EventParticipant,
  SocietyNotification,
  SocietyAnalytics,
  SocietyAuditLogResponse,
  SocietySettings,
  SocietyProfile,
  ChatChannel,
  ChatMessage,
  MyRole,
  SocietyPost,
  SocietyAlbum,
  AlbumPhoto,
  CreatePostData,
  CreateAlbumData,
  EventEditData,
  UploadResponse,
} from "./types";

// ─── Base Fetch ─────────────────────────────────────────────────────────────

interface ApiError {
  error: string;
  detail?: string | null;
  code?: string;
  [key: string]: unknown;
}

export class SocietyApiError extends Error {
  status: number;
  body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.error || `API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    let body: ApiError;
    try {
      body = await res.json();
    } catch {
      body = { error: `HTTP ${res.status}` };
    }

    if (body.detail && typeof body.detail === "string") {
      body.error = `${body.error}: ${body.detail}`;
    }
    if (body.code && typeof body.code === "string") {
      body.error = `${body.error} (${body.code})`;
    }

    throw new SocietyApiError(res.status, body);
  }

  return res.json();
}

/** Base path builder */
function s(societyId: string) {
  return `/api/societies/${societyId}`;
}

// ─── Governance Overview ────────────────────────────────────────────────────

export function fetchGovernanceOverview(
  societyId: string,
): Promise<GovernanceOverview> {
  return api<GovernanceOverview>(`${s(societyId)}/governance/overview`);
}

// ─── My Role ────────────────────────────────────────────────────────────────

export function fetchMyRole(
  societyId: string,
): Promise<{ role: MyRole | null }> {
  return api<{ role: MyRole | null }>(`${s(societyId)}/governance/my-role`);
}

export function fetchMyPermissions(societyId: string): Promise<{
  can_create_event: boolean;
  can_manage_content: boolean;
  can_upload_media: boolean;
  role_name?: string;
  required_event_role?: string;
  required_content_role?: string;
}> {
  return api(`${s(societyId)}/governance/my-permissions`);
}

// ─── Events ─────────────────────────────────────────────────────────────────

export function fetchSocietyEvents(
  societyId: string,
  status?: string,
): Promise<SocietyEvent[]> {
  const qs = status && status !== "ALL" ? `?status=${status}` : "";
  return api<SocietyEvent[]>(`${s(societyId)}/governance/events${qs}`);
}

export function createSocietyEvent(
  societyId: string,
  data: {
    title: string;
    description?: string;
    event_start: string;
    event_end?: string;
    location?: string;
    venue_details?: string;
    venue?: string;
    visibility?: string;
    is_paid?: boolean;
    ticket_price?: number;
    max_participants?: number;
    registration_end?: string;
    registration_deadline?: string;
    banner_url?: string;
    thumbnail_url?: string;
  },
): Promise<{ success: boolean; event: { id: string; status: string } }> {
  const payload = {
    ...data,
    location: data.location ?? data.venue,
    registration_end: data.registration_end ?? data.registration_deadline,
    is_paid: Number(data.ticket_price ?? 0) > 0,
  };

  return api(`${s(societyId)}/events`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Ticket Approvals ───────────────────────────────────────────────────────

export function fetchPendingTickets(
  societyId: string,
  status?: string,
): Promise<{
  tickets: PendingTicket[];
  stats: { pending: number; approved: number; rejected: number };
}> {
  const qs = status ? `?status=${status}` : "";
  return api(`${s(societyId)}/governance/ticket-approvals${qs}`);
}

export function reviewTicket(
  societyId: string,
  ticketId: string,
  data: { action: "APPROVE" | "REJECT" | "NEEDS_REUPLOAD"; reason?: string },
): Promise<{ success: boolean; message: string }> {
  return api(`${s(societyId)}/governance/ticket-approvals/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function bulkReviewTickets(
  societyId: string,
  data: { ticketIds: string[]; action: "APPROVE" | "REJECT"; reason?: string },
): Promise<{ success: boolean; processed: number; failed: number }> {
  return api(`${s(societyId)}/governance/ticket-approvals/bulk`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Entry Control ──────────────────────────────────────────────────────────

export function fetchEntryStats(
  societyId: string,
  eventId: string,
): Promise<EntryStats> {
  return api<EntryStats>(
    `${s(societyId)}/governance/entry-control?eventId=${eventId}`,
  );
}

export function manualCheckIn(
  societyId: string,
  data: { eventId: string; userEmail: string },
): Promise<{ success: boolean; record: AttendanceRecord }> {
  return api(`${s(societyId)}/governance/entry-control`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Members ────────────────────────────────────────────────────────────────

export function fetchMembers(societyId: string): Promise<SocietyMember[]> {
  return api<SocietyMember[]>(`${s(societyId)}/members`);
}

export function removeMember(
  societyId: string,
  membershipId: string,
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/members/${membershipId}`, { method: "DELETE" });
}

export function updateMemberRole(
  societyId: string,
  membershipId: string,
  data: {
    roleId: string;
    wingId?: string;
    portfolioId?: string;
    reason?: string;
  },
): Promise<{
  success: boolean;
  message?: string;
  previousRole?: string;
  newRole?: string;
}> {
  return api(`${s(societyId)}/members/${membershipId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export interface Role {
  id: string;
  name: string;
  description: string | null;
  hierarchy_level: number;
  is_system_role: boolean;
  created_at: string;
}

export function fetchRoles(societyId: string): Promise<Role[]> {
  return api<Role[]>(`${s(societyId)}/roles`);
}

// ─── Portfolios ──────────────────────────────────────────────────────────────

export interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  wing_id: string;
  created_at: string;
  member_count?: string;
  director_name?: string | null;
}

export function fetchPortfolios(
  societyId: string,
  wingId: string,
): Promise<Portfolio[]> {
  return api<Portfolio[]>(`${s(societyId)}/wings/${wingId}/portfolios`);
}

// ─── Wings & Portfolios ────────────────────────────────────────────────────

export function fetchWings(societyId: string): Promise<Wing[]> {
  return api<any[]>(`${s(societyId)}/wings`).then(async (wings) => {
    const wingList = Array.isArray(wings) ? wings : [];

    const wingsWithPortfolios = await Promise.all(
      wingList.map(async (wing) => {
        try {
          const portfolios = await api<Portfolio[]>(
            `${s(societyId)}/wings/${wing.id}/portfolios`,
          );
          return {
            ...wing,
            portfolios: Array.isArray(portfolios) ? portfolios : [],
          };
        } catch {
          return { ...wing, portfolios: [] };
        }
      }),
    );

    return wingsWithPortfolios as Wing[];
  });
}

export function createWing(
  societyId: string,
  data: { name: string; description?: string },
): Promise<{ success: boolean; wing: { id: string } }> {
  return api(`${s(societyId)}/wings`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteWing(
  societyId: string,
  wingId: string,
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/wings/${wingId}`, { method: "DELETE" });
}

export function createPortfolio(
  societyId: string,
  wingId: string,
  data: { name: string; description?: string },
): Promise<{ success: boolean; portfolio: { id: string } }> {
  return api(`${s(societyId)}/wings/${wingId}/portfolios`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function fetchRolePrivileges(
  societyId: string,
  membershipId: string,
): Promise<RolePrivileges> {
  return api<RolePrivileges>(
    `${s(societyId)}/governance/privileges/${membershipId}`,
  );
}

export function updatePrivilege(
  societyId: string,
  data: { membershipId: string; privilegeKey: string; granted: boolean },
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/governance/privileges`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Finance ────────────────────────────────────────────────────────────────

export function fetchFinance(societyId: string): Promise<SocietyFinance> {
  return api<SocietyFinance>(`${s(societyId)}/governance/finance`);
}

export function exportFinanceCsv(societyId: string): Promise<string> {
  return fetch(`${s(societyId)}/governance/finance?format=csv`, {
    credentials: "include",
  }).then((r) => r.text());
}

// ─── Storage ────────────────────────────────────────────────────────────────

export function fetchStorage(societyId: string): Promise<SocietyStorageInfo> {
  return api<SocietyStorageInfo>(`${s(societyId)}/governance/storage`);
}

export function deleteMedia(
  mediaId: string,
  hard?: boolean,
): Promise<{ success: boolean }> {
  const qs = hard ? "?hard=true" : "";
  return api(`/api/media/${mediaId}${qs}`, { method: "DELETE" });
}

// ─── Participants ───────────────────────────────────────────────────────────

export function fetchParticipants(
  societyId: string,
  eventId?: string,
): Promise<{ participants: EventParticipant[]; total: number }> {
  const qs = eventId ? `?eventId=${eventId}` : "";
  return api(`${s(societyId)}/governance/participants${qs}`);
}

// ─── Notifications ──────────────────────────────────────────────────────────

export function fetchSocietyNotifications(
  societyId: string,
): Promise<SocietyNotification[]> {
  return api<SocietyNotification[]>(`${s(societyId)}/governance/notifications`);
}

export function markNotificationRead(
  societyId: string,
  notificationId: string,
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/governance/notifications/${notificationId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_read: true }),
  });
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export function fetchAnalytics(societyId: string): Promise<SocietyAnalytics> {
  return api<SocietyAnalytics>(`${s(societyId)}/governance/analytics`);
}

// ─── Audit Logs ─────────────────────────────────────────────────────────────

export function fetchAuditLogs(
  societyId: string,
  params: {
    page?: number;
    limit?: number;
    action?: string;
    from?: string;
    to?: string;
  },
): Promise<SocietyAuditLogResponse> {
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.action) sp.set("action", params.action);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  return api<SocietyAuditLogResponse>(
    `${s(societyId)}/governance/audit-logs?${sp.toString()}`,
  );
}

// ─── Settings ───────────────────────────────────────────────────────────────

export function fetchSettings(societyId: string): Promise<SocietySettings> {
  return api<SocietySettings>(`${s(societyId)}/settings`);
}

export function updateSettings(
  societyId: string,
  data: Partial<SocietySettings>,
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/settings`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Transfer Presidency ────────────────────────────────────────────────────

export function transferPresidency(
  societyId: string,
  data: { targetUserId: string },
): Promise<{ success: boolean; message: string }> {
  return api(`${s(societyId)}/transfer-presidency`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Society Profile ────────────────────────────────────────────────────────

export function fetchSocietyProfile(
  societyId: string,
): Promise<SocietyProfile | null> {
  return api<SocietyProfile | null>(`${s(societyId)}/profile`);
}

export function updateSocietyProfile(
  societyId: string,
  data: Partial<SocietyProfile>,
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/profile`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export function fetchChatChannels(societyId: string): Promise<ChatChannel[]> {
  return api<ChatChannel[]>(`${s(societyId)}/chat`);
}

export function createChatChannel(
  societyId: string,
  data: {
    name: string;
    description?: string;
    wing_id?: string;
    portfolio_id?: string;
    mode?: string;
  },
): Promise<{ success: boolean; channel: ChatChannel }> {
  return api(`${s(societyId)}/chat`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function fetchChatMessages(
  societyId: string,
  chatId: string,
  before?: string,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const qs = before ? `?before=${before}` : "";
  return api(`${s(societyId)}/chat/${chatId}/messages${qs}`);
}

export function sendChatMessage(
  societyId: string,
  chatId: string,
  data: { content: string; reply_to_id?: string },
): Promise<{ success: boolean; message: ChatMessage }> {
  return api(`${s(societyId)}/chat/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Society Posts (Feed) ───────────────────────────────────────────────────

export function fetchPosts(
  societyId: string,
  page?: number,
): Promise<{
  posts: SocietyPost[];
  pagination: { page: number; limit: number; total: number; hasMore: boolean };
}> {
  const qs = page ? `?page=${page}` : "";
  return api(`${s(societyId)}/posts${qs}`);
}

export function createPost(
  societyId: string,
  data: CreatePostData,
): Promise<{ success: boolean; post: SocietyPost }> {
  return api(`${s(societyId)}/posts`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updatePost(
  societyId: string,
  postId: string,
  data: Partial<CreatePostData>,
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/posts/${postId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deletePost(
  societyId: string,
  postId: string,
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/posts/${postId}`, { method: "DELETE" });
}

// ─── Photo Albums ───────────────────────────────────────────────────────────

export async function fetchAlbums(societyId: string): Promise<SocietyAlbum[]> {
  const res = await api<{ albums: SocietyAlbum[] }>(`${s(societyId)}/albums`);
  return Array.isArray(res.albums) ? res.albums : [];
}

export function createAlbum(
  societyId: string,
  data: CreateAlbumData,
): Promise<{ success: boolean; album: SocietyAlbum }> {
  return api(`${s(societyId)}/albums`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateAlbum(
  societyId: string,
  albumId: string,
  data: Partial<CreateAlbumData>,
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/albums/${albumId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteAlbum(
  societyId: string,
  albumId: string,
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/albums/${albumId}`, { method: "DELETE" });
}

export async function fetchAlbumPhotos(
  societyId: string,
  albumId: string,
): Promise<AlbumPhoto[]> {
  const res = await api<{ album: SocietyAlbum; photos: AlbumPhoto[] }>(
    `${s(societyId)}/albums/${albumId}`,
  );
  return Array.isArray(res.photos) ? res.photos : [];
}

export function deleteAlbumPhoto(
  societyId: string,
  albumId: string,
  photoId: string,
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/albums/${albumId}/photos/${photoId}`, {
    method: "DELETE",
  });
}

export function setFeaturedPhoto(
  societyId: string,
  albumId: string,
  photoId: string,
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/albums/${albumId}/photos/${photoId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_featured: true }),
  });
}

// ─── Event Management (Edit / Delete / Cancel) ─────────────────────────────

export function editEvent(
  eventId: string,
  data: EventEditData,
): Promise<{ success: boolean; event: SocietyEvent }> {
  return api(`/api/events/${eventId}/edit`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function cancelEvent(
  eventId: string,
  reason?: string,
): Promise<{ success: boolean; message: string }> {
  return api(`/api/events/${eventId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function deleteEvent(
  societyId: string,
  eventId: string,
): Promise<{ success: boolean }> {
  return api(`${s(societyId)}/events/${eventId}`, { method: "DELETE" });
}

export function fetchEventDetail(
  eventId: string,
): Promise<{ event: SocietyEvent }> {
  return api<{ event: SocietyEvent }>(`/api/events/${eventId}`);
}

// ─── Media Upload (multipart) ───────────────────────────────────────────────

async function uploadFile(
  path: string,
  file: File,
  caption?: string,
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (caption) formData.append("caption", caption);

  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    let body;
    try {
      body = await res.json();
    } catch {
      body = { error: `HTTP ${res.status}` };
    }
    throw new SocietyApiError(res.status, body);
  }

  const payload = await res.json();
  const normalized: UploadResponse = {
    success: Boolean(payload?.success),
    url: payload?.url ?? payload?.data?.url ?? "",
    blobName: payload?.blobName ?? payload?.data?.blobName ?? "",
    sizeBytes: Number(payload?.sizeBytes ?? payload?.data?.sizeBytes ?? 0),
    mediaId: payload?.mediaId ?? payload?.data?.mediaId,
  };

  if (!normalized.url) {
    throw new SocietyApiError(res.status, {
      error: "Upload succeeded but no file URL was returned",
    });
  }

  return normalized;
}

export function uploadSocietyMedia(
  societyId: string,
  type: "logo" | "cover" | "gallery",
  file: File,
  caption?: string,
): Promise<UploadResponse> {
  return uploadFile(
    `/api/upload/society-media?societyId=${societyId}&type=${type}`,
    file,
    caption,
  );
}

export function uploadEventMedia(
  eventId: string,
  type: "thumbnail" | "banner" | "gallery" | "document",
  file: File,
  caption?: string,
): Promise<UploadResponse> {
  return uploadFile(
    `/api/upload/event-media?eventId=${eventId}&type=${type}`,
    file,
    caption,
  );
}

export function uploadPostImage(
  postId: string,
  file: File,
): Promise<UploadResponse> {
  return uploadFile(
    `/api/upload/post-attachment?postId=${postId}&type=image`,
    file,
  );
}

export function uploadAlbumPhoto(
  societyId: string,
  albumId: string,
  file: File,
  caption?: string,
): Promise<UploadResponse> {
  return uploadFile(
    `/api/upload/society-media?societyId=${societyId}&type=gallery&albumId=${albumId}`,
    file,
    caption,
  );
}
