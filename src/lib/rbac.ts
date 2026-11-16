/**
 * Role-based access control (SRS 2.3, 5.2, 8.1).
 *
 * Society level   Faculty Sponsor > Admin > Officer > Member      (society_memberships + roles.tier)
 * Event level     Event Head                                      (events.event_head_id)
 * Team level      Team Lead > Executive                           (event_team_members)
 * Platform        Super Admin (developers), Principal (users.designation)
 *
 * Society privileges are always answered by the database function
 * fn_has_privilege(), so SQL and TypeScript can never disagree.
 * Every route should ask this module instead of comparing role names or levels.
 */
import type { PoolClient } from 'pg';
import { NextResponse } from 'next/server';
import { query } from './db';
import type { JWTPayload } from './auth';
import { isUuid } from './event-workspace';

export type SocietyTier = 'FACULTY_SPONSOR' | 'ADMIN' | 'OFFICER' | 'MEMBER';
export type TeamRole = 'TEAM_LEAD' | 'EXECUTIVE';

export const TIER_LABELS: Record<SocietyTier, string> = {
  FACULTY_SPONSOR: 'Faculty Sponsor',
  ADMIN: 'Admin',
  OFFICER: 'Officer',
  MEMBER: 'Member',
};

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  TEAM_LEAD: 'Team Lead',
  EXECUTIVE: 'Executive',
};

/** Portfolio functions that carry module powers inside their event (SRS 4.8-4.11). */
export const FUNCTION = {
  FINANCE: 'FINANCE',
  LOGISTICS: 'LOGISTICS',
  OUTREACH: 'OUTREACH',
  SECURITY: 'SECURITY',
  USHERS: 'USHERS',
  CROWD_CONTROL: 'CROWD_CONTROL',
  TEAM_HR: 'TEAM_HR',
} as const;

const ENTRY_CONTROL_FUNCTIONS = [FUNCTION.SECURITY, FUNCTION.USHERS, FUNCTION.CROWD_CONTROL];

type Queryable = Pick<PoolClient, 'query'> | { query: typeof query };

function runner(client?: PoolClient): Queryable {
  return client ?? { query };
}

// ---------------------------------------------------------------------------
// Society access
// ---------------------------------------------------------------------------

export interface SocietyAccess {
  userId: string;
  societyId: string;
  societyStatus: string;
  isSuperAdmin: boolean;
  /** Has an active, non-suspended society membership. */
  isMember: boolean;
  tier: SocietyTier | null;
  roleName: string | null;
  roleId: string | null;
  level: number;
  membershipId: string | null;
  privileges: Set<string>;
}

/**
 * Loads the user's standing in a society. Returns null when the society does not exist.
 * `privileges` holds every privilege fn_has_privilege() grants at society scope.
 */
export async function getSocietyAccess(
  user: Pick<JWTPayload, 'userId' | 'userType'>,
  societyId: string,
  client?: PoolClient,
): Promise<SocietyAccess | null> {
  if (!isUuid(societyId)) return null;
  const db = runner(client);
  const society = await db.query(
    'SELECT status::text AS status FROM societies WHERE id = $1 AND deleted_at IS NULL',
    [societyId],
  );
  if (society.rows.length === 0) return null;

  const membership = await db.query(
    `SELECT sm.id, r.id AS role_id, r.name, r.tier, r.hierarchy_level
     FROM society_memberships sm
     JOIN roles r ON r.id = sm.role_id
     WHERE sm.user_id = $1 AND sm.society_id = $2 AND sm.is_active AND sm.suspended_at IS NULL
     ORDER BY r.hierarchy_level DESC, sm.assigned_at ASC
     LIMIT 1`,
    [user.userId, societyId],
  );
  const m = membership.rows[0];

  const privs = await db.query(
    `SELECT p.name FROM privileges p WHERE fn_has_privilege($1, $2, p.name)`,
    [user.userId, societyId],
  );

  return {
    userId: user.userId,
    societyId,
    societyStatus: society.rows[0].status,
    isSuperAdmin: user.userType === 'SUPER_ADMIN',
    isMember: Boolean(m),
    tier: (m?.tier as SocietyTier) ?? null,
    roleName: m?.name ?? null,
    roleId: m?.role_id ?? null,
    level: user.userType === 'SUPER_ADMIN' ? 1000 : Number(m?.hierarchy_level ?? 0),
    membershipId: m?.id ?? null,
    privileges: new Set(privs.rows.map((r: { name: string }) => r.name)),
  };
}

