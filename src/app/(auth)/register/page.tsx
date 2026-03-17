'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Eye, EyeOff, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        localStorage.setItem('user', JSON.stringify(data.user));
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
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-brand-500/8 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-brand-500/25">
            <span className="text-2xl font-extrabold text-white">N</span>
          </div>
          <h1 className="text-display text-foreground">Create Account</h1>
          <p className="text-body-sm text-muted-foreground mt-1.5">Join the NUST Events community</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4" noValidate>
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
                className="text-muted-foreground hover:text-foreground transition-colors"
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
            <UserPlus className="w-5 h-5" />
            Create Account
          </Button>
        </form>

        <p className="text-center text-muted-foreground mt-8 text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-600 dark:text-brand-400 hover:text-brand-700 font-semibold transition-colors">
            Sign In
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
