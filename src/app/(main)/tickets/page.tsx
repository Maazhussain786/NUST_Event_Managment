'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Ticket, QrCode, Calendar, MapPin, ChevronRight, CheckCircle2, WifiOff, AlertCircle, Clock, XCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getCachedTickets, type CachedTicket } from '@/lib/ticket-cache';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface TicketData {
  id: string;
  ticket_number: string;
  status: string;
  purchased_at: string;
  event_id: string;
  event_title: string;
  event_venue: string;
  event_start: string;
  event_end: string;
  event_banner: string | null;
  event_thumbnail?: string | null;
  society_name: string;
  society_logo: string | null;
  has_qr: boolean;
  is_paid: boolean;
  is_cancelled: boolean;
  source_type: string;
  rejection_reason?: string;
}

const ease = [0.25, 0.1, 0.25, 1] as const;

function getStatusConfig(ticket: TicketData) {
  const normalizedStatus = String(ticket.status || '').toUpperCase();

  if (ticket.is_cancelled) {
    return {
      variant: 'destructive' as const,
      label: 'Cancelled',
      icon: XCircle,
      borderClass: 'border-l-3 border-l-red-500',
      bgClass: '',
    };
  }
  switch (normalizedStatus) {
    case 'APPROVED':
    case 'CHECKED_IN':
      return {
        variant: 'success' as const,
        label: normalizedStatus === 'CHECKED_IN' ? 'Checked In' : 'Valid',
        icon: CheckCircle2,
        borderClass: 'border-l-3 border-l-emerald-500',
        bgClass: '',
      };
    case 'PENDING':
    case 'PENDING_VERIFICATION':
      return {
        variant: 'warning' as const,
        label: normalizedStatus === 'PENDING_VERIFICATION' ? 'Proof Needed' : 'Pending',
        icon: Clock,
        borderClass: 'border-l-3 border-l-amber-500',
        bgClass: 'bg-amber-50/50 dark:bg-amber-950/10',
      };
    case 'NEEDS_REUPLOAD':
      return {
        variant: 'warning' as const,
        label: 'Reupload Required',
        icon: AlertCircle,
        borderClass: 'border-l-3 border-l-brand-500',
        bgClass: 'bg-brand-50/50 dark:bg-brand-950/10',
      };
    case 'REJECTED':
      return {
        variant: 'destructive' as const,
        label: 'Rejected',
        icon: XCircle,
        borderClass: 'border-l-3 border-l-red-500',
        bgClass: 'bg-red-50/50 dark:bg-red-950/10',
      };
    default:
      return {
        variant: 'default' as const,
        label: normalizedStatus.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
        icon: AlertCircle,
        borderClass: '',
        bgClass: '',
      };
  }
}

