import { Inbox, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  message: string;
  action?: {
    label: string;
    onClick?: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, message, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-20 text-center', className)}>
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      {title && <h3 className="text-h3 text-foreground mb-1">{title}</h3>}
      <p className="text-body-sm text-muted-foreground max-w-[260px]">{message}</p>
      {action && (
        <Button variant="primary" size="sm" className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
