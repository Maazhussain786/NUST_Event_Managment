'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Bell, TrendingUp, Calendar, Loader2, MapPin } from 'lucide-react';
import EventCard from '@/components/EventCard';
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

const CATEGORY_ICONS: Record<string, string> = {
  technology: '/icons/tech.svg',
  sports: '/icons/sports.svg',
  music: '/icons/music.svg',
};

export default function HomePage() {
  const [trending, setTrending] = useState<Event[]>([]);
  const [upcoming, setUpcoming] = useState<Event[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      const parsed = JSON.parse(user);
      setUserName(parsed.fullName?.split(' ')[0] || 'there');
    }

    Promise.all([
      fetch('/api/events/trending').then(r => r.json()),
      fetch('/api/events?limit=10').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
    ]).then(([trendingData, upcomingData, catData]) => {
      setTrending(trendingData.events || []);
      setUpcoming(upcomingData.events || []);
      setCategories(catData.categories || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredUpcoming = activeCategory === 'all'
    ? upcoming
    : upcoming.filter(e => e.category_name?.toLowerCase() === activeCategory);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-30" style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-primary)' }}>
        <div className="px-5 pt-12 pb-4">
          {/* Top row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-brand-500" />
              <span className="text-sm font-semibold text-primary">NUST, Islamabad</span>
            </div>
            <button className="relative w-10 h-10 rounded-2xl flex items-center justify-center transition-colors"
                    style={{ background: 'var(--bg-secondary)' }}>
              <Bell className="w-5 h-5 text-secondary" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-brand-500 rounded-full text-[9px] font-bold flex items-center justify-center text-white">3</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              placeholder="Search for an event"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-12 !rounded-2xl"
            />
          </div>

          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            <button
              onClick={() => setActiveCategory('all')}
              className={`chip ${activeCategory === 'all' ? 'active' : ''}`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.name.toLowerCase())}
                className={`chip ${activeCategory === cat.name.toLowerCase() ? 'active' : ''}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      ) : (
        <div className="px-5 py-5 space-y-7">
          {/* Trending Section */}
          {trending.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-brand-500" />
                  <h2 className="section-title">Trending Events</h2>
                </div>
                <Link href="/timeline" className="text-brand-500 text-sm font-semibold hover:text-brand-600 transition-colors">
                  View all
                </Link>
              </div>
              <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1">
                {trending.map((event, i) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="min-w-[280px] max-w-[300px]"
                  >
                    <EventCard event={event} />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-brand-500" />
                <h2 className="section-title">Upcoming</h2>
              </div>
            </div>
            {filteredUpcoming.length > 0 ? (
              <div className="space-y-3">
                {filteredUpcoming.map((event, i) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <EventCard event={event} compact />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-14 text-muted">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No upcoming events{activeCategory !== 'all' ? ' in this category' : ''}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
