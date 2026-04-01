/* ============================================================================
 * Platform API — Centralized fetch wrapper
 * ============================================================================
 * All platform dashboard API calls go through this module.
 * - Uses native fetch() with credentials: 'include' for HttpOnly cookies
 * - Typed responses
 * - Consistent error handling
 * ========================================================================== */

import type {
  PlatformStats,
  AdminUser,
  UserDetail,
  Administrator,
  AdminSociety,
  AdminEvent,
  FinanceData,
  AuditLogResponse,
  AnalyticsData,
  StorageResponse,
  SecurityMetrics,
  FeatureFlag,
  SystemConfigItem,
  Incident,
  SearchResults,
  HealthStatus,
  UniversityEvent,
  CoHostRequest,
  PlatformNotification,
  PushReminderStats,
  BlackoutDate,
  EmergencyStatus,
  SocietyTransferMember,
} from "./types";

// ─── Base Fetch ─────────────────────────────────────────────────────────────

interface ApiError {
  error: string;
  [key: string]: unknown;
}

export class PlatformApiError extends Error {
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
    throw new PlatformApiError(res.status, body);
  }

  return res.json();
}

// ─── Overview (Command Center) ──────────────────────────────────────────────

export function fetchStats(): Promise<PlatformStats> {
  return api<PlatformStats>("/api/admin/stats");
}

// ─── Administrators ─────────────────────────────────────────────────────────

export function fetchAdministrators(): Promise<{
  administrators: Administrator[];
  totalCount: number;
}> {
  return api("/api/admin/administrators");
}

export function addAdministrator(
  userId: string,
): Promise<{ success: boolean; message: string }> {
  return api("/api/admin/administrators", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

// ─── Users ──────────────────────────────────────────────────────────────────

export function fetchUsers(): Promise<AdminUser[]> {
  return api<AdminUser[]>("/api/admin/users");
}

export function fetchUserDetail(id: string): Promise<UserDetail> {
  return api<UserDetail>(`/api/admin/users/${id}`);
}

export function suspendUser(
  id: string,
  reason: string,
): Promise<{ success: boolean }> {
  return api(`/api/admin/users/${id}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function reactivateUser(id: string): Promise<{ success: boolean }> {
  return api(`/api/admin/users/${id}/reactivate`, { method: "POST" });
}

// ─── Societies ──────────────────────────────────────────────────────────────

export function fetchSocieties(status?: string): Promise<AdminSociety[]> {
  const qs = status ? `?status=${status}` : "";
  return api<AdminSociety[]>(`/api/admin/societies${qs}`);
}

export function patchSociety(
  id: string,
  action: string,
  reason?: string,
): Promise<{ success: boolean; status: string }> {
  return api(`/api/admin/societies/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ action, reason }),
  });
}

export function suspendSociety(
  id: string,
  reason: string,
): Promise<{ success: boolean; message: string }> {
  return api(`/api/admin/societies/${id}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function reactivateSociety(
  id: string,
  reason?: string,
): Promise<{ success: boolean; message: string }> {
  return api(`/api/admin/societies/${id}/reactivate`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function forceTransferPresidency(
  id: string,
  targetUserId: string,
  reason: string,
): Promise<{ success: boolean; message: string }> {
  return api(`/api/admin/societies/${id}/force-transfer`, {
    method: "POST",
    body: JSON.stringify({ targetUserId, reason }),
  });
}

export function searchSocietyMembersForTransfer(
  id: string,
  q: string,
): Promise<SocietyTransferMember[]> {
  const sp = new URLSearchParams();
  if (q.trim()) sp.set("q", q.trim());
  return api<SocietyTransferMember[]>(
    `/api/admin/societies/${id}/members?${sp.toString()}`,
  );
}

export function updateStorageLimit(
  id: string,
  storageLimitBytes: number,
): Promise<{ success: boolean; newLimit: number; currentUsed: number }> {
  return api(`/api/admin/societies/${id}/storage-limit`, {
    method: "PATCH",
    body: JSON.stringify({ storage_limit_bytes: storageLimitBytes }),
  });
}

// ─── Events ─────────────────────────────────────────────────────────────────

export function fetchEvents(status: string = "ALL"): Promise<AdminEvent[]> {
  return api<AdminEvent[]>(`/api/admin/events?status=${status}`);
}

export function patchEvent(
  id: string,
  action: string,
  reason?: string,
): Promise<{ success: boolean; status?: string; is_pinned?: boolean }> {
  return api(`/api/admin/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ action, reason }),
  });
}

