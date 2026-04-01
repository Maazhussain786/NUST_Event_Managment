'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus } from 'lucide-react';
import SocietyCard from '@/components/SocietyCard';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
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

const ease = [0.25, 0.1, 0.25, 1] as const;

function dedupeSocieties(list: Society[]): Society[] {
  const byIdentity = new Map<string, Society>();

  for (const item of list) {
    const normalizedName = item.name.trim().toLowerCase();
    const key = `${item.id}|${normalizedName}`;
    const existing = byIdentity.get(key);

    if (!existing || item.member_count > existing.member_count) {
      byIdentity.set(key, item);
    }
  }

  const byNameAndSchool = new Map<string, Society>();
  for (const item of Array.from(byIdentity.values())) {
    const name = item.name.trim().toLowerCase();
    const school = item.school_id ?? 'nust-wide';
    const key = `${name}|${school}`;
    const existing = byNameAndSchool.get(key);

    if (!existing || item.member_count > existing.member_count) {
      byNameAndSchool.set(key, item);
    }
  }

  return Array.from(byNameAndSchool.values());
}

export default function SocietiesPage() {
  const [societies, setSocieties] = useState<Society[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [activeSchool, setActiveSchool] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/societies?limit=100').then((r) => r.json()),
      fetch('/api/schools').then((r) => r.json()),
    ])
      .then(([socData, schoolData]) => {
        setSocieties(dedupeSocieties(socData.societies || []));
        setSchools(schoolData.schools || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = societies.filter((s) => {
    const matchesSchool =
      activeSchool === 'all' ||
      (activeSchool === 'nust-wide' && s.is_nust_wide) ||
      s.school_id === activeSchool;
    const matchesSearch =
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSchool && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Societies"
        search={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: 'Search societies...',
        }}
        filters={{
          items: [
            { value: 'all', label: 'All' },
            { value: 'nust-wide', label: 'NUST-Wide' },
            ...schools.map((s) => ({ value: s.id, label: s.abbreviation })),
          ],
          active: activeSchool,
          onChange: setActiveSchool,
        }}
      />

      <div className="px-5 py-4 pb-24 lg:pb-8">
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3.5 p-4 rounded-xl border border-border">
                <Skeleton className="w-12 h-12 rounded-2xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-2.5">
            {filtered.map((soc, i) => (
              <motion.div
                key={soc.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, ease }}
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
          <EmptyState icon={Users} message="No societies found" />
        )}
      </div>

      {/* FAB */}
      <Button
        asChild
        size="icon"
        className="fixed bottom-24 right-5 z-20 w-13 h-13 rounded-2xl shadow-elevation-3 shadow-brand-500/20"
      >
        <Link href="/register-society" aria-label="Register a society">
          <Plus className="w-6 h-6" />
        </Link>
      </Button>
    </div>
  );
}
