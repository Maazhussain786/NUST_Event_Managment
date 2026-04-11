'use client';

import { Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { clearLocalAuth, setLocalUser, syncUserFromSession } from '@/lib/client-auth';

const ease = [0.25, 0.1, 0.25, 1] as const;

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const queryError = searchParams.get('error');
    if (queryError) {
      setError(queryError);
    }
  }, [searchParams]);

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
      setLocalUser(data.user);
      window.location.href = '/home';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
            Welcome back!
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-6" noValidate>
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
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <div className="space-y-2">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
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
              <div className="px-2">
                <button
                  type="button"
                  onClick={() => {}} 
                  className="text-[13px] font-medium text-[#00AEEF] hover:underline"
                >
                  Forgot Password ?
                </button>
              </div>
            </div>
          </div>

          <Button 
            type="submit" 
            loading={loading} 
            className="w-full h-14 rounded-full bg-gradient-to-r from-[#00AEEF] to-[#018ABE] hover:opacity-90 text-white text-lg font-bold shadow-lg shadow-[#00AEEF]/20 transition-all active:scale-[0.98] border-none"
          >
            Sign In
          </Button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-border/50"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-[#151921] px-4 text-[13px] font-medium text-muted-foreground transition-colors">
                Or Sign in with
              </span>
            </div>
          </div>

          <div className="flex justify-center">
            <GoogleSignInButton minimal />
          </div>
        </form>

        <div className="mt-8 text-center space-y-2">
          {process.env.NODE_ENV === 'development' && (
            <details className="text-[11px] text-muted-foreground/60 cursor-pointer group">
              <summary className="hover:text-[#00AEEF] transition-colors py-1 font-medium list-none">
                Development Logins 
                <span className="ml-1 inline-block group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="p-3 bg-muted/30 dark:bg-white/5 rounded-2xl grid grid-cols-1 gap-2 mt-2 border border-border/50">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setEmail('superadmin@test.com'); setPassword('password'); }} className="px-2 py-1.5 bg-background dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 rounded-lg border border-border/50 transition-all hover:border-[#00AEEF] text-foreground font-medium">Super Admin</button>
                  <button onClick={() => { setEmail('admin@test.com'); setPassword('password'); }} className="px-2 py-1.5 bg-background dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 rounded-lg border border-border/50 transition-all hover:border-[#00AEEF] text-foreground font-medium">Admin</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setEmail('society@test.com'); setPassword('password'); }} className="px-2 py-1.5 bg-background dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 rounded-lg border border-border/50 transition-all hover:border-[#00AEEF] text-foreground font-medium">Society</button>
                  <button onClick={() => { setEmail('user@test.com'); setPassword('password'); }} className="px-2 py-1.5 bg-background dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 rounded-lg border border-border/50 transition-all hover:border-[#00AEEF] text-foreground font-medium">Student</button>
                </div>
                <button onClick={() => { setEmail('maaz.hussain@student.nust.edu.pk'); setPassword('password123'); }} className="px-2 py-1.5 bg-background dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 rounded-lg border border-border/50 transition-all hover:border-[#00AEEF] text-foreground font-medium">President (Maaz)</button>
              </div>
            </details>
          )}
          <p className="text-[13px] text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-[#00AEEF] font-bold hover:underline">
              Create account
            </Link>
          </p>
          
          <button
            type="button"
            onClick={() => {
              clearLocalAuth();
              router.push('/home');
            }}
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Join as Guest
          </button>
        </div>

        {/* Dev credentials (restored full list) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-10 pt-6 border-t border-dashed border-border">
            <details className="cursor-pointer group">
              <summary className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest list-none text-center hover:text-brand-500 transition-colors">
                Dev Logins
              </summary>
              <div className="mt-4 grid grid-cols-1 gap-2">
                {[
                  { label: 'Super Admin 1', email: 'maazhussain972@gmail.com', pw: 'maaz@123' },
                  { label: 'Super Admin 2', email: 'abduldaym786@gmail.com', pw: 'daym@123' },
                  { label: 'Super Admin 3', email: 'bilalatif23@gmail.com', pw: 'bilal@123' },
                  { label: 'Student', email: 'student1@seecs.edu.pk', pw: 'test1234' },
                  { label: 'President', email: 'president.devs@seecs.edu.pk', pw: 'president123' },
                ].map((cred) => (
                  <button
                    key={cred.email}
                    type="button"
                    onClick={() => { setEmail(cred.email); setPassword(cred.pw); }}
                    className="text-left p-3 rounded-2xl bg-[#F8FAFC] hover:bg-slate-100 transition-colors"
                  >
                    <p className="text-[11px] font-bold text-[#00AEEF]">{cred.label}</p>
                    <p className="text-[10px] text-muted-foreground">{cred.email}</p>
                  </button>
                ))}
              </div>
            </details>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginPageContent />
    </Suspense>
  );
}
