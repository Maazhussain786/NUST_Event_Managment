'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Ticket, QrCode, Calendar, MapPin, Clock, Loader2, ChevronRight } from 'lucide-react';
import Link from 'next/link';

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
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    // For now, using mock data. In production, fetch from /api/tickets
    setLoading(false);
    // Mock data for UI preview
    setTickets([]);
  }, []);

  const now = new Date();
  const upcomingTickets = tickets.filter(t => new Date(t.event_start) > now && t.status === 'VALID');
  const pastTickets = tickets.filter(t => new Date(t.event_start) <= now || t.status !== 'VALID');

  const displayTickets = activeTab === 'upcoming' ? upcomingTickets : pastTickets;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-xl" style={{ background: 'var(--bg-nav)', borderBottom: '1px solid var(--border-card)' }}>
        <div className="px-5 pt-12 pb-4">
          <h1 className="text-xl font-bold text-primary mb-4">My Tickets</h1>

          {/* Tabs */}
          <div className="flex rounded-xl p-1" style={{ background: 'var(--bg-input)' }}>
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'upcoming'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-muted'
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'past'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-muted'
              }`}
            >
              Past
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          </div>
        ) : displayTickets.length > 0 ? (
          <div className="space-y-3">
            {displayTickets.map((ticket, i) => (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link href={`/tickets/${ticket.id}`}>
                  <div className="card p-4 transition-colors">
                    <div className="flex items-start gap-3">
                      {/* Event Image Thumbnail */}
                      <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                           style={{ background: 'var(--bg-input)' }}>
                        {ticket.event_banner ? (
                          <img src={ticket.event_banner} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Ticket className="w-6 h-6 text-brand-500" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-primary font-semibold text-sm truncate">{ticket.event_title}</h3>
                        <p className="text-muted text-xs mt-0.5">{ticket.society_name}</p>
                        <div className="flex items-center gap-3 mt-2 text-muted text-xs">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(ticket.event_start).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {ticket.event_venue}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <QrCode className="w-5 h-5 text-brand-500" />
                        <ChevronRight className="w-4 h-4 text-muted" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-muted">
            <Ticket className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <h3 className="text-primary font-semibold mb-1">No Tickets Yet</h3>
            <p className="text-sm mb-4">Browse events to get your first ticket</p>
            <Link href="/home" className="btn-primary inline-flex items-center gap-2">
              Explore Events
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
