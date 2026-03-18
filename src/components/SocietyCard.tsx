'use client';

import Link from 'next/link';
import { Users, Star, ChevronRight } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

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
  id, name, description, logoUrl, memberCount, rating, school, isNustWide,
}: SocietyCardProps) {
  return (
    <Link href={`/societies/${id}`} className="block group">
      <div className="p-4 rounded-xl border border-border bg-card hover:border-brand-200 dark:hover:border-brand-900/40 transition-all duration-200 active:scale-[0.99]">
        <div className="flex items-center gap-3.5">
          {/* Logo */}
          <Avatar size="lg" className="rounded-2xl flex-shrink-0 border border-border/50 w-12 h-12">
            {logoUrl ? (
              <AvatarImage src={logoUrl} alt={name} className="rounded-2xl" />
            ) : null}
            <AvatarFallback className="rounded-2xl text-sm font-bold">
              {name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-[15px] truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
              {name}
            </h3>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {school && (
                <Badge variant={isNustWide ? 'default' : 'outline'} size="sm">
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

          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-brand-500 transition-colors" />
        </div>
      </div>
    </Link>
  );
}
