'use client';

import React, { useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface ChipFilterProps {
  items: { value: string; label: string }[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ChipFilter({ items, active, onChange, className }: ChipFilterProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      let nextIndex = index;
      if (e.key === 'ArrowRight') nextIndex = Math.min(index + 1, items.length - 1);
      else if (e.key === 'ArrowLeft') nextIndex = Math.max(index - 1, 0);
      else return;

      e.preventDefault();
      onChange(items[nextIndex].value);

      const container = containerRef.current;
      if (container) {
        const buttons = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
        buttons[nextIndex]?.focus();
      }
    },
    [items, onChange],
  );

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label="Filter"
      className={cn('flex gap-2 overflow-x-auto scrollbar-hide pb-1', className)}
    >
      {items.map((item, i) => {
        const isActive = active === item.value;
        return (
          <button
            key={item.value}
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200',
              isActive
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                : 'bg-secondary border border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
