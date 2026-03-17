'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChipFilter } from '@/components/chip-filter';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backButton?: boolean;
  action?: React.ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  filters?: {
    items: { value: string; label: string }[];
    active: string;
    onChange: (value: string) => void;
  };
  sticky?: boolean;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  backButton,
  action,
  search,
  filters,
  sticky = true,
  className,
}: PageHeaderProps) {
  const router = useRouter();

  return (
    <header
      className={cn(
        'z-header bg-background/80 backdrop-blur-xl border-b border-border/50',
        sticky && 'sticky top-0',
        className,
      )}
    >
      <div className="px-4 pt-14 pb-3 safe-top">
        <div className="flex items-center gap-3">
          {backButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              aria-label="Go back"
              className="-ml-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-h1 text-foreground truncate">{title}</h1>
            {subtitle && (
              <p className="text-caption text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {action}
        </div>

        {search && (
          <div className="mt-3">
            <Input
              icon={Search}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder || 'Search...'}
              className="h-10"
            />
          </div>
        )}

        {filters && (
          <div className="mt-3 -mx-4 px-4">
            <ChipFilter
              items={filters.items}
              active={filters.active}
              onChange={filters.onChange}
            />
          </div>
        )}
      </div>
    </header>
  );
}
