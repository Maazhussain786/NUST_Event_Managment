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
} from 'lucide-react';

interface SocietyShellProps {
  societyId: string;
  societyName: string;
  societyLogo: string | null;
  roleName: string;
  hierarchyLevel: number;
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  section: string;
  minLevel?: number;
  badge?: number;
}

export default function SocietyShell({
  societyId,
  societyName,
  societyLogo,
  roleName,
  hierarchyLevel,
  children,
}: SocietyShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const base = `/society/${societyId}`;

  const navItems: NavItem[] = [
    // ── Core
    { label: 'Dashboard', href: `${base}/dashboard`, icon: <LayoutDashboard size={20} />, section: 'Core' },
    { label: 'Posts', href: `${base}/posts`, icon: <FileText size={20} />, section: 'Core' },
    { label: 'Events', href: `${base}/events`, icon: <Calendar size={20} />, section: 'Core' },
    { label: 'Photos', href: `${base}/photos`, icon: <Camera size={20} />, section: 'Core' },
    { label: 'Members', href: `${base}/members`, icon: <Users size={20} />, section: 'Core' },

    // ── Operations
    { label: 'Approvals', href: `${base}/approvals`, icon: <Ticket size={20} />, section: 'Operations', minLevel: 3 },
    { label: 'Entry Control', href: `${base}/entry`, icon: <ScanLine size={20} />, section: 'Operations', minLevel: 3 },
    { label: 'Participants', href: `${base}/participants`, icon: <UserCheck size={20} />, section: 'Operations' },

    // ── Structure
    { label: 'Wings & Portfolios', href: `${base}/wings`, icon: <Network size={20} />, section: 'Structure', minLevel: 5 },
    { label: 'Chat', href: `${base}/chat`, icon: <MessageSquare size={20} />, section: 'Structure' },

    // ── Intelligence
    { label: 'Finance', href: `${base}/finance`, icon: <Wallet size={20} />, section: 'Intelligence', minLevel: 8 },
    { label: 'Analytics', href: `${base}/analytics`, icon: <BarChart3 size={20} />, section: 'Intelligence', minLevel: 8 },

    // ── System
    { label: 'Storage', href: `${base}/storage`, icon: <HardDrive size={20} />, section: 'System', minLevel: 5 },
    { label: 'Notifications', href: `${base}/notifications`, icon: <Bell size={20} />, section: 'System' },
    { label: 'Audit Logs', href: `${base}/audit-logs`, icon: <ScrollText size={20} />, section: 'System', minLevel: 8 },
    { label: 'Settings', href: `${base}/settings`, icon: <Settings size={20} />, section: 'System', minLevel: 10 },
  ];

  const visibleItems = navItems.filter(item => !item.minLevel || hierarchyLevel >= item.minLevel);

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
    <div className="flex h-screen overflow-hidden bg-primary">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-themed bg-card transition-all duration-300 lg:static lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${collapsed ? 'w-[72px]' : 'w-64'}
        `}
      >
        {/* Society branding */}
        <div className="flex items-center gap-3 border-b border-themed px-4 py-4">
          {societyLogo ? (
            <img src={societyLogo} alt={societyName} className="h-9 w-9 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500 font-bold text-sm flex-shrink-0">
              {initials}
            </div>
          )}
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary truncate">{societyName}</p>
              <p className="text-xs text-muted flex items-center gap-1">
                <Shield size={12} /> {roleName}
              </p>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex items-center justify-center h-7 w-7 rounded-md hover:bg-secondary text-muted">
            <ChevronLeft size={16} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden flex items-center justify-center h-7 w-7 rounded-md hover:bg-secondary text-muted">
            <X size={16} />
          </button>
        </div>

        {/* Mode indicator */}
        <div className={`px-3 py-2 border-b border-themed ${collapsed ? 'px-1' : ''}`}>
          <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 bg-brand-500/5 border border-brand-500/20 ${collapsed ? 'justify-center px-0' : ''}`}>
            <div className="h-2 w-2 rounded-full bg-brand-500 animate-pulse flex-shrink-0" />
            {!collapsed && <span className="text-[11px] font-semibold text-brand-500 uppercase tracking-wider">Society Mode</span>}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4 scrollbar-hide">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              {!collapsed && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{section}</p>
              )}
              <div className="space-y-0.5">
                {items.map(item => {
                  const active = isActive(item.href);
                  return (
                    <button
                      key={item.href}
                      onClick={() => router.push(item.href)}
                      className={`flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors
                        ${active ? 'bg-brand-500/10 text-brand-500' : 'text-secondary hover:bg-secondary hover:text-primary'}
                        ${collapsed ? 'justify-center px-0' : ''}
                      `}
                      title={collapsed ? item.label : undefined}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.badge !== undefined && item.badge > 0 && (
                        <span className="ml-auto text-xs bg-brand-500 text-white rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{item.badge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-themed p-2 space-y-0.5">
          <button
            onClick={() => router.push(`/society/${societyId}`)}
            className={`flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-secondary hover:bg-secondary hover:text-primary ${collapsed ? 'justify-center px-0' : ''}`}
            title={collapsed ? 'Public Page' : undefined}
          >
            <Globe size={20} />
            {!collapsed && <span>Public Page</span>}
          </button>
          <button
            onClick={() => router.push('/home')}
            className={`flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-secondary hover:bg-secondary hover:text-primary ${collapsed ? 'justify-center px-0' : ''}`}
            title={collapsed ? 'User Mode' : undefined}
          >
            <ArrowLeftRight size={20} />
            {!collapsed && <span>User Mode</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-4 border-b border-themed bg-card px-4 py-3 lg:px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden flex items-center justify-center h-9 w-9 rounded-lg hover:bg-secondary text-secondary">
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-primary truncate">{getPageTitle(pathname, base)}</h1>
          </div>
          {hierarchyLevel >= 10 && (
            <button onClick={() => router.push(`${base}/settings`)} className="flex items-center justify-center h-9 w-9 rounded-lg hover:bg-secondary text-secondary" title="Settings">
              <Settings size={20} />
            </button>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

function getPageTitle(pathname: string, base: string): string {
  const sub = pathname.replace(base, '') || '';

  if (sub.startsWith('/events/') && sub.includes('/entry/scan')) {
    return 'QR Scanner';
  }
  if (sub.startsWith('/events/') && sub.includes('/entry')) {
    return 'Entry Control';
  }

  const map: Record<string, string> = {
    '': 'Dashboard',
    '/dashboard': 'Dashboard',
    '/events': 'Events',
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
