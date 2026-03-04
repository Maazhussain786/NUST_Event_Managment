'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker on mount.
 * This component renders nothing — it only triggers SW registration.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // Register after a short delay to avoid blocking initial render
    const timer = setTimeout(() => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[SW] Registered, scope:', reg.scope);

          // Check for updates periodically (every 60 min)
          setInterval(() => reg.update(), 60 * 60 * 1000);
        })
        .catch((err) => {
          console.warn('[SW] Registration failed:', err);
        });
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