function getRelativeEventTime(dateStr: string): string {
  const now = new Date();
  const target = new Date(dateStr);
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) return '';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays} days`;
  return '';
}

function TicketListItem({ ticket }: { ticket: TicketData }) {
  const [imageFailed, setImageFailed] = useState(false);
  const config = getStatusConfig(ticket);
  const StatusIcon = config.icon;
  const date = new Date(ticket.event_start);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-PK', { month: 'short' }).toUpperCase();
  const relativeTime = getRelativeEventTime(ticket.event_start);
  const isUpcoming = new Date(ticket.event_start) > new Date();
  const normalizedStatus = String(ticket.status || '').toUpperCase();
  const showQR = ticket.has_qr && (normalizedStatus === 'APPROVED' || normalizedStatus === 'CHECKED_IN');
  const previewSrc = ticket.event_banner || ticket.event_thumbnail || null;
  const showPreviewImage = Boolean(previewSrc) && !imageFailed;

  return (
    <Link href={`/tickets/${ticket.id}`}>
      <motion.div
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'rounded-xl border border-border bg-card p-4 hover:border-brand-200 dark:hover:border-brand-900/40 hover:shadow-elevation-1 transition-all duration-200',
          config.borderClass,
          config.bgClass,
        )}
      >
        <div className="flex items-center gap-3.5">
          {/* Date or image */}
          <div className="relative flex flex-col items-center justify-center flex-shrink-0 overflow-hidden w-14 h-14 rounded-xl bg-muted">
            {showPreviewImage ? (
              <Image
                src={previewSrc as string}
                alt=""
                fill
                className="object-cover"
                sizes="56px"
                unoptimized
                onError={() => setImageFailed(true)}
              />
            ) : (
              <>
                <span className="text-[9px] font-bold text-brand-500 uppercase tracking-wider">{month}</span>
                <span className="text-lg font-extrabold leading-none text-foreground">{day}</span>
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 font-semibold truncate text-body-sm text-foreground">{ticket.event_title}</h3>
              <Badge variant={config.variant} size="sm" className="shrink-0">
                {config.label}
              </Badge>
            </div>
            <p className="text-caption text-muted-foreground mt-0.5">{ticket.society_name}</p>
            <div className="flex items-center gap-3 mt-1.5 text-caption text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {date.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })}
              </span>
              {ticket.event_venue && (
                <span className="flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3" />
                  {ticket.event_venue}
                </span>
              )}
              {relativeTime && isUpcoming && (
                <span className="font-medium text-brand-600 dark:text-brand-400">{relativeTime}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {showQR ? (
              <div className="flex items-center justify-center rounded-lg w-9 h-9 bg-brand-500/10">
                <QrCode className="w-5 h-5 text-brand-500" />
              </div>
            ) : (
              <StatusIcon className={cn(
                'w-5 h-5',
                config.variant === 'success' && 'text-emerald-500',
                config.variant === 'warning' && 'text-amber-500',
                config.variant === 'destructive' && 'text-red-500',
              )} />
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>

        {/* Rejection reason */}
        {String(ticket.status || '').toUpperCase() === 'REJECTED' && ticket.rejection_reason && (
          <div className="pt-3 mt-3 border-t border-border">
            <p className="text-red-600 text-caption dark:text-red-400">
              <span className="font-medium">Reason:</span> {ticket.rejection_reason}
            </p>
          </div>
        )}
      </motion.div>
    </Link>
  );
}

function TicketsSkeleton() {
  return (
    <div className="space-y-2.5">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3.5 p-4 rounded-xl border border-border">
          <Skeleton className="flex-shrink-0 w-14 h-14 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="w-3/4 h-4" />
            <Skeleton className="w-1/2 h-3" />
            <Skeleton className="w-2/3 h-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [cachedTickets, setCachedTickets] = useState<CachedTicket[]>([]);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    const loadTickets = async () => {
      if (!navigator.onLine) {
        try {
          const cached = await getCachedTickets();
          setCachedTickets(cached);
        } catch (cacheErr) {
          console.error('Failed to load cached tickets:', cacheErr);
        }
        setLoading(false);
        return;
      }

      try {
        const r = await fetch('/api/tickets');
        const data = await r.json();

        if (!r.ok) {
          // Handle specific error cases
          if (r.status === 401) {
            setError('Please sign in to view your tickets');
          } else {
            setError(data.error || 'Failed to load tickets');
          }
          return;
        }

        setTickets(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        console.error('Tickets fetch error:', err);
        try {
          const cached = await getCachedTickets();
          if (cached.length > 0) {
            setCachedTickets(cached);
            setIsOffline(true);
          } else {
            setError(err instanceof Error ? err.message : 'Failed to load tickets');
          }
        } catch (cacheErr) {
          console.error('Failed to load cached tickets:', cacheErr);
          setError(err instanceof Error ? err.message : 'Failed to load tickets');
        }
      } finally {
        setLoading(false);
      }
    };
    loadTickets();
  }, []);

  // Offline cached view
  if (isOffline && cachedTickets.length > 0 && tickets.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-header bg-background/80 backdrop-blur-xl">
          <div
            className="px-5 pt-6 pb-3"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
          >
            <div className="flex items-center justify-between">
              <h1 className="text-h1 text-foreground">My Tickets</h1>
              <Badge variant="warning" size="md" className="flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Offline
              </Badge>
            </div>
          </div>
        </header>
        <div className="px-5 py-1 pb-24 lg:pb-8">
          <p className="mb-3 text-caption text-muted-foreground">
            Showing {cachedTickets.length} cached ticket{cachedTickets.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2.5">
            {cachedTickets.map((ticket, i) => (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, ease }}
              >
                <Link href={`/tickets/${ticket.id}`}>
                  <div className="p-4 border rounded-xl border-border bg-card">
                    <div className="flex items-start gap-3.5">
                      <div className="flex items-center justify-center w-14 h-14 rounded-xl shrink-0 bg-muted">
                        <Ticket className="w-6 h-6 text-brand-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate text-body-sm text-foreground">{ticket.event_title}</h3>
                        <p className="text-caption text-muted-foreground mt-0.5">{ticket.society_name}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-caption text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(ticket.event_date).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })}
                          </span>
                          {ticket.event_venue && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3" />
                              {ticket.event_venue}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {ticket.qr_data && <QrCode className="w-5 h-5 text-brand-500" />}
                        <WifiOff className="w-4 h-4 text-amber-500" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const now = new Date();
  const upcomingTickets = tickets.filter((t) => {
    const normalizedStatus = String(t.status || '').toUpperCase();
    return new Date(t.event_start) > now && normalizedStatus !== 'CANCELLED' && normalizedStatus !== 'REJECTED' && !t.is_cancelled;
  });
  const pastTickets = tickets.filter((t) => {
    const normalizedStatus = String(t.status || '').toUpperCase();
    return new Date(t.event_start) <= now || normalizedStatus === 'CANCELLED' || normalizedStatus === 'REJECTED' || t.is_cancelled;
  });

  return (
    <div className="min-h-screen bg-background">
      <Tabs defaultValue="upcoming">
        <header className="sticky top-0 z-header bg-background/80 backdrop-blur-xl">
          <div
            className="px-5 pt-6 pb-3"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
          >
            <h1 className="mb-4 text-h1 text-foreground">My Tickets</h1>
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
            </TabsList>
          </div>
        </header>

        <div className="px-5 pb-24 lg:pb-8">
          <TabsContent value="upcoming">
            {loading ? (
              <TicketsSkeleton />
            ) : error ? (
              <ErrorState message={error} onRetry={() => window.location.reload()} />
            ) : upcomingTickets.length > 0 ? (
              <div className="space-y-2.5">
                {upcomingTickets.map((ticket, i) => (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, ease }}
                  >
                    <TicketListItem ticket={ticket} />
                  </motion.div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Ticket}
                title="No Tickets Yet"
                message="Browse events to get your first ticket"
                action={{ label: 'Explore Events', onClick: () => (window.location.href = '/home') }}
              />
            )}
          </TabsContent>

          <TabsContent value="past">
            {loading ? (
              <TicketsSkeleton />
            ) : pastTickets.length > 0 ? (
              <div className="space-y-2.5">
                {pastTickets.map((ticket, i) => (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, ease }}
                  >
                    <TicketListItem ticket={ticket} />
                  </motion.div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Ticket} message="No past tickets" />
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
