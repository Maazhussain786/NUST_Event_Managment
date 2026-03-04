'use client';

import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
          <WifiOff className="w-10 h-10 text-surface-400" />
        </div>

        <h1 className="text-xl font-bold text-primary mb-2">You&apos;re Offline</h1>
        <p className="text-sm text-secondary mb-6">
          No internet connection. Previously viewed tickets are still available in your Tickets tab.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm"
        >
          <RefreshCw size={16} />
          Try Again
        </button>

        <p className="text-xs text-muted mt-6">
          Tip: Open your tickets while online to cache them for offline access.
        </p>
      </div>
    </div>
  );
}
