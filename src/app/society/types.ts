/* ============================================================================
 * Society Governance Dashboard — TypeScript Interfaces
 * ============================================================================
 * All types consumed by the /society/[societyId] President dashboard.
 * PostgreSQL returns COUNT/SUM/AGG as strings — keep them as strings here,
 * convert with Number() in UI code.
 * ========================================================================== */

// ─── RBAC ───────────────────────────────────────────────────────────────────

export type RoleName =
  | 'President'
  | 'Vice President'
  | 'Director'
  | 'Deputy Director'
  | 'Member';

export interface MyRole {
  role_name: RoleName;
  hierarchy_level: number;
  wing_id: string | null;
  portfolio_id: string | null;
  membership_id: string;
}

// ─── Society Info ───────────────────────────────────────────────────────────

export type SocietyStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'DEACTIVATED';

export interface SocietyInfo {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  status: SocietyStatus;
  storage_used_bytes: number;
  storage_quota_bytes: number;
  created_at: string;
}

// ─── Overview Dashboard ─────────────────────────────────────────────────────

export interface GovernanceOverview {
  society: {
    id: string;
    name: string;
    status: SocietyStatus;
    logoUrl: string | null;
  };
  stats: {
    totalMembers: number;
    totalWings: number;
    totalPortfolios: number;
    totalEvents: number;
    upcomingEvents: number;
    ongoingEvents: number;
    pendingTickets: number;
    totalRevenue: string;
    totalCheckins: number;
    storagePercentUsed: number;
  };
  upcomingEvents: SocietyEvent[];
  recentActivity: SocietyAuditLog[];
  myRole: MyRole;
}

// ─── Events ─────────────────────────────────────────────────────────────────

export type EventStatus =
  | 'DRAFT' | 'PENDING' | 'UPCOMING' | 'ONGOING'
  | 'COMPLETED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'ARCHIVED';

export interface SocietyEvent {
  id: string;
  title: string;
  description: string | null;
  event_start: string;
  event_end: string | null;
  venue: string | null;
  status: EventStatus;
  visibility: 'PUBLIC' | 'MEMBERS_ONLY';
  ticket_price: string | null;
  max_participants: number | null;
  participants_count: string;
  banner_url: string | null;
  registration_link: string | null;
  registration_deadline: string | null;
  created_by_name: string;
  created_at: string;
  version: number;
  waitlist_count?: string;
  revenue?: string;
}

// ─── Ticket Approvals ───────────────────────────────────────────────────────

export type TicketStatus =
  | 'PENDING' | 'PENDING_VERIFICATION' | 'NEEDS_REUPLOAD'
  | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface PendingTicket {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatar: string | null;
  event_id: string;
  event_title: string;
  amount: string;
  payment_reference: string;
  payment_proof_url: string | null;
  proof_type: string | null;
  transaction_reference: string;
  student_note: string | null;
  proof_submitted_at: string | null;
  payment_proof_status: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  status: TicketStatus;
  purchased_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  rejection_reason: string | null;
}

// ─── Entry Control ──────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatar: string | null;
  event_id: string;
  event_title: string;
  check_in_time: string;
  check_in_method: 'QR' | 'MANUAL';
  checked_in_by_name: string | null;
}

export interface EntryStats {
  totalRegistered: number;
  totalCheckedIn: number;
  totalTicketed: number;
  recentScans: AttendanceRecord[];
}

// ─── Members ────────────────────────────────────────────────────────────────

export interface SocietyMember {
  membership_id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role_name: RoleName;
  hierarchy_level: number;
  wing_id: string | null;
  wing_name: string | null;
  portfolio_id: string | null;
  portfolio_name: string | null;
  is_active: boolean;
  assigned_at: string;
}

// ─── Wings & Portfolios ────────────────────────────────────────────────────

export interface Wing {
  id: string;
  name: string;
  description: string | null;
  member_count: string;
  vp_name: string | null;
  created_at: string;
  portfolios: Portfolio[];
}

export interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  wing_id: string;
  member_count: string;
  director_name: string | null;
  created_at: string;
}

