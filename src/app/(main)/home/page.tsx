"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  Bell,
  Sparkles,
  ArrowRight,
  Ticket,
  Users,
  CalendarDays,
  ChevronRight,
  Clock,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import EventCard from "@/components/EventCard";
import { AnimatedPage } from "@/components/AnimatedPage";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface Event {
  id: string;
  title: string;
  description: string;
  banner_url: string | null;
  location: string;
  event_start: string;
  event_end: string;
  ticket_price: number;
  max_tickets: number;
  is_paid: boolean;
  category_id: string | null;
  category_name: string;
  society_id: string;
  society_name: string;
  society_logo: string | null;
  tickets_sold: number;
}

interface Category {
  id: string;
  name: string;
  description: string;
}

interface TicketPreview {
  id: string;
  event_title: string;
  event_start: string;
  event_venue?: string;
  status: string;
}

interface UserStats {
  upcomingEvents: number;
  totalTickets: number;
  pendingTickets: number;
  followedSocieties: number;
  unreadNotifications: number;
}

const ease = [0.25, 0.1, 0.25, 1] as const;

function getUserName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("user");
    if (!stored) return null;
    const user = JSON.parse(stored);
    return user.fullName?.split(" ")[0] || null;
  } catch {
    return null;
  }
}

function buildContextLine(stats: UserStats): string {
  const parts: string[] = [];
  if (stats.upcomingEvents > 0) {
    parts.push(
      `${stats.upcomingEvents} upcoming event${stats.upcomingEvents !== 1 ? "s" : ""}`,
    );
  }
  if (stats.pendingTickets > 0) {
    parts.push(
      `${stats.pendingTickets} pending ticket${stats.pendingTickets !== 1 ? "s" : ""}`,
    );
  }
  if (parts.length === 0) return "Discover events happening around you";
  return `You have ${parts.join(" and ")}`;
}

function HomeSkeleton() {
  return (
    <div className="px-4 pt-4 pb-24 space-y-6 md:px-6 lg:px-8 lg:pb-8">
      {/* Action card skeleton (Next Ticket) */}
      <div className="rounded-2xl border-2 border-border/50 bg-card p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Skeleton className="w-4 h-4 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex-1 space-y-2 mt-1">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="w-11 h-11 rounded-xl ml-3 shrink-0" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-3 gap-2.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-3 flex flex-col items-center">
            <Skeleton className="w-5 h-5 rounded-md mb-2" />
            <Skeleton className="h-6 w-10 mb-1" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>

      {/* Upcoming Events skeleton */}
      <section className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="w-7 h-7 rounded-lg" />
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3.5 p-3 rounded-xl border border-border bg-card">
              <Skeleton className="w-12 h-14 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2 py-0.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trending skeleton */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Skeleton className="w-7 h-7 rounded-lg" />
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex gap-4 overflow-hidden -mx-1 px-1 lg:grid lg:grid-cols-3 lg:overflow-visible">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="min-w-[280px] h-[180px] rounded-2xl shrink-0 lg:min-w-0" />
          ))}
        </div>
      </section>
    </div>
  );
}