export function can(access: SocietyAccess | null | undefined, privilege: string): boolean {
  return Boolean(access?.privileges.has(privilege));
}

/** Super admin, Faculty Sponsor or Admin tier. */
export function isSocietyAdmin(access: SocietyAccess | null | undefined): boolean {
  return Boolean(access && (access.isSuperAdmin || access.tier === 'FACULTY_SPONSOR' || access.tier === 'ADMIN'));
}

export function isFacultySponsor(access: SocietyAccess | null | undefined): boolean {
  return access?.tier === 'FACULTY_SPONSOR';
}

/**
 * Who may define Officer roles and their permissions (FR-ROLE-03): the Faculty
 * Sponsor. While a society has no Faculty Sponsor yet, its Admins may do it.
 */
export async function canDefineOfficerPermissions(access: SocietyAccess, client?: PoolClient): Promise<boolean> {
  if (access.isSuperAdmin || access.tier === 'FACULTY_SPONSOR') return true;
  if (access.tier !== 'ADMIN') return false;
  const fs = await runner(client).query(
    `SELECT 1 FROM society_memberships sm JOIN roles r ON r.id = sm.role_id
     WHERE sm.society_id = $1 AND sm.is_active AND sm.suspended_at IS NULL AND r.tier = 'FACULTY_SPONSOR'
     LIMIT 1`,
    [access.societyId],
  );
  return fs.rows.length === 0;
}

/**
 * True when `actor` may change `target`'s role or membership: strictly higher
 * rank, and nobody below the Faculty Sponsor may touch a Faculty Sponsor.
 */
export function outranks(actor: SocietyAccess, targetLevel: number, targetTier?: string | null): boolean {
  if (actor.isSuperAdmin) return true;
  if (targetTier === 'FACULTY_SPONSOR') return false;
  return actor.level > targetLevel;
}

// ---------------------------------------------------------------------------
// Event / team access
// ---------------------------------------------------------------------------

export interface TeamMembership {
  teamId: string;
  portfolioId: string;
  portfolioName: string;
  functionKey: string;
  teamRole: TeamRole;
}

export interface EventAccess {
  society: SocietyAccess;
  event: {
    id: string;
    society_id: string;
    title: string;
    event_head_id: string | null;
    status: string | null;
    archived_at: string | null;
    deleted_at: string | null;
    event_start: string;
    event_end: string;
  };
  isEventHead: boolean;
  teams: TeamMembership[];
}

export async function getEventAccess(
  user: Pick<JWTPayload, 'userId' | 'userType'>,
  eventId: string,
  client?: PoolClient,
): Promise<EventAccess | null> {
  if (!isUuid(eventId)) return null;
  const db = runner(client);
  const ev = await db.query(
    `SELECT id, society_id, title, event_head_id, status, archived_at, deleted_at, event_start, event_end
     FROM events WHERE id = $1`,
    [eventId],
  );
  const event = ev.rows[0];
  if (!event) return null;

  const society = await getSocietyAccess(user, event.society_id, client);
  if (!society) return null;

  const teams = await db.query(
    `SELECT etm.team_id, et.portfolio_id, p.name AS portfolio_name, p.function_key, etm.team_role
     FROM event_team_members etm
     JOIN event_teams et ON et.id = etm.team_id AND et.is_active
     JOIN portfolios p ON p.id = et.portfolio_id
     WHERE etm.event_id = $1 AND etm.user_id = $2 AND etm.removed_at IS NULL`,
    [eventId, user.userId],
  );

  // Team and Event Head standing only count while the person is an active
  // (non-suspended) member of the society.
  const standing = society.isMember || society.isSuperAdmin;
  return {
    society,
    event,
    isEventHead: standing && event.event_head_id === user.userId,
    teams: (standing ? teams.rows : []).map((r: Record<string, string>) => ({
      teamId: r.team_id,
      portfolioId: r.portfolio_id,
      portfolioName: r.portfolio_name,
      functionKey: r.function_key,
      teamRole: r.team_role as TeamRole,
    })),
  };
}

