'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, MapPin, Clock, Download, Loader2 } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';

interface TicketDetail {
  id: string;
  ticket_number: string;
  status: string;
  purchased_at: string;
  event_title: string;
  event_venue: string;
  event_start: string;
  event_end: string;
  event_banner: string | null;
  society_name: string;
  attendee_name: string;
  qr_data: string;
}

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock for now - in production fetch from /api/tickets/[id]
    setLoading(false);
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  // Demo ticket view
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="px-4 pt-12 pb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-primary"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-card)' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-primary">E-Ticket</h1>
      </div>

      <div className="px-5 pb-8">
        {/* Ticket Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
        >
          {/* Top Section - Event Banner */}
          <div className="h-40 bg-gradient-to-br from-brand-500 to-brand-700 relative">
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute bottom-4 left-4 right-4">
              <h2 className="text-xl font-bold text-white">
                {ticket?.event_title || 'Event Name'}
              </h2>
              <p className="text-white/80 text-sm">
                {ticket?.society_name || 'Society Name'}
              </p>
            </div>
          </div>

          {/* Tear Line */}
          <div className="relative">
            <div className="absolute left-0 -top-3 w-6 h-6 rounded-full" style={{ background: 'var(--bg-primary)' }} />
            <div className="absolute right-0 -top-3 w-6 h-6 rounded-full" style={{ background: 'var(--bg-primary)' }} />
            <div className="mx-8" style={{ borderTop: '2px dashed var(--border-primary)' }} />
          </div>

          {/* Details Section */}
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted text-xs mb-1">Date</p>
                <div className="flex items-center gap-1.5 text-primary text-sm">
                  <Calendar className="w-4 h-4 text-brand-500" />
                  {ticket ? new Date(ticket.event_start).toLocaleDateString('en-PK', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  }) : 'TBD'}
                </div>
              </div>
              <div>
                <p className="text-muted text-xs mb-1">Time</p>
                <div className="flex items-center gap-1.5 text-primary text-sm">
                  <Clock className="w-4 h-4 text-brand-500" />
                  {ticket ? new Date(ticket.event_start).toLocaleTimeString('en-PK', {
                    hour: '2-digit', minute: '2-digit', hour12: true
                  }) : 'TBD'}
                </div>
              </div>
              <div>
                <p className="text-muted text-xs mb-1">Venue</p>
                <div className="flex items-center gap-1.5 text-primary text-sm">
                  <MapPin className="w-4 h-4 text-brand-500" />
                  {ticket?.event_venue || 'TBD'}
                </div>
              </div>
              <div>
                <p className="text-muted text-xs mb-1">Ticket #</p>
                <p className="text-primary text-sm font-mono">
                  {ticket?.ticket_number || 'NUST-XXXX'}
                </p>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center py-4">
              <div className="w-48 h-48 bg-white rounded-2xl flex items-center justify-center p-3">
                <div className="w-full h-full bg-gradient-to-br from-surface-200 to-surface-300 rounded-xl flex items-center justify-center">
                  <div className="text-center">
                    <div className="grid grid-cols-5 gap-1 w-32 h-32 mx-auto">
                      {Array.from({ length: 25 }).map((_, i) => (
                        <div
                          key={i}
                          className={`rounded-sm ${Math.random() > 0.4 ? 'bg-surface-900' : 'bg-white'}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-muted text-xs mt-3">Show this QR code at the venue entrance</p>
            </div>

            {/* Attendee */}
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-input)' }}>
              <p className="text-muted text-xs">Attendee</p>
              <p className="text-primary font-semibold">{ticket?.attendee_name || 'Your Name'}</p>
            </div>
          </div>
        </motion.div>

        {/* Download Button */}
        <button className="btn-secondary w-full mt-4 flex items-center justify-center gap-2">
          <Download className="w-5 h-5" />
          Save Ticket
        </button>
      </div>
    </div>
  );
}
