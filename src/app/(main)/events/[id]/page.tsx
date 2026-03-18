'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, MapPin, Clock, Users, Star, Ticket, Heart, Share2 } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

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

function EventDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <Skeleton className="h-[52vh] min-h-[320px] w-full" />
      <div className="relative -mt-6 rounded-t-[2rem] bg-background pt-6 pb-28 px-5 space-y-5">
        <Skeleton className="h-7 w-56" />
        <div className="flex gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
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
      .then((r) => r.json())
      .then((data) => setEvent(data.event))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <EventDetailSkeleton />;

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-muted-foreground gap-4">
        <p className="text-h3">Event not found</p>
        <Button variant="secondary" onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  const startDate = new Date(event.event_start);
  const endDate = new Date(event.event_end);
  const spotsLeft = event.max_tickets - parseInt(String(event.tickets_sold));
  const isFree = !event.is_paid;
  const isUpcoming = startDate > new Date();

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-PK', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero banner ── */}
      <div className="relative h-[52vh] min-h-[320px]">
        {event.banner_url ? (
          <Image
            src={event.banner_url}
            alt={event.title}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-brand-400 via-brand-500 to-surface-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />

        {/* Top controls */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 z-10 safe-top">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            aria-label="Go back"
            className="bg-black/30 backdrop-blur-md text-white hover:bg-black/50 rounded-xl"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (!requireAuth('Sign in to save events to your favorites')) return;
                setIsFavorite(!isFavorite);
              }}
              aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
              className="bg-black/30 backdrop-blur-md text-white hover:bg-black/50 rounded-xl"
            >
              <Heart className={cn('w-5 h-5', isFavorite && 'fill-red-500 text-red-500')} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Share event"
              className="bg-black/30 backdrop-blur-md text-white hover:bg-black/50 rounded-xl"
            >
              <Share2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-5 z-10">
          {event.category_name && (
            <Badge variant="solid" size="md" className="mb-2">
              {event.category_name}
            </Badge>
          )}
          <h1 className="text-display text-white leading-tight">{event.title}</h1>
        </div>
      </div>

      {/* ── Content sheet ── */}
      <div className="relative -mt-6 rounded-t-[2rem] bg-background z-20 pt-6 pb-28">
        {/* Society link */}
        <Link
          href={`/societies/${event.society_id}`}
          className="mx-5 flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-brand-200 dark:hover:border-brand-900/40 transition-colors mb-5"
        >
          <Avatar size="md" className="rounded-xl">
            {event.society_logo ? <AvatarImage src={event.society_logo} alt={event.society_name} /> : null}
            <AvatarFallback className="rounded-xl text-sm font-bold">
              {event.society_name?.[0] || 'S'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-semibold text-foreground truncate">{event.society_name}</p>
            <p className="text-caption text-muted-foreground">Organizer</p>
          </div>
        </Link>

        {/* Quick info cards */}
        <div className="px-5 grid grid-cols-2 gap-2.5 mb-6">
          <div className="rounded-xl bg-card border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-brand-500" />
              <span className="text-caption text-muted-foreground">Date</span>
            </div>
            <p className="text-body-sm font-semibold text-foreground">{formatDate(startDate)}</p>
          </div>
          <div className="rounded-xl bg-card border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-brand-500" />
              <span className="text-caption text-muted-foreground">Time</span>
            </div>
            <p className="text-body-sm font-semibold text-foreground">{formatTime(startDate)} – {formatTime(endDate)}</p>
          </div>
          <div className="rounded-xl bg-card border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-brand-500" />
              <span className="text-caption text-muted-foreground">Venue</span>
            </div>
            <p className="text-body-sm font-semibold text-foreground truncate">{event.location || 'TBA'}</p>
          </div>
          <div className="rounded-xl bg-card border border-border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-brand-500" />
              <span className="text-caption text-muted-foreground">Spots</span>
            </div>
            <p className={cn(
              'text-body-sm font-semibold',
              spotsLeft > 0 ? 'text-foreground' : 'text-destructive',
            )}>
              {spotsLeft > 0 ? `${spotsLeft} left` : 'Sold Out'}
            </p>
          </div>
        </div>

        {/* Rating */}
        {event.rating_count > 0 && (
          <div className="px-5 flex items-center gap-2 mb-5">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={cn(
                    'w-4 h-4',
                    star <= Math.round(event.avg_rating)
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-border',
                  )}
                />
              ))}
            </div>
            <span className="text-body-sm font-semibold text-foreground">{event.avg_rating}</span>
            <span className="text-caption text-muted-foreground">({event.rating_count})</span>
          </div>
        )}

        {/* About */}
        <div className="px-5 mb-6">
          <h2 className="text-h3 text-foreground mb-2">About</h2>
          <p className="text-body text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {event.description || 'No description available.'}
          </p>
        </div>
      </div>

      {/* ── Fixed bottom CTA ── */}
      {isUpcoming && spotsLeft > 0 && (
        <motion.footer
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-modal px-4 py-3 glass-heavy border-t border-border/50 safe-bottom"
        >
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-caption text-muted-foreground">Price</p>
              <p className="text-h2 text-foreground">
                {isFree ? 'Free' : `Rs. ${event.ticket_price}`}
              </p>
            </div>
            <Button
              size="lg"
              className="rounded-xl px-8"
              onClick={() => {
                if (!requireAuth('Sign in to buy tickets or register for events')) return;
              }}
            >
              <Ticket className="w-5 h-5" />
              {isFree ? 'Register' : 'Get Ticket'}
            </Button>
          </div>
        </motion.footer>
      )}
    </div>
  );
}
