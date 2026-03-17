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
      <Skeleton className="h-[55vh] min-h-[340px] w-full" />
      <div className="relative -mt-5 rounded-t-4xl bg-background pt-6 pb-32 px-6 space-y-6">
        <div className="flex flex-wrap gap-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-6 w-48" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="h-16 w-full rounded-xl" />
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
      {/* Full banner */}
      <div className="relative h-[55vh] min-h-[340px]">
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
          <div className="w-full h-full bg-gradient-to-br from-brand-500 via-brand-600 to-surface-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />

        {/* Top controls */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 z-10 safe-top">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            aria-label="Go back"
            className="bg-black/30 backdrop-blur-md text-white hover:bg-black/50"
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
              className="bg-black/30 backdrop-blur-md text-white hover:bg-black/50"
            >
              <Heart className={cn('w-5 h-5', isFavorite && 'fill-red-500 text-red-500')} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Share event"
              className="bg-black/30 backdrop-blur-md text-white hover:bg-black/50"
            >
              <Share2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
          <Link href={`/societies/${event.society_id}`} className="inline-flex items-center gap-2 mb-2 group">
            <span className="text-white/70 text-sm group-hover:text-brand-400 transition-colors">
              By {event.society_name}
            </span>
          </Link>
          <h1 className="text-display text-white leading-tight">{event.title}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="relative -mt-5 rounded-t-4xl bg-background z-20 pt-6 pb-32">
        {/* Quick info */}
        <div className="px-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-body-sm mb-6">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-4 h-4 text-brand-500" />
            <span>{formatTime(startDate)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="w-4 h-4 text-brand-500" />
            <span>{formatDate(startDate)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="w-4 h-4 text-brand-500" />
            <span>{event.location || 'TBA'}</span>
          </div>
        </div>

        {/* Attendees indicator */}
        <div className="px-6 flex items-center gap-3 mb-6">
          <div className="flex -space-x-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full border-2 border-background bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-[10px] font-bold text-brand-600 dark:text-brand-400"
              >
                {String.fromCharCode(65 + i)}
              </div>
            ))}
          </div>
          <span className="text-body-sm text-muted-foreground">{event.tickets_sold}+ Interested</span>
        </div>

        {/* Rating */}
        {event.rating_count > 0 && (
          <div className="px-6 flex items-center gap-2 mb-6">
            <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
            <span className="font-bold text-foreground">{event.avg_rating}</span>
            <span className="text-body-sm text-muted-foreground">({event.rating_count} ratings)</span>
          </div>
        )}

        {/* About */}
        <div className="px-6 mb-6">
          <h2 className="text-h2 text-foreground mb-3">About Event</h2>
          <p className="text-body text-muted-foreground whitespace-pre-wrap">
            {event.description || 'No description available.'}
          </p>
        </div>

        {/* Spots info */}
        {event.max_tickets > 0 && (
          <div className="px-6 mb-6">
            <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-500" />
                <span className="text-body-sm font-medium text-foreground">Available Spots</span>
              </div>
              <span
                className={cn(
                  'font-bold text-sm',
                  spotsLeft > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-destructive',
                )}
              >
                {spotsLeft > 0 ? `${spotsLeft} / ${event.max_tickets}` : 'Sold Out'}
              </span>
            </div>
          </div>
        )}

        {/* Category */}
        {event.category_name && (
          <div className="px-6 mb-6">
            <Badge variant="default" size="lg">{event.category_name}</Badge>
          </div>
        )}
      </div>

      {/* Fixed bottom CTA */}
      {isUpcoming && spotsLeft > 0 && (
        <motion.footer
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-modal px-4 py-4 bg-background/80 backdrop-blur-2xl border-t border-border/50"
        >
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-caption text-muted-foreground font-medium">Price</p>
              <p className="text-h1 text-foreground">
                {isFree ? 'Free' : `Rs. ${event.ticket_price}`}
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => {
                if (!requireAuth('Sign in to buy tickets or register for events')) return;
              }}
            >
              <Ticket className="w-5 h-5" />
              {isFree ? 'Register Now' : 'Buy Ticket'}
            </Button>
          </div>
        </motion.footer>
      )}
    </div>
  );
}
