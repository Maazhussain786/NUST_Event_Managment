'use client';

import { Calendar, MapPin, Heart } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface EventCardProps {
  event: {
    id: string;
    title: string;
    banner_url?: string | null;
    location?: string;
    event_start: string;
    event_end?: string;
    ticket_price?: number;
    is_paid?: boolean;
    society_name?: string;
    society_logo?: string | null;
    category_name?: string;
    tickets_sold?: number;
  };
  variant?: 'default' | 'compact' | 'featured';
}

export default function EventCard({ event, variant = 'default' }: EventCardProps) {
  const isFree = !event.is_paid || !event.ticket_price;
  const date = new Date(event.event_start);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-PK', { month: 'short' }).toUpperCase();
  const timeStr = date.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });

  if (variant === 'compact') {
    return (
      <Link href={`/events/${event.id}`} className="block group">
        <div className="flex gap-3 p-3 rounded-xl border border-border bg-card hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-200">
          {/* Thumbnail */}
          <div className="w-20 h-20 rounded-xl flex-shrink-0 overflow-hidden relative">
            {event.banner_url ? (
              <Image src={event.banner_url} alt={event.title} fill className="object-cover" sizes="80px" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-white/60" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 py-0.5">
            {event.category_name && (
              <span className="text-brand-600 dark:text-brand-400 text-caption font-semibold">{event.category_name}</span>
            )}
            <h3 className="text-body-sm font-bold text-foreground truncate">{event.title}</h3>
            <div className="flex items-center gap-3 text-muted-foreground text-caption mt-1">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-brand-500" />
                {month} {day}
              </span>
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 text-brand-500" />
                {event.location || 'TBA'}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-caption text-muted-foreground">{event.society_name}</span>
              <Badge variant={isFree ? 'success' : 'default'} size="sm">
                {isFree ? 'Free' : `Rs. ${event.ticket_price}`}
              </Badge>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/events/${event.id}`} className="block group">
      <div className={cn(
        'overflow-hidden rounded-xl border border-border bg-card hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-300',
        variant === 'featured' && 'shadow-elevation-2',
      )}>
        {/* Banner */}
        <div className="relative h-48 overflow-hidden">
          {event.banner_url ? (
            <Image
              src={event.banner_url}
              alt={event.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes="(max-width: 512px) 100vw, 400px"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 flex items-center justify-center">
              <Calendar className="w-14 h-14 text-white/30" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

          {/* Date badge */}
          <div className="absolute top-3 left-3 z-10 bg-brand-500 text-white rounded-xl w-12 h-14 flex flex-col items-center justify-center shadow-lg shadow-brand-500/30">
            <span className="text-lg font-extrabold leading-none">{day}</span>
            <span className="text-[10px] font-semibold tracking-wider">{month}</span>
          </div>

          {/* Favorite */}
          <button
            className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-brand-500/80 transition-colors"
            onClick={(e) => { e.preventDefault(); }}
            aria-label="Add to favorites"
          >
            <Heart className="w-4 h-4 text-white" />
          </button>

          {/* Title overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
            <h3 className="text-white font-bold text-lg leading-tight drop-shadow-lg">{event.title}</h3>
            <div className="flex items-center gap-1 mt-1">
              <Calendar className="w-3 h-3 text-brand-300" />
              <span className="text-white/80 text-xs">{timeStr}</span>
            </div>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar size="sm" className="w-6 h-6">
              {event.society_logo ? (
                <AvatarImage src={event.society_logo} alt={event.society_name || ''} />
              ) : null}
              <AvatarFallback className="text-[10px]">
                {event.society_name?.[0] || 'S'}
              </AvatarFallback>
            </Avatar>
            <span className="text-caption text-muted-foreground truncate">{event.society_name}</span>
          </div>
          <Badge variant={isFree ? 'success' : 'default'} size="md">
            {isFree ? 'Free' : `Rs. ${event.ticket_price}`}
          </Badge>
        </div>
      </div>
    </Link>
  );
}
