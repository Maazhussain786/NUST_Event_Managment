"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, BellOff, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { ContentSkeleton } from "@/components/ContentSkeleton";

interface Notification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setNotifs(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const markAllRead = async () => {
    setNotifs((n) => n.map((x) => ({ ...x, is_read: true })));
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  };

  const markRead = async (id: string) => {
    setNotifs((n) => n.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: id }),
    });
  };

  const toAppLink = (raw: string | null): string | null => {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("/")) return trimmed;
    try {
      const url = new URL(trimmed);
      if (
        typeof window !== "undefined" &&
        url.origin === window.location.origin
      ) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      return null;
    }
    return null;
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.is_read) {
      await markRead(n.id);
    }
    const appLink = toAppLink(n.link);
    if (appLink) {
      router.push(appLink);
    }
  };

  const unreadCount = notifs.filter((n) => !n.is_read).length;

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <div className="px-5 pt-12 pb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl"
          style={{ background: "var(--bg-card)" }}
        >
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h1 className="text-xl font-bold text-primary flex-1">Notifications</h1>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-brand-500 text-sm font-medium flex items-center gap-1"
          >
            <Check className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      <div className="px-5 pb-32">
        {loading ? (
          <ContentSkeleton />
        ) : notifs.length === 0 ? (
          <div className="text-center py-20">
            <BellOff className="w-16 h-16 mx-auto text-surface-400 mb-4" />
            <h2 className="text-primary text-lg font-semibold mb-2">
              All Quiet
            </h2>
            <p className="text-muted text-sm">You have no notifications yet.</p>
          </div>
        ) : (
          <div className="space-y-2 mt-4">
            {notifs.map((n, i) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => handleNotificationClick(n)}
                className={`card p-4 flex items-start gap-3 cursor-pointer transition-all ${!n.is_read ? "border-l-4 border-l-brand-500" : ""}`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${!n.is_read ? "bg-brand-500/15" : "bg-surface-200 dark:bg-surface-700"}`}
                >
                  <Bell
                    className={`w-5 h-5 ${!n.is_read ? "text-brand-500" : "text-muted"}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    className={`text-sm font-medium truncate ${!n.is_read ? "text-primary" : "text-muted"}`}
                  >
                    {n.title}
                  </h3>
                  <p className="text-muted text-xs mt-0.5 line-clamp-2">
                    {n.body}
                  </p>
                  <p className="text-muted text-[11px] mt-1">
                    {timeAgo(n.created_at)}
                  </p>
                </div>
                {!n.is_read && (
                  <div className="w-2 h-2 rounded-full bg-brand-500 mt-2 flex-shrink-0" />
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
