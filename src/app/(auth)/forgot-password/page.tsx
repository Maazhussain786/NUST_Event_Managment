'use client';

import { useState } from 'react';
import Link from 'next/link';

/** Request a password-reset link (FR-AUTH-03). */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send the reset link');
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F0F2F5] p-6 dark:bg-[#0B0E14]">
      <div className="w-full max-w-[420px] rounded-[2rem] border border-transparent bg-white p-10 shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:border-white/5 dark:bg-[#151921]">
        <h1 className="mb-2 text-center text-2xl font-bold text-foreground">Forgot password</h1>
        {sent ? (
          <>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires in 30 minutes.
            </p>
            <Link href="/login" className="block text-center text-sm font-semibold text-[#00AEEF] hover:underline">Back to sign in</Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">Enter your SEECS email and we will send you a link to set a new password.</p>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@seecs.edu.pk"
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00AEEF]/40"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-2xl bg-[#00AEEF] py-3 text-sm font-semibold text-white hover:bg-[#0096D1] disabled:opacity-60">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <Link href="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">Back to sign in</Link>
          </form>
        )}
      </div>
    </div>
  );
}
