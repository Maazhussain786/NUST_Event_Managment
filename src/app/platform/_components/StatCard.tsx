'use client';

import { type LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  accent?: string;
}

export function StatCard({ label, value, icon: Icon, trend, accent = 'brand' }: StatCardProps) {
  const colorMap: Record<string, string> = {
    brand: 'bg-brand-500/10 text-brand-500',
    blue: 'bg-blue-500/10 text-blue-500',
    green: 'bg-emerald-500/10 text-emerald-500',
    red: 'bg-red-500/10 text-red-500',
    purple: 'bg-purple-500/10 text-purple-500',
    amber: 'bg-amber-500/10 text-amber-500',
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {label}
          </p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            {value}
          </p>
          {trend && (
            <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
              {trend}
            </p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[accent] || colorMap.brand}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
