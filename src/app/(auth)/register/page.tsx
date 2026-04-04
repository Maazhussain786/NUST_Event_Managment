'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { clearLocalAuth, setLocalUser, syncUserFromSession } from '@/lib/client-auth';

const ease = [0.25, 0.1, 0.25, 1] as const;

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    syncUserFromSession().then((user) => {
      if (!cancelled && user) {
        window.location.href = '/home';
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match'); setLoading(false); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); setLoading(false); return; }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.user) {
        setLocalUser(data.user);
      }
      window.location.href = '/home';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden bg-background">
      <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-brand-500/6 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-brand-500/25">
            <span className="text-xl font-extrabold text-white">N</span>
          </div>
          <h1 className="text-display text-foreground">Create account</h1>
          <p className="text-body-sm text-muted-foreground mt-1">Join the NUST Events community</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4" noValidate>
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-destructive/8 border border-destructive/15 text-destructive px-4 py-3 rounded-xl text-[13px] font-medium"
              role="alert"
              aria-live="polite"
            >
              {error}
            </motion.div>
          )}

          <GoogleSignInButton label="Continue with Google" />

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                Or register with email
              </span>
            </div>
          </div>

          <Input
            icon={User}
            type="text"
            label="Full Name"
            placeholder="Your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
          />

          <Input
            icon={Mail}
            type="email"
            label="Email"
            placeholder="you@seecs.edu.pk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            icon={Lock}
            type={showPassword ? 'text' : 'password'}
            label="Password"
            placeholder="Min 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            endIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            }
          />

          <Input
            icon={Lock}
            type={showPassword ? 'text' : 'password'}
            label="Confirm Password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            error={confirmPassword && password !== confirmPassword ? 'Passwords do not match' : undefined}
          />

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Create Account
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>

        <p className="text-center text-muted-foreground mt-8 text-[13px]">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-600 dark:text-brand-400 hover:text-brand-700 font-semibold transition-colors">
            Sign in
          </Link>
        </p>

        <button
          type="button"
          onClick={() => {
            clearLocalAuth();
            window.location.href = '/home';
          }}
          className="w-full mt-2 text-center text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Join as Guest
        </button>
      </motion.div>
    </div>
  );
}
