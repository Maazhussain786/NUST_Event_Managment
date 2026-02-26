'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Wallet, Download, TrendingUp, Ticket, DollarSign,
  Calendar, BarChart3,
} from 'lucide-react';
import { fetchFinance, exportFinanceCsv, SocietyApiError } from '../../api';
import { PageLoader, ErrorState, EmptyState, StatCard } from '../../_components/Shared';
import type { SocietyFinance } from '../../types';

export default function FinancePage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [data, setData] = useState<SocietyFinance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const finance = await fetchFinance(societyId);
      setData(finance);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        if (err.status === 403) { setError('Access denied'); return; }
        setError(err.message);
      } else {
        setError('Failed to load finance data');
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, router]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    try {
      setExporting(true);
      const csv = await exportFinanceCsv(societyId);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance-${societyId}-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setToast('CSV exported');
    } catch {
      setToast('Export failed');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  if (loading) return <PageLoader />;
  if (error || !data) return <ErrorState message={error || 'Failed to load'} onRetry={load} />;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Revenue"
          value={`Rs. ${Number(data.totalRevenue || 0).toLocaleString()}`}
          icon={DollarSign}
          accent="green"
        />
        <StatCard label="Total Tickets" value={Number(data.totalTickets || 0)} icon={Ticket} accent="blue" />
        <StatCard label="Approved" value={Number(data.approvedTickets || 0)} icon={TrendingUp} accent="purple" />
        <StatCard label="Pending" value={Number(data.pendingTickets || 0)} icon={Wallet} accent="amber" />
      </div>

      {/* Export button */}
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-secondary text-sm px-4 py-2 flex items-center gap-1.5"
        >
          <Download size={16} /> {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Revenue by event */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-muted" /> Revenue by Event
        </h2>
        {data.revenueByEvent.length === 0 ? (
          <EmptyState message="No revenue data" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-themed">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Event</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Price</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Sold</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Revenue</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.revenueByEvent.map(item => (
                  <tr key={item.event_id} className="border-b border-themed/50 hover:bg-secondary/50">
                    <td className="px-4 py-3 text-primary font-medium truncate max-w-[200px]">{item.event_title}</td>
                    <td className="px-4 py-3 text-right text-secondary">Rs. {Number(item.ticket_price).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-secondary">{item.tickets_sold}</td>
                    <td className="px-4 py-3 text-right text-primary font-medium">Rs. {Number(item.total_revenue).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted text-xs">
                      {new Date(item.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-primary mb-4">Recent Transactions</h2>
        {data.recentTransactions.length === 0 ? (
          <EmptyState message="No transactions" />
        ) : (
          <div className="space-y-2">
            {data.recentTransactions.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50">
                <div className="h-8 w-8 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center">
                  <DollarSign size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-primary truncate">{tx.user_name}</p>
                  <p className="text-xs text-muted truncate">{tx.event_title}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-primary">Rs. {Number(tx.amount).toLocaleString()}</p>
                  <p className="text-xs text-muted">
                    {new Date(tx.purchased_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
