'use client';

import { createContext, useContext, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, X, UserCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('user');
  });
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptMessage, setPromptMessage] = useState('');
  const router = useRouter();

  const refreshAuth = useCallback(() => {
    setIsLoggedIn(!!localStorage.getItem('user'));
  }, []);

  const requireAuth = useCallback((message?: string) => {
    if (localStorage.getItem('user')) return true;
    setPromptMessage(message || 'Sign in to continue');
    setShowPrompt(true);
    return false;
  }, []);

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
                <div className="w-16 h-16 rounded-2xl bg-brand-500/15 flex items-center justify-center mb-4">
                  <UserCircle className="w-9 h-9 text-brand-500" />
                </div>
                <h3 className="text-lg font-bold text-primary mb-1">Sign In Required</h3>
                <p className="text-secondary text-sm mb-6 leading-relaxed max-w-[260px]">
                  {promptMessage}
                </p>

                <button
                  onClick={() => { setShowPrompt(false); router.push('/login'); }}
                  className="btn-primary w-full flex items-center justify-center gap-2 mb-3"
                >
                  <LogIn className="w-5 h-5" />
                  Sign In
                </button>
                <button
                  onClick={() => { setShowPrompt(false); router.push('/register'); }}
                  className="w-full py-3 rounded-2xl text-sm font-medium text-brand-500 transition-colors hover:bg-brand-500/5"
                >
                  Create Account
                </button>
                <button
                  onClick={() => setShowPrompt(false)}
                  className="mt-1 text-muted text-xs hover:text-secondary transition-colors"
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
