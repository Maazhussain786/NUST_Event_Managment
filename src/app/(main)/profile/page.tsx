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

export default function ProfilePage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { isLoggedIn, requireAuth } = useAuth();
  const isDark = theme === 'dark';
  const [user, setUser] = useState<UserProfile | null>(null);
  const [mySocieties, setMySocieties] = useState<MySociety[]>([]);
  const [loadingSocieties, setLoadingSocieties] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem('user'); }
      setLoadingSocieties(true);
      fetch('/api/my-societies')
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setMySocieties(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setLoadingSocieties(false));

      fetch('/api/me')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.user) {
            setUser(data.user);
            localStorage.setItem('user', JSON.stringify(data.user));
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    document.cookie = 'auth_token=; path=/; max-age=0';
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
      localStorage.setItem('user', JSON.stringify(updatedUser));
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

  const menuItems = [
    { icon: Bell, label: 'Notifications', onClick: authGuard(() => router.push('/notifications'), 'Sign in to view notifications') },
    { icon: Heart, label: 'Favorites', onClick: authGuard(() => router.push('/favorites'), 'Sign in to see favorites') },
    { icon: Shield, label: 'Privacy & Security', onClick: () => router.push('/privacy') },
    { icon: HelpCircle, label: 'Help & Support', onClick: () => router.push('/help') },
    { icon: Settings, label: 'Settings', onClick: () => router.push('/settings') },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header + Profile Card */}
      <div className="px-4 pt-14 pb-6 safe-top">
        <h1 className="text-h1 text-foreground mb-6">Profile</h1>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-5"
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
                <Avatar size="lg" className="w-16 h-16 rounded-2xl">
                  {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.fullName} /> : null}
                  <AvatarFallback className="rounded-2xl text-xl">{initials}</AvatarFallback>
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
                <p className="text-caption text-muted-foreground truncate flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {user.email}
                </p>
                {user.userType && (
                  <Badge variant="default" size="sm" className="mt-1">
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

      {/* Menu */}
      <div className="px-4 space-y-2">
        {/* Theme Toggle */}
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

        {/* My Societies */}
        {user && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-overline text-muted-foreground">My Societies</h3>
              <Link href="/register-society" className="text-brand-600 dark:text-brand-400 text-xs font-medium flex items-center gap-1">
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
              <div className="space-y-2">
                {mySocieties.map((soc) => (
                  <button
                    key={soc.id + soc.role_name}
                    onClick={() => {
                      if (soc.status === 'APPROVED') router.push(`/society/${soc.id}/dashboard`);
                    }}
                    className={cn(
                      'w-full rounded-xl border border-border bg-card p-4 flex items-center gap-3 transition-colors hover:bg-accent',
                      soc.status !== 'APPROVED' && 'opacity-80',
                    )}
                  >
                    <Avatar size="md" className="rounded-xl">
                      {soc.logo_url ? <AvatarImage src={soc.logo_url} alt={soc.name} /> : null}
                      <AvatarFallback className="rounded-xl">
                        <Building2 className="w-5 h-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
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
                className="w-full rounded-xl border-2 border-dashed border-brand-500/30 bg-card p-4 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-brand-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-body-sm font-medium text-foreground">Register a Society</p>
                  <p className="text-caption text-muted-foreground">Become a president of your own society</p>
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
            className="w-full rounded-xl border border-brand-500/30 bg-card p-4 flex items-center gap-3 transition-colors hover:bg-accent"
          >
            <ShieldCheck className="w-5 h-5 text-brand-500" />
            <span className="text-body-sm text-brand-600 dark:text-brand-400 flex-1 text-left font-semibold">Admin Panel</span>
            <Badge variant="default" size="sm">ADMIN</Badge>
          </button>
        )}

        {/* Menu Items */}
        {menuItems.map((item, i) => (
          <motion.button
            key={item.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={item.onClick}
            className="w-full rounded-xl border border-border bg-card p-4 flex items-center gap-3 transition-colors hover:bg-accent"
          >
            <item.icon className="w-5 h-5 text-brand-500" />
            <span className="text-body-sm text-foreground flex-1 text-left">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </motion.button>
        ))}

        {/* Sign Out / Sign In */}
        {user ? (
          <button
            onClick={handleLogout}
            className="w-full rounded-xl border border-destructive/20 bg-card p-4 flex items-center gap-3 transition-colors hover:bg-destructive/5 mt-4"
          >
            <LogOut className="w-5 h-5 text-destructive" />
            <span className="text-body-sm text-destructive flex-1 text-left">Sign Out</span>
          </button>
        ) : (
          <button
            onClick={() => router.push('/login')}
            className="w-full rounded-xl border border-brand-500/30 bg-card p-4 flex items-center gap-3 transition-colors hover:bg-accent mt-4"
          >
            <LogIn className="w-5 h-5 text-brand-500" />
            <span className="text-body-sm text-brand-600 dark:text-brand-400 flex-1 text-left font-semibold">Sign In</span>
            <ChevronRight className="w-4 h-4 text-brand-500" />
          </button>
        )}

        <p className="text-center text-caption text-muted-foreground py-4">NUST Events v1.0.0</p>
      </div>
    </div>
  );
}