export interface PrivilegeEntry {
  privilege_key: string;
  label: string;
  description: string;
  granted: boolean;
}

export interface RolePrivileges {
  membership_id: string;
  user_name: string;
  role_name: string;
  privileges: PrivilegeEntry[];
}

export interface RolePermissionSettings {
  role_id: string;
  role_name: string;
  hierarchy_level: number;
  privileges: PrivilegeEntry[];
}

// ─── Finance ────────────────────────────────────────────────────────────────

export interface SocietyFinance {
  totalRevenue: string;
  totalTickets: string;
  approvedTickets: string;
  pendingTickets: string;
  revenueByEvent: EventRevenue[];
  recentTransactions: FinanceTransaction[];
}

export interface EventRevenue {
  event_id: string;
  event_title: string;
  ticket_price: string;
  tickets_sold: string;
  total_revenue: string;
  event_date: string;
}

export interface FinanceTransaction {
  id: string;
  user_name: string;
  event_title: string;
  amount: string;
  status: string;
  purchased_at: string;
}

// ─── Storage ────────────────────────────────────────────────────────────────

export interface SocietyStorageInfo {
  used_bytes: number;
  quota_bytes: number;
  percent_used: number;
  media_items: MediaItem[];
}

export interface MediaItem {
  id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  media_type: string;
  media_table: 'society_media' | 'event_media' | 'post_attachments' | 'event_note_attachments';
  uploaded_by_name: string;
  uploaded_at: string;
  category: 'logo' | 'cover' | 'gallery' | 'event' | 'post' | 'note';
}

// ─── Participants ───────────────────────────────────────────────────────────

export interface EventParticipant {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatar: string | null;
  event_id: string;
  event_title: string;
  registration_type: 'REGISTRATION' | 'TICKET';
  status: string;
  registered_at: string;
  checked_in: boolean;
  check_in_time: string | null;
}

// ─── Notifications ──────────────────────────────────────────────────────────

export interface SocietyNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface SocietyAnalytics {
  memberGrowth: { month: string; count: string }[];
  eventsByMonth: { month: string; count: string }[];
  eventsByStatus: { status: string; count: string }[];
  topEvents: {
    id: string;
    title: string;
    participants: string;
    revenue: string;
    rating: string;
  }[];
  registrationStats: {
    total: string;
    active: string;
    last30Days: string;
  };
  revenueByMonth: { month: string; revenue: string }[];
  checkInRate: string;
}

// ─── Audit Logs ─────────────────────────────────────────────────────────────

export type SocietyAuditAction =
  | 'EVENT_CREATED' | 'EVENT_UPDATED' | 'EVENT_CANCELLED'
  | 'MEMBER_ADDED' | 'MEMBER_REMOVED' | 'MEMBER_SUSPENDED' | 'MEMBER_REACTIVATED'
  | 'WING_CREATED' | 'WING_DELETED' 
  | 'PORTFOLIO_CREATED' | 'PORTFOLIO_DELETED'
  | 'ROLE_ASSIGNED' | 'ROLE_UPDATED' | 'ROLE_CHANGED'
  | 'PRIVILEGE_GRANTED' | 'PRIVILEGE_REVOKED' | 'PRIVILEGE_UPDATED'
  | 'PRESIDENCY_TRANSFERRED'
  | 'TICKET_APPROVED' | 'TICKET_REJECTED'
  | 'QR_SCANNED' | 'QR_REGENERATED'
  | 'MEDIA_UPLOADED' | 'MEDIA_DELETED'
  | 'CONTENT_UPLOADED' | 'CONTENT_DELETED'
  | 'STORAGE_LIMIT_UPDATED'
  | 'SETTINGS_UPDATED';

