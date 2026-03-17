'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Ticket, QrCode, Calendar, MapPin, ChevronRight, CheckCircle2, WifiOff } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getCachedTickets, type CachedTicket } from '@/lib/ticket-cache';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  society_name: string;
  society_logo: string | null;
  has_qr: boolean;
  is_paid: boolean;
  is_cancelled: boolean;
  source_type: string;
}

type BadgeVariant = 'success' | 'warning' | 'destructive';

function getStatusBadge(ticket: TicketData): { label: string; variant: BadgeVariant } | null {
  if (ticket.is_cancelled) return { label: 'Cancelled', variant: 'destructive' };
  if (ticket.status === 'APPROVED') return { label: 'Valid', variant: 'success' };
  if (ticket.status === 'PENDING') return { label: 'Pending', variant: 'warning' };
  if (ticket.status === 'REJECTED') return { label: 'Rejected', variant: 'destructive' };
  return null;
}

function TicketListItem({ ticket }: { ticket: TicketData }) {
  const badge = getStatusBadge(ticket);
  return (
    <Link href={`/tickets/${ticket.id}`}>
      <div className="rounded-xl border border-border bg-card p-4 hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-200">
        <div className="flex items-start gap-3">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 overflow-hidden bg-muted relative">
            {ticket.event_banner ? (
              <Image src={ticket.event_banner} alt="" fill className="object-cover" sizes="64px" />
            ) : (
              <Ticket className="w-6 h-6 text-brand-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-body-sm font-semibold text-foreground truncate flex-1">{ticket.event_title}</h3>
              {badge && <Badge variant={badge.variant} size="sm">{badge.label}</Badge>}
            </div>
            <p className="text-caption text-muted-foreground mt-0.5">{ticket.society_name}</p>
            <div className="flex items-center gap-3 mt-2 text-caption text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(ticket.event_start).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })}
              </span>
              {ticket.event_venue && (
                <span className="flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3" />
                  {ticket.event_venue}
                </span>
              )}
              <span className="font-mono text-[10px]">{ticket.ticket_number}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {ticket.has_qr ? (
              <QrCode className="w-5 h-5 text-brand-500" />
            ) : ticket.status === 'APPROVED' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : null}
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function TicketsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3 p-4 rounded-xl border border-border">
          <Skeleton className="w-16 h-16 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
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
        } catch {}
        setLoading(false);
        return;
      }

      try {
        const r = await fetch('/api/tickets');
        if (!r.ok) throw new Error('Failed to load tickets');
        const data = await r.json();
        setTickets(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        try {
          const cached = await getCachedTickets();
          if (cached.length > 0) {
            setCachedTickets(cached);
            setIsOffline(true);
          } else {
            setError(err instanceof Error ? err.message : 'Failed to load tickets');
          }
        } catch {
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
        <PageHeader
          title="My Tickets"
          action={
            <Badge variant="warning" size="md" className="flex items-center gap-1">
              <WifiOff className="w-3 h-3" /> Offline
            </Badge>
          }
        />
        <div className="px-4 py-1">
          <p className="text-caption text-muted-foreground mb-3">
            Showing {cachedTickets.length} cached ticket{cachedTickets.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-3">
            {cachedTickets.map((ticket, i) => (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link href={`/tickets/${ticket.id}`}>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 bg-muted">
                        <Ticket className="w-6 h-6 text-brand-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-body-sm font-semibold text-foreground truncate">{ticket.event_title}</h3>
                        <p className="text-caption text-muted-foreground mt-0.5">{ticket.society_name}</p>
                        <div className="flex items-center gap-3 mt-2 text-caption text-muted-foreground">
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
  const upcomingTickets = tickets.filter(
    (t) => new Date(t.event_start) > now && t.status !== 'CANCELLED' && t.status !== 'REJECTED' && !t.is_cancelled,
  );
  const pastTickets = tickets.filter(
    (t) => new Date(t.event_start) <= now || t.status === 'CANCELLED' || t.status === 'REJECTED' || t.is_cancelled,
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-header bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-4 pt-14 pb-3 safe-top">
          <h1 className="text-h1 text-foreground mb-4">My Tickets</h1>
          <Tabs defaultValue="upcoming">
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <div className="px-4 pb-32">
        <Tabs defaultValue="upcoming">
          <TabsContent value="upcoming">
            <div className="py-1">
              {loading ? (
                <TicketsSkeleton />
              ) : error ? (
                <ErrorState message={error} onRetry={() => window.location.reload()} />
              ) : upcomingTickets.length > 0 ? (
                <div className="space-y-3">
                  {upcomingTickets.map((ticket, i) => (
                    <motion.div
                      key={ticket.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
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
            </div>
          </TabsContent>

          <TabsContent value="past">
            <div className="py-1">
              {loading ? (
                <TicketsSkeleton />
              ) : pastTickets.length > 0 ? (
                <div className="space-y-3">
                  {pastTickets.map((ticket, i) => (
                    <motion.div
                      key={ticket.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <TicketListItem ticket={ticket} />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Ticket} message="No past tickets" />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
