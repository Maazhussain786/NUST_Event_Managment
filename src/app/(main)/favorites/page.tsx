'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ArrowLeft, Users, Loader2, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface FavSociety {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  category: string;
  favorited_at: string;
}

export default function FavoritesPage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<FavSociety[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const hasUser = !!localStorage.getItem('user');
    setIsLoggedIn(hasUser);
    if (!hasUser) { setLoading(false); return; }
    fetch('/api/favorites')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setFavorites(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const removeFav = async (id: string) => {
    setFavorites(f => f.filter(s => s.id !== id));
    await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ societyId: id }),
    });
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <div className="px-5 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl" style={{ background: 'var(--bg-card)' }}>
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h1 className="text-xl font-bold text-primary">Favorites</h1>
      </div>

      <div className="px-5 pb-32">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          </div>
        ) : !isLoggedIn ? (
          <div className="text-center py-20">
            <Heart className="w-16 h-16 mx-auto text-surface-400 mb-4" />
            <h2 className="text-primary text-lg font-semibold mb-2">Sign In to See Favorites</h2>
            <p className="text-muted text-sm mb-6">Create an account to save your favorite societies.</p>
            <button onClick={() => router.push('/login')} className="btn-primary inline-flex items-center gap-2 px-6">
              <LogIn className="w-5 h-5" /> Sign In
            </button>
          </div>
        ) : favorites.length === 0 ? (
          <div className="text-center py-20">
            <Heart className="w-16 h-16 mx-auto text-surface-400 mb-4" />
            <h2 className="text-primary text-lg font-semibold mb-2">No Favorites Yet</h2>
            <p className="text-muted text-sm">Tap the heart icon on any society to add it here.</p>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            <AnimatePresence>
              {favorites.map((soc, i) => (
                <motion.div
                  key={soc.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ delay: i * 0.05 }}
                  className="card p-4 flex items-center gap-4"
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold text-brand-500 bg-brand-500/10 overflow-hidden cursor-pointer"
                    onClick={() => router.push(`/societies/${soc.id}`)}
                  >
                    {soc.logo_url ? (
                      <img src={soc.logo_url} alt={soc.name} className="w-full h-full object-cover" />
                    ) : (
                      soc.name.charAt(0)
                    )}
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/societies/${soc.id}`)}>
                    <h3 className="text-primary font-semibold truncate">{soc.name}</h3>
                    <p className="text-muted text-xs flex items-center gap-1">
                      <Users className="w-3 h-3" /> {soc.category}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFav(soc.id)}
                    className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors"
                  >
                    <Heart className="w-5 h-5 text-red-500 fill-red-500" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
