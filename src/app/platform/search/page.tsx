'use client';

import { useState, useCallback } from 'react';
import {
  Search,
  Users,
  Building2,
  Calendar,
  FileText,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { EmptyState, StatusBadge } from '../_components/Shared';
import { globalSearch } from '../api';
import type { SearchResults, SearchResultItem } from '../types';

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string; key: keyof SearchResults }> = {
  users: { label: 'Users', icon: Users, color: 'text-blue-500', key: 'users' },
  societies: { label: 'Societies', icon: Building2, color: 'text-emerald-500', key: 'societies' },
  events: { label: 'Events', icon: Calendar, color: 'text-brand-500', key: 'events' },
  auditLogs: { label: 'Audit Logs', icon: FileText, color: 'text-purple-500', key: 'auditLogs' },
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearched(true);
    try {
      const data = await globalSearch(q);
      setResults(data);
    } catch {
      setResults(null);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const totalResults = results
    ? (results.users?.length || 0) + (results.societies?.length || 0) +
      (results.events?.length || 0) + (results.auditLogs?.length || 0)
    : 0;

  const renderItem = (item: SearchResultItem, category: string) => {
    // Build link based on category
    let href = '#';
    if (category === 'users') href = `/platform/users`;
    else if (category === 'societies' && item.id) href = `/platform/societies/${item.id}`;
    else if (category === 'events') href = `/platform/events`;
    else if (category === 'auditLogs') href = `/platform/audit-logs`;

    return (
      <a
        key={`${category}-${item.id}`}
        href={href}
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors border-b last:border-b-0"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {item.title || 'Untitled'}
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            {item.subtitle || ''}
          </p>
        </div>
        {item.status && <StatusBadge status={item.status} />}
        <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
      </a>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Global Search</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Search across users, societies, events, and audit logs
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
          style={{ color: 'var(--text-muted)' }}
        />
        <input
          className="input-field w-full pl-12 pr-4 py-3.5 text-base"
          placeholder="Search by name, email, title, or action..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          autoFocus
        />
        {searching && (
          <Loader2
            className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-brand-500"
          />
        )}
      </div>

      {query.trim().length > 0 && query.trim().length < 2 && (
        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          Type at least 2 characters to search
        </p>
      )}

      {/* Results Summary */}
      {searched && !searching && results && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {totalResults} result{totalResults !== 1 ? 's' : ''} found for &ldquo;{query.trim()}&rdquo;
        </p>
      )}

      {/* Results by Category */}
      {searched && !searching && totalResults === 0 && (
        <EmptyState message={`No results found for "${query.trim()}"`} />
      )}

      {results && !searching && (
        <div className="space-y-4">
          {Object.entries(CATEGORY_META).map(([key, meta]) => {
            const items = results[meta.key] as SearchResultItem[] | undefined;
            if (!items || items.length === 0) return null;
            const Icon = meta.icon;

            return (
              <div key={key} className="card overflow-hidden">
                <div
                  className="px-4 py-2.5 flex items-center gap-2 border-b"
                  style={{ borderColor: 'var(--border-primary)' }}
                >
                  <Icon className={`w-4 h-4 ${meta.color}`} />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    {meta.label}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800" style={{ color: 'var(--text-muted)' }}>
                    {items.length}
                  </span>
                </div>
                <div>
                  {items.map(item => renderItem(item, key))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
