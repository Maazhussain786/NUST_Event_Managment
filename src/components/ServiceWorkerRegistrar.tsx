"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on mount.
 * This component renders nothing — it only triggers SW registration.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // In development, remove any previously installed SW/caches to avoid stale bundles.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => {
          void reg.unregister();
        });
      });

      if ("caches" in window) {
        void caches.keys().then((keys) => {
          keys
            .filter((key) => key.startsWith("nust-events-"))
            .forEach((key) => {
              void caches.delete(key);
            });
        });
      }

      return;
    }

    // Register after a short delay to avoid blocking initial render
    const timer = setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.log("[SW] Registered, scope:", reg.scope);

          // Check for updates periodically (every 60 min)
          setInterval(() => reg.update(), 60 * 60 * 1000);
        })
        .catch((err) => {
          console.warn("[SW] Registration failed:", err);
        });
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
