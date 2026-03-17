'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
      window.location.href = '/home';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden bg-background">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-brand-500/8 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Branding */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-brand-500/25">
            <span className="text-2xl font-extrabold text-white">N</span>
          </div>
          <h1 className="text-display text-foreground">Welcome Back</h1>
          <p className="text-body-sm text-muted-foreground mt-1.5">Sign in to NUST Events</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4" noValidate>
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-xl text-sm"
              role="alert"
              aria-live="polite"
            >
              {error}
            </motion.div>
          )}

          <Input
            icon={Mail}
            type="email"
            label="Email"
            placeholder="your.email@seecs.edu.pk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            icon={Lock}
            type={showPassword ? 'text' : 'password'}
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            endIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            }
          />

          <Button type="submit" loading={loading} className="w-full" size="lg">
            <LogIn className="w-5 h-5" />
            Sign In
          </Button>
        </form>

        <p className="text-center text-muted-foreground mt-8 text-sm">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-brand-600 dark:text-brand-400 hover:text-brand-700 font-semibold transition-colors">
            Sign Up
          </Link>
        </p>

        {/* Dev credentials — only in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-6 rounded-xl p-4 bg-muted border border-border">
            <p className="text-overline text-muted-foreground mb-2">Sample Logins (Dev Only)</p>
            {[
              { label: 'Super Admin', email: 'mhussain.bscs24seecs@seecs.edu.pk', pw: 'Mobile 786' },
              { label: 'Student', email: 'student1@seecs.edu.pk', pw: 'test1234' },
              { label: 'Society President', email: 'president.devs@seecs.edu.pk', pw: 'president123' },
            ].map((cred) => (
              <button
                key={cred.email}
                type="button"
                onClick={() => { setEmail(cred.email); setPassword(cred.pw); }}
                className="w-full text-left p-2.5 rounded-lg hover:bg-accent transition-colors mb-0.5"
              >
                <p className="text-xs font-semibold text-brand-600 dark:text-brand-400">{cred.label}</p>
                <p className="text-caption text-muted-foreground">{cred.email}</p>
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
