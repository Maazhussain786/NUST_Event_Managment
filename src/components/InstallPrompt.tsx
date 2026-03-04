'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA install prompt banner.
 * Shows when the browser fires `beforeinstallprompt` and the user hasn't dismissed it.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone or PWA)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    // Check if user previously dismissed
    if (localStorage.getItem('pwa-install-dismissed')) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setDeferredPrompt(null);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }, []);

  // Don't show if already installed, dismissed, or no prompt
  if (installed || dismissed || !deferredPrompt) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-[90] max-w-sm mx-auto animate-in slide-in-from-top-4">
      <div className="card p-4 shadow-xl border border-brand-500/20">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
            <Download size={20} className="text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-primary">Install NUST Events</h3>
            <p className="text-xs text-muted mt-0.5">
              Add to your home screen for quick access and offline tickets.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="btn-primary text-xs px-4 py-1.5"
              >
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="text-xs text-muted hover:text-primary transition-colors px-2 py-1.5"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted hover:text-primary transition-colors p-1"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
