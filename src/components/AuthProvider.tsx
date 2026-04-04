'use client';

import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, X, UserCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  AUTH_STATE_CHANGED_EVENT,
  clearLocalAuth,
  getLocalUser,
  syncUserFromSession,
} from '@/lib/client-auth';

interface AuthContextType {
  /** true when a user object exists in localStorage */
  isLoggedIn: boolean;
  /** Call this before any action that needs auth.
   *  Returns true if already logged-in, false if guest (and shows prompt). */
  requireAuth: (message?: string) => boolean;
  /** Re-check localStorage (call after login) */
  refreshAuth: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  requireAuth: () => false,
  refreshAuth: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptMessage, setPromptMessage] = useState('');
  const router = useRouter();

  const syncAuthState = useCallback(async () => {
    const user = await syncUserFromSession();
    setIsLoggedIn(!!user);
  }, []);

  useEffect(() => {
    void syncAuthState();

    const handleAuthChange = () => {
      setIsLoggedIn(!!getLocalUser());
    };

    window.addEventListener(AUTH_STATE_CHANGED_EVENT, handleAuthChange);
    window.addEventListener('storage', handleAuthChange);
    return () => {
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, [syncAuthState]);

  const refreshAuth = useCallback(() => {
    void syncAuthState();
  }, [syncAuthState]);

  const requireAuth = useCallback((message?: string) => {
    if (isLoggedIn || !!getLocalUser()) return true;
    setPromptMessage(message || 'Sign in to continue');
    setShowPrompt(true);
    return false;
  }, [isLoggedIn]);

  return (
    <AuthContext.Provider value={{ isLoggedIn, requireAuth, refreshAuth }}>
      {children}

      {/* Auth Prompt Modal */}
      <AnimatePresence>
        {showPrompt && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
              onClick={() => setShowPrompt(false)}
            />
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-5 bottom-8 z-[110] max-w-md mx-auto rounded-3xl p-6 shadow-2xl"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
            >
              <button
                onClick={() => setShowPrompt(false)}
                className="absolute top-4 right-4 p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5 text-muted" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-brand-500/15">
                  <UserCircle className="w-9 h-9 text-brand-500" />
                </div>
                <h3 className="mb-1 text-lg font-bold text-primary">Sign In Required</h3>
                <p className="text-secondary text-sm mb-6 leading-relaxed max-w-[260px]">
                  {promptMessage}
                </p>

                <button
                  onClick={() => { setShowPrompt(false); router.push('/login'); }}
                  className="flex items-center justify-center w-full gap-2 mb-3 btn-primary"
                >
                  <LogIn className="w-5 h-5" />
                  Sign In
                </button>
                <button
                  onClick={() => { setShowPrompt(false); router.push('/register'); }}
                  className="w-full py-3 text-sm font-medium transition-colors rounded-2xl text-brand-500 hover:bg-brand-500/5"
                >
                  Create Account
                </button>
                <button
                  onClick={() => {
                    clearLocalAuth();
                    setShowPrompt(false);
                    router.push('/home');
                  }}
                  className="mt-1 text-xs transition-colors text-muted hover:text-secondary"
                >
                  Continue as Guest
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AuthContext.Provider>
  );
}
