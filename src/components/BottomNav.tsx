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
      className="fixed bottom-0 left-0 right-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-900 lg:hidden"
      style={{
        zIndex: 9999,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -2px 16px rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex items-center justify-around py-2 px-1 max-w-lg mx-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex flex-col items-center gap-1 py-2 px-3 rounded-xl min-w-[56px]',
                isActive
                  ? 'text-orange-500'
                  : 'text-gray-500 dark:text-gray-400 active:scale-95 transition-transform',
              )}
            >
              {/* Active indicator background */}
              {isActive && (
                <motion.div
                  layoutId="bottomnav-pill"
                  className="absolute inset-0 bg-orange-500/10 rounded-xl"
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35,
                  }}
                />
              )}

              <motion.div
                className="relative z-10"
                animate={isActive ? { scale: 1.1 } : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <Icon
                  className={cn(
                    'w-6 h-6',
                    isActive ? 'text-orange-500' : 'text-gray-500 dark:text-gray-400',
                  )}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
              </motion.div>

              <span
                className={cn(
                  'relative z-10 text-[11px] font-semibold',
                  isActive ? 'text-orange-500' : 'text-gray-500 dark:text-gray-400',
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
