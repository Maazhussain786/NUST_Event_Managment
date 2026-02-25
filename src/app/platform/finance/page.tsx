'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Receipt,
  Building2,
  Calendar,
} from 'lucide-react';
import { StatCard } from '../_components/StatCard';
import { PageLoader, ErrorState, EmptyState } from '../_components/Shared';
import { fetchFinance } from '../api';
import type { FinanceData } from '../types';

export default function FinancePage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'society' | 'event' | 'payments'>('society');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const d = await fetchFinance();
      setData(d);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load finance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { paymentBreakdown } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Financial Intelligence</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Revenue tracking, payment monitoring, and financial trends
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Revenue"
          value={`Rs. ${Number(paymentBreakdown.total_revenue).toLocaleString()}`}
          icon={DollarSign}
          accent="green"
        />
        <StatCard
          label="Approved Tickets"
          value={paymentBreakdown.approved}
          icon={CreditCard}
          accent="blue"
        />
        <StatCard
          label="Pending Tickets"
          value={paymentBreakdown.pending}
          icon={Receipt}
          accent="amber"
        />
        <StatCard
          label="Rejected Tickets"
          value={paymentBreakdown.rejected}
          icon={CreditCard}
          accent="red"
        />
      </div>

      {/* Monthly Revenue chart */}
      {data.monthlyRevenue.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Monthly Revenue Trend</h3>
          <div className="flex items-end gap-2 h-40">
            {data.monthlyRevenue.map((m) => {
              const max = Math.max(...data.monthlyRevenue.map(x => Number(x.count)));
              const height = max > 0 ? (Number(m.count) / max) * 100 : 0;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    Rs. {Number(m.count).toLocaleString()}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-emerald-500/80 min-h-[4px] transition-all"
                    style={{ height: `${Math.max(height, 3)}%` }}
                  />
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    {m.month.split('-')[1]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
        {([
          { value: 'society', label: 'By Society' },
          { value: 'event', label: 'By Event' },
          { value: 'payments', label: 'Recent Payments' },
        ] as const).map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`chip ${activeTab === tab.value ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'society' && (
        <div className="space-y-2">
          {data.revenueBySociety.length === 0 ? (
            <EmptyState message="No revenue data by society" />
          ) : (
            <>
              <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                <div className="col-span-4">Society</div>
                <div className="col-span-2">Revenue</div>
                <div className="col-span-2">Tickets</div>
                <div className="col-span-2">Events</div>
                <div className="col-span-2">Share</div>
              </div>
              {data.revenueBySociety.map((s) => {
                const total = Number(paymentBreakdown.total_revenue);
                const share = total > 0 ? ((Number(s.total_revenue) / total) * 100).toFixed(1) : '0';
                return (
                  <div key={s.society_id} className="card px-5 py-4">
                    <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center space-y-2 md:space-y-0">
                      <div className="col-span-4 flex items-center gap-2 min-w-0">
                        <Building2 className="w-4 h-4 shrink-0 text-brand-500" />
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {s.society_name}
                        </span>
                      </div>
                      <div className="col-span-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        Rs. {Number(s.total_revenue).toLocaleString()}
                      </div>
                      <div className="col-span-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {s.ticket_count}
                      </div>
                      <div className="col-span-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {s.event_count}
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-surface-100 dark:bg-surface-800">
                            <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${share}%` }} />
                          </div>
                          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{share}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {activeTab === 'event' && (
        <div className="space-y-2">
          {data.revenueByEvent.length === 0 ? (
            <EmptyState message="No revenue data by event" />
          ) : (
            <>
              <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                <div className="col-span-3">Event</div>
                <div className="col-span-2">Society</div>
                <div className="col-span-2">Price</div>
                <div className="col-span-2">Sold</div>
                <div className="col-span-2">Revenue</div>
                <div className="col-span-1">Date</div>
              </div>
              {data.revenueByEvent.map((e) => (
                <div key={e.event_id} className="card px-5 py-4">
                  <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center space-y-2 md:space-y-0">
                    <div className="col-span-3 flex items-center gap-2 min-w-0">
                      <Calendar className="w-4 h-4 shrink-0 text-purple-500" />
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{e.event_title}</span>
                    </div>
                    <div className="col-span-2 text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{e.society_name}</div>
                    <div className="col-span-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Rs. {Number(e.ticket_price).toLocaleString()}</div>
                    <div className="col-span-2 text-sm" style={{ color: 'var(--text-primary)' }}>{e.tickets_sold}</div>
                    <div className="col-span-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">Rs. {Number(e.total_revenue).toLocaleString()}</div>
                    <div className="col-span-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(e.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="space-y-2">
          {data.recentPayments.length === 0 ? (
            <EmptyState message="No recent payments" />
          ) : (
            <>
              <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                <div className="col-span-3">User</div>
                <div className="col-span-4">Event</div>
                <div className="col-span-2">Amount</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-2">Date</div>
              </div>
              {data.recentPayments.map((p) => (
                <div key={p.id} className="card px-5 py-4">
                  <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center space-y-2 md:space-y-0">
                    <div className="col-span-3 text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{p.user_name}</div>
                    <div className="col-span-4 text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{p.event_title}</div>
                    <div className="col-span-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Rs. {Number(p.amount).toLocaleString()}</div>
                    <div className="col-span-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        p.status === 'APPROVED'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : p.status === 'PENDING'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                    <div className="col-span-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(p.purchased_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
