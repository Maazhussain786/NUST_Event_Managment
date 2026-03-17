import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  endIcon?: React.ReactNode;
  error?: string;
  label?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon: Icon, endIcon, error, label, id: providedId, ...props }, ref) => {
    const autoId = React.useId();
    const id = providedId || autoId;
    const errorId = `${id}-error`;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="text-caption font-medium text-muted-foreground mb-1.5 block">
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground pointer-events-none" />
          )}
          <input
            type={type}
            id={id}
            className={cn(
              'flex h-12 w-full rounded-xl bg-input border-[1.5px] border-border px-4 text-[0.9375rem] text-foreground',
              'placeholder:text-muted-foreground',
              'focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/12 focus:outline-none',
              'transition-all duration-200',
              'disabled:cursor-not-allowed disabled:opacity-50',
              Icon && 'pl-11',
              endIcon && 'pr-11',
              error && 'border-destructive focus:border-destructive focus:ring-destructive/12',
              className,
            )}
            ref={ref}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? errorId : undefined}
            {...props}
          />
          {endIcon && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              {endIcon}
            </div>
          )}
        </div>
        {error && (
          <p id={errorId} className="text-caption text-destructive mt-1.5" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
