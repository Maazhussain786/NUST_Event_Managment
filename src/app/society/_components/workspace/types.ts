export interface WorkspaceMember {
  id: string;
  team_id: string;
  user_id: string;
  team_role: 'TEAM_LEAD' | 'EXECUTIVE';
  source: string;
  full_name: string;
  email: string;
}

export interface WorkspaceTeam {
  id: string;
  portfolio_id: string;
  portfolio_name: string;
  function_key: string;
  description: string | null;
  is_event_specific: boolean;
  is_active: boolean;
  notes: string | null;
  members: WorkspaceMember[];
}

export interface Workspace {
  event: {
    id: string;
    society_id: string;
    society_name: string;
    title: string;
    description: string | null;
    location: string | null;
    event_start: string;
    event_end: string;
    status: string;
    archived_at: string | null;
    budget_total: string | null;
    event_head_id: string | null;
    event_head_name: string | null;
    event_head_email: string | null;
  };
  teams: WorkspaceTeam[];
  me: {
    user_id: string;
    is_event_head: boolean;
    society_role: string | null;
    tier: string | null;
    teams: Array<{ teamId: string; portfolioName: string; functionKey: string; teamRole: 'TEAM_LEAD' | 'EXECUTIVE' }>;
    editable: boolean;
    can: Record<
      | 'manage_teams' | 'edit_plan' | 'manage_any_recruitment' | 'view_all_recruitment' | 'manage_any_duties'
      | 'view_all_duties' | 'allocate_funds' | 'verify_money' | 'view_all_finance' | 'manage_sponsors'
      | 'view_sponsors' | 'manage_inventory' | 'create_minutes' | 'check_in' | 'view_registrations'
      | 'archive' | 'is_admin',
      boolean
    >;
  };
  summary: {
    duties: Record<string, number>;
    finance: { allocated: number; spent: number; sponsorship: number; remaining: number } | null;
    pending_inventory_requests: number;
    minutes_awaiting_approval: number;
  };
}

export interface TabProps {
  ws: Workspace;
  reload: () => Promise<void> | void;
}

export const leadsAnyTeam = (ws: Workspace) => ws.me.teams.some((t) => t.teamRole === 'TEAM_LEAD');
export const ledTeamIds = (ws: Workspace) => ws.me.teams.filter((t) => t.teamRole === 'TEAM_LEAD').map((t) => t.teamId);
export const activeTeams = (ws: Workspace) => ws.teams.filter((t) => t.is_active);
export const eventMembers = (ws: Workspace) => {
  const seen = new Map<string, { user_id: string; full_name: string; email: string }>();
  for (const t of ws.teams) for (const m of t.members) seen.set(m.user_id, m);
  return Array.from(seen.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
};
