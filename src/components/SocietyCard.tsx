'use client';

import Link from 'next/link';
import { Users, Star, Heart } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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
      <div className="p-4 rounded-xl border border-border bg-card hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-200">
        <div className="flex items-start gap-4">
          {/* Logo */}
          <Avatar size="lg" className="rounded-2xl flex-shrink-0 border border-border group-hover:border-brand-300 dark:group-hover:border-brand-700 transition-colors">
            {logoUrl ? (
              <AvatarImage src={logoUrl} alt={name} className="rounded-2xl" />
            ) : null}
            <AvatarFallback className="rounded-2xl">
              <Users className="w-6 h-6" />
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-foreground text-base truncate pr-2">{name}</h3>
              <button
                className="flex-shrink-0 p-1 -m-1"
                onClick={(e) => { e.preventDefault(); }}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Heart className={cn(
                  'w-4 h-4 transition-colors',
                  isFavorite
                    ? 'text-brand-500 fill-brand-500'
                    : 'text-muted-foreground hover:text-brand-500',
                )} />
              </button>
            </div>

            {description && (
              <p className="text-body-sm text-muted-foreground mt-1 line-clamp-2">{description}</p>
            )}

            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              {school && (
                <Badge variant={isNustWide ? 'default' : 'info'} size="sm">
                  {isNustWide ? 'NUST-Wide' : school}
                </Badge>
              )}
              {memberCount !== undefined && (
                <span className="text-caption text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" /> {memberCount}
                </span>
              )}
              {rating !== undefined && rating > 0 && (
                <span className="text-caption text-muted-foreground flex items-center gap-1">
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
