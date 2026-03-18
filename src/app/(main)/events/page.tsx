'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Search, Filter } from 'lucide-react';
import EventCard from '@/components/EventCard';
import { AnimatedPage } from '@/components/AnimatedPage';
import { EmptyState } from '@/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

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
  category_name: string;
  society_id: string;
  society_name: string;
  society_logo: string | null;
  tickets_sold: number;
}

interface Category {
  id: string;
  name: string;
}

const ease = [0.25, 0.1, 0.25, 1] as const;

function groupByDate(events: Event[]): { label: string; events: Event[] }[] {
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const weekEnd = new Date(todayEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

  const today: Event[] = [];
  const thisWeek: Event[] = [];
  const later: Event[] = [];

  events.forEach((e) => {
    const d = new Date(e.event_start);
    if (d <= todayEnd) today.push(e);
    else if (d <= weekEnd) thisWeek.push(e);
    else later.push(e);
  });

  const groups: { label: string; events: Event[] }[] = [];
  if (today.length) groups.push({ label: 'Today', events: today });
  if (thisWeek.length) groups.push({ label: 'This Week', events: thisWeek });
  if (later.length) groups.push({ label: 'Coming Up', events: later });
  return groups;
}

function EventsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-3.5 p-3 rounded-xl border border-border">
          <Skeleton className="w-12 h-14 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2 py-0.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/events?limit=50').then((r) => r.json()),
      fetch('/api/categories').then((r) => r.json()),
    ])
      .then(([evData, catData]) => {
        setEvents(evData.events || []);
        setCategories(catData.categories || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = events.filter((e) => {
    const matchesCat = activeCategory === 'all' || e.category_name?.toLowerCase() === activeCategory;
    const matchesSearch =
      !searchQuery ||
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.society_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.location?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const grouped = groupByDate(filtered);
  const featured = filtered.length > 0 ? filtered[0] : null;

  return (
    <AnimatedPage className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-header bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="px-5 pt-14 pb-3 safe-top">
          <h1 className="text-h1 text-foreground mb-4">Events</h1>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-xl text-body-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all"
            />
          </div>

          {/* Category filters */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
            {[{ value: 'all', label: 'All' }, ...categories.map((c) => ({ value: c.name.toLowerCase(), label: c.name }))].map(
              (cat) => (
                <button
                  key={cat.value}
                  onClick={() => setActiveCategory(cat.value)}
                  className={cn(
                    'px-3.5 py-1.5 rounded-lg text-body-sm font-medium whitespace-nowrap transition-all duration-200',
                    activeCategory === cat.value
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  {cat.label}
                </button>
              ),
            )}
          </div>
        </div>
      </header>

      <div className="px-5 py-4 lg:py-6">
        {loading ? (
          <EventsSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState icon={CalendarDays} message="No events found" />
        ) : (
          <div className="space-y-6">
            {/* Featured event (desktop: hero, mobile: regular card) */}
            {featured && !searchQuery && activeCategory === 'all' && (
              <section className="lg:mb-2">
                <EventCard event={featured} variant="featured" />
              </section>
            )}

            {/* Date-grouped listing */}
            {grouped.map((group) => (
              <section key={group.label}>
                <h2 className="text-overline text-muted-foreground mb-2.5 px-1">{group.label}</h2>
                <div className="space-y-2.5 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3 lg:space-y-0">
                  {group.events
                    .filter((e) => !(featured && e.id === featured.id && !searchQuery && activeCategory === 'all'))
                    .map((event, i) => (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, ease }}
                      >
                        <EventCard event={event} variant="compact" />
                      </motion.div>
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}
