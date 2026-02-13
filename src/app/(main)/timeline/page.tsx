'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, MapPin, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  banner_url: string | null;
  is_paid: boolean;
  location: string;
  event_start: string;
  event_end: string;
  ticket_price: number;
  category_name: string;
  society_id: string;
  society_name: string;
  society_logo: string | null;
}

export default function TimelinePage() {
  const [dates, setDates] = useState<string[]>([]);
  const [events, setEvents] = useState<Record<string, TimelineEvent[]>>({});
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Generate next 30 days
  const allDates: string[] = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    allDates.push(d.toISOString().split('T')[0]);
  }

  useEffect(() => {
    const todayStr = today.toISOString().split('T')[0];
    setSelectedDate(todayStr);

    fetch(`/api/timeline?from=${todayStr}&days=30`)
      .then(r => r.json())
      .then(data => {
        setDates(data.dates || []);
        setEvents(data.events || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-PK', { weekday: 'short' }).slice(0, 3);
  };

  const formatDayNum = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').getDate();
  };

  const formatMonth = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PK', { month: 'short' });
  };

  const isToday = (dateStr: string) => dateStr === today.toISOString().split('T')[0];
  const hasEvents = (dateStr: string) => dates.includes(dateStr);

  const selectedEvents = events[selectedDate] || [];

  const formatTime = (dt: string) => new Date(dt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-xl" style={{ background: 'var(--bg-nav)', borderBottom: '1px solid var(--border-card)' }}>
        <div className="px-5 pt-12 pb-4">
          <h1 className="text-xl font-bold text-primary mb-4">Timeline</h1>

          {/* Horizontal Date Scroll */}
          <div ref={scrollRef} className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {allDates.map((dateStr) => {
              const selected = selectedDate === dateStr;
              const todayMark = isToday(dateStr);
              const hasEvt = hasEvents(dateStr);

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`flex flex-col items-center min-w-[52px] py-2 px-2 rounded-xl transition-all ${
                    selected
                      ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                      : ''
                  }`}
                  style={!selected ? { background: 'var(--bg-input)', border: '1px solid var(--border-card)' } : {}}
                >
                  <span className={`text-[10px] uppercase font-medium ${selected ? 'text-white' : 'text-muted'}`}>{formatDay(dateStr)}</span>
                  <span className={`text-lg font-bold ${selected ? 'text-white' : todayMark ? 'text-brand-500' : 'text-primary'}`}>
                    {formatDayNum(dateStr)}
                  </span>
                  <span className={`text-[10px] ${selected ? 'text-white' : 'text-muted'}`}>{formatMonth(dateStr)}</span>
                  {hasEvt && !selected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1" />
                  )}
                  {todayMark && !selected && (
                    <div className="w-1 h-1 rounded-full bg-brand-400 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Events List */}
      <div className="px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedDate}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Date Header */}
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-brand-500" />
                <h2 className="text-primary font-semibold">
                  {isToday(selectedDate) ? 'Today' : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-PK', {
                    weekday: 'long', month: 'long', day: 'numeric'
                  })}
                </h2>
                <span className="text-muted text-sm">
                  ({selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''})
                </span>
              </div>

              {selectedEvents.length > 0 ? (
                <div className="relative">
                  {/* Timeline Line */}
                  <div className="absolute left-[18px] top-4 bottom-4 w-0.5 bg-surface-200 dark:bg-surface-800" />

                  <div className="space-y-4">
                    {selectedEvents.map((evt, i) => (
                      <motion.div
                        key={evt.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex gap-4"
                      >
                        {/* Timeline Dot */}
                        <div className="flex flex-col items-center pt-1">
                          <div className="w-3 h-3 rounded-full bg-brand-500 z-10" style={{ boxShadow: '0 0 0 4px var(--bg-primary)' }} />
                        </div>

                        {/* Event Card */}
                        <Link href={`/events/${evt.id}`} className="flex-1 card p-4 transition-colors" style={{ borderColor: 'var(--border-card)' }}>
                          <div className="flex items-start gap-3">
                            {/* Time */}
                            <div className="text-right min-w-[54px]">
                              <p className="text-brand-500 text-sm font-semibold">{formatTime(evt.event_start)}</p>
                              <p className="text-muted text-xs">{formatTime(evt.event_end)}</p>
                            </div>

                            <div className="flex-1">
                              <h3 className="text-primary font-semibold text-sm mb-1">{evt.title}</h3>
                              <div className="flex items-center gap-3 text-muted text-xs">
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {evt.location || 'TBA'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {evt.society_name}
                                </span>
                              </div>
                              {evt.category_name && (
                                <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 border border-brand-500/20">
                                  {evt.category_name}
                                </span>
                              )}
                            </div>

                            {/* Price */}
                            <div className={`text-xs font-bold px-2 py-1 rounded-lg ${
                              !evt.ticket_price ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400'
                            }`}>
                              {!evt.ticket_price ? 'Free' : `Rs.${evt.ticket_price}`}
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-muted">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No events on this date</p>
                  <p className="text-sm mt-1">Check other dates or explore societies</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
