'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Users, Star, Calendar, MapPin, Loader2 } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import EventCard from '@/components/EventCard';
import { useAuth } from '@/components/AuthProvider';

interface Society {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  is_nust_wide: boolean;
  school_name: string | null;
  school_abbr: string | null;
  member_count: number;
  avg_rating: number;
  rating_count: number;
  created_at: string;
}

interface Wing {
  id: string;
  name: string;
  description: string;
}

interface Event {
  id: string;
  title: string;
  description: string;
  banner_url: string | null;
  is_paid: boolean;
  location: string;
  event_start: string;
  event_end: string;
  ticket_price: number;
  tickets_sold: number;
  society_id: string;
  society_name: string;
  society_logo: string | null;
}

export default function SocietyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { requireAuth } = useAuth();
  const [society, setSociety] = useState<Society | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [wings, setWings] = useState<Wing[]>([]);
  const [activeTab, setActiveTab] = useState<'about' | 'events' | 'wings'>('about');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/societies/${params.id}`)
      .then(r => r.json())
      .then(data => {
        setSociety(data.society);
        setEvents(data.events || []);
        setWings(data.wings || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!society) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">
        Society not found
      </div>
    );
  }

  const tabs = [
    { key: 'about', label: 'About' },
    { key: 'events', label: `Events (${events.length})` },
    { key: 'wings', label: `Wings (${wings.length})` },
  ] as const;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header Banner */}
      <div className="relative h-48 bg-gradient-to-br from-brand-500 to-brand-700">
        <button
          onClick={() => router.back()}
          className="absolute top-12 left-4 z-10 w-10 h-10 rounded-2xl bg-black/30 backdrop-blur-md flex items-center justify-center text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Society Info */}
      <div className="px-5 -mt-16 relative z-10">
        <div className="flex items-end gap-4 mb-4">
          <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-bold text-brand-500 shrink-0 border-4"
               style={{ background: 'var(--bg-primary)', borderColor: 'var(--bg-primary)' }}>
            {society.logo_url ? (
              <img src={society.logo_url} alt={society.name} className="w-full h-full rounded-2xl object-cover" />
            ) : (
              society.name[0]
            )}
          </div>
          <div className="pb-1">
            <h1 className="text-xl font-bold text-primary">{society.name}</h1>
            <p className="text-muted text-sm">
              {society.is_nust_wide ? 'NUST-Wide' : society.school_abbr || 'Society'}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mb-6">
          <div className="flex items-center gap-1 text-sm text-secondary">
            <Users className="w-4 h-4 text-brand-500" />
            <span className="font-semibold text-primary">{society.member_count}</span> members
          </div>
          <div className="flex items-center gap-1 text-sm text-secondary">
            <Star className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-primary">{society.avg_rating}</span>
            <span>({society.rating_count})</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-secondary">
            <Calendar className="w-4 h-4 text-brand-500" />
            <span>{events.length} events</span>
          </div>
        </div>

        {/* Join Button */}
        <button
          onClick={() => {
            if (!requireAuth('Sign in to join societies')) return;
            // TODO: join society flow
          }}
          className="btn-primary w-full mb-6"
        >
          Join Society
        </button>

        {/* Tabs */}
        <div className="flex mb-4" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 pb-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.key ? 'text-brand-500' : 'text-muted'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="societyTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500"
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'about' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-6">
            <p className="text-secondary leading-relaxed">{society.description || 'No description available.'}</p>
          </motion.div>
        )}

        {activeTab === 'events' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 pb-6">
            {events.length > 0 ? (
              events.map(event => <EventCard key={event.id} event={event} variant="compact" />)
            ) : (
              <p className="text-center text-muted py-8">No upcoming events</p>
            )}
          </motion.div>
        )}

        {activeTab === 'wings' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 pb-6">
            {wings.length > 0 ? (
              wings.map(wing => (
                <div key={wing.id} className="card p-4">
                  <h3 className="text-primary font-semibold">{wing.name}</h3>
                  <p className="text-muted text-sm mt-1">{wing.description || 'No description'}</p>
                </div>
              ))
            ) : (
              <p className="text-center text-muted py-8">No wings created yet</p>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
