'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  User, Mail, LogOut, Settings, ChevronRight,
  Moon, Sun, Bell, Shield, Heart, HelpCircle, Loader2,
  ShieldCheck, LogIn, Building2, Crown, Plus, Clock, Camera,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/components/AuthProvider';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status-badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  AUTH_STATE_CHANGED_EVENT,
  getLocalUser,
  logoutClient,
  setLocalUser,
  syncUserFromSession,
} from '@/lib/client-auth';

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  userType: string;
  avatarUrl?: string | null;
}

interface MySociety {
  id: string;
  name: string;
  logo_url: string | null;
  status: string;
  role_name: string;
  hierarchy_level: number;
  member_count: number;
  president_name?: string;
  contact_number?: string;
  rejection_reason?: string;
}

const ease = [0.25, 0.1, 0.25, 1] as const;

export default function ProfilePage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { requireAuth } = useAuth();
  const isDark = theme === 'dark';
  const [user, setUser] = useState<UserProfile | null>(null);
  const [mySocieties, setMySocieties] = useState<MySociety[]>([]);
  const [loadingSocieties, setLoadingSocieties] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const sessionUser = await syncUserFromSession();
      if (cancelled) return;

      setUser(sessionUser);
      if (!sessionUser) {
        setMySocieties([]);
        return;
      }

      setLoadingSocieties(true);
      fetch('/api/my-societies')
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (!cancelled) setMySocieties(Array.isArray(data) ? data : []);
        })
        .catch((err) => console.error('Failed to fetch societies:', err))
        .finally(() => {
          if (!cancelled) setLoadingSocieties(false);
        });

      fetch('/api/me')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.user && !cancelled) {
            setUser(data.user);
            setLocalUser(data.user);
          }
        })
        .catch((err) => console.error('Failed to fetch user:', err));
    };

    void load();

    const handleAuthChanged = () => {
      setUser(getLocalUser());
    };
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, handleAuthChanged);
    window.addEventListener('storage', handleAuthChanged);

    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, handleAuthChanged);
      window.removeEventListener('storage', handleAuthChanged);
    };
  }, []);

  const handleLogout = async () => {
    await logoutClient();
    window.location.href = '/login';
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image must be under 8MB');
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload/profile-picture', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }
      const data = await res.json();
      const updatedUser = { ...user, avatarUrl: data.data.url };
      setUser(updatedUser);
      setLocalUser(updatedUser);
      toast.success('Profile picture updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const authGuard = (action: () => void, msg: string) => {
    return () => {
      if (requireAuth(msg)) action();
    };
  };

  const initials = user?.fullName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const menuSections = [
    {
      items: [
        { icon: Bell, label: 'Notifications', onClick: authGuard(() => router.push('/notifications'), 'Sign in to view notifications') },
        { icon: Heart, label: 'Favorites', onClick: authGuard(() => router.push('/favorites'), 'Sign in to see favorites') },
      ],
    },
    {
      items: [
        { icon: Shield, label: 'Privacy & Security', onClick: () => router.push('/privacy') },
        { icon: HelpCircle, label: 'Help & Support', onClick: () => router.push('/help') },
        { icon: Settings, label: 'Settings', onClick: () => router.push('/settings') },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-8">
      {/* ── Profile header ── */}
      <div
        className="px-5 pt-6 pb-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
      >
        <h1 className="text-h1 text-foreground mb-5">Profile</h1>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ease }}
          className="rounded-2xl border border-border bg-card p-5"
        >
          {user ? (
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarUpload}
                className="hidden"
                aria-label="Upload profile picture"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="relative shrink-0 group"
                aria-label="Change profile picture"
              >
                <Avatar size="lg" className="w-16 h-16 rounded-2xl ring-2 ring-border">
                  {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.fullName} /> : null}
                  <AvatarFallback className="rounded-2xl text-xl font-bold">{initials}</AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploadingAvatar ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5 text-white" />
                  )}
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="text-h3 text-foreground truncate">{user.fullName}</h2>
                <p className="text-caption text-muted-foreground truncate mt-0.5">
                  {user.email}
                </p>
                {user.userType && (
                  <Badge variant="default" size="sm" className="mt-1.5">
                    {user.userType.replace('_', ' ')}
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Avatar size="lg" className="w-16 h-16 rounded-2xl">
                <AvatarFallback className="rounded-2xl">
                  <User className="w-8 h-8" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="text-h3 text-foreground">Guest</h2>
                <p className="text-body-sm text-muted-foreground">Sign in for the full experience</p>
              </div>
              <Button size="sm" onClick={() => router.push('/login')}>
                <LogIn className="w-4 h-4" />
                Sign In
              </Button>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Content ── */}
      <div className="px-5 space-y-5">
        {/* Theme Toggle */}
        <div
          className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 transition-colors hover:bg-accent cursor-pointer active:scale-[0.99]"
          onClick={toggleTheme}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleTheme(); }}
        >
          <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
            {isDark ? <Moon className="w-4.5 h-4.5 text-brand-500" /> : <Sun className="w-4.5 h-4.5 text-brand-500" />}
          </div>
          <span className="text-body-sm text-foreground flex-1 text-left font-medium">
            {isDark ? 'Dark Mode' : 'Light Mode'}
          </span>
          <Switch checked={isDark} onCheckedChange={toggleTheme} onClick={(e) => e.stopPropagation()} aria-label="Toggle dark mode" />
        </div>

        {/* My Societies */}
        {user && (
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <h3 className="text-overline text-muted-foreground">My Societies</h3>
              <Link href="/register-society" className="text-brand-600 dark:text-brand-400 text-xs font-semibold flex items-center gap-1">
                <Plus className="w-3 h-3" /> Register
              </Link>
            </div>
            {loadingSocieties ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              </div>
            ) : mySocieties.length > 0 ? (
              <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                {mySocieties.map((soc) => (
                  <button
                    key={soc.id}
                    onClick={() => {
                      if (soc.status === 'APPROVED') router.push(`/society/${soc.id}/dashboard`);
                    }}
                    className={cn(
                      'w-full px-4 py-3.5 flex items-center gap-3 transition-colors hover:bg-accent text-left',
                      soc.status !== 'APPROVED' && 'opacity-70',
                    )}
                  >
                    <Avatar size="md" className="rounded-xl w-10 h-10">
                      {soc.logo_url ? <AvatarImage src={soc.logo_url} alt={soc.name} /> : null}
                      <AvatarFallback className="rounded-xl text-sm font-bold">
                        {soc.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-body-sm font-medium text-foreground truncate">{soc.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {soc.status === 'APPROVED' ? (
                          <Badge
                            variant={
                              soc.role_name === 'President' ? 'warning' :
                              soc.role_name === 'Vice President' ? 'info' :
                              soc.role_name === 'Director' ? 'purple' : 'outline'
                            }
                            size="sm"
                          >
                            {soc.role_name}
                          </Badge>
                        ) : (
                          <StatusBadge status={soc.status} />
                        )}
                      </div>
                      {soc.status === 'REJECTED' && soc.rejection_reason && (
                        <p className="text-[10px] text-destructive mt-1 truncate">Reason: {soc.rejection_reason}</p>
                      )}
                    </div>
                    {soc.status === 'APPROVED' && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                    {soc.status === 'PENDING' && <Clock className="w-4 h-4 text-amber-500 shrink-0" />}
                  </button>
                ))}
              </div>
            ) : (
              <Link
                href="/register-society"
                className="w-full rounded-xl border-2 border-dashed border-brand-500/20 bg-card p-4 flex items-center gap-3 hover:border-brand-500/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-brand-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-body-sm font-medium text-foreground">Register a Society</p>
                  <p className="text-caption text-muted-foreground">Lead your own student society</p>
                </div>
                <ChevronRight className="w-4 h-4 text-brand-500" />
              </Link>
            )}
          </div>
        )}

        {/* Admin Panel */}
        {user?.userType === 'SUPER_ADMIN' && (
          <button
            onClick={() => router.push('/admin')}
            className="w-full rounded-xl border border-brand-500/20 bg-card p-4 flex items-center gap-3 transition-colors hover:bg-accent active:scale-[0.99]"
          >
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5 text-brand-500" />
            </div>
            <span className="text-body-sm text-foreground flex-1 text-left font-medium">Admin Panel</span>
            <Badge variant="default" size="sm">ADMIN</Badge>
          </button>
        )}

        {/* Menu groups */}
        {menuSections.map((section, sectionIdx) => (
          <div key={sectionIdx} className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
            {section.items.map((item, i) => (
              <motion.button
                key={item.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (sectionIdx * section.items.length + i) * 0.03, ease }}
                onClick={item.onClick}
                className="w-full px-4 py-3.5 flex items-center gap-3 transition-colors hover:bg-accent"
              >
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                  <item.icon className="w-4.5 h-4.5 text-muted-foreground" />
                </div>
                <span className="text-body-sm text-foreground flex-1 text-left font-medium">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </motion.button>
            ))}
          </div>
        ))}

        {/* Sign Out / Sign In */}
        {user ? (
          <button
            onClick={handleLogout}
            className="w-full rounded-xl bg-card border border-border p-4 flex items-center gap-3 transition-colors hover:bg-destructive/5 active:scale-[0.99]"
          >
            <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
              <LogOut className="w-4.5 h-4.5 text-destructive" />
            </div>
            <span className="text-body-sm text-destructive flex-1 text-left font-medium">Sign Out</span>
          </button>
        ) : (
          <button
            onClick={() => router.push('/login')}
            className="w-full rounded-xl border border-brand-500/20 bg-card p-4 flex items-center gap-3 transition-colors hover:bg-accent active:scale-[0.99]"
          >
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <LogIn className="w-4.5 h-4.5 text-brand-500" />
            </div>
            <span className="text-body-sm text-brand-600 dark:text-brand-400 flex-1 text-left font-semibold">Sign In</span>
            <ChevronRight className="w-4 h-4 text-brand-500" />
          </button>
        )}

        <p className="text-center text-caption text-muted-foreground py-2">NUST Events v1.0</p>
      </div>
    </div>
  );
}
