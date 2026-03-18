'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CalendarDays, Users, Ticket, User, Settings, LogOut, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

const navItems: NavItem[] = [
  { href: '/home', icon: Home, label: 'Home' },
  { href: '/events', icon: CalendarDays, label: 'Events' },
  { href: '/societies', icon: Users, label: 'Societies' },
  { href: '/tickets', icon: Ticket, label: 'Tickets' },
  { href: '/profile', icon: User, label: 'Profile' },
];

interface UserInfo {
  fullName: string;
  email: string;
}

function getUserInfo(): UserInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('user');
    if (!stored) return null;
    const user = JSON.parse(stored);
    return {
      fullName: user.fullName || 'User',
      email: user.email || '',
    };
  } catch {
    return null;
  }
}

export default function DesktopSidebar() {
  const pathname = usePathname();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    setUserInfo(getUserInfo());
  }, []);

  return (
    <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-sidebar border-r border-border bg-card z-nav">
      {/* Logo */}
      <div className="px-5 pt-6 pb-6">
        <Link href="/home" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20 group-hover:shadow-brand-500/30 transition-shadow">
            <span className="text-sm font-extrabold text-white">N</span>
          </div>
          <div>
            <span className="text-h3 text-foreground block leading-tight">NUST Events</span>
            <span className="text-caption text-muted-foreground">Campus Hub</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1" aria-label="Main navigation">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-sm font-medium transition-all duration-200',
                isActive
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {/* Animated pill background */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-pill"
                  className="absolute inset-0 bg-brand-500/10 rounded-xl"
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35,
                    mass: 0.8,
                  }}
                />
              )}
              <Icon
                className={cn(
                  'relative z-10 w-5 h-5 shrink-0 transition-colors',
                  isActive ? 'text-brand-500' : 'text-muted-foreground',
                )}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span className="relative z-10">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User card at bottom */}
      <div className="px-3 pb-4 mt-auto border-t border-border pt-4">
        {userInfo ? (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">
                {userInfo.fullName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body-sm font-medium text-foreground truncate">{userInfo.fullName}</p>
              <p className="text-caption text-muted-foreground truncate">{userInfo.email}</p>
            </div>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-3 px-3 py-3 rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-colors"
          >
            <User className="w-5 h-5" />
            <span className="text-body-sm font-medium">Sign in</span>
          </Link>
        )}

        {userInfo && (
          <div className="mt-2 flex gap-1">
            <Link
              href="/profile"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
            >
              <Settings className="w-4 h-4" />
              <span className="text-caption font-medium">Settings</span>
            </Link>
            <button
              onClick={() => {
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                window.location.href = '/login';
              }}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
