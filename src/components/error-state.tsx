import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-20 text-center', className)}>
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7 text-destructive" />
      </div>
      <h3 className="text-h3 text-foreground mb-1">{title}</h3>
      <p className="text-body-sm text-muted-foreground max-w-[260px]">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
