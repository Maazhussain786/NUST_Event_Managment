'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  Calendar,
  ScrollText,
  BarChart3,
  HardDrive,
  Menu,
  X,
  LogOut,
  Shield,
  ChevronRight,
  DollarSign,
  ShieldAlert,
  ToggleLeft,
  Settings,
  AlertOctagon,
  Search,
  Activity,
  UserCog,
  GraduationCap,
  Handshake,
  Bell,
  ShieldOff,
  CalendarOff,
} from 'lucide-react';
import { logoutClient } from '@/lib/client-auth';

interface PlatformShellProps {
  user: { fullName: string; email: string };
  children: React.ReactNode;
}

const NAV_SECTIONS = [
  {
    label: 'Core',
    items: [
      { href: '/platform', label: 'Overview', icon: LayoutDashboard },
      { href: '/platform/administrators', label: 'Administrators', icon: UserCog },
      { href: '/platform/users', label: 'Users', icon: Users },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/platform/societies', label: 'Societies', icon: Building2 },
      { href: '/platform/nust-administration', label: 'NUST Administration', icon: Building2 },
      { href: '/platform/events', label: 'Events', icon: Calendar },
      { href: '/platform/university-events', label: 'University Events', icon: GraduationCap },
      { href: '/platform/cohost-requests', label: 'Co-Host Requests', icon: Handshake },
      { href: '/platform/finance', label: 'Finance', icon: DollarSign },
      { href: '/platform/storage', label: 'Storage', icon: HardDrive },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/platform/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/platform/audit-logs', label: 'Audit Logs', icon: ScrollText },
      { href: '/platform/security', label: 'Security', icon: ShieldAlert },
    ],
  },
  {
    label: 'Communication',
    items: [
      { href: '/platform/notifications', label: 'Notifications', icon: Bell },
      { href: '/platform/blackout-calendar', label: 'Blackout Calendar', icon: CalendarOff },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/platform/feature-flags', label: 'Feature Flags', icon: ToggleLeft },
      { href: '/platform/system-config', label: 'Configuration', icon: Settings },
      { href: '/platform/incidents', label: 'Incidents', icon: AlertOctagon },
      { href: '/platform/emergency', label: 'Emergency', icon: ShieldOff },
      { href: '/platform/health', label: 'Health', icon: Activity },
    ],
  },
];

export function PlatformShell({ user, children }: PlatformShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/platform') return pathname === '/platform';
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    await logoutClient();
    window.location.href = '/login';
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 flex flex-col
          transform transition-transform duration-200 ease-in-out
          lg:relative lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ background: 'var(--bg-card)', borderRight: '1px solid var(--border-primary)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between h-16 px-5"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                NUST Platform
              </span>
              <p
                className="text-[10px] font-medium tracking-wide uppercase"
                style={{ color: 'var(--text-muted)' }}
              >
                Super Admin
              </p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800"
          >
            <X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p
                className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium
                        transition-all duration-150 group
                        ${
                          active
                            ? 'bg-brand-500/10 text-brand-500'
                            : 'hover:bg-surface-100 dark:hover:bg-surface-800'
                        }
                      `}
                      style={active ? undefined : { color: 'var(--text-secondary)' }}
                    >
                      <Icon className={`w-[16px] h-[16px] ${active ? 'text-brand-500' : ''}`} />
                      {label}
                      {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-brand-500" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Global Search + User & Logout */}
        <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--border-primary)' }}>
          <Link
            href="/platform/search"
            onClick={() => setSidebarOpen(false)}
            className={`
              flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium
              transition-all duration-150
              ${
                pathname === '/platform/search'
                  ? 'bg-brand-500/10 text-brand-500'
                  : 'hover:bg-surface-100 dark:hover:bg-surface-800'
              }
            `}
            style={pathname === '/platform/search' ? undefined : { color: 'var(--text-secondary)' }}
          >
            <Search className="w-4 h-4" />
            Global Search
          </Link>

          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-brand-500/15 flex items-center justify-center text-brand-500 text-xs font-bold">
              {user.fullName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {user.fullName}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {user.email}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium
              hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 transition-all duration-150"
          >
            <LogOut className="w-[16px] h-[16px]" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="flex items-center h-14 px-4 lg:px-8 shrink-0"
          style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-primary)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
          >
            <Menu className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
          </button>

          {/* Breadcrumb */}
          <div className="hidden lg:flex items-center gap-1 text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Platform</span>
            {pathname !== '/platform' && (
              <>
                <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                <span
                  className="font-medium capitalize"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {pathname
                    .split('/')
                    .filter(Boolean)
                    .slice(1)
                    .join(' / ')
                    .replace(/-/g, ' ')}
                </span>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
