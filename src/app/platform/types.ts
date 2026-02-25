/* ============================================================================
 * Platform Dashboard — TypeScript Interfaces
 * ============================================================================
 * All types consumed by the /platform SuperAdmin dashboard.
 * These mirror backend API response shapes exactly.
 * ========================================================================== */

// ─── Core Stats ─────────────────────────────────────────────────────────────

export interface PlatformStats {
  totalUsers: number;
  totalSocieties: number;
  totalEvents: number;
  pendingEvents: number;
  pendingSocieties: number;
}

// ─── Users ──────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  user_type: 'SUPER_ADMIN' | 'STUDENT';
  status: 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED';
  created_at: string;
  society_count: string;
}

// ─── Societies ──────────────────────────────────────────────────────────────

export type SocietyStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'DEACTIVATED';

export interface AdminSociety {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  category: string | null;
  status: SocietyStatus;
  created_at: string;
  president_name: string | null;
  contact_number: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  member_count: string;
  event_count: string;
  storage_used_bytes: number | null;
  storage_quota_bytes: number | null;
}

// ─── Events ─────────────────────────────────────────────────────────────────

export type EventStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface AdminEvent {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string | null;
  venue: string;
  status: EventStatus;
  capacity: number;
  ticket_price: number | null;
  banner_url: string | null;
  society_name: string;
  society_logo: string | null;
  created_by_name: string;
  created_at: string;
}

// ─── Audit Logs ─────────────────────────────────────────────────────────────

export type AuditAction =
  | 'CHAT_CREATED' | 'CHAT_DELETED' | 'CHAT_UPDATED'
  | 'CONTENT_DELETED' | 'CONTENT_UPLOADED'
  | 'EVENT_CANCELLED' | 'EVENT_CREATED' | 'EVENT_REGISTERED' | 'EVENT_UPDATED' | 'EVENT_WAITLISTED'
  | 'MEDIA_DELETED' | 'MEDIA_UPLOADED'
  | 'MEMBER_ADDED' | 'MEMBER_REACTIVATED' | 'MEMBER_REMOVED' | 'MEMBER_SUSPENDED'
  | 'NOTE_CREATED' | 'NOTE_DELETED' | 'NOTE_UPDATED'
  | 'PAYMENT_REJECTED' | 'PAYMENT_VERIFIED'
  | 'PORTFOLIO_CREATED' | 'PORTFOLIO_DELETED'
  | 'POST_CREATED' | 'POST_DELETED' | 'POST_UPDATED'
  | 'PRESIDENCY_TRANSFERRED' | 'PRIVILEGE_GRANTED' | 'PRIVILEGE_REVOKED'
  | 'QR_REGENERATED' | 'QR_SCANNED' | 'QUOTA_EXCEEDED'
  | 'ROLE_ASSIGNED' | 'ROLE_REVOKED' | 'ROLE_UPDATED'
  | 'SOCIETY_APPROVED' | 'SOCIETY_DEACTIVATED' | 'SOCIETY_REACTIVATED' | 'SOCIETY_REJECTED' | 'SOCIETY_SUSPENDED'
  | 'STORAGE_DECREMENT' | 'STORAGE_LIMIT_UPDATED'
  | 'SUPERADMIN_OVERRIDE'
  | 'TICKET_APPROVED' | 'TICKET_REJECTED' | 'TICKET_TRANSFERRED'
  | 'WING_CREATED' | 'WING_DELETED';

export interface AuditLog {
  id: string;
  action: AuditAction;
  performed_by: string;
  performed_by_name: string | null;
  performed_by_email: string | null;
  society_id: string | null;
  society_name: string | null;
  target_type: string | null;
  target_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface MonthlyCount {
  month: string;
  count: string;
}

export interface StatusCount {
  status: string;
  count: string;
}

export interface TopSociety {
  id: string;
  name: string;
  logo_url: string | null;
  status: string;
  member_count: string;
  event_count: string;
}

export interface RegistrationStats {
  total_registrations: string;
  active_registrations: string;
  last_30_days: string;
  last_7_days: string;
}

export interface RevenueStats {
  total_tickets: string;
  approved_tickets: string;
  total_revenue: string;
  tickets_last_30_days: string;
}

export interface StorageOverview {
  total_societies: string;
  total_used_bytes: string;
  total_quota_bytes: string;
  max_used_bytes: string | null;
  avg_used_bytes: string | null;
}

export interface RecentActivity {
  id: string;
  action: AuditAction;
  created_at: string;
  user_name: string | null;
  society_name: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AnalyticsData {
  userGrowth: MonthlyCount[];
  eventsByMonth: MonthlyCount[];
  eventsByStatus: StatusCount[];
  societiesByStatus: StatusCount[];
  topSocieties: TopSociety[];
  registrationStats: RegistrationStats;
  revenueStats: RevenueStats;
  storageOverview: StorageOverview;
  recentActivity: RecentActivity[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

export interface SocietyStorage {
  society_id: string;
  society_name: string;
  society_status: string;
  storage_used_bytes: string;
  storage_used_mb: string;
  storage_quota_bytes: string;
  storage_limit_mb: string;
  percent_used: string;
}

export interface StorageAggregate {
  total_societies: string;
  total_used: string;
  total_quota: string;
  near_limit_count: string;
  critical_count: string;
}

export interface StorageResponse {
  societies: SocietyStorage[];
  aggregate: StorageAggregate;
}