export interface SocietyAuditLog {
  id: string;
  action: SocietyAuditAction;
  performedByName: string | null;
  performedByEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface SocietyAuditLogResponse {
  logs: SocietyAuditLog[];
  total: number;
  page: number;
  limit: number;
}

// ─── Society Settings ───────────────────────────────────────────────────────

export interface SocietySettings {
  event_creation_role: RoleName;
  chat_management_role: RoleName;
  content_upload_role: RoleName;
  ticketing_enabled: boolean;
  transfer_policy: 'ALLOWED' | 'RESTRICTED' | 'DISABLED';
  transfer_deadline_hours: number;
  payment_provider: string | null;
  payment_recipient_name: string | null;
  payment_account_number: string | null;
  payment_iban: string | null;
  payment_instructions: string | null;
}

// ─── Society Profile (Public Branding) ──────────────────────────────────────

export interface SocietyProfile {
  society_id: string;
  tagline: string | null;
  cover_url: string | null;
  logo_url: string | null;
  mission: string | null;
  established_year: number | null;
  faculty_advisor: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  office_location: string | null;
  social_links: Record<string, string>;
  primary_color: string | null;
  accent_color: string | null;
  ticket_footer_text: string | null;
  is_public: boolean;
  member_approval: boolean;
  auto_approve_ticket: boolean;
  pin_announcement: string | null;
  featured_event_id: string | null;
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export interface ChatChannel {
  id: string;
  society_id: string;
  wing_id: string | null;
  portfolio_id: string | null;
  name: string;
  description: string | null;
  mode: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  message_count?: string;
  last_message_at?: string;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar: string | null;
  content: string;
  reply_to_id: string | null;
  is_deleted: boolean;
  created_at: string;
}

// ─── Navigation Items ───────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  requiredLevel?: number;  // minimum hierarchy_level to see this item
}

// ─── Society Posts (Feed) ───────────────────────────────────────────────────

export type PostType = 'TEXT' | 'IMAGE' | 'GALLERY' | 'EVENT_SHARE';

export interface SocietyPost {
  id: string;
  society_id: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  author_role: string | null;
  content: string | null;
  post_type: PostType;
  shared_event_id: string | null;
  shared_event_title: string | null;
  shared_event_banner: string | null;
  shared_event_date: string | null;
  is_pinned: boolean;
  like_count: number;
  comment_count: number;
  images: PostImage[];
  created_at: string;
  updated_at: string;
}

export interface PostImage {
  id: string;
  file_url: string;
  file_name: string | null;
  display_order: number;
}

export interface CreatePostData {
  content?: string;
  post_type?: PostType;
  shared_event_id?: string;
  is_pinned?: boolean;
  image_urls?: { file_url: string; file_name: string; file_size_bytes: number; mime_type: string }[];
}

// ─── Photo Albums ───────────────────────────────────────────────────────────

export type AlbumCategory = 'GENERAL' | 'EVENTS' | 'ACHIEVEMENTS' | 'TEAM' | 'OTHER';

export interface SocietyAlbum {
  id: string;
  society_id: string;
  name: string;
  description: string | null;
  category: AlbumCategory;
  cover_photo_url: string | null;
  photo_count: number;
  created_by_name: string;
  created_at: string;
}

export interface AlbumPhoto {
  id: string;
  album_id: string;
  file_url: string;
  file_name: string | null;
  file_size_bytes: number;
  caption: string | null;
  is_featured: boolean;
  display_order: number;
  uploaded_by_name: string;
  created_at: string;
}

export interface CreateAlbumData {
  name: string;
  description?: string;
  category?: AlbumCategory;
}

// ─── Event Management (Edit/Delete) ─────────────────────────────────────────

export interface EventEditData {
  version: number;
  title?: string;
  description?: string;
  location?: string;
  venue_details?: string;
  event_start?: string;
  event_end?: string;
  registration_start?: string;
  registration_end?: string;
  is_paid?: boolean;
  ticket_price?: number | null;
  max_tickets?: number | null;
  max_participants?: number | null;
  visibility?: 'PUBLIC' | 'MEMBERS_ONLY';
  transfer_deadline?: string;
  banner_url?: string;
  thumbnail_url?: string;
}

// ─── Upload Response ────────────────────────────────────────────────────────

export interface UploadResponse {
  success: boolean;
  url: string;
  blobName: string;
  sizeBytes: number;
  mediaId?: string;
}

