'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  User, Mail, School, LogOut, Settings, ChevronRight,
  Moon, Sun, Bell, Shield, Heart, HelpCircle, Loader2,
  ShieldCheck, LogIn
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/components/AuthProvider';

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  userType: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { isLoggedIn, requireAuth } = useAuth();
  const isDark = theme === 'dark';
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    document.cookie = 'auth_token=; path=/; max-age=0';
    router.push('/login');
  };

  const authGuard = (action: () => void, msg: string) => {
    return () => {
      if (requireAuth(msg)) action();
    };
  };

  const menuItems = [
    { icon: Bell, label: 'Notifications', onClick: authGuard(() => router.push('/notifications'), 'Sign in to view your notifications') },
    { icon: Heart, label: 'Favorites', onClick: authGuard(() => router.push('/favorites'), 'Sign in to see your favorites') },
    { icon: Shield, label: 'Privacy & Security', onClick: () => router.push('/privacy') },
    { icon: HelpCircle, label: 'Help & Support', onClick: () => router.push('/help') },
    { icon: Settings, label: 'Settings', onClick: () => router.push('/settings') },
  ];

  const initials = user?.fullName
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="px-5 pt-12 pb-6">
        <h1 className="text-xl font-bold text-primary mb-6">Profile</h1>

        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5"
        >
          {user ? (
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-brand-500/20 flex items-center justify-center text-xl font-bold text-brand-500">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-primary font-semibold text-lg truncate">{user.fullName}</h2>
                <p className="text-muted text-sm truncate flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {user.email}
                </p>
                {user.userType && (
                  <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 border border-brand-500/20">
                    {user.userType.replace('_', ' ')}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-surface-200 dark:bg-surface-700 flex items-center justify-center">
                <User className="w-8 h-8 text-muted" />
              </div>
              <div className="flex-1">
                <h2 className="text-primary font-semibold text-lg">Guest</h2>
                <p className="text-muted text-sm">Sign in for the full experience</p>
              </div>
              <button
                onClick={() => router.push('/login')}
                className="btn-primary flex items-center gap-1.5 px-4 py-2.5 text-sm"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            </div>
          )}
        </motion.div>
      </div>

      {/* Menu Items */}
      <div className="px-5 space-y-2">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-full card p-4 flex items-center gap-3 transition-colors"
        >
          {isDark ? <Moon className="w-5 h-5 text-brand-500" /> : <Sun className="w-5 h-5 text-brand-500" />}
          <span className="text-primary text-sm flex-1 text-left">
            {isDark ? 'Dark Mode' : 'Light Mode'}
          </span>
          <div className={`w-11 h-6 rounded-full flex items-center p-0.5 transition-colors ${isDark ? 'bg-brand-500' : 'bg-surface-300'}`}>
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </button>

      {/* Admin Panel (Super Admin only) */}
        {user?.userType === 'SUPER_ADMIN' && (
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => router.push('/admin')}
            className="w-full card p-4 flex items-center gap-3 transition-colors border-brand-500/30"
            style={{ borderWidth: 1 }}
          >
            <ShieldCheck className="w-5 h-5 text-brand-500" />
            <span className="text-brand-500 text-sm flex-1 text-left font-semibold">Admin Panel</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500 text-white font-medium">ADMIN</span>
          </motion.button>
        )}

        {menuItems.map((item, i) => (
          <motion.button
            key={item.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={item.onClick}
            className="w-full card p-4 flex items-center gap-3 transition-colors"
          >
            <item.icon className="w-5 h-5 text-brand-500" />
            <span className="text-primary text-sm flex-1 text-left">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-muted" />
          </motion.button>
        ))}

        {/* Sign In / Sign Out */}
        {user ? (
          <button
            onClick={handleLogout}
            className="w-full card p-4 flex items-center gap-3 transition-colors mt-4" style={{ borderColor: 'rgba(239,68,68,0.2)' }}
          >
            <LogOut className="w-5 h-5 text-red-500" />
            <span className="text-red-500 text-sm flex-1 text-left">Sign Out</span>
          </button>
        ) : (
          <button
            onClick={() => router.push('/login')}
            className="w-full card p-4 flex items-center gap-3 transition-colors mt-4 border-brand-500/30" style={{ borderWidth: 1 }}
          >
            <LogIn className="w-5 h-5 text-brand-500" />
            <span className="text-brand-500 text-sm flex-1 text-left font-semibold">Sign In</span>
            <ChevronRight className="w-4 h-4 text-brand-500" />
          </button>
        )}

        {/* Version */}
        <p className="text-center text-muted text-xs py-4">NUST Events v1.0.0</p>
      </div>
    </div>
  );
}
