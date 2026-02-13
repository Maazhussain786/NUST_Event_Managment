'use client';

import Link from 'next/link';
import { Users, Star, Heart } from 'lucide-react';

interface SocietyCardProps {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  memberCount?: number;
  rating?: number;
  school?: string;
  isNustWide?: boolean;
  isFavorite?: boolean;
}

export default function SocietyCard({
  id, name, description, logoUrl, memberCount, rating, school, isNustWide, isFavorite,
}: SocietyCardProps) {
  return (
    <Link href={`/societies/${id}`} className="block group">
      <div className="card p-4 transition-all duration-300 hover:shadow-lg">
        <div className="flex items-start gap-4">
          {/* Logo */}
          <div className="w-14 h-14 rounded-2xl bg-brand-50 dark:bg-brand-950/30 border border-brand-100 dark:border-brand-900/30
                          flex items-center justify-center flex-shrink-0 group-hover:border-brand-300 dark:group-hover:border-brand-700 transition-colors overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt={name} className="w-full h-full rounded-2xl object-cover" />
            ) : (
              <Users className="w-6 h-6 text-brand-500" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-primary text-base truncate pr-2">{name}</h3>
              <button className="flex-shrink-0" onClick={(e) => { e.preventDefault(); }}>
                <Heart className={`w-4 h-4 ${isFavorite ? 'text-brand-500 fill-brand-500' : 'text-surface-400'}`} />
              </button>
            </div>

            {description && (
              <p className="text-secondary text-sm mt-1 line-clamp-2">{description}</p>
            )}

            <div className="flex items-center gap-3 mt-2.5">
              {school && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  isNustWide
                    ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400'
                    : 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                }`}>
                  {isNustWide ? 'NUST-Wide' : school}
                </span>
              )}
              {memberCount !== undefined && (
                <span className="text-xs text-muted flex items-center gap-1">
                  <Users className="w-3 h-3" /> {memberCount}
                </span>
              )}
              {rating !== undefined && rating > 0 && (
                <span className="text-xs text-muted flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-500 fill-amber-500" /> {rating.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
