'use client';

interface GoogleSignInButtonProps {
  label?: string;
  nextPath?: string;
  className?: string;
}

export function GoogleSignInButton({
  label = 'Continue with Google',
  nextPath = '/home',
  className = '',
}: GoogleSignInButtonProps) {
  const href = `/api/auth/google/start?next=${encodeURIComponent(nextPath)}`;

  return (
    <a
      href={href}
      className={`w-full h-12 rounded-xl border border-border bg-card hover:bg-accent transition-colors flex items-center justify-center gap-3 text-sm font-semibold ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-2H12z"
        />
      </svg>
      {label}
    </a>
  );
}

