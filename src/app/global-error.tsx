'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-background">
          <AlertTriangle className="w-16 h-16 mb-4 text-amber-500" />
          <h2 className="mb-2 text-2xl font-bold text-foreground">Something went wrong!</h2>
          <p className="mb-6 text-center text-muted-foreground">
            {error.message || 'An unexpected error occurred'}
          </p>
          <div className="flex gap-3">
            <Button onClick={() => reset()}>
              Try again
            </Button>
            <Button variant="outline" onClick={() => window.location.href = '/'}>
              Go home
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