export function createEvent(data: {
  title: string;
  description?: string;
  event_start: string;
  event_end: string;
  location?: string;
  ticket_price?: number;
  max_tickets?: number;
  society_id: string;
  cohost_society_ids?: string[];
  include_nust_administration?: boolean;
}): Promise<{ success: boolean; id: string }> {
  return api("/api/admin/events", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteEvent(id: string): Promise<{ success: boolean }> {
  return api(`/api/admin/events/${id}`, {
    method: "DELETE",
  });
}

export function uploadEventBanner(
  eventId: string,
  file: File,
): Promise<{ success: boolean; data: { url: string } }> {
  const formData = new FormData();
  formData.append("file", file);

  return fetch(`/api/upload/event-media?eventId=${eventId}&type=banner`, {
    method: "POST",
    credentials: "include",
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      let body: ApiError;
      try {
        body = await res.json();
      } catch {
        body = { error: `HTTP ${res.status}` };
      }
      throw new PlatformApiError(res.status, body);
    }
    return res.json();
  });
}

export function updateEvent(
  id: string,
  data: {
    title?: string;
    description?: string;
    event_start?: string;
    event_end?: string;
    location?: string;
    ticket_price?: number;
    max_tickets?: number;
    banner_url?: string;
  },
): Promise<{ success: boolean }> {
  return api(`/api/admin/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Financial Intelligence ─────────────────────────────────────────────────

export function fetchFinance(): Promise<FinanceData> {
  return api<FinanceData>("/api/admin/finance");
}

// ─── Audit Logs ─────────────────────────────────────────────────────────────

export function fetchAuditLogs(params: {
  page?: number;
  limit?: number;
  action?: string;
  userId?: string;
  societyId?: string;
  from?: string;
  to?: string;
}): Promise<AuditLogResponse> {
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.action) sp.set("action", params.action);
  if (params.userId) sp.set("userId", params.userId);
  if (params.societyId) sp.set("societyId", params.societyId);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  return api<AuditLogResponse>(`/api/admin/audit-logs?${sp.toString()}`);
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export function fetchAnalytics(): Promise<AnalyticsData> {
  return api<AnalyticsData>("/api/admin/analytics");
}

// ─── Storage ────────────────────────────────────────────────────────────────

export function fetchStorageOverview(sort?: string): Promise<StorageResponse> {
  const qs = sort ? `?sort=${sort}` : "";
  return api<StorageResponse>(`/api/admin/storage${qs}`);
}

// ─── Security Monitoring ────────────────────────────────────────────────────

export function fetchSecurityMetrics(): Promise<SecurityMetrics> {
  return api<SecurityMetrics>("/api/admin/security");
}

// ─── Feature Flags ──────────────────────────────────────────────────────────

export function fetchFeatureFlags(): Promise<FeatureFlag[]> {
  return api<FeatureFlag[]>("/api/admin/feature-flags");
}

export function updateFeatureFlag(
  key: string,
  enabled: boolean,
): Promise<{ success: boolean }> {
  return api("/api/admin/feature-flags", {
    method: "PATCH",
    body: JSON.stringify({ key, enabled }),
  });
}

// ─── System Configuration ───────────────────────────────────────────────────

export function fetchSystemConfig(): Promise<SystemConfigItem[]> {
  return api<SystemConfigItem[]>("/api/admin/system-config");
}

export function updateSystemConfig(
  key: string,
  value: string | number,
): Promise<{ success: boolean }> {
  return api("/api/admin/system-config", {
    method: "PATCH",
    body: JSON.stringify({ key, value }),
  });
}

// ─── Incident Management ────────────────────────────────────────────────────

export function fetchIncidents(): Promise<Incident[]> {
  return api<Incident[]>("/api/admin/incidents");
}

export function createIncident(data: {
  title: string;
  description?: string;
  severity: string;
}): Promise<{ success: boolean; id: string }> {
  return api("/api/admin/incidents", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateIncident(
  id: number | string,
  data: {
    status?: string;
    severity?: string;
    note?: string;
  },
): Promise<{ success: boolean }> {
  return api(`/api/admin/incidents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Global Search ──────────────────────────────────────────────────────────

export function globalSearch(query: string): Promise<SearchResults> {
  return api<SearchResults>(`/api/admin/search?q=${encodeURIComponent(query)}`);
}

// ─── Health Monitor ─────────────────────────────────────────────────────────

export function fetchHealthStatus(): Promise<HealthStatus> {
  return api<HealthStatus>("/api/admin/health");
}

// ─── University Events (NUST Official) ──────────────────────────────────────

export function fetchUniversityEvents(): Promise<UniversityEvent[]> {
  return api<UniversityEvent[]>("/api/admin/university-events");
}

export function createUniversityEvent(data: {
  title: string;
  description?: string;
  event_start: string;
  event_end: string;
  location?: string;
  banner_url?: string;
  ticket_price?: number;
  max_tickets?: number;
  society_id?: string;
  is_pinned?: boolean;
  priority_rank?: number;
  cohost_society_ids?: string[];
  include_nust_administration?: boolean;
}): Promise<{ success: boolean; id: string }> {
  return api("/api/admin/university-events", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function uploadUniversityEventBanner(
  eventId: string,
  file: File,
): Promise<{ success: boolean; data: { url: string } }> {
  const formData = new FormData();
  formData.append("file", file);

  return fetch(`/api/upload/event-media?eventId=${eventId}&type=banner`, {
    method: "POST",
    credentials: "include",
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      let body: ApiError;
      try {
        body = await res.json();
      } catch {
        body = { error: `HTTP ${res.status}` };
      }
      throw new PlatformApiError(res.status, body);
    }
    return res.json();
  });
}

export function patchUniversityEvent(
  id: string,
  data: {
    is_pinned?: boolean;
    is_locked?: boolean;
    priority_rank?: number;
    status?: string;
    title?: string;
    description?: string;
    event_start?: string;
    event_end?: string;
    location?: string;
    banner_url?: string;
    ticket_price?: number;
    max_tickets?: number;
  },
): Promise<{ success: boolean }> {
  return api(`/api/admin/university-events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteUniversityEvent(
  id: string,
): Promise<{ success: boolean }> {
  return api(`/api/admin/university-events/${id}`, {
    method: "DELETE",
  });
}
// ─── Co-Host Request Workflow ───────────────────────────────────────────────

export function fetchCoHostRequests(status?: string): Promise<CoHostRequest[]> {
  const qs = status ? `?status=${status}` : "";
  return api<CoHostRequest[]>(`/api/admin/cohost-requests${qs}`);
}

export function updateCoHostRequest(
  id: string,
  data: { action: "APPROVED" | "REJECTED"; admin_note?: string },
): Promise<{ success: boolean }> {
  return api(`/api/admin/cohost-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Notification Engine (In-App) ───────────────────────────────────────────

export function fetchNotifications(): Promise<PlatformNotification[]> {
  return api<PlatformNotification[]>("/api/admin/notifications");
}

export function createNotification(data: {
  title: string;
  body: string;
  priority?: string;
  target_type?: string;
  target_id?: string;
  scheduled_at?: string;
  expires_at?: string;
}): Promise<{ success: boolean; id: string }> {
  return api("/api/admin/notifications", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateNotification(
  id: string,
  data: {
    title: string;
    body: string;
    priority?: string;
    target_type?: string;
    target_id?: string;
    scheduled_at?: string;
    expires_at?: string;
  },
): Promise<{ success: boolean }> {
  return api(`/api/admin/notifications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteNotification(id: string): Promise<{ success: boolean }> {
  return api(`/api/admin/notifications/${id}`, { method: "DELETE" });
}

export function fetchPushReminderStats(days: number = 7): Promise<PushReminderStats> {
  const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(Math.floor(days), 90)) : 7;
  return api<PushReminderStats>(`/api/admin/push-reminders?days=${safeDays}`);
}

export function runPushReminderDispatch(): Promise<{
  success: boolean;
  action: "dispatch";
  result: unknown;
}> {
  return api("/api/admin/push-reminders", {
    method: "POST",
    body: JSON.stringify({ action: "dispatch" }),
  });
}

export function runPushReminderDryRun(): Promise<{
  success: boolean;
  action: "dry-run";
  result: unknown;
}> {
  return api("/api/admin/push-reminders", {
    method: "POST",
    body: JSON.stringify({ action: "dry-run" }),
  });
}

export function retryPushReminderDispatch(input?: {
  statuses?: string[];
  lookbackHours?: number;
  limit?: number;
  eventId?: string;
  userId?: string;
  notificationType?: string;
}): Promise<{ success: boolean; action: "retry"; result: unknown }> {
  return api("/api/admin/push-reminders", {
    method: "POST",
    body: JSON.stringify({ action: "retry", ...(input || {}) }),
  });
}

// ─── Blackout Calendar ──────────────────────────────────────────────────────

export function fetchBlackoutDates(): Promise<BlackoutDate[]> {
  return api<BlackoutDate[]>("/api/admin/blackout-dates");
}

export function createBlackoutDate(data: {
  title: string;
  start_date: string;
  end_date: string;
  reason?: string;
  scope?: string;
}): Promise<{ success: boolean; id: string }> {
  return api("/api/admin/blackout-dates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteBlackoutDate(id: string): Promise<{ success: boolean }> {
  return api(`/api/admin/blackout-dates/${id}`, { method: "DELETE" });
}

// ─── Emergency Controls ─────────────────────────────────────────────────────

export function fetchEmergencyStatus(): Promise<EmergencyStatus> {
  return api<EmergencyStatus>("/api/admin/emergency");
}

export function toggleEmergencyFlag(
  key: string,
  enabled: boolean,
): Promise<{ success: boolean }> {
  return api("/api/admin/emergency", {
    method: "POST",
    body: JSON.stringify({ key, enabled }),
  });
}

// ─── Audit Logs CSV Export ──────────────────────────────────────────────────

export function exportAuditLogsCsv(params: {
  action?: string;
  userId?: string;
  societyId?: string;
  from?: string;
  to?: string;
}): Promise<string> {
  const sp = new URLSearchParams();
  sp.set("format", "csv");
  if (params.action) sp.set("action", params.action);
  if (params.userId) sp.set("userId", params.userId);
  if (params.societyId) sp.set("societyId", params.societyId);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  return fetch(`/api/admin/audit-logs?${sp.toString()}`, {
    credentials: "include",
  }).then((r) => r.text());
}
