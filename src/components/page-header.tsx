'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
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
  /** Dynamic greeting mode - shows personalized greeting with contextual info */
  greeting?: {
    userName: string | null;
    contextLine?: string;
  };
}

function getGreetingText(): string {
  return 'Welcome back';
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
  greeting,
}: PageHeaderProps) {
  const router = useRouter();

  // Determine what to show in the header
  const showGreeting = greeting && greeting.userName;
  const displayTitle = showGreeting
    ? `${getGreetingText()}, ${greeting.userName}`
    : title;
  const displaySubtitle = showGreeting ? greeting.contextLine : subtitle;

  return (
    <header
      className={cn(
        'z-header bg-background/80 backdrop-blur-xl',
        sticky && 'sticky top-0',
        className,
      )}
    >
      <div
        className="px-4 pt-6 pb-4 md:px-6 md:pt-8 lg:px-8"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)',
        }}
      >
        <div className="flex flex-col gap-4">
          {/* Title and greeting section with improved spacing */}
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
              <h1 className={cn(
                'text-foreground truncate',
                showGreeting ? 'text-h2' : 'text-h1'
              )}>
                {displayTitle}
              </h1>
              {displaySubtitle && (
                <p className={cn(
                  'mt-2',
                  showGreeting
                    ? 'text-body-sm text-muted-foreground'
                    : 'text-caption text-muted-foreground'
                )}>
                  {displaySubtitle}
                </p>
              )}
            </div>
            {action}
          </div>

          {/* Search bar with proper spacing */}
          {search && (
            <div>
              <Input
                icon={Search}
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder || 'Search...'}
                className="h-11 rounded-xl bg-muted/60 border-transparent focus:border-brand-500 focus:bg-background"
              />
            </div>
          )}

          {/* Filters with proper spacing */}
          {filters && (
            <div className="-mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
              <ChipFilter
                items={filters.items}
                active={filters.active}
                onChange={filters.onChange}
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
