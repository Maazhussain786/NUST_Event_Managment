'use client';

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Small floating banner shown when the user is offline.
 * Automatically appears/disappears based on navigator.onLine.
 */
export function OfflineIndicator() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);

    // Check initial state
    update();

    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-black text-center py-1.5 px-4">
      <p className="text-xs font-medium flex items-center justify-center gap-1.5">
        <WifiOff size={13} />
        You&apos;re offline — cached content may be shown
      </p>
    </div>
  );
}
