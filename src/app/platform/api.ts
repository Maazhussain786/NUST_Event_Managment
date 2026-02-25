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
  AdminSociety,
  AdminEvent,
  AuditLogResponse,
  AnalyticsData,
  StorageResponse,
} from './types';

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
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
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

// ─── Stats ──────────────────────────────────────────────────────────────────

export function fetchStats(): Promise<PlatformStats> {
  return api<PlatformStats>('/api/admin/stats');
}

// ─── Users ──────────────────────────────────────────────────────────────────

export function fetchUsers(): Promise<AdminUser[]> {
  return api<AdminUser[]>('/api/admin/users');
}

// ─── Societies ──────────────────────────────────────────────────────────────

export function fetchSocieties(status?: string): Promise<AdminSociety[]> {
  const qs = status ? `?status=${status}` : '';
  return api<AdminSociety[]>(`/api/admin/societies${qs}`);
}

export function patchSociety(
  id: string,
  action: string,
  reason?: string
): Promise<{ success: boolean; status: string }> {
  return api(`/api/admin/societies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action, reason }),
  });
}

export function suspendSociety(
  id: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  return api(`/api/admin/societies/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function reactivateSociety(
  id: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  return api(`/api/admin/societies/${id}/reactivate`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function forceTransferPresidency(
  id: string,
  targetUserId: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  return api(`/api/admin/societies/${id}/force-transfer`, {
    method: 'POST',
    body: JSON.stringify({ targetUserId, reason }),
  });
}

export function updateStorageLimit(
  id: string,
  storageLimitBytes: number
): Promise<{ success: boolean; newLimit: number; currentUsed: number }> {
  return api(`/api/admin/societies/${id}/storage-limit`, {
    method: 'PATCH',
    body: JSON.stringify({ storage_limit_bytes: storageLimitBytes }),
  });
}

// ─── Events ─────────────────────────────────────────────────────────────────

export function fetchEvents(status?: string): Promise<AdminEvent[]> {
  const qs = status ? `?status=${status}` : '';
  return api<AdminEvent[]>(`/api/admin/events${qs}`);
}

export function patchEvent(
  id: string,
  action: string,
  reason?: string
): Promise<{ success: boolean; status: string }> {
  return api(`/api/admin/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action, reason }),
  });
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
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.action) sp.set('action', params.action);
  if (params.userId) sp.set('userId', params.userId);
  if (params.societyId) sp.set('societyId', params.societyId);
  if (params.from) sp.set('from', params.from);
  if (params.to) sp.set('to', params.to);
  return api<AuditLogResponse>(`/api/admin/audit-logs?${sp.toString()}`);
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export function fetchAnalytics(): Promise<AnalyticsData> {
  return api<AnalyticsData>('/api/admin/analytics');
}

// ─── Storage ────────────────────────────────────────────────────────────────

export function fetchStorageOverview(sort?: string): Promise<StorageResponse> {
  const qs = sort ? `?sort=${sort}` : '';
  return api<StorageResponse>(`/api/admin/storage${qs}`);
}
