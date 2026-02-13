'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, MapPin, Clock, Users, Star, Ticket, Loader2, Heart, Share2 } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface EventDetail {
  id: string;
  title: string;
  description: string;
  banner_url: string | null;
  is_paid: boolean;
  location: string;
  event_start: string;
  event_end: string;
  ticket_price: number;
  max_tickets: number;
  registration_end: string;
  category_name: string;
  society_id: string;
  society_name: string;
  society_logo: string | null;
  tickets_sold: number;
  avg_rating: number;
  rating_count: number;
  is_cancelled: boolean;
}

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { requireAuth } = useAuth();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${params.id}`)
      .then(r => r.json())
      .then(data => setEvent(data.event))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">
        Event not found
      </div>
    );
  }

  const startDate = new Date(event.event_start);
  const endDate = new Date(event.event_end);
  const spotsLeft = event.max_tickets - parseInt(String(event.tickets_sold));
  const isFree = !event.is_paid;
  const isUpcoming = new Date(event.event_start) > new Date();

  const formatDate = (d: Date) => d.toLocaleDateString('en-PK', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const formatTime = (d: Date) => d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Full banner */}
      <div className="relative h-[55vh] min-h-[340px]">
        {event.banner_url ? (
          <img src={event.banner_url} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-brand-500 via-brand-600 to-surface-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />

        {/* Top controls */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-12 z-10">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-black/30 backdrop-blur-md flex items-center justify-center text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!requireAuth('Sign in to save events to your favorites')) return;
                setIsFavorite(!isFavorite);
              }}
              className="w-10 h-10 rounded-2xl bg-black/30 backdrop-blur-md flex items-center justify-center"
            >
              <Heart className={`w-5 h-5 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-white'}`} />
            </button>
            <button className="w-10 h-10 rounded-2xl bg-black/30 backdrop-blur-md flex items-center justify-center text-white">
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
          <Link href={`/societies/${event.society_id}`} className="inline-flex items-center gap-2 mb-2 group">
            <span className="text-white/70 text-sm group-hover:text-brand-400 transition-colors">
              By {event.society_name}
            </span>
          </Link>
          <h1 className="text-3xl font-extrabold text-white leading-tight">{event.title}</h1>
        </div>
      </div>

      {/* Content - overlaps banner with rounded top */}
      <div className="relative -mt-5 rounded-t-[2rem] z-20 pt-6 pb-32" style={{ background: 'var(--bg-primary)' }}>
        {/* Quick info row */}
        <div className="px-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm mb-6">
          <div className="flex items-center gap-1.5 text-secondary">
            <Clock className="w-4 h-4 text-brand-500" />
            <span>{formatTime(startDate)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-secondary">
            <Calendar className="w-4 h-4 text-brand-500" />
            <span>{formatDate(startDate)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-secondary">
            <MapPin className="w-4 h-4 text-brand-500" />
            <span>{event.location || 'TBA'}</span>
          </div>
        </div>

        {/* Interested count */}
        <div className="px-6 flex items-center gap-3 mb-6">
          <div className="flex -space-x-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-8 h-8 rounded-full border-2 bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-[10px] font-bold text-brand-600 dark:text-brand-400"
                   style={{ borderColor: 'var(--bg-primary)' }}>
                {String.fromCharCode(65 + i)}
              </div>
            ))}
          </div>
          <span className="text-sm text-secondary">{event.tickets_sold}+ Interested</span>
        </div>

        {/* Rating */}
        {event.rating_count > 0 && (
          <div className="px-6 flex items-center gap-2 mb-6">
            <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
            <span className="font-bold text-primary">{event.avg_rating}</span>
            <span className="text-sm text-muted">({event.rating_count} ratings)</span>
          </div>
        )}

        {/* About */}
        <div className="px-6 mb-6">
          <h2 className="text-lg font-bold text-primary mb-3">About Event</h2>
          <p className="text-secondary leading-relaxed whitespace-pre-wrap text-[0.9375rem]">
            {event.description || 'No description available.'}
          </p>
        </div>

        {/* Spots info */}
        {event.max_tickets > 0 && (
          <div className="px-6 mb-6">
            <div className="card p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-500" />
                <span className="text-sm font-medium text-primary">Available Spots</span>
              </div>
              <span className={`font-bold text-sm ${spotsLeft > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                {spotsLeft > 0 ? `${spotsLeft} / ${event.max_tickets}` : 'Sold Out'}
              </span>
            </div>
          </div>
        )}

        {/* Category */}
        {event.category_name && (
          <div className="px-6 mb-6">
            <span className="chip active">{event.category_name}</span>
          </div>
        )}
      </div>

      {/* Fixed bottom buy bar */}
      {isUpcoming && spotsLeft > 0 && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-0 left-0 right-0 z-[60] px-5 py-4"
          style={{
            background: 'var(--bg-nav)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderTop: '1px solid var(--border-card)',
          }}
        >
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-muted text-xs font-medium">Price</p>
              <p className="text-primary text-2xl font-extrabold">
                {isFree ? 'Free' : `Rs. ${event.ticket_price}`}
              </p>
            </div>
            <button
              onClick={() => {
                if (!requireAuth('Sign in to buy tickets or register for events')) return;
                // TODO: ticket purchase flow
              }}
              className="btn-primary flex items-center gap-2 px-8"
            >
              <Ticket className="w-5 h-5" />
              {isFree ? 'Register Now' : 'Buy Ticket'}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
