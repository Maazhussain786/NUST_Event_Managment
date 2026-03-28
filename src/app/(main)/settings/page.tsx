'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, Info, Database, Code, LogIn, LogOut, ChevronRight, Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { PageHeader } from '@/components/page-header';
import { Switch } from '@/components/ui/switch';
import {
  AUTH_STATE_CHANGED_EVENT,
  getLocalUser,
  logoutClient,
  syncUserFromSession,
} from '@/lib/client-auth';

interface PushPreferences {
  eventStartingSoon: boolean;
  registrationClosingSoon: boolean;
  limitedSeatsLeft: boolean;
}

const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  eventStartingSoon: true,
  registrationClosingSoon: true,
  limitedSeatsLeft: true,
};

export default function SettingsPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pushPreferences, setPushPreferences] = useState<PushPreferences>(DEFAULT_PUSH_PREFERENCES);
  const [pushPrefsLoading, setPushPrefsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoggedIn(!!getLocalUser());
    syncUserFromSession().then((user) => {
      if (!cancelled) setIsLoggedIn(!!user);
    });

    const handleAuthChanged = () => setIsLoggedIn(!!getLocalUser());
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, handleAuthChanged);
    window.addEventListener('storage', handleAuthChanged);

    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, handleAuthChanged);
      window.removeEventListener('storage', handleAuthChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn) {
      setPushPreferences(DEFAULT_PUSH_PREFERENCES);
      return () => {
        cancelled = true;
      };
    }

    const loadPreferences = async () => {
      setPushPrefsLoading(true);
      try {
        const res = await fetch('/api/push/preferences', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.preferences) {
          setPushPreferences({
            eventStartingSoon: Boolean(data.preferences.eventStartingSoon),
            registrationClosingSoon: Boolean(data.preferences.registrationClosingSoon),
            limitedSeatsLeft: Boolean(data.preferences.limitedSeatsLeft),
          });
        }
      } catch {
        // keep defaults on network failures
      } finally {
        if (!cancelled) setPushPrefsLoading(false);
      }
    };

    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const handleLogout = async () => {
    await logoutClient();
    window.location.href = '/login';
  };

  const updatePushPreference = async (
    key: keyof PushPreferences,
    value: boolean,
  ) => {
    const previous = pushPreferences;
    const next = { ...previous, [key]: value };
    setPushPreferences(next);

    try {
      const res = await fetch('/api/push/preferences', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) {
        setPushPreferences(previous);
      }
    } catch {
      setPushPreferences(previous);
    }
  };

  const aboutItems = [
    { icon: Info, label: 'Version', value: '1.0.0' },
    { icon: Database, label: 'Backend', value: 'Azure PostgreSQL' },
    { icon: Globe, label: 'Platform', value: 'NUST Islamabad' },
    { icon: Code, label: 'Framework', value: 'Next.js 14' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Settings" backButton />

      <div className="px-4 pb-32 space-y-6">
        {/* Account */}
        <div>
          <h2 className="text-overline text-muted-foreground mb-3 px-1">Account</h2>
          {isLoggedIn ? (
            <button
              onClick={handleLogout}
              className="w-full rounded-xl border border-destructive/20 bg-card p-4 flex items-center gap-3 transition-colors hover:bg-destructive/5"
            >
              <LogOut className="w-5 h-5 text-destructive" />
              <span className="text-body-sm text-destructive flex-1 text-left">Sign Out</span>
            </button>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className="w-full rounded-xl border border-border bg-card p-4 flex items-center gap-3 transition-colors hover:bg-accent"
            >
              <LogIn className="w-5 h-5 text-brand-500" />
              <span className="text-body-sm text-foreground flex-1 text-left">Sign In</span>
              <span className="text-caption text-muted-foreground">Login to your account</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Appearance */}
        <div>
          <h2 className="text-overline text-muted-foreground mb-3 px-1">Appearance</h2>
          <div
            className="w-full rounded-xl border border-border bg-card p-4 flex items-center gap-3 transition-colors hover:bg-accent cursor-pointer"
            onClick={toggleTheme}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleTheme(); }}
          >
            {isDark ? <Moon className="w-5 h-5 text-brand-500" /> : <Sun className="w-5 h-5 text-brand-500" />}
            <span className="text-body-sm text-foreground flex-1 text-left">
              {isDark ? 'Dark Mode' : 'Light Mode'}
            </span>
            <Switch checked={isDark} onCheckedChange={toggleTheme} onClick={(e) => e.stopPropagation()} aria-label="Toggle dark mode" />
          </div>
        </div>

        {/* Notifications */}
        <div>
          <h2 className="text-overline text-muted-foreground mb-3 px-1">Notifications</h2>
          <div className="space-y-2">
            {[
              { key: 'eventStartingSoon' as const, label: 'Event starts in 1 hour' },
              { key: 'registrationClosingSoon' as const, label: 'Registration closes soon' },
              { key: 'limitedSeatsLeft' as const, label: 'Limited seats left alerts' },
            ].map((item) => (
              <div
                key={item.key}
                className="w-full rounded-xl border border-border bg-card p-4 flex items-center gap-3"
              >
                <span className="text-body-sm text-foreground flex-1 text-left">{item.label}</span>
                <Switch
                  checked={pushPreferences[item.key]}
                  disabled={!isLoggedIn || pushPrefsLoading}
                  onCheckedChange={(checked) => updatePushPreference(item.key, checked)}
                  aria-label={item.label}
                />
              </div>
            ))}
            {!isLoggedIn && (
              <p className="text-caption text-muted-foreground px-1">
                Sign in to manage push reminder preferences.
              </p>
            )}
          </div>
        </div>

        {/* About */}
        <div>
          <h2 className="text-overline text-muted-foreground mb-3 px-1">About</h2>
          <div className="space-y-2">
            {aboutItems.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full rounded-xl border border-border bg-card p-4 flex items-center gap-3"
              >
                <item.icon className="w-5 h-5 text-brand-500" />
                <span className="text-body-sm text-foreground flex-1 text-left">{item.label}</span>
                <span className="text-caption text-muted-foreground">{item.value}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <p className="text-center text-caption text-muted-foreground pt-4">NUST Events v1.0.0</p>
      </div>
    </div>
  );
}
