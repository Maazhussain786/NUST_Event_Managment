'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CalendarDays, Users, Ticket, User, type LucideIcon } from 'lucide-react';
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

export default function BottomNav() {
  const pathname = usePathname();

  // Hide on event detail pages that have their own CTA bar
  if (pathname?.match(/^\/events\/[^/]+$/) && pathname !== '/events') {
    return null;
  }

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-md lg:hidden z-50"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div
        className={cn(
          'w-full rounded-2xl backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.4)]',
          // Light mode
          'bg-white/90 border border-black/10',
          // Dark mode
          'dark:bg-zinc-900/80 dark:border-white/10'
        )}
      >
        <div className="flex items-center justify-between px-4 py-2">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || pathname?.startsWith(href + '/');

            return (
              <motion.div
                key={href}
                className="flex-1"
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <Link
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2',
                    isActive
                      ? 'text-brand-600 dark:text-brand-400'
                      : 'text-muted-foreground',
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="bottom-nav-active-pill"
                      className="absolute inset-0 rounded-xl border border-brand-500/30 bg-brand-500/10 dark:bg-brand-500/20"
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    />
                  )}

                  <motion.div
                    className="relative z-10"
                    animate={isActive ? { scale: 1.05 } : { scale: 1 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2.2 : 2} />
                  </motion.div>

                  <span className="relative z-10 text-[10px] font-medium leading-none">{label}</span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