export function teamRoleIn(access: EventAccess, teamId: string): TeamRole | null {
  return access.teams.find((t) => t.teamId === teamId)?.teamRole ?? null;
}

export function leadsTeam(access: EventAccess, teamId: string): boolean {
  return teamRoleIn(access, teamId) === 'TEAM_LEAD';
}

export function inTeam(access: EventAccess, teamId: string): boolean {
  return teamRoleIn(access, teamId) !== null;
}

/** Member (optionally only as Team Lead) of a team with the given portfolio function in this event. */
export function hasFunction(access: EventAccess, functionKey: string, role?: TeamRole): boolean {
  return access.teams.some((t) => t.functionKey === functionKey && (!role || t.teamRole === role));
}

export function isOnAnyTeam(access: EventAccess): boolean {
  return access.teams.length > 0;
}

/** Anyone who works on this event: admins, Event Head, any team member, or officers with a view privilege. */
export function canSeeEventWorkspace(access: EventAccess): boolean {
  return isSocietyAdmin(access.society) || access.isEventHead || isOnAnyTeam(access) || access.society.tier === 'OFFICER';
}

/** The event is still open for changes (not archived or deleted). */
export function eventIsEditable(access: EventAccess): boolean {
  return !access.event.archived_at && !access.event.deleted_at;
}

// Module rules from the SRS role-to-module matrix (8.1) -----------------------

export const rules = {
  manageTeams: (a: EventAccess) => can(a.society, 'MANAGE_TEAMS'),
  editPlan: (a: EventAccess) => can(a.society, 'MANAGE_EVENT_PLAN') || a.isEventHead,

  // Recruitment: Admin full, Event Head view, Team Lead own team
  manageRecruitmentFor: (a: EventAccess, teamId: string | null) =>
    can(a.society, 'MANAGE_RECRUITMENT') || (teamId !== null && leadsTeam(a, teamId)),
  viewAllRecruitment: (a: EventAccess) =>
    can(a.society, 'MANAGE_RECRUITMENT') || can(a.society, 'VIEW_RECRUITMENT') || a.isEventHead,

  // Duties: Admin full, Event Head event-wide, Team Lead own team, Executive own/team view
  manageDutiesFor: (a: EventAccess, teamId: string | null) =>
    can(a.society, 'MANAGE_DUTIES') || a.isEventHead || (teamId !== null && leadsTeam(a, teamId)),
  viewAllDuties: (a: EventAccess) =>
    can(a.society, 'MANAGE_DUTIES') || can(a.society, 'VIEW_ALL_DUTIES') || a.isEventHead,

  // Finance: Admin full, Event Head view, Team Lead logs own team's expenses, Finance portfolio verifies
  allocateFunds: (a: EventAccess) => can(a.society, 'MANAGE_FINANCE'),
  logExpenseFor: (a: EventAccess, teamId: string) => leadsTeam(a, teamId) || can(a.society, 'MANAGE_FINANCE'),
  verifyMoney: (a: EventAccess) => can(a.society, 'VERIFY_EXPENSES') || hasFunction(a, FUNCTION.FINANCE, 'TEAM_LEAD'),
  viewAllFinance: (a: EventAccess) =>
    can(a.society, 'VIEW_FINANCE') || can(a.society, 'MANAGE_FINANCE') || a.isEventHead || hasFunction(a, FUNCTION.FINANCE),

  // Sponsors: Admin full, Event Head view, Outreach portfolio manages
  manageSponsorsForEvent: (a: EventAccess) => can(a.society, 'MANAGE_SPONSORS') || hasFunction(a, FUNCTION.OUTREACH),
  viewSponsorsForEvent: (a: EventAccess) =>
    can(a.society, 'VIEW_SPONSORS') || can(a.society, 'MANAGE_SPONSORS') || a.isEventHead ||
    hasFunction(a, FUNCTION.OUTREACH) || hasFunction(a, FUNCTION.FINANCE),

  // Inventory: Admin full, Logistics approves/issues, Team Leads request, everyone on a team views
  manageInventoryForEvent: (a: EventAccess) => can(a.society, 'MANAGE_INVENTORY') || hasFunction(a, FUNCTION.LOGISTICS),
  requestInventoryFor: (a: EventAccess, teamId: string) => leadsTeam(a, teamId) || can(a.society, 'MANAGE_INVENTORY'),

  // Minutes: Team Lead / Event Head create; Faculty Sponsor approves; Admin forwards
  createMinutesFor: (a: EventAccess, teamId: string | null) =>
    can(a.society, 'CREATE_MINUTES') || a.isEventHead || (teamId !== null && leadsTeam(a, teamId)),

  // Registration & ticketing: Security/Ushers check people in (matrix: Executive = check-in)
  checkIn: (a: EventAccess) =>
    can(a.society, 'SCAN_QR') || ENTRY_CONTROL_FUNCTIONS.some((f) => hasFunction(a, f)),
  viewRegistrations: (a: EventAccess) =>
    can(a.society, 'VIEW_REGISTRATIONS') || a.isEventHead || a.teams.some((t) => t.teamRole === 'TEAM_LEAD'),
};

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

