'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsVerification) {
          router.push(`/verify-otp?userId=${data.userId}`);
          return;
        }
        throw new Error(data.error);
      }
      localStorage.setItem('user', JSON.stringify(data.user));
      // Full page reload so middleware picks up the new cookie
      // and AuthProvider re-initialises from localStorage
      window.location.href = '/home';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{ background: 'var(--bg-primary)' }}>
      {/* Subtle glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-brand-500/8 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-brand-500/25">
            <span className="text-2xl font-extrabold text-white">N</span>
          </div>
          <h1 className="text-2xl font-extrabold text-primary">Welcome Back</h1>
          <p className="text-secondary mt-1.5 text-sm">Sign in to NUST Events</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 px-4 py-3 rounded-2xl text-sm"
            >
              {error}
            </motion.div>
          )}

          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="email"
              placeholder="your.email@seecs.edu.pk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field pl-12"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field pl-12 pr-12"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Sign In
              </>
            )}
          </button>
        </form>

        <p className="text-center text-secondary mt-8 text-sm">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-brand-500 hover:text-brand-600 font-semibold transition-colors">
            Sign Up
          </Link>
        </p>

        {/* Dev sample credentials — only visible in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-6 rounded-2xl p-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-card)' }}>
            <p className="text-xs font-semibold text-muted mb-2 uppercase tracking-wider">Sample Logins (Dev Only)</p>
            <button
              type="button"
              onClick={() => { setEmail('mhussain.bscs24seecs@seecs.edu.pk'); setPassword('Mobile 786'); }}
              className="w-full text-left p-2 rounded-xl hover:bg-brand-500/5 transition-colors mb-1"
            >
              <p className="text-xs font-semibold text-brand-500">Super Admin</p>
              <p className="text-[11px] text-muted">mhussain.bscs24seecs@seecs.edu.pk</p>
            </button>
            <button
              type="button"
              onClick={() => { setEmail('student1@seecs.edu.pk'); setPassword('test1234'); }}
              className="w-full text-left p-2 rounded-xl hover:bg-brand-500/5 transition-colors mb-1"
            >
              <p className="text-xs font-semibold text-brand-500">Student</p>
              <p className="text-[11px] text-muted">student1@seecs.edu.pk</p>
            </button>
            <button
              type="button"
              onClick={() => { setEmail('president.devs@seecs.edu.pk'); setPassword('president123'); }}
              className="w-full text-left p-2 rounded-xl hover:bg-brand-500/5 transition-colors"
            >
              <p className="text-xs font-semibold text-brand-500">Society President</p>
              <p className="text-[11px] text-muted">president.devs@seecs.edu.pk</p>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
