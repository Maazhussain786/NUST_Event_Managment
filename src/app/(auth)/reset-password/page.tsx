'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/** Set a new password from the emailed link (FR-AUTH-03). */
function ResetPasswordForm() {
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return setError('Use at least 8 characters with a letter and a number');
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not reset the password');
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const input = 'w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00AEEF]/40';
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F0F2F5] p-6 dark:bg-[#0B0E14]">
      <div className="w-full max-w-[420px] rounded-[2rem] border border-transparent bg-white p-10 shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:border-white/5 dark:bg-[#151921]">
        <h1 className="mb-4 text-center text-2xl font-bold text-foreground">Set a new password</h1>
        {!token ? (
          <p className="text-center text-sm text-red-600">This link is incomplete. Request a new one from “Forgot password”.</p>
        ) : done ? (
          <>
            <p className="mb-6 text-center text-sm text-muted-foreground">Your password was changed and you were signed out everywhere else.</p>
            <Link href="/login" className="block w-full rounded-2xl bg-[#00AEEF] py-3 text-center text-sm font-semibold text-white">Sign in</Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input type="password" required autoComplete="new-password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
            <input type="password" required autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-2xl bg-[#00AEEF] py-3 text-sm font-semibold text-white hover:bg-[#0096D1] disabled:opacity-60">
              {loading ? 'Saving…' : 'Save password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
