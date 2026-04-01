'use client';

import { Calendar, MapPin, Heart, Flame, Clock, Users } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
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
    max_tickets?: number;
    is_paid?: boolean;
    society_name?: string;
    society_logo?: string | null;
    category_name?: string;
    tickets_sold?: number;
  };
  variant?: 'default' | 'compact' | 'featured';
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const target = new Date(dateStr);
  const diffMs = target.getTime() - now.getTime();
  if (diffMs < 0) return 'Past';
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 1) return 'Starting soon';
  if (diffHours < 24) return `In ${diffHours}h`;
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays} days`;
  return '';
}

function getUrgency(event: EventCardProps['event']): { text: string; level: 'warning' | 'danger' } | null {
  if (!event.max_tickets || !event.tickets_sold) return null;
  const spotsLeft = event.max_tickets - Number(event.tickets_sold);
  if (spotsLeft <= 0) return { text: 'Sold Out', level: 'danger' };
  if (spotsLeft <= 5) return { text: `Only ${spotsLeft} left`, level: 'danger' };
  if (spotsLeft <= 20) return { text: `${spotsLeft} spots left`, level: 'warning' };
  return null;
}

// Avatar stack for attendees
function AttendeeStack({ count }: { count: number }) {
  if (count <= 0) return null;
  const displayCount = Math.min(count, 3);
  const remaining = count - displayCount;

  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {Array.from({ length: displayCount }).map((_, i) => (
          <div
            key={i}
            className="w-5 h-5 rounded-full bg-muted border-2 border-card flex items-center justify-center"
          >
            <span className="text-[8px] font-medium text-muted-foreground">
              {String.fromCharCode(65 + i)}
            </span>
          </div>
        ))}
      </div>
      {remaining > 0 && (
        <span className="ml-1.5 text-caption text-muted-foreground">
          +{remaining > 99 ? '99' : remaining}
        </span>
      )}
    </div>
  );
}

export default function EventCard({ event, variant = 'default' }: EventCardProps) {
  const isFree = !event.is_paid || !event.ticket_price;
  const formattedPrice = Number(event.ticket_price || 0).toLocaleString('en-PK');
  const date = new Date(event.event_start);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-PK', { month: 'short' }).toUpperCase();
  const weekday = date.toLocaleDateString('en-PK', { weekday: 'short' });
  const timeStr = date.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });
  const relativeTime = getRelativeTime(event.event_start);
  const urgency = getUrgency(event);
  const attendeeCount = Number(event.tickets_sold) || 0;

  /* ── Compact row variant ── */
  if (variant === 'compact') {
    return (
      <Link href={`/events/${event.id}`} className="block group h-full">
        <motion.div
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="flex h-full min-h-[110px] gap-3.5 p-3 rounded-xl bg-card border border-border hover:border-brand-200 dark:hover:border-brand-900/40 hover:shadow-elevation-1 transition-all duration-200"
        >
          {/* Date column */}
          <div className="flex flex-col items-center justify-center w-12 shrink-0">
            <span className="text-[10px] font-semibold text-brand-500 uppercase tracking-wide">{month}</span>
            <span className="text-xl font-bold text-foreground leading-none">{day}</span>
            <span className="text-[10px] text-muted-foreground">{weekday}</span>
          </div>

          {/* Divider */}
          <div className="w-px bg-border self-stretch my-1" />

          {/* Content */}
          <div className="flex-1 min-w-0 py-0.5 flex flex-col justify-between">
            <h3 className="text-body-sm font-semibold text-foreground truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
              {event.title}
            </h3>
            <div className="flex items-center gap-2 text-muted-foreground text-caption mt-1">
              {event.location && (
                <span className="flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {event.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 shrink-0" />
                {timeStr}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Avatar size="sm" className="w-4 h-4">
                  {event.society_logo ? <AvatarImage src={event.society_logo} alt={event.society_name || ''} /> : null}
                  <AvatarFallback className="text-[7px]">{event.society_name?.[0] || 'S'}</AvatarFallback>
                </Avatar>
                <span className="text-caption text-muted-foreground truncate">{event.society_name}</span>
                {attendeeCount > 0 && (
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{attendeeCount} going</span>
                )}
              </div>
              <div className="flex flex-col items-end justify-center gap-1 shrink-0 min-w-[86px]">
                {relativeTime && (
                  <span className="text-[10px] font-medium text-brand-600 dark:text-brand-400 whitespace-nowrap">{relativeTime}</span>
                )}
                <Badge variant={isFree ? 'success' : 'default'} size="sm" className="whitespace-nowrap">
                  {isFree ? 'Free' : `Rs. ${formattedPrice}`}
                </Badge>
              </div>
            </div>
          </div>
        </motion.div>
      </Link>
    );
  }

  /* ── Default / Featured banner card ── */
  return (
    <Link href={`/events/${event.id}`} className="block group">
      <motion.div
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'overflow-hidden rounded-2xl bg-card border border-border transition-all duration-200',
          variant === 'featured'
            ? 'shadow-elevation-2 hover:shadow-elevation-3'
            : 'hover:shadow-elevation-2 hover:border-brand-200 dark:hover:border-brand-900/40',
        )}
      >
        {/* Banner */}
        <div className="relative aspect-[16/9] overflow-hidden">
          {event.banner_url ? (
            <Image
              src={event.banner_url}
              alt={event.title}
              fill
              className="object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out"
              sizes="(max-width: 512px) 100vw, 400px"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />

          {/* Date chip */}
          <div className="absolute top-3 left-3 z-10">
            <div className="bg-white/95 dark:bg-surface-900/95 backdrop-blur-sm text-foreground rounded-xl px-2.5 py-1.5 flex flex-col items-center leading-none shadow-sm">
              <span className="text-[9px] font-bold text-brand-500 uppercase tracking-wider">{month}</span>
              <span className="text-base font-extrabold">{day}</span>
            </div>
          </div>

          {/* Urgency chip */}
          {urgency && (
            <div className="absolute top-3 right-3 z-10">
              <div className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold',
                urgency.level === 'danger'
                  ? 'bg-red-500/90 text-white'
                  : 'bg-amber-500/90 text-white',
              )}>
                <Flame className="w-3 h-3" />
                {urgency.text}
              </div>
            </div>
          )}

          {/* Title overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
            <h3 className="text-white font-bold text-[17px] leading-snug drop-shadow-lg line-clamp-2">{event.title}</h3>
          </div>
        </div>

        {/* Bottom meta strip */}
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar size="sm" className="w-5 h-5">
              {event.society_logo ? <AvatarImage src={event.society_logo} alt={event.society_name || ''} /> : null}
              <AvatarFallback className="text-[8px]">{event.society_name?.[0] || 'S'}</AvatarFallback>
            </Avatar>
            <span className="text-caption text-muted-foreground truncate">{event.society_name}</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-caption text-muted-foreground">{timeStr}</span>
            {attendeeCount > 0 && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <AttendeeStack count={attendeeCount} />
              </>
            )}
          </div>
          <Badge variant={isFree ? 'success' : 'default'} size="sm">
            {isFree ? 'Free' : `Rs. ${formattedPrice}`}
          </Badge>
        </div>
      </motion.div>
    </Link>
  );
}
