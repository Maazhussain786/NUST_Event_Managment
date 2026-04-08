"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldOff,
  AlertOctagon,
  Power,
  Zap,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { ErrorState } from "../_components/Shared";
import { Skeleton } from "@/components/ui/skeleton";
import type { EmergencyStatus } from "../types";
import { fetchEmergencyStatus, toggleEmergencyFlag } from "../api";

function EmergencySkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="card p-5 border-2 border-border">
        <div className="flex items-center gap-4">
           <Skeleton className="w-14 h-14 rounded-2xl shrink-0" />
           <div className="space-y-2">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-48" />
           </div>
        </div>
      </div>

      <div className="space-y-3">
         {[1, 2, 3, 4].map(i => (
           <div key={i} className="card p-4 border-l-4 border-border flex items-center gap-4">
              <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                 <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                    <Skeleton className="h-4 w-16 text-transparent" />
                 </div>
                 <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-10 w-32 rounded-xl shrink-0" />
           </div>
         ))}
      </div>

      <div className="card p-4">
         <div className="flex gap-3">
            <Skeleton className="w-5 h-5 rounded-md shrink-0" />
            <div className="space-y-2 flex-1">
               <Skeleton className="h-5 w-72" />
               <Skeleton className="h-4 w-full" />
               <Skeleton className="h-4 w-2/3" />
            </div>
         </div>
      </div>
    </div>
  );
}

export default function EmergencyPage() {
  const [status, setStatus] = useState<EmergencyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchEmergencyStatus();
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (key: string, current: boolean) => {
    const action = current ? "DEACTIVATE" : "ACTIVATE";
    if (
      !confirm(
        `${action} emergency control: ${key}?\n\nThis will take effect immediately.`,
      )
    )
      return;
    setToggling(key);
    try {
      await toggleEmergencyFlag(key, !current);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to toggle emergency flag");
    } finally {
      setToggling(null);
    }
  };

  if (loading) return <EmergencySkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!status) return <ErrorState message="No data" />;

  const activeFlags = status.flags.filter((f) => f.enabled).length;
  const isEmergency = activeFlags > 0;

  const severityIcon = {
    LOW: CheckCircle,
    MEDIUM: AlertTriangle,
    HIGH: AlertOctagon,
    CRITICAL: ShieldOff,
  };

  const severityColor = {
    LOW: "text-gray-500",
    MEDIUM: "text-amber-500",
    HIGH: "text-red-500",
    CRITICAL: "text-red-600",
  };

  const severityBorder = {
    LOW: "border-gray-200 dark:border-gray-700",
    MEDIUM: "border-amber-200 dark:border-amber-800",
    HIGH: "border-red-200 dark:border-red-800",
    CRITICAL: "border-red-300 dark:border-red-700",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Emergency Control Panel
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Quick-access emergency shutdowns and platform-wide controls
        </p>
      </div>

      {/* Status Banner */}
      <div
        className={`card p-5 border-2 ${
          isEmergency
            ? "border-red-400 dark:border-red-600 bg-red-50/50 dark:bg-red-950/20"
            : "border-emerald-400 dark:border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20"
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
              isEmergency
                ? "bg-red-100 dark:bg-red-900/30"
                : "bg-emerald-100 dark:bg-emerald-900/30"
            }`}
          >
            {isEmergency ? (
              <ShieldOff className="w-7 h-7 text-red-500" />
            ) : (
              <CheckCircle className="w-7 h-7 text-emerald-500" />
            )}
          </div>
          <div>
            <h2
              className={`text-lg font-bold ${isEmergency ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
            >
              {isEmergency
                ? `EMERGENCY ACTIVE — ${activeFlags} control(s) engaged`
                : "ALL SYSTEMS NORMAL"}
            </h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {status.activeIncidents} open incident(s)
              {status.lastEmergencyAction && (
                <>
                  {" "}
                  • Last emergency action:{" "}
                  {new Date(status.lastEmergencyAction).toLocaleString()}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Emergency Flags */}
      <div className="space-y-3">
        {status.flags.map((flag) => {
          const Icon = severityIcon[flag.severity] || AlertTriangle;
          return (
            <div
              key={flag.key}
              className={`card p-4 border-l-4 ${severityBorder[flag.severity] || ""} ${
                flag.enabled
                  ? "ring-2 ring-red-400/50 dark:ring-red-600/50"
                  : ""
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    flag.enabled
                      ? "bg-red-100 dark:bg-red-900/30"
                      : "bg-surface-100 dark:bg-surface-800"
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 ${flag.enabled ? "text-red-500" : severityColor[flag.severity] || ""}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      className="text-sm font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {flag.label}
                    </h3>
                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                        flag.enabled
                          ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                          : "bg-gray-100 dark:bg-gray-800/50 text-gray-500"
                      }`}
                    >
                      {flag.enabled ? "ACTIVE" : "INACTIVE"}
                    </span>
                    <span
                      className={`text-[10px] font-semibold uppercase ${severityColor[flag.severity]}`}
                    >
                      {flag.severity}
                    </span>
                  </div>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {flag.description}
                  </p>
                </div>
                <button
                  onClick={() => handleToggle(flag.key, flag.enabled)}
                  disabled={toggling === flag.key}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors shrink-0 ${
                    flag.enabled
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                      : "bg-red-500 hover:bg-red-600 text-white"
                  }`}
                >
                  {toggling === flag.key ? (
                    <Zap className="w-4 h-4 animate-pulse" />
                  ) : (
                    <Power className="w-4 h-4" />
                  )}
                  {flag.enabled ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Warning footer */}
      <div className="card p-4 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Emergency controls take effect immediately
            </p>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--text-secondary)" }}
            >
              All emergency actions are audit logged. Activating a control will
              immediately affect all users on the platform. Use these only when
              necessary.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
