'use client';

/**
 * Small UI kit shared by the SRS module screens (event workspace, roles, sponsors,
 * inventory, minutes, recruitment). Keeps those pages short and consistent.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Data fetching ──────────────────────────────────────────────────────────

export class ApiCallError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiCall<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error || `Request failed (${res.status})`;
    throw new ApiCallError(res.status, message);
  }
  return data as T;
}

/** Loads JSON from a URL; `reload()` refetches. `url = null` skips loading. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(url));

  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await apiCall<T>('GET', url));
      setError(null);
      setStatus(200);
    } catch (e) {
      setError((e as Error).message);
      setStatus(e instanceof ApiCallError ? e.status : 500);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, status, loading, reload, setData };
}

// ─── Formatting ─────────────────────────────────────────────────────────────

export function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `Rs ${n.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}

export function fmtDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-PK', withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' });
}

/** Converts an ISO timestamp to the value a datetime-local input expects (local time). */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function labelize(value: string | null | undefined): string {
  if (!value) return '';
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Layout pieces ──────────────────────────────────────────────────────────

export function Section({ title, description, actions, children, className }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-4 sm:p-5', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const PILL_TONES: Record<string, string> = {
  green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  red: 'bg-red-500/10 text-red-700 dark:text-red-400',
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  gray: 'bg-muted text-muted-foreground',
};

const STATUS_TONE: Record<string, keyof typeof PILL_TONES> = {
  DONE: 'green', VERIFIED: 'green', APPROVED: 'green', RECEIVED: 'green', SELECTED: 'green', RETURNED: 'green',
  PRINCIPAL_APPROVED: 'green', DELIVERED: 'green', OPEN: 'green', ISSUED: 'blue', CONFIRMED: 'blue',
  IN_PROGRESS: 'blue', SUBMITTED: 'blue', SHORTLISTED: 'blue', INTERVIEW_SCHEDULED: 'violet', INTERVIEWED: 'violet',
  FORWARDED: 'violet', PENDING: 'amber', PROPOSED: 'amber', DRAFT: 'gray', CLOSED: 'gray', FINALIZED: 'gray',
  CHANGES_REQUESTED: 'amber', INFO_REQUESTED: 'amber', REJECTED: 'red', PRINCIPAL_REJECTED: 'red', DECLINED: 'red',
  CANCELLED: 'gray', WITHDRAWN: 'gray', SCHEDULED: 'violet', COMPLETED: 'green', NO_SHOW: 'red',
  TEAM_LEAD: 'violet', EXECUTIVE: 'blue',
};

export function Pill({ children, tone, status }: { children?: ReactNode; tone?: keyof typeof PILL_TONES; status?: string }) {
  const resolved = tone ?? (status ? STATUS_TONE[status] ?? 'gray' : 'gray');
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold', PILL_TONES[resolved])}>
      {children ?? labelize(status)}
    </span>
  );
}

export function Btn({ children, onClick, variant = 'primary', size = 'sm', type = 'button', disabled, busy, className }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'xs' | 'sm';
  type?: 'button' | 'submit';
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  const styles = {
    primary: 'bg-brand-500 text-white hover:bg-brand-600',
    secondary: 'border border-border bg-secondary text-foreground hover:bg-accent',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none',
        size === 'xs' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-[13px]',
        styles,
        className,
      )}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

// ─── Forms ──────────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/30';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cn(inputClass, 'resize-y', props.className)} />;
}

export function Select({ options, placeholder, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <select {...props} className={cn(inputClass, props.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Modal ──────────────────────────────────────────────────────────────────

export function Modal({ open, title, onClose, children, footer, wide }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-accent" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ─── States ─────────────────────────────────────────────────────────────────

export function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Notice({ tone = 'gray', children }: { tone?: 'gray' | 'red' | 'amber' | 'green'; children: ReactNode }) {
  const styles = {
    gray: 'border-border bg-muted/40 text-muted-foreground',
    red: 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400',
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300',
    green: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300',
  }[tone];
  return <div className={cn('rounded-xl border px-3 py-2 text-sm', styles)}>{children}</div>;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('px-3 py-2 align-top', className)}>{children}</td>;
}
