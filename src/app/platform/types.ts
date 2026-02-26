/* ============================================================================
 * Platform Dashboard — TypeScript Interfaces
 * ============================================================================
 * All types consumed by the /platform SuperAdmin dashboard.
 * PostgreSQL returns COUNT/SUM/AGG as strings — keep them as strings here,
 * convert with Number() in UI code.
 * ========================================================================== */

// ─── Command Center (Overview) ──────────────────────────────────────────────

export interface PlatformStats {
  totalUsers: number;
  totalSocieties: number;
  totalEvents: number;
  activeEvents: number;
  pendingEvents: number;
  pendingSocieties: number;
  revenueToday: string;
  globalStorageUsed: string;
  globalStorageQuota: string;
  qrScansToday: number;
  suspensionsToday: number;
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

export interface UserDetail {
  id: string;
  email: string;
  full_name: string;
  user_type: 'SUPER_ADMIN' | 'STUDENT';
  status: string;
  avatar_url: string | null;
  created_at: string;
  memberships: UserMembership[];
  events: UserEventParticipation[];
  auditLogs: AuditLog[];
}

export interface UserMembership {
  society_id: string;
  society_name: string;
  role: string;
  is_active: boolean;
  joined_at: string;
}

export interface UserEventParticipation {
  event_id: string;
  event_title: string;
  society_name: string;
  registered_at: string;
  status: string;
}

// ─── Administrators ─────────────────────────────────────────────────────────

export interface Administrator {
  id: string;
  email: string;
  full_name: string;
  status: string;
  created_at: string;
  action_count: string;
  last_action_at: string | null;
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

export type EventStatus = 'DRAFT' | 'PENDING' | 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'APPROVED' | 'REJECTED' | 'ARCHIVED' | 'CANCELLED';

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
  participant_count?: string;
  waitlist_count?: string;
  revenue?: string;
}

// ─── Financial Intelligence ─────────────────────────────────────────────────

export interface FinanceData {
  revenueBySociety: RevenueBySociety[];
  revenueByEvent: RevenueByEvent[];
  paymentBreakdown: PaymentBreakdown;
  recentPayments: RecentPayment[];
  monthlyRevenue: MonthlyCount[];
}

export interface RevenueBySociety {
  society_id: string;
  society_name: string;
  total_revenue: string;
  ticket_count: string;
  event_count: string;
}

export interface RevenueByEvent {
  event_id: string;
  event_title: string;
  society_name: string;
  ticket_price: string;
  tickets_sold: string;
  total_revenue: string;
  event_date: string;
}

export interface PaymentBreakdown {
  total: string;
  approved: string;
  pending: string;
  rejected: string;
  total_revenue: string;
}

export interface RecentPayment {
  id: string;
  user_name: string;
  event_title: string;
  amount: string;
  status: string;
  purchased_at: string;
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

// ─── Security Monitoring ────────────────────────────────────────────────────

export interface SecurityMetrics {
  failedLogins24h: number;
  qrScanBursts: number;
  rapidRegistrations: number;
  lockingConflicts: number;
  paymentRetrySpikes: number;
  apiErrors24h: number;
  suspiciousActivities: SuspiciousActivity[];
  recentSecurityEvents: SecurityEvent[];
}

export interface SuspiciousActivity {
  user_id: string;
  user_name: string;
  user_email: string;
  indicator: string;
  count: string;
  last_occurred: string;
}

export interface SecurityEvent {
  id: string;
  action: string;
  performed_by: string | null;
  user_name: string | null;
  user_email: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Feature Flags ──────────────────────────────────────────────────────────

export interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  scope: 'global' | 'per_society';
  category: string;
}

// ─── System Configuration ───────────────────────────────────────────────────

export interface SystemConfigItem {
  key: string;
  label: string;
  description: string;
  value: string | number;
  type: 'number' | 'string' | 'boolean';
  unit?: string;
  category: string;
}

// ─── Incident Management ────────────────────────────────────────────────────

export interface Incident {
  id: string;
  title: string;
  description: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
  created_by_name: string;
  created_by_email: string;
  assigned_to_name: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  notes: IncidentNote[];
}

export interface IncidentNote {
  id: string;
  note: string;
  created_by_name: string;
  created_at: string;
}

// ─── Global Search ──────────────────────────────────────────────────────────

export interface SearchResults {
  users: SearchResultItem[];
  societies: SearchResultItem[];
  events: SearchResultItem[];
  auditLogs: SearchResultItem[];
}

export interface SearchResultItem {
  id: string;
  type: 'user' | 'society' | 'event' | 'audit_log';
  title: string;
  subtitle: string | null;
  status: string | null;
  created_at: string;
}

// ─── Health Monitor ─────────────────────────────────────────────────────────

export interface HealthStatus {
  database: ServiceHealth;
  storage: ServiceHealth;
  api: ServiceHealth;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  systemInfo: {
    totalUsers: number;
    totalSocieties: number;
    totalEvents: number;
    dbResponseTime: number;
    uptimeHours: number;
    errorRate24h: number;
  };
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  message: string;
}

// ─── University Events (NUST Official) ──────────────────────────────────────

export interface UniversityEvent {
  id: string;
  title: string;
  description: string | null;
  event_start: string;
  event_end: string | null;
  location: string | null;
  status: string;
  banner_url: string | null;
  ticket_price: string;
  max_tickets: string | null;
  is_pinned: boolean;
  is_locked: boolean;
  priority_rank: number;
  created_by_name: string | null;
  society_name: string | null;
  society_id: string | null;
  registration_count: string;
  created_at: string;
}

// ─── Co-Host Request Workflow ───────────────────────────────────────────────

export type CoHostRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface CoHostRequest {
  id: string;
  event_id: string;
  event_title: string;
  requesting_society_id: string;
  requesting_society_name: string;
  host_society_id: string;
  host_society_name: string;
  requested_by_name: string;
  status: CoHostRequestStatus;
  reason: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

// ─── Notification Engine (In-App) ───────────────────────────────────────────

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type NotificationTargetType = 'ALL' | 'SOCIETY' | 'EVENT' | 'USER';

export interface PlatformNotification {
  id: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  target_type: NotificationTargetType;
  target_id: string | null;
  target_label: string | null;
  scheduled_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  read_count: string;
  total_target: string;
  sender_name: string;
  created_at: string;
}

// ─── Blackout Calendar ──────────────────────────────────────────────────────

export interface BlackoutDate {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  scope: 'ALL' | 'EVENTS' | 'REGISTRATIONS';
  created_by_name: string;
  created_at: string;
}

// ─── Emergency Controls ─────────────────────────────────────────────────────

export interface EmergencyStatus {
  flags: EmergencyFlag[];
  activeIncidents: number;
  lastEmergencyAction: string | null;
}

export interface EmergencyFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
