'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  User, Mail, School, LogOut, Settings, ChevronRight,
  Moon, Sun, Bell, Shield, Heart, HelpCircle, Loader2,
  ShieldCheck, LogIn, Building2, Crown, Plus, Clock, Camera
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/components/AuthProvider';

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
      setUser(JSON.parse(stored));
      // Fetch societies where this user has a role
      setLoadingSocieties(true);
      fetch('/api/my-societies')
        .then(r => r.ok ? r.json() : [])
        .then(data => setMySocieties(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setLoadingSocieties(false));
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

    // Client-side validation
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert('Image must be under 8MB');
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload/profile-picture', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();
      const updatedUser = { ...user, avatarUrl: data.data.url };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploadingAvatar(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="relative w-16 h-16 rounded-2xl shrink-0 overflow-hidden group"
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-brand-500/20 flex items-center justify-center text-xl font-bold text-brand-500">
                    {initials}
                  </div>
                )}
                {/* Camera overlay */}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploadingAvatar ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5 text-white" />
                  )}
                </div>
                {uploadingAvatar && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </div>
                )}
              </button>
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

        {/* My Societies */}
        {user && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">My Societies</h3>
              <Link href="/register-society" className="text-brand-500 text-xs font-medium flex items-center gap-1">
                <Plus className="w-3 h-3" /> Register
              </Link>
            </div>
            {loadingSocieties ? (
              <div className="card p-4 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
              </div>
            ) : mySocieties.length > 0 ? (
              <div className="space-y-2">
                {mySocieties.map((soc) => (
                  <button
                    key={soc.id + soc.role_name}
                    onClick={() => {
                      if (soc.status === 'APPROVED') {
                        router.push(`/society/${soc.id}/dashboard`);
                      }
                    }}
                    className={`w-full card p-4 flex items-center gap-3 transition-colors ${
                      soc.status !== 'APPROVED' ? 'opacity-90' : ''
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {soc.logo_url ? (
                        <img src={soc.logo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="w-5 h-5 text-brand-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <h4 className="text-primary text-sm font-medium truncate">{soc.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {soc.status === 'PENDING' ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            Pending Approval
                          </span>
                        ) : soc.status === 'REJECTED' ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-500/10 text-red-500 border border-red-500/20">
                            Rejected
                          </span>
                        ) : (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            soc.role_name === 'President' ? 'bg-amber-500/10 text-amber-600' :
                            soc.role_name === 'Vice President' ? 'bg-blue-500/10 text-blue-600' :
                            soc.role_name === 'Director' ? 'bg-purple-500/10 text-purple-600' :
                            'bg-surface-200 dark:bg-surface-700 text-muted'
                          }`}>
                            {soc.role_name}
                          </span>
                        )}
                      </div>
                      {soc.status === 'REJECTED' && soc.rejection_reason && (
                        <p className="text-[10px] text-red-400 mt-1 truncate">Reason: {soc.rejection_reason}</p>
                      )}
                    </div>
                    {soc.status === 'APPROVED' && (
                      <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
                    )}
                    {soc.status === 'PENDING' && (
                      <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <Link href="/register-society" className="w-full card p-4 flex items-center gap-3 border-2 border-dashed border-brand-500/30">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-brand-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-primary text-sm font-medium">Register a Society</p>
                  <p className="text-muted text-xs">Become a president of your own society</p>
                </div>
                <ChevronRight className="w-4 h-4 text-brand-500" />
              </Link>
            )}
          </div>
        )}

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
