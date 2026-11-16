'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { clearLocalAuth, syncUserFromSession } from '@/lib/client-auth';

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
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/d/.test(password)) { setError('Password must be at least 8 characters with a letter and a number'); setLoading(false); return; }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Accounts start unverified: confirm the emailed code first (FR-AUTH-04).
      window.location.href = `/verify-otp?userId=${encodeURIComponent(data.userId)}&email=${encodeURIComponent(data.email || email)}`;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F0F2F5] dark:bg-[#0B0E14] overflow-hidden transition-colors duration-300">
      <motion.div
        initial={{ y: '100vh', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 25, stiffness: 120, mass: 1 }}
        className="w-full max-w-[420px] bg-white dark:bg-[#151921] rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-10 md:p-12 relative z-10 border border-transparent dark:border-white/5"
      >
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#00AEEF]">
            Sign Up
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="space-y-6" noValidate>
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-2xl text-[13px] font-medium text-center"
              role="alert"
            >
              {error}
            </motion.div>
          )}

          <div className="space-y-4">
            <Input
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
            />

            <Input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              endIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-muted-foreground hover:text-foreground transition-colors mr-2"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              }
            />

            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              error={confirmPassword && password !== confirmPassword ? 'Passwords do not match' : undefined}
            />
          </div>

          <Button 
            type="submit" 
            loading={loading} 
            className="w-full h-14 rounded-full bg-gradient-to-r from-[#00AEEF] to-[#018ABE] hover:opacity-90 text-white text-lg font-bold shadow-lg shadow-[#00AEEF]/20 transition-all active:scale-[0.98] border-none"
          >
            Create Account
          </Button>

          <div className="relative py-2">
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-[#151921] px-4 text-[13px] font-medium text-muted-foreground transition-colors">
                Or Sign up with
              </span>
            </div>
          </div>

          <div className="flex justify-center">
            <GoogleSignInButton minimal />
          </div>
        </form>

        <div className="mt-8 text-center space-y-2">
          <p className="text-[13px] text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-[#00AEEF] font-bold hover:underline">
              Sign in
            </Link>
          </p>
          
          <button
            type="button"
            onClick={() => {
              clearLocalAuth();
              window.location.href = '/home';
            }}
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Join as Guest
          </button>
        </div>
      </motion.div>
    </div>
  );
}
