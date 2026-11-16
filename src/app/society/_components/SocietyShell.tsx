'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  Ticket,
  ScanLine,
  Users,
  Network,
  Wallet,
  HardDrive,
  UserCheck,
  Bell,
  BarChart3,
  ScrollText,
  ChevronLeft,
  Menu,
  X,
  Settings,
  ArrowLeftRight,
  Shield,
  MessageSquare,
  Globe,
  FileText,
  Camera,
  KeyRound,
  Boxes,
  Handshake,
  NotebookPen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SmartImage } from '@/components/SmartImage';

interface SocietyShellProps {
  societyId: string;
  societyName: string;
  societyLogo: string | null;
  roleName: string;
  hierarchyLevel: number;
  /** What the viewer may do (from src/lib/rbac): drives which sections appear. */
  access: ShellAccess;
  children: React.ReactNode;
}

export interface ShellAccess {
  privileges: string[];
  isAdmin: boolean;
  onTeam: boolean;
  isEventHead: boolean;
  teamFunctions: string[];
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  section: string;
  show?: boolean;
  badge?: number;
}

export default function SocietyShell({
  societyId,
  societyName,
  societyLogo,
  roleName,
  access,
  children,
}: SocietyShellProps) {
  const has = (p: string) => access.isAdmin || access.privileges.includes(p);
  const fn = (f: string) => access.teamFunctions.includes(f);
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const base = `/society/${societyId}`;

  const navItems: NavItem[] = [
    { label: 'Dashboard', href: `${base}/dashboard`, icon: <LayoutDashboard size={18} />, section: 'Core' },
    { label: 'Events', href: `${base}/events`, icon: <Calendar size={18} />, section: 'Core' },
    { label: 'Posts', href: `${base}/posts`, icon: <FileText size={18} />, section: 'Core' },
    { label: 'Photos', href: `${base}/photos`, icon: <Camera size={18} />, section: 'Core' },
    { label: 'Members', href: `${base}/members`, icon: <Users size={18} />, section: 'Core' },
    { label: 'Minutes', href: `${base}/minutes`, icon: <NotebookPen size={18} />, section: 'Organisation' },
    { label: 'Inventory', href: `${base}/inventory`, icon: <Boxes size={18} />, section: 'Organisation',
      show: has('VIEW_INVENTORY') || has('MANAGE_INVENTORY') || access.onTeam || access.isEventHead },
    { label: 'Sponsors', href: `${base}/sponsors`, icon: <Handshake size={18} />, section: 'Organisation',
      show: has('VIEW_SPONSORS') || has('MANAGE_SPONSORS') || fn('OUTREACH') || fn('FINANCE') || access.isEventHead },
    { label: 'Roles & Permissions', href: `${base}/roles`, icon: <KeyRound size={18} />, section: 'Organisation' },
    { label: 'Wings & Portfolios', href: `${base}/wings`, icon: <Network size={18} />, section: 'Organisation',
      show: has('MANAGE_WINGS') || has('MANAGE_PORTFOLIOS') },
    { label: 'Chat', href: `${base}/chat`, icon: <MessageSquare size={18} />, section: 'Organisation', show: has('VIEW_CHAT') || has('MANAGE_CHAT') },
    { label: 'Approvals', href: `${base}/approvals`, icon: <Ticket size={18} />, section: 'Ticketing', show: has('VERIFY_PAYMENTS') },
    { label: 'Entry Control', href: `${base}/entry`, icon: <ScanLine size={18} />, section: 'Ticketing',
      show: has('SCAN_QR') || fn('SECURITY') || fn('USHERS') || fn('CROWD_CONTROL') },
    { label: 'Participants', href: `${base}/participants`, icon: <UserCheck size={18} />, section: 'Ticketing', show: has('VIEW_REGISTRATIONS') },
    { label: 'Finance', href: `${base}/finance`, icon: <Wallet size={18} />, section: 'Oversight', show: has('VIEW_FINANCE') },
    { label: 'Analytics', href: `${base}/analytics`, icon: <BarChart3 size={18} />, section: 'Oversight', show: has('VIEW_ANALYTICS') },
    { label: 'Activity Log', href: `${base}/audit-logs`, icon: <ScrollText size={18} />, section: 'Oversight', show: has('VIEW_AUDIT_LOGS') },
    { label: 'Storage', href: `${base}/storage`, icon: <HardDrive size={18} />, section: 'System', show: access.isAdmin },
    { label: 'Notifications', href: `${base}/notifications`, icon: <Bell size={18} />, section: 'System' },
    { label: 'Settings', href: `${base}/settings`, icon: <Settings size={18} />, section: 'System', show: access.isAdmin },
  ];

  const visibleItems = navItems.filter((item) => item.show !== false);

  const sections = visibleItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  const isActive = (href: string) => {
    if (href === `${base}/dashboard`) return pathname === `${base}/dashboard` || pathname === base;
    return pathname.startsWith(href);
  };

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const initials = societyName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card transition-all duration-300 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'w-[68px]' : 'w-[260px]',
        )}
      >
        {/* Society branding */}
        <div className="flex items-center gap-3 border-b border-border px-4 h-[60px] shrink-0">
          {societyLogo ? (
            <SmartImage src={societyLogo} alt={societyName} className="h-8 w-8 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500 font-bold text-xs flex-shrink-0">
              {initials}
            </div>
          )}
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-body-sm font-semibold text-foreground truncate">{societyName}</p>
              <p className="text-caption text-muted-foreground flex items-center gap-1">
                <Shield size={10} /> {roleName}
              </p>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex items-center justify-center h-7 w-7 rounded-lg hover:bg-accent text-muted-foreground transition-colors">
            <ChevronLeft size={14} className={cn('transition-transform duration-200', collapsed && 'rotate-180')} />
          </button>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden flex items-center justify-center h-7 w-7 rounded-lg hover:bg-accent text-muted-foreground">
            <X size={14} />
          </button>
        </div>

        {/* Mode indicator */}
        <div className={cn('px-3 py-2 border-b border-border', collapsed && 'px-2')}>
          <div className={cn(
            'flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-brand-500/5 border border-brand-500/15',
            collapsed && 'justify-center px-0',
          )}>
            <div className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse flex-shrink-0" />
            {!collapsed && <span className="text-[10px] font-semibold text-brand-500 uppercase tracking-wider">Society Mode</span>}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-3 scrollbar-hide">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section}</p>
              )}
              <div className="space-y-px">
                {items.map(item => {
                  const active = isActive(item.href);
                  return (
                    <button
                      key={item.href}
                      onClick={() => router.push(item.href)}
                      className={cn(
                        'flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                        active
                          ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        collapsed && 'justify-center px-0',
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.badge !== undefined && item.badge > 0 && (
                        <span className="ml-auto text-[10px] bg-brand-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-bold">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-border p-2 space-y-px">
          <button
            onClick={() => router.push(`/society/${societyId}`)}
            className={cn(
              'flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
              collapsed && 'justify-center px-0',
            )}
            title={collapsed ? 'Public Page' : undefined}
          >
            <Globe size={18} />
            {!collapsed && <span>Public Page</span>}
          </button>
          <button
            onClick={() => router.push('/home')}
            className={cn(
              'flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
              collapsed && 'justify-center px-0',
            )}
            title={collapsed ? 'User Mode' : undefined}
          >
            <ArrowLeftRight size={18} />
            {!collapsed && <span>User Mode</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-border bg-card/80 backdrop-blur-xl px-4 h-[60px] shrink-0 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden flex items-center justify-center h-9 w-9 rounded-xl hover:bg-accent text-muted-foreground transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-h3 text-foreground truncate">{getPageTitle(pathname, base)}</h1>
          </div>
          {access.isAdmin && (
            <button
              onClick={() => router.push(`${base}/settings`)}
              className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-accent text-muted-foreground transition-colors"
              title="Settings"
            >
              <Settings size={18} />
            </button>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-background">{children}</main>
      </div>
    </div>
  );
}

function getPageTitle(pathname: string, base: string): string {
  const sub = pathname.replace(base, '') || '';

  if (sub.startsWith('/events/') && sub.includes('/workspace')) return 'Event Workspace';
  if (sub.startsWith('/minutes')) return 'Minutes';
  if (sub.startsWith('/inventory')) return 'Inventory';
  if (sub.startsWith('/sponsors')) return 'Sponsors';
  if (sub.startsWith('/roles')) return 'Roles & Permissions';
  if (sub.startsWith('/events/') && sub.includes('/entry/scan')) return 'QR Scanner';
  if (sub.startsWith('/events/') && sub.includes('/entry')) return 'Entry Control';

  const map: Record<string, string> = {
    '': 'Dashboard',
    '/dashboard': 'Dashboard',
    '/posts': 'Posts',
    '/events': 'Events',
    '/photos': 'Photos',
    '/approvals': 'Ticket Approvals',
    '/entry': 'Entry Control',
    '/members': 'Members',
    '/wings': 'Wings & Portfolios',
    '/finance': 'Finance',
    '/storage': 'Storage',
    '/participants': 'Participants',
    '/notifications': 'Notifications',
    '/analytics': 'Analytics',
    '/audit-logs': 'Audit Logs',
    '/chat': 'Team Chat',
    '/settings': 'Settings',
  };
  return map[sub] || 'Society Management';
}


