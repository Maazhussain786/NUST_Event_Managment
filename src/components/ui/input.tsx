'use client';

import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  endIcon?: React.ReactNode;
  error?: string;
  label?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon: Icon, endIcon, error, label, id: providedId, placeholder, value, ...props }, ref) => {
    const autoId = React.useId();
    const id = providedId || autoId;
    const errorId = `${id}-error`;
    const [isFocused, setIsFocused] = React.useState(false);
    
    const hasValue = value !== undefined && value !== null && value !== '';
    const isFloating = isFocused || hasValue;

    const labelText = label || placeholder;

    return (
      <div className="w-full">
        <div className="relative group">
          {Icon && (
            <Icon className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/30 group-focus-within:text-[#00AEEF] transition-colors pointer-events-none z-10" />
          )}
          
          <AnimatePresence>
            {labelText && (
              <motion.label
                htmlFor={id}
                initial={false}
                animate={{
                  y: isFloating ? -39 : -12,
                  x: isFloating ? (Icon ? -32 : -4) : 0,
                  scale: isFloating ? 0.8 : 1,
                  color: isFocused ? '#00AEEF' : (isFloating ? (isFocused ? '#00AEEF' : 'hsl(var(--foreground))') : 'rgba(115, 115, 115, 0.4)'),
                  backgroundColor: isFloating ? 'hsl(var(--card))' : 'transparent',
                }}
                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                className={cn(
                  "absolute left-8 top-1/2 text-[15px] pointer-events-none z-20 origin-left select-none px-1",
                  Icon && "left-14",
                  isFloating && "font-bold"
                )}
              >
                {labelText}
              </motion.label>
            )}
          </AnimatePresence>

          <input
            type={type}
            id={id}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
              'flex h-14 w-full rounded-full bg-card border border-border px-7 text-[15px] text-foreground transition-all duration-200 outline-none',
              'placeholder:opacity-0',
              'focus:border-[#00AEEF] focus:ring-4 focus:ring-[#00AEEF]/10',
              'disabled:cursor-not-allowed disabled:opacity-50',
              Icon && 'pl-14',
              endIcon && 'pr-14',
              error && 'border-destructive focus:border-destructive focus:ring-destructive/10',
              className,
            )}
            ref={ref}
            value={value}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? errorId : undefined}
            {...props}
          />

          {endIcon && (
            <div className="absolute right-5 top-1/2 -translate-y-1/2 z-10 flex items-center">
              {endIcon}
            </div>
          )}
        </div>
        {error && (
          <p id={errorId} className="text-[12px] text-destructive mt-1.5 px-6 font-medium" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
