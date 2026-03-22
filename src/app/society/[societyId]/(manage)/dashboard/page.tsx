"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Users,
  Calendar,
  Ticket,
  ScanLine,
  Network,
  HardDrive,
  Wallet,
  Clock,
  Activity,
  Plus,
  ChevronRight,
} from "lucide-react";
import { fetchGovernanceOverview, SocietyApiError } from "../../../api";
import {
  PageLoader,
  ErrorState,
  StatCard,
  StatusBadge,
} from "../../../_components/Shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GovernanceOverview } from "../../../types";

export default function SocietyOverviewPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [data, setData] = useState<GovernanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const overview = await fetchGovernanceOverview(societyId);
      setData(overview);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) {
          router.push("/login");
          return;
        }
        if (err.status === 403) {
          setError("You do not have access to this dashboard.");
          return;
        }
        setError(err.message);
      } else {
        setError("Failed to load dashboard");
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader />;
  if (error || !data)
    return <ErrorState message={error || "Failed to load"} onRetry={load} />;

  const { stats, upcomingEvents, recentActivity, myRole } = data;
  const isMemberView = myRole.hierarchy_level <= 1;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Role banner */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-brand-500/10 text-brand-500 shrink-0">
          <Activity size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body-sm font-semibold text-foreground">
            Welcome back — you are the{" "}
            <span className="text-brand-600 dark:text-brand-400">
              {myRole.role_name}
            </span>
          </p>
          <p className="text-caption text-muted-foreground flex items-center gap-1.5">
            Society is <StatusBadge status={data.society.status} />
          </p>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Members"
          value={stats.totalMembers}
          icon={Users}
          accent="blue"
        />
        <StatCard
          label="Events"
          value={stats.totalEvents}
          icon={Calendar}
          accent="purple"
        />
        <StatCard
          label="Upcoming"
          value={stats.upcomingEvents}
          icon={Clock}
          accent="amber"
        />
        <StatCard
          label="Ongoing"
          value={stats.ongoingEvents}
          icon={Activity}
          accent="green"
        />
        {!isMemberView && (
          <>
            <StatCard
              label="Pending Tickets"
              value={stats.pendingTickets}
              icon={Ticket}
              accent="red"
            />
            <StatCard
              label="Total Check-ins"
              value={stats.totalCheckins}
              icon={ScanLine}
              accent="brand"
            />
            <StatCard
              label="Wings"
              value={stats.totalWings}
              icon={Network}
              accent="blue"
            />
            <StatCard
              label="Revenue"
              value={`Rs. ${Number(stats.totalRevenue || 0).toLocaleString()}`}
              icon={Wallet}
              accent="green"
            />
          </>
        )}
      </div>

      {!isMemberView && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-body-sm font-medium text-foreground flex items-center gap-2">
              <HardDrive size={16} className="text-muted-foreground" /> Storage
              Usage
            </span>
            <span className="text-caption text-muted-foreground">
              {stats.storagePercentUsed.toFixed(1)}% used
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                stats.storagePercentUsed > 90
                  ? "bg-red-500"
                  : stats.storagePercentUsed > 70
                    ? "bg-amber-500"
                    : "bg-brand-500",
              )}
              style={{ width: `${Math.min(stats.storagePercentUsed, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Upcoming events */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body-sm font-semibold text-foreground">
              Upcoming Events
            </h2>
            <button
              onClick={() => router.push(`/society/${societyId}/events`)}
              className="text-caption text-brand-600 dark:text-brand-400 hover:underline font-semibold"
            >
              View all
            </button>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="text-body-sm text-muted-foreground text-center py-8">
              No upcoming events
            </p>
          ) : (
            <div className="space-y-1">
              {upcomingEvents.slice(0, 5).map((event) => (
                <button
                  key={event.id}
                  onClick={() => router.push(`/society/${societyId}/events`)}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent transition-colors w-full text-left"
                >
                  <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 shrink-0">
                    <Calendar size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-foreground truncate">
                      {event.title}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {new Date(event.event_start).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <StatusBadge status={event.status} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        {!isMemberView && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-body-sm font-semibold text-foreground mb-4">
              Recent Activity
            </h2>
            {recentActivity.length === 0 ? (
              <p className="text-body-sm text-muted-foreground text-center py-8">
                No recent activity
              </p>
            ) : (
              <div className="space-y-3">
                {recentActivity.slice(0, 8).map((log) => (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="h-1.5 w-1.5 rounded-full bg-brand-500 mt-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm text-foreground">
                        <span className="font-medium">
                          {log.performedByName || "System"}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {formatAction(log.action)}
                        </span>
                      </p>
                      <p className="text-caption text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick actions */}
      {isMemberView && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-body-sm font-semibold text-foreground mb-3">
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/society/${societyId}/events`)}
            >
              <Calendar className="w-4 h-4" />
              View Events
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/society/${societyId}/photos`)}
            >
              <ChevronRight className="w-4 h-4" />
              Browse Photos
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/society/${societyId}/chat`)}
            >
              <Users className="w-4 h-4" />
              Open Chat
            </Button>
          </div>
        </div>
      )}

      {!isMemberView && myRole.hierarchy_level >= 5 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-body-sm font-semibold text-foreground mb-3">
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-2.5">
            <Button
              size="sm"
              onClick={() => router.push(`/society/${societyId}/events`)}
            >
              <Plus className="w-4 h-4" />
              Create Event
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/society/${societyId}/members`)}
            >
              <Users className="w-4 h-4" />
              Manage Members
            </Button>
            {myRole.hierarchy_level >= 8 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/society/${societyId}/approvals`)}
              >
                <Ticket className="w-4 h-4" />
                Review Tickets
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
