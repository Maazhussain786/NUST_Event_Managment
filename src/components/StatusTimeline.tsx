'use client';

import { Check, Clock, XCircle, ScanLine } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'purchased' | 'approved' | 'checked_in';
type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHECKED_IN' | string;
type StepState = 'completed' | 'current' | 'pending' | 'rejected';

interface StatusTimelineProps {
  status: Status;
  className?: string;
}

const steps: { key: Step; label: string }[] = [
  { key: 'purchased', label: 'Purchased' },
  { key: 'approved', label: 'Approved' },
  { key: 'checked_in', label: 'Checked In' },
];

function normalizeStatus(status: Status): 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHECKED_IN' {
  const normalized = String(status || '').trim().toUpperCase();

  if (normalized === 'CHECKED_IN' || normalized === 'CHECKEDIN' || normalized === 'SCANNED') {
    return 'CHECKED_IN';
  }
  if (normalized === 'APPROVED') {
    return 'APPROVED';
  }
  if (normalized === 'REJECTED' || normalized === 'CANCELLED') {
    return 'REJECTED';
  }
  return 'PENDING';
}

function getStepState(step: Step, normalizedStatus: ReturnType<typeof normalizeStatus>): StepState {

  // Handle rejection - show red state
  if (normalizedStatus === 'REJECTED') {
    if (step === 'purchased') return 'completed';
    if (step === 'approved') return 'rejected';
    return 'pending';
  }

  // Normal flow
  if (normalizedStatus === 'CHECKED_IN') {
    return 'completed';
  }

  if (normalizedStatus === 'APPROVED') {
    if (step === 'purchased' || step === 'approved') return 'completed';
    return 'pending';
  }

  // PENDING
  if (step === 'purchased') return 'completed';
  if (step === 'approved') return 'current';
  return 'pending';
}

export function StatusTimeline({ status, className }: StatusTimelineProps) {
  const normalizedStatus = normalizeStatus(status);

  return (
    <div className={cn('status-timeline', className)}>
      {steps.map((step, index) => {
        const state = getStepState(step.key, normalizedStatus);
        const isLast = index === steps.length - 1;
        const nextStep = steps[index + 1];
        const nextState: StepState | null = nextStep
          ? getStepState(nextStep.key, normalizedStatus)
          : null;
        const isSegmentCompleted = nextState === 'completed' || nextState === 'current' || nextState === 'rejected';

        return (
          <div key={step.key} className="status-timeline-step">
            {/* Connecting line (not for last item) */}
            {!isLast && (
              <div
                className={cn(
                  'status-timeline-line',
                  isSegmentCompleted && 'completed',
                )}
              />
            )}

            {/* Dot */}
            <div
              className={cn(
                'relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ring-2 ring-background',
                state === 'completed' && 'bg-emerald-500 text-white',
                state === 'current' && 'bg-amber-500 text-white animate-status-pulse',
                state === 'rejected' && 'bg-red-500 text-white',
                state === 'pending' && 'bg-muted text-muted-foreground',
              )}
            >
              {state === 'completed' && <Check className="w-4 h-4" />}
              {state === 'current' && <Clock className="w-4 h-4" />}
              {state === 'rejected' && <XCircle className="w-4 h-4" />}
              {state === 'pending' && (
                step.key === 'checked_in' ? (
                  <ScanLine className="w-4 h-4" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-current" />
                )
              )}
            </div>

            {/* Label */}
            <span
              className={cn(
                'status-timeline-label mt-2',
                state === 'completed' && 'text-emerald-600 dark:text-emerald-400 font-medium',
                state === 'current' && 'text-amber-600 dark:text-amber-400 font-medium',
                state === 'rejected' && 'text-red-600 dark:text-red-400 font-medium',
              )}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface StatusBadgeProps {
  status: Status;
  reason?: string;
  className?: string;
}

export function StatusBadge({ status, reason, className }: StatusBadgeProps) {
  const normalizedStatus = String(status || '').trim().toUpperCase();

  const config = {
    PENDING: {
      bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40',
      text: 'text-amber-700 dark:text-amber-400',
      label: 'Pending Approval',
      description: 'Waiting for society to approve your ticket',
    },
    APPROVED: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40',
      text: 'text-emerald-700 dark:text-emerald-400',
      label: 'Approved',
      description: 'Show your QR code at the venue',
    },
    PENDING_VERIFICATION: {
      bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40',
      text: 'text-amber-700 dark:text-amber-400',
      label: 'Proof Needed',
      description: 'Submit your payment screenshot from the event page',
    },
    NEEDS_REUPLOAD: {
      bg: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/40',
      text: 'text-orange-700 dark:text-orange-400',
      label: 'Reupload Required',
      description: 'Upload an updated payment screenshot to continue',
    },
    REJECTED: {
      bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/40',
      text: 'text-red-700 dark:text-red-400',
      label: 'Rejected',
      description: reason || 'Your ticket was not approved',
    },
    CANCELLED: {
      bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/40',
      text: 'text-red-700 dark:text-red-400',
      label: 'Cancelled',
      description: 'This ticket is no longer valid',
    },
    CHECKED_IN: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40',
      text: 'text-emerald-700 dark:text-emerald-400',
      label: 'You are checked in',
      description: 'Your check-in has been recorded. Keep your ticket for reference.',
    },
  };

  const c = config[normalizedStatus as keyof typeof config] || config.PENDING;

  return (
    <div className={cn('rounded-xl border p-3', c.bg, className)}>
      <p className={cn('text-body-sm font-semibold', c.text)}>{c.label}</p>
      <p className="text-caption text-muted-foreground mt-0.5">{c.description}</p>
    </div>
  );
}
