'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, CalendarDays, Ticket, User } from 'lucide-react';

const navItems = [
  { href: '/home', icon: Home, label: 'Home' },
  { href: '/societies', icon: Users, label: 'Societies' },
  { href: '/timeline', icon: CalendarDays, label: 'Timeline' },
  { href: '/tickets', icon: Ticket, label: 'Tickets' },
  { href: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const pathname = usePathname();

  // Hide nav on detail pages that have their own bottom bars
  const hideOnPaths = ['/events/'];
  if (hideOnPaths.some(p => pathname.includes(p) && pathname !== '/events')) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2.5rem)] max-w-[26rem]">
      <nav
        className="flex items-center justify-around py-3 px-2 rounded-[1.75rem]"
        style={{
          background: 'var(--bg-nav)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: 'var(--shadow-nav)',
          border: '1px solid var(--border-card)',
        }}
      >
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 relative"
            >
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                  isActive
                    ? 'bg-brand-500 shadow-lg shadow-brand-500/30 scale-105'
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Icon
                  className={`w-[22px] h-[22px] transition-colors duration-200 ${
                    isActive ? 'text-white' : 'text-surface-400 dark:text-surface-500'
                  }`}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
              </div>
              <span
                className={`text-[10px] font-medium transition-colors duration-200 ${
                  isActive ? 'text-brand-500' : 'text-surface-400 dark:text-surface-500'
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