export default function HomePage() {
  const [trending, setTrending] = useState<Event[]>([]);
  const [upcoming, setUpcoming] = useState<Event[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [nextTicket, setNextTicket] = useState<TicketPreview | null>(null);
  const [pendingTickets, setPendingTickets] = useState<TicketPreview[]>([]);
  const [userStats, setUserStats] = useState<UserStats>({
    upcomingEvents: 0,
    totalTickets: 0,
    pendingTickets: 0,
    followedSocieties: 0,
    unreadNotifications: 0,
  });

  const categoryOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  );

  const nowMs = Date.now();

  useEffect(() => {
    setUserName(getUserName());

    Promise.all([
      fetch("/api/events/trending").then((r) => r.json()),
      fetch("/api/events?limit=100").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ])
      .then(([trendingData, upcomingData, catData]) => {
        setTrending(trendingData.events || []);
        const events = upcomingData.events || [];
        setUpcoming(events);
        setCategories(catData.categories || []);
        setUserStats((prev) => ({ ...prev, upcomingEvents: events.length }));
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    // Fetch user's tickets for context
    if (typeof window !== "undefined" && localStorage.getItem("user")) {
      // Fetch unread notifications for badge counter
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (Array.isArray(data)) {
            const unreadNotifications = data.filter((n) => !n.is_read).length;
            setUserStats((prev) => ({ ...prev, unreadNotifications }));
          }
        })
        .catch(() => {});

      // Fetch next approved ticket
      fetch("/api/tickets?limit=1&status=APPROVED&upcoming=true")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data) && data.length > 0) {
            setNextTicket(data[0]);
          }
        })
        .catch(() => {});

      // Fetch pending tickets for action items
      fetch("/api/tickets?status=PENDING")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data)) {
            setPendingTickets(data);
            setUserStats((prev) => ({ ...prev, pendingTickets: data.length }));
          }
        })
        .catch(() => {});

      // Fetch total ticket count for quick stats
      fetch("/api/tickets")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data)) {
            setUserStats((prev) => ({ ...prev, totalTickets: data.length }));
          }
        })
        .catch(() => {});

      // Fetch followed / member societies count for quick stats
      fetch("/api/my-societies")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data)) {
            setUserStats((prev) => ({ ...prev, followedSocieties: data.length }));
          }
        })
        .catch(() => {});
    }
  }, []);

  const filteredUpcoming = upcoming.filter((e) => {
    const isUpcoming = new Date(e.event_start).getTime() >= nowMs;
    const matchesCategory =
      activeCategory === "all" ||
      e.category_id === activeCategory;
    const matchesSearch =
      !searchQuery ||
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.society_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.location?.toLowerCase().includes(searchQuery.toLowerCase());
    return isUpcoming && matchesCategory && matchesSearch;
  });

  return (
    <AnimatedPage className="min-h-screen bg-background">
      <PageHeader
        title="Home"
        greeting={
          userName
            ? { userName, contextLine: buildContextLine(userStats) }
            : undefined
        }
        action={
          <Button variant="ghost" size="icon" asChild>
            <Link href="/notifications" aria-label="Notifications">
              <div className="relative">
                <Bell className="h-5 w-5" />
                {userStats.unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-500 rounded-full text-[9px] font-bold flex items-center justify-center text-white ring-2 ring-background">
                    {userStats.unreadNotifications > 9
                      ? "9+"
                      : userStats.unreadNotifications}
                  </span>
                )}
              </div>
            </Link>
          </Button>
        }
        search={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: "Search events, societies...",
        }}
        filters={{
          items: categoryOptions,
          active: activeCategory,
          onChange: setActiveCategory,
        }}
      />

      {loading ? (
        <HomeSkeleton />
      ) : (
        <div className="px-4 pt-4 pb-24 space-y-6 md:px-6 lg:px-8 lg:space-y-8 lg:pb-8">
          {/* ═══ PRIORITY 1: Continue where you left off ═══ */}
          {nextTicket && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, ease }}
            >
              <Link href={`/tickets/${nextTicket.id}`}>
                <div className="rounded-2xl border-2 border-brand-200 dark:border-brand-900/50 bg-gradient-to-br from-brand-50 to-white dark:from-brand-950/30 dark:to-card p-4 hover:border-brand-300 dark:hover:border-brand-800 transition-all duration-200 active:scale-[0.99]">
                  <div className="flex items-center gap-1.5 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-brand-500" />
                    <span className="text-overline text-brand-600 dark:text-brand-400">
                      YOUR NEXT EVENT
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-semibold text-foreground truncate">
                        {nextTicket.event_title}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-caption text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {new Date(nextTicket.event_start).toLocaleDateString(
                            "en-PK",
                            {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="w-11 h-11 rounded-xl bg-brand-500 flex items-center justify-center shrink-0 ml-3 shadow-lg shadow-brand-500/25">
                      <ArrowRight className="w-5 h-5 text-white" />
                    </div>
                  </div>
                </div>
              </Link>
            </motion.section>
          )}

          {/* ═══ PRIORITY 2: Tickets needing action ═══ */}
          {pendingTickets.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, ease }}
            >
              <Link href="/tickets">
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 hover:border-amber-300 dark:hover:border-amber-800/50 transition-all duration-200 active:scale-[0.99]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-body-sm font-semibold text-foreground">
                          {pendingTickets.length} pending ticket
                          {pendingTickets.length !== 1 ? "s" : ""}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          Waiting for approval
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            </motion.section>
          )}

          {/* ═══ Quick Stats (logged in users) ═══ */}
          {userName && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, ease }}
              className="grid grid-cols-3 gap-2.5"
            >
              <Link
                href="/events"
                className="rounded-xl border border-border bg-card p-3 hover:border-brand-200 dark:hover:border-brand-900/40 transition-all duration-200 text-center active:scale-[0.97]"
              >
                <CalendarDays className="w-5 h-5 text-brand-500 mx-auto mb-1" />
                <p className="text-h3 text-foreground">{upcoming.length}</p>
                <p className="text-caption text-muted-foreground">Events</p>
              </Link>
              <Link
                href="/tickets"
                className="rounded-xl border border-border bg-card p-3 hover:border-brand-200 dark:hover:border-brand-900/40 transition-all duration-200 text-center active:scale-[0.97]"
              >
                <Ticket className="w-5 h-5 text-brand-500 mx-auto mb-1" />
                <p className="text-h3 text-foreground">{userStats.totalTickets}</p>
                <p className="text-caption text-muted-foreground">Tickets</p>
              </Link>
              <Link
                href="/societies"
                className="rounded-xl border border-border bg-card p-3 hover:border-brand-200 dark:hover:border-brand-900/40 transition-all duration-200 text-center active:scale-[0.97]"
              >
                <Users className="w-5 h-5 text-brand-500 mx-auto mb-1" />
                <p className="text-h3 text-foreground">{userStats.followedSocieties}</p>
                <p className="text-caption text-muted-foreground">Societies</p>
              </Link>
            </motion.section>
          )}

          {/* ═══ Guest CTA (not logged in) ═══ */}
          {!userName && !nextTicket && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, ease }}
            >
              <Link href="/events">
                <div className="rounded-2xl border border-border bg-card p-4 hover:border-brand-200 dark:hover:border-brand-900/40 transition-all duration-200 active:scale-[0.99]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-body font-semibold text-foreground">
                        Discover events at NUST
                      </p>
                      <p className="text-caption text-muted-foreground mt-0.5">
                        Browse upcoming events, workshops & shows
                      </p>
                    </div>
                    <div className="w-11 h-11 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0 ml-3">
                      <CalendarDays className="w-5 h-5 text-brand-500" />
                    </div>
                  </div>
                </div>
              </Link>
            </motion.section>
          )}

          {/* ═══ PRIORITY 3: Upcoming Events ═══ */}
          <section className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-brand-500/10 flex items-center justify-center">
                <Calendar className="w-3.5 h-3.5 text-brand-500" />
              </div>
              <h2 className="text-h3 text-foreground">Upcoming</h2>
            </div>
            {filteredUpcoming.length > 0 ? (
              <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                {filteredUpcoming.slice(0, 6).map((event, i) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.04, ease }}
                  >
                    <EventCard event={event} variant="compact" />
                  </motion.div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Calendar}
                message={`No upcoming events${activeCategory !== "all" ? " in this category" : ""}`}
              />
            )}
            {filteredUpcoming.length > 6 && (
              <div className="mt-4 text-center">
                <Link
                  href="/events"
                  className="text-brand-600 dark:text-brand-400 text-body-sm font-semibold"
                >
                  View all events →
                </Link>
              </div>
            )}
          </section>

          {/* ═══ PRIORITY 4: Trending (lowest) ═══ */}
          {trending.length > 0 && (
            <section className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-brand-500/10 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                  </div>
                  <h2 className="text-h3 text-foreground">Trending</h2>
                </div>
                <Link
                  href="/events"
                  className="text-brand-600 dark:text-brand-400 text-body-sm font-semibold flex items-center gap-0.5"
                >
                  See all <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1 snap-x snap-mandatory lg:grid lg:grid-cols-3 lg:overflow-visible">
                {trending.map((event, i) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.08, ease }}
                    className="min-w-[280px] max-w-[300px] snap-start lg:min-w-0 lg:max-w-none"
                  >
                    <EventCard event={event} variant="featured" />
                  </motion.div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AnimatedPage>
  );
}
