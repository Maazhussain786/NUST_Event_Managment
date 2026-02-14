'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Palette, Globe, Info, Database, Code, LogIn, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem('user'));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    document.cookie = 'auth_token=; path=/; max-age=0';
    window.location.href = '/login';
  };

  const sections: { title: string; items: { icon: typeof Palette; label: string; value: string; action?: () => void }[] }[] = [
    {
      title: 'Account',
      items: isLoggedIn
        ? [{ icon: LogOut, label: 'Sign Out', value: '', action: handleLogout }]
        : [{ icon: LogIn, label: 'Sign In', value: 'Login to your account', action: () => router.push('/login') }],
    },
    {
      title: 'Appearance',
      items: [
        {
          icon: Palette,
          label: 'Theme',
          value: isDark ? 'Dark' : 'Light',
          action: toggleTheme,
        },
      ],
    },
    {
      title: 'About',
      items: [
        { icon: Info, label: 'Version', value: '1.0.0' },
        { icon: Database, label: 'Backend', value: 'Azure PostgreSQL' },
        { icon: Globe, label: 'Platform', value: 'NUST Islamabad' },
        { icon: Code, label: 'Framework', value: 'Next.js 14' },
      ],
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="px-5 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl" style={{ background: 'var(--bg-card)' }}>
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h1 className="text-xl font-bold text-primary">Settings</h1>
      </div>

      <div className="px-5 pb-32 space-y-6">
        {sections.map((section, si) => (
          <div key={section.title}>
            <h2 className="text-muted text-xs font-semibold uppercase tracking-wider mb-3 px-1">
              {section.title}
            </h2>
            <div className="space-y-2">
              {section.items.map((item, i) => (
                <motion.button
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (si * 3 + i) * 0.05 }}
                  onClick={item.action}
                  className="w-full card p-4 flex items-center gap-3"
                >
                  <item.icon className="w-5 h-5 text-brand-500" />
                  <span className="text-primary text-sm flex-1 text-left">{item.label}</span>
                  <span className="text-muted text-sm">{item.value}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
