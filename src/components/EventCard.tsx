'use client';

import { Calendar, MapPin, Heart } from 'lucide-react';
import Link from 'next/link';

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
  compact?: boolean;
}

export default function EventCard({ event, compact = false }: EventCardProps) {
  const isFree = !event.is_paid || !event.ticket_price;
  const date = new Date(event.event_start);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-PK', { month: 'short' }).toUpperCase();
  const timeStr = date.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });

  if (compact) {
    return (
      <Link href={`/events/${event.id}`} className="block group">
        <div className="card flex gap-3 p-3 hover:shadow-lg transition-all">
          {/* Rounded image */}
          <div className="w-20 h-20 rounded-2xl flex-shrink-0 overflow-hidden relative">
            {event.banner_url ? (
              <img src={event.banner_url} alt={event.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-white/60" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 py-0.5">
            {event.category_name && (
              <span className="text-brand-500 text-xs font-semibold">{event.category_name}</span>
            )}
            <h3 className="text-sm font-bold text-primary truncate">{event.title}</h3>
            <div className="flex items-center gap-3 text-muted text-xs mt-1">
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
              <span className="text-xs text-muted">{event.society_name}</span>
              <span className={`text-xs font-bold ${isFree ? 'text-emerald-500' : 'text-brand-500'}`}>
                {isFree ? 'Free' : `Rs. ${event.ticket_price}`}
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/events/${event.id}`} className="block group">
      <div className="card overflow-hidden hover:shadow-lg transition-all duration-300">
        {/* Banner with large rounded corners */}
        <div className="relative h-48 overflow-hidden rounded-t-[1.25rem]">
          {event.banner_url ? (
            <img
              src={event.banner_url}
              alt={event.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 flex items-center justify-center">
              <Calendar className="w-14 h-14 text-white/40" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

          {/* Date badge - top left like the reference */}
          <div className="absolute top-3 left-3 z-10 bg-brand-500 text-white rounded-xl w-12 h-14 flex flex-col items-center justify-center shadow-lg">
            <span className="text-lg font-extrabold leading-none">{day}</span>
            <span className="text-[10px] font-semibold tracking-wider">{month}</span>
          </div>

          {/* Fav button */}
          <button
            className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center hover:bg-brand-500/80 transition-colors"
            onClick={(e) => { e.preventDefault(); }}
          >
            <Heart className="w-4 h-4 text-white" />
          </button>

          {/* Title overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
            <h3 className="text-white font-bold text-lg leading-tight drop-shadow-lg">{event.title}</h3>
            <div className="flex items-center gap-1 mt-1">
              <Calendar className="w-3 h-3 text-brand-300" />
              <span className="text-white/80 text-xs">{timeStr}</span>
            </div>
          </div>
        </div>

        {/* Bottom info strip */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {event.society_logo ? (
              <img src={event.society_logo} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-[10px] font-bold text-brand-500">
                {event.society_name?.[0]}
              </div>
            )}
            <span className="text-xs text-secondary truncate">{event.society_name}</span>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${
            isFree
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
              : 'bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400'
          }`}>
            {isFree ? 'Free' : `Rs. ${event.ticket_price}`}
          </span>
        </div>
      </div>
    </Link>
  );
}
