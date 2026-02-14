'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, Users, Plus } from 'lucide-react';
import SocietyCard from '@/components/SocietyCard';
import Link from 'next/link';

interface Society {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  is_nust_wide: boolean;
  school_id: string | null;
  school_name: string | null;
  school_abbr: string | null;
  member_count: number;
  avg_rating: number;
}

interface School {
  id: string;
  name: string;
  abbreviation: string;
}

export default function SocietiesPage() {
  const [societies, setSocieties] = useState<Society[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [activeSchool, setActiveSchool] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/societies').then(r => r.json()),
      fetch('/api/schools').then(r => r.json()),
    ]).then(([socData, schoolData]) => {
      setSocieties(socData.societies || []);
      setSchools(schoolData.schools || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = societies.filter(s => {
    const matchesSchool = activeSchool === 'all' 
      || (activeSchool === 'nust-wide' && s.is_nust_wide)
      || s.school_id === activeSchool;
    const matchesSearch = !searchQuery 
      || s.name.toLowerCase().includes(searchQuery.toLowerCase())
      || s.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSchool && matchesSearch;
  });

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-xl" style={{ background: 'var(--bg-nav)', borderBottom: '1px solid var(--border-card)' }}>
        <div className="px-5 pt-12 pb-4">
          <h1 className="text-xl font-bold text-primary mb-4">Societies</h1>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              placeholder="Search societies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field w-full py-3 pl-12 pr-4 text-sm"
            />
          </div>

          {/* School Filter Tabs */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            <button
              onClick={() => setActiveSchool('all')}
              className={`chip whitespace-nowrap ${activeSchool === 'all' ? 'active' : ''}`}
            >
              All
            </button>
            <button
              onClick={() => setActiveSchool('nust-wide')}
              className={`chip whitespace-nowrap ${activeSchool === 'nust-wide' ? 'active' : ''}`}
            >
              NUST-Wide
            </button>
            {schools.map((school) => (
              <button
                key={school.id}
                onClick={() => setActiveSchool(school.id)}
                className={`chip whitespace-nowrap ${activeSchool === school.id ? 'active' : ''}`}
              >
                {school.abbreviation}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((soc, i) => (
              <motion.div
                key={soc.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <SocietyCard
                  id={soc.id}
                  name={soc.name}
                  description={soc.description}
                  logoUrl={soc.logo_url || undefined}
                  memberCount={soc.member_count}
                  rating={soc.avg_rating}
                  school={soc.school_abbr || undefined}
                  isNustWide={soc.is_nust_wide}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-muted">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No societies found</p>
          </div>
        )}
      </div>

      {/* Register Society FAB */}
      <Link href="/register-society"
        className="fixed bottom-24 right-5 z-20 w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/30 hover:bg-brand-600 transition-colors">
        <Plus className="w-6 h-6 text-white" />
      </Link>
    </div>
  );
}
