"use client";

import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";
import { ContentSkeleton } from "@/components/ContentSkeleton";

// ─── Page Loader ────────────────────────────────────────────────────────────

export function PageLoader() {
  return <ContentSkeleton />;
}

// ─── Empty State ────────────────────────────────────────────────────────────

export function EmptyState({
  message = "No data found",
}: {
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Inbox className="h-12 w-12 text-muted mb-3" />
      <p className="text-secondary text-sm">{message}</p>
    </div>
  );
}

// ─── Error State ────────────────────────────────────────────────────────────

export function ErrorState({
  message = "Something went wrong",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertTriangle className="h-12 w-12 text-red-500 mb-3" />
      <p className="text-secondary text-sm mb-3">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary text-sm px-4 py-2">
          Retry
        </button>
      )}
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

const accentMap: Record<string, string> = {
  brand: "bg-brand-500/10 text-brand-500",
  blue: "bg-blue-500/10 text-blue-500",
  green: "bg-green-500/10 text-green-500",
  red: "bg-red-500/10 text-red-500",
  purple: "bg-purple-500/10 text-purple-500",
  amber: "bg-amber-500/10 text-amber-500",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  accent = "brand",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  accent?: string;
}) {
  const colors = accentMap[accent] || accentMap.brand;
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted uppercase tracking-wide">
          {label}
        </span>
        <div
          className={`flex items-center justify-center h-8 w-8 rounded-lg ${colors}`}
        >
          <Icon size={16} />
        </div>
      </div>
      <p className="text-2xl font-bold text-primary">{value}</p>
      {trend && <p className="text-xs text-muted mt-1">{trend}</p>}
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  APPROVED: "bg-green-500/10 text-green-600 dark:text-green-400",
  ACTIVE: "bg-green-500/10 text-green-600 dark:text-green-400",
  PENDING: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  PENDING_VERIFICATION: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  NEEDS_REUPLOAD: "bg-brand-500/10 text-brand-600 dark:text-brand-400",
  REJECTED: "bg-red-500/10 text-red-600 dark:text-red-400",
  CANCELLED: "bg-red-500/10 text-red-600 dark:text-red-400",
  SUSPENDED: "bg-red-500/10 text-red-600 dark:text-red-400",
  COMPLETED: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  UPCOMING: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  ONGOING: "bg-green-500/10 text-green-600 dark:text-green-400",
  DRAFT: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  ARCHIVED: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const color =
    statusColors[status] || "bg-gray-500/10 text-gray-600 dark:text-gray-400";
  const sizeClass =
    size === "md" ? "text-xs px-2.5 py-1" : "text-[11px] px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${color} ${sizeClass}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Confirm Dialog ─────────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-sm p-6">
        <h3 className="text-lg font-semibold text-primary mb-2">{title}</h3>
        <p className="text-sm text-secondary mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="btn-ghost text-sm px-4 py-2"
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50
              ${
                variant === "danger"
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "btn-primary"
              }
            `}
          >
            {loading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Data Table ─────────────────────────────────────────────────────────────

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  onRowClick,
  emptyMessage = "No data",
}: {
  data: T[];
  columns: {
    key: string;
    label: string;
    render?: (row: T) => React.ReactNode;
    className?: string;
  }[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-themed">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted ${col.className || ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              className={`border-b border-themed/50 transition-colors hover:bg-secondary/50 ${onRowClick ? "cursor-pointer" : ""}`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-3 text-primary ${col.className || ""}`}
                >
                  {col.render ? col.render(row) : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
