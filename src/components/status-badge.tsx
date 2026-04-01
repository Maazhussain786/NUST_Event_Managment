import { Badge, type BadgeProps } from '@/components/ui/badge';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

const STATUS_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  // Lifecycle
  ACTIVE:              { variant: 'success',     label: 'Active' },
  APPROVED:            { variant: 'success',     label: 'Approved' },
  COMPLETED:           { variant: 'success',     label: 'Completed' },
  CHECKED_IN:          { variant: 'success',     label: 'Checked In' },
  VERIFIED:            { variant: 'success',     label: 'Verified' },
  RESOLVED:            { variant: 'success',     label: 'Resolved' },
  HEALTHY:             { variant: 'success',     label: 'Healthy' },

  // Pending / Warning
  PENDING:             { variant: 'warning',     label: 'Pending' },
  PENDING_VERIFICATION:{ variant: 'warning',     label: 'Pending Verification' },
  INFO_REQUESTED:      { variant: 'warning',     label: 'Info Requested' },
  UNDER_REVIEW:        { variant: 'warning',     label: 'Under Review' },
  INVESTIGATING:       { variant: 'warning',     label: 'Investigating' },
  DEGRADED:            { variant: 'warning',     label: 'Degraded' },
  OPEN:                { variant: 'warning',     label: 'Open' },

  // Destructive
  REJECTED:            { variant: 'destructive', label: 'Rejected' },
  CANCELLED:           { variant: 'destructive', label: 'Cancelled' },
  SUSPENDED:           { variant: 'destructive', label: 'Suspended' },
  BANNED:              { variant: 'destructive', label: 'Banned' },
  UNHEALTHY:           { variant: 'destructive', label: 'Unhealthy' },

  // Info
  DRAFT:               { variant: 'info',        label: 'Draft' },
  ARCHIVED:            { variant: 'info',        label: 'Archived' },
  INACTIVE:            { variant: 'info',        label: 'Inactive' },

  // Special
  FREE:                { variant: 'success',     label: 'Free' },
  PAID:                { variant: 'purple',       label: 'Paid' },
};

export interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StatusBadge({ status, size = 'sm', className }: StatusBadgeProps) {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  const mapped = STATUS_MAP[normalizedStatus] || {
    variant: 'outline' as BadgeVariant,
    label: normalizedStatus.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
  };
  return (
    <Badge variant={mapped.variant} size={size} className={className}>
      {mapped.label}
    </Badge>
  );
}
