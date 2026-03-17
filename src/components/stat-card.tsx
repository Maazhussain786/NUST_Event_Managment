import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const accentClasses = {
  brand:  'bg-brand-500/10 text-brand-600 dark:text-brand-400',
  blue:   'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  green:  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  red:    'bg-red-500/10 text-red-600 dark:text-red-400',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  amber:  'bg-amber-500/10 text-amber-600 dark:text-amber-400',
} as const;

export interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  accent?: keyof typeof accentClasses;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, trend, accent = 'brand', className }: StatCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-caption text-muted-foreground font-medium">{label}</p>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', accentClasses[accent])}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
      </div>
      <p className="text-h1 text-foreground">{value}</p>
      {trend && (
        <p className="text-caption text-emerald-600 dark:text-emerald-400 mt-1 font-medium">{trend}</p>
      )}
    </div>
  );
}
