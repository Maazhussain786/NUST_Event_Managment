'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, ScanLine, Ticket, User } from 'lucide-react';

const navItems = [
  { href: '/home', icon: Home, label: 'Home' },
  { href: '/societies', icon: Users, label: 'Societies' },
  { href: '/scan', icon: ScanLine, label: 'Scan', isCenter: true },
  { href: '/tickets', icon: Ticket, label: 'Tickets' },
  { href: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const pathname = usePathname();

  // Hide nav on detail pages that have their own bottom bars
  const hideOnPaths = ['/events/', '/scan'];
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
        {navItems.map(({ href, icon: Icon, label, isCenter }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 relative"
            >
              <div
                className={`rounded-2xl flex items-center justify-center transition-all duration-300 ${
                  isCenter
                    ? 'w-12 h-12 -mt-5 bg-brand-500 shadow-lg shadow-brand-500/40 scale-110'
                    : isActive
                      ? 'w-11 h-11 bg-brand-500 shadow-lg shadow-brand-500/30 scale-105'
                      : 'w-11 h-11 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Icon
                  className={`transition-colors duration-200 ${
                    isCenter
                      ? 'w-6 h-6 text-white'
                      : isActive
                        ? 'w-[22px] h-[22px] text-white'
                        : 'w-[22px] h-[22px] text-surface-400 dark:text-surface-500'
                  }`}
                  strokeWidth={isActive || isCenter ? 2.2 : 1.8}
                />
              </div>
              <span
                className={`text-[10px] font-medium transition-colors duration-200 ${
                  isCenter || isActive ? 'text-brand-500' : 'text-surface-400 dark:text-surface-500'
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
