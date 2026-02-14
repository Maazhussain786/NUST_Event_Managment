'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, AlertCircle, Mail, Users, Crown } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('No invite token provided');
      setLoading(false);
      return;
    }

    fetch(`/api/invites/${token}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error || 'Invalid invite');
          if (data.invite) setInvite(data.invite);
        } else {
          setInvite(data);
        }
      })
      .catch(() => setError('Failed to load invite'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError('');

    try {
      const r = await fetch(`/api/invites/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await r.json();

      if (!r.ok) {
        setError(data.error || 'Failed to accept invite');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/society-dashboard/${data.societyId}`);
      }, 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-primary)' }}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card p-8 text-center max-w-sm w-full"
        >
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-primary mb-2">Welcome Aboard!</h2>
          <p className="text-muted text-sm">
            You&apos;ve joined as <span className="font-semibold text-primary">{invite?.role_name}</span>.
            Redirecting to dashboard...
          </p>
        </motion.div>
      </div>
    );
  }

  if (!invite && error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-primary)' }}>
        <div className="card p-8 text-center max-w-sm w-full">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-primary mb-2">Invalid Invite</h2>
          <p className="text-muted text-sm mb-6">{error}</p>
          <button onClick={() => router.push('/home')} className="btn-primary w-full py-3 rounded-xl text-sm font-semibold">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-primary)' }}>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="card p-6 max-w-sm w-full"
      >
        {/* Society info */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-3">
            <Crown className="w-8 h-8 text-brand-500" />
          </div>
          <h2 className="text-lg font-bold text-primary">{invite?.society_name}</h2>
          {invite?.society_description && (
            <p className="text-muted text-xs mt-1 line-clamp-2">{invite.society_description}</p>
          )}
        </div>

        {/* Invite details */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-input)' }}>
            <Users className="w-5 h-5 text-brand-500 flex-shrink-0" />
            <div>
              <p className="text-muted text-xs">Role</p>
              <p className="text-primary text-sm font-semibold">{invite?.role_name}</p>
            </div>
          </div>

          {invite?.wing_name && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-input)' }}>
              <Users className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div>
                <p className="text-muted text-xs">Wing</p>
                <p className="text-primary text-sm font-medium">{invite.wing_name}</p>
              </div>
            </div>
          )}

          {invite?.portfolio_name && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-input)' }}>
              <Users className="w-5 h-5 text-purple-500 flex-shrink-0" />
              <div>
                <p className="text-muted text-xs">Portfolio</p>
                <p className="text-primary text-sm font-medium">{invite.portfolio_name}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-input)' }}>
            <Mail className="w-5 h-5 text-muted flex-shrink-0" />
            <div>
              <p className="text-muted text-xs">Invited by</p>
              <p className="text-primary text-sm font-medium">{invite?.invited_by_name}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 text-red-500 text-sm mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={accepting || invite?.status !== 'PENDING'}
          className="btn-primary w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {accepting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Accepting...
            </>
          ) : (
            'Accept Invite'
          )}
        </button>

        <button
          onClick={() => router.push('/home')}
          className="w-full py-2.5 mt-2 text-muted text-sm hover:text-primary transition-colors text-center"
        >
          Decline
        </button>
      </motion.div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    }>
      <InviteContent />
    </Suspense>
  );
}