export function forbidden(message = 'You do not have permission to do this.') {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Loads society access and checks one privilege. Returns the access, or a
 * NextResponse (404 / 403) to return from the route.
 */
export async function requireSocietyPrivilege(
  user: JWTPayload,
  societyId: string,
  privilege: string,
  client?: PoolClient,
): Promise<SocietyAccess | NextResponse> {
  const access = await getSocietyAccess(user, societyId, client);
  if (!access) return NextResponse.json({ error: 'Society not found' }, { status: 404 });
  if (!can(access, privilege)) return forbidden();
  return access;
}

/** Loads society access and requires an active membership (or super admin). */
export async function requireSocietyMember(
  user: JWTPayload,
  societyId: string,
  client?: PoolClient,
): Promise<SocietyAccess | NextResponse> {
  const access = await getSocietyAccess(user, societyId, client);
  if (!access) return NextResponse.json({ error: 'Society not found' }, { status: 404 });
  if (!access.isMember && !access.isSuperAdmin) return forbidden('You are not a member of this society.');
  return access;
}

/** Loads event access and requires the caller to work on the event. */
export async function requireEventWorkspace(
  user: JWTPayload,
  eventId: string,
  client?: PoolClient,
): Promise<EventAccess | NextResponse> {
  const access = await getEventAccess(user, eventId, client);
  if (!access || access.event.deleted_at) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  if (!canSeeEventWorkspace(access)) return forbidden('You are not part of this event.');
  return access;
}

/**
 * Records who/why for role changes made in this transaction; the database
 * triggers copy it into role_change_log (FR-ROLE-06).
 */
export async function setChangeContext(
  client: PoolClient,
  ctx: { actorId: string; reason?: string | null; source?: 'DIRECT' | 'APPLICATION' | 'RECRUITMENT' | 'TRANSFER' | 'SYSTEM' },
): Promise<void> {
  await client.query(
    `SELECT set_config('app.actor_id', $1, true),
            set_config('app.change_reason', $2, true),
            set_config('app.change_source', $3, true)`,
    [ctx.actorId, ctx.reason ?? '', ctx.source ?? 'DIRECT'],
  );
}

/** Adds the user to the society as a Member if they have no active membership yet. */
export async function ensureSocietyMember(
  client: PoolClient,
  societyId: string,
  userId: string,
  assignedBy: string,
): Promise<void> {
  const existing = await client.query(
    `SELECT 1 FROM society_memberships
     WHERE society_id = $1 AND user_id = $2 AND is_active`,
    [societyId, userId],
  );
  if (existing.rows.length > 0) return;
  const suspended = await client.query(
    `SELECT 1 FROM society_memberships
     WHERE society_id = $1 AND user_id = $2 AND suspended_at IS NOT NULL AND NOT is_active`,
    [societyId, userId],
  );
  if (suspended.rows.length > 0) {
    throw new RbacError('This person is suspended from the society.');
  }
  await client.query('SELECT fn_seed_society_roles($1)', [societyId]);
  await client.query(
    `INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
     SELECT $2, $1, r.id, TRUE, $3 FROM roles r
     WHERE r.society_id = $1 AND r.tier = 'MEMBER'
     ORDER BY r.hierarchy_level ASC LIMIT 1`,
    [societyId, userId, assignedBy],
  );
}

export class RbacError extends Error {}
