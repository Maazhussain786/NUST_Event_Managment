import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full font-medium transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-brand-500/10 text-brand-700 dark:text-brand-400',
        success:     'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        warning:     'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        destructive: 'bg-red-500/10 text-red-700 dark:text-red-400',
        info:        'bg-blue-500/10 text-blue-700 dark:text-blue-400',
        purple:      'bg-purple-500/10 text-purple-700 dark:text-purple-400',
        outline:     'border border-border text-muted-foreground',
      },
      size: {
        sm: 'text-[10px] px-2 py-0.5',
        md: 'text-xs px-2.5 py-1',
        lg: 'text-sm px-3 py-1.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
