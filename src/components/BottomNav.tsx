'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, Ticket, User, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

const navItems: NavItem[] = [
  { href: '/home', icon: Home, label: 'Home' },
  { href: '/societies', icon: Users, label: 'Societies' },
  { href: '/tickets', icon: Ticket, label: 'Tickets' },
  { href: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const pathname = usePathname();

  // Hide on event detail pages that have their own CTA bar
  if (pathname.includes('/events/') && pathname !== '/events') return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-nav w-[calc(100%-2.5rem)] max-w-[26rem]">
      <nav
        role="navigation"
        aria-label="Main navigation"
        className="flex items-center justify-around py-2.5 px-2 rounded-3xl bg-background/75 backdrop-blur-2xl shadow-elevation-3 border border-border/50"
      >
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-col items-center gap-0.5 relative min-w-[3rem]"
            >
              <div
                className={cn(
                  'rounded-2xl w-11 h-11 flex items-center justify-center transition-all duration-300',
                  isActive
                    ? 'bg-brand-500 shadow-lg shadow-brand-500/30 scale-105'
                    : 'hover:bg-accent',
                )}
              >
                <Icon
                  className={cn(
                    'w-[22px] h-[22px] transition-colors duration-200',
                    isActive ? 'text-white' : 'text-muted-foreground',
                  )}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium transition-colors duration-200',
                  isActive ? 'text-brand-500' : 'text-muted-foreground',
                )}
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
