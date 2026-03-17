'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, RotateCcw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function VerifyOTPContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!userId) router.push('/register');
    inputs.current[0]?.focus();
  }, [userId, router]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || '';
    }
    setOtp(newOtp);
    const lastIndex = Math.min(pasted.length, 5);
    inputs.current[lastIndex]?.focus();
  };

  const handleVerify = async () => {
    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/home');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to resend code');
      }
      setOtp(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden bg-background">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-brand-500" />
          </div>
          <h1 className="text-display text-foreground">Verify Email</h1>
          <p className="text-body-sm text-muted-foreground mt-1">Enter the 6-digit code sent to your email</p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-xl text-sm mb-4"
            role="alert"
            aria-live="polite"
          >
            {error}
          </motion.div>
        )}

        {/* OTP Input */}
        <div className="flex gap-3 justify-center mb-6" onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              aria-label={`Digit ${i + 1} of 6`}
              className={cn(
                'w-12 h-14 text-center text-xl font-bold rounded-xl',
                'bg-input border-[1.5px] border-border text-foreground',
                'focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/12 focus:outline-none',
                'transition-all duration-200',
                digit && 'border-brand-500/50',
              )}
            />
          ))}
        </div>

        <Button
          onClick={handleVerify}
          loading={loading}
          disabled={otp.join('').length < 6}
          className="w-full"
          size="lg"
        >
          Verify
        </Button>

        <Button
          variant="ghost"
          onClick={handleResend}
          loading={resending}
          className="w-full mt-3"
        >
          <RotateCcw className="w-4 h-4" />
          Resend Code
        </Button>
      </motion.div>
    </div>
  );
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-2xl" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex gap-3 justify-center">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="w-12 h-14 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[3.25rem] w-full rounded-2xl" />
        </div>
      </div>
    }>
      <VerifyOTPContent />
    </Suspense>
  );
}
