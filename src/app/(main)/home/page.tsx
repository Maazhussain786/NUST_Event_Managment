'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Calendar, Bell } from 'lucide-react';
import EventCard from '@/components/EventCard';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

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
  description: string;
}

function HomeSkeleton() {
  return (
    <div className="px-4 py-5 space-y-8">
      <div>
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="flex gap-4 overflow-x-auto pb-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="min-w-[280px]">
              <Skeleton className="h-48 rounded-xl mb-3" />
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-5 w-32 mb-4" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl mb-3" />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [trending, setTrending] = useState<Event[]>([]);
  const [upcoming, setUpcoming] = useState<Event[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/events/trending').then((r) => r.json()),
      fetch('/api/events?limit=10').then((r) => r.json()),
      fetch('/api/categories').then((r) => r.json()),
    ])
      .then(([trendingData, upcomingData, catData]) => {
        setTrending(trendingData.events || []);
        setUpcoming(upcomingData.events || []);
        setCategories(catData.categories || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredUpcoming = upcoming.filter((e) => {
    const matchesCategory = activeCategory === 'all' || e.category_name?.toLowerCase() === activeCategory;
    const matchesSearch = !searchQuery || e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.society_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.location?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="NUST Events"
        subtitle="Islamabad"
        action={
          <Button variant="ghost" size="icon" asChild>
            <Link href="/notifications" aria-label="Notifications">
              <div className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-500 rounded-full text-[9px] font-bold flex items-center justify-center text-white">
                  3
                </span>
              </div>
            </Link>
          </Button>
        }
        search={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: 'Search for an event',
        }}
        filters={{
          items: [
            { value: 'all', label: 'All' },
            ...categories.map((c) => ({ value: c.name.toLowerCase(), label: c.name })),
          ],
          active: activeCategory,
          onChange: setActiveCategory,
        }}
      />

      {loading ? (
        <HomeSkeleton />
      ) : (
        <div className="px-4 py-5 space-y-8">
          {/* Trending */}
          {trending.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-brand-500" />
                  <h2 className="text-h3 text-foreground">Trending</h2>
                </div>
                <Link href="/timeline" className="text-brand-600 dark:text-brand-400 text-sm font-semibold">
                  View all
                </Link>
              </div>
              <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1">
                {trending.map((event, i) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08, ease: [0.25, 0.1, 0.25, 1] }}
                    className="min-w-[280px] max-w-[300px]"
                  >
                    <EventCard event={event} variant="featured" />
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Upcoming */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-brand-500" />
              <h2 className="text-h3 text-foreground">Upcoming</h2>
            </div>
            {filteredUpcoming.length > 0 ? (
              <div className="space-y-3">
                {filteredUpcoming.map((event, i) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, ease: [0.25, 0.1, 0.25, 1] }}
                  >
                    <EventCard event={event} variant="compact" />
                  </motion.div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Calendar}
                message={`No upcoming events${activeCategory !== 'all' ? ' in this category' : ''}`}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
