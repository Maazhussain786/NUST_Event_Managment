"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Users,
  Star,
  Calendar,
  MapPin,
  Loader2,
  X,
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import EventCard from "@/components/EventCard";
import { useAuth } from "@/components/AuthProvider";

interface Society {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  is_nust_wide: boolean;
  school_name: string | null;
  school_abbr: string | null;
  member_count: number;
  avg_rating: number;
  rating_count: number;
  created_at: string;
}

interface Wing {
  id: string;
  name: string;
  description: string;
  portfolios?: Array<{ id: string; name: string }>;
}

interface Event {
  id: string;
  title: string;
  description: string;
  banner_url: string | null;
  is_paid: boolean;
  location: string;
  event_start: string;
  event_end: string;
  ticket_price: number;
  tickets_sold: number;
  society_id: string;
  society_name: string;
  society_logo: string | null;
}

export default function SocietyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { requireAuth, isLoggedIn } = useAuth();
  const [society, setSociety] = useState<Society | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [wings, setWings] = useState<Wing[]>([]);
  const [activeTab, setActiveTab] = useState<"about" | "events" | "wings">(
    "about",
  );
  const [loading, setLoading] = useState(true);
  const [joinStatusLoading, setJoinStatusLoading] = useState(false);
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinToast, setJoinToast] = useState<string | null>(null);
  const [joinStatus, setJoinStatus] = useState<{
    is_member: boolean;
    role_name?: string;
    request: null | {
      id: string;
      status:
        | "PENDING"
        | "INTERVIEW_SCHEDULED"
        | "APPROVED"
        | "REJECTED"
        | "WITHDRAWN";
      review_notes?: string | null;
      interview_scheduled_at?: string | null;
      interview_mode?: string | null;
      interview_location?: string | null;
      interview_meeting_link?: string | null;
      interview_notes?: string | null;
      created_at: string;
    };
  }>({ is_member: false, request: null });
  const [joinForm, setJoinForm] = useState({
    phone: "",
    department: "",
    year_of_study: "",
    preferred_wing_id: "",
    preferred_portfolio_id: "",
    skills: "",
    availability: "",
    motivation: "",
    prior_experience: "",
    expected_contribution: "",
  });

  useEffect(() => {
    fetch(`/api/societies/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setSociety(data.society);
        setEvents(data.events || []);
        setWings(data.wings || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    if (!isLoggedIn) {
      setJoinStatus({ is_member: false, request: null });
      return;
    }

    setJoinStatusLoading(true);
    fetch(`/api/societies/${params.id}/join-requests/me`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (res.status === 401) return null;
        const payload = await res.json();
        return payload;
      })
      .then((payload) => {
        if (!payload) return;
        setJoinStatus(payload);
      })
      .catch(() => {
        // Keep UI usable even if status endpoint fails.
      })
      .finally(() => setJoinStatusLoading(false));
  }, [params.id, isLoggedIn]);

  useEffect(() => {
    if (!joinToast) return;
    const t = setTimeout(() => setJoinToast(null), 3000);
    return () => clearTimeout(t);
  }, [joinToast]);

  const submitJoinRequest = async () => {
    if (!joinForm.motivation.trim()) {
      setJoinError("Motivation is required.");
      return;
    }
    const hasWingOptions = wings.length > 0;
    const selectedWing = wings.find((w) => w.id === joinForm.preferred_wing_id);
    const selectedWingPortfolios = selectedWing?.portfolios || [];

    if (hasWingOptions && !joinForm.preferred_wing_id) {
      setJoinError("Please select a preferred wing.");
      return;
    }
    if (
      hasWingOptions &&
      selectedWingPortfolios.length > 0 &&
      !joinForm.preferred_portfolio_id
    ) {
      setJoinError("Please select a preferred portfolio.");
      return;
    }

    setJoinSubmitting(true);
    setJoinError(null);
    try {
      const response = await fetch(
        `/api/societies/${params.id}/join-requests`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...joinForm,
            preferred_wing_id: joinForm.preferred_wing_id || undefined,
            preferred_portfolio_id:
              joinForm.preferred_portfolio_id || undefined,
            skills: joinForm.skills
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to submit join request");
      }

      setJoinStatus((prev) => ({
        ...prev,
        request: {
          id: data.request.id,
          status: data.request.status,
          created_at: data.request.created_at,
        },
      }));
      setShowJoinModal(false);
      setJoinToast(
        "Join request submitted. You will be notified after review.",
      );
    } catch (err) {
      setJoinError(
        err instanceof Error ? err.message : "Failed to submit join request",
      );
    } finally {
      setJoinSubmitting(false);
    }
  };

  const requestStatus = joinStatus.request?.status;
  const hasWingOptions = wings.length > 0;
  const selectedWing = wings.find((w) => w.id === joinForm.preferred_wing_id);
  const availablePortfolios = selectedWing?.portfolios || [];
  const needsPortfolioSelection =
    hasWingOptions &&
    !!joinForm.preferred_wing_id &&
    availablePortfolios.length > 0;
  const joinButtonLabel = (() => {
    if (joinStatusLoading) return "Checking...";
    if (joinStatus.is_member) {
      if (!joinStatus.role_name || joinStatus.role_name === "Member") {
        return "Already a Member";
      }
      return `Member · ${joinStatus.role_name}`;
    }
    if (requestStatus === "PENDING") return "Request Pending";
    if (requestStatus === "INTERVIEW_SCHEDULED") return "Interview Scheduled";
    if (requestStatus === "APPROVED") return "Approved";
    return "Join Society";
  })();

  const joinDisabled =
    joinStatusLoading ||
    joinStatus.is_member ||
    requestStatus === "PENDING" ||
    requestStatus === "INTERVIEW_SCHEDULED" ||
    requestStatus === "APPROVED";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!society) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">
        Society not found
      </div>
    );
  }

  const tabs = [
    { key: "about", label: "About" },
    { key: "events", label: `Events (${events.length})` },
    { key: "wings", label: `Wings (${wings.length})` },
  ] as const;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Header Banner */}
      <div className="relative h-48 bg-gradient-to-br from-brand-500 to-brand-700">
        <button
          onClick={() => router.back()}
          className="absolute top-12 left-4 z-10 w-10 h-10 rounded-2xl bg-black/30 backdrop-blur-md flex items-center justify-center text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Society Info */}
      <div className="px-5 -mt-16 relative z-10">
        <div className="flex items-end gap-4 mb-4">
          <div
            className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-bold text-brand-500 shrink-0 border-4"
            style={{
              background: "var(--bg-primary)",
              borderColor: "var(--bg-primary)",
            }}
          >
            {society.logo_url ? (
              <img
                src={society.logo_url}
                alt={society.name}
                className="w-full h-full rounded-2xl object-cover"
              />
            ) : (
              society.name[0]
            )}
          </div>
          <div className="pb-1">
            <h1 className="text-xl font-bold text-primary">{society.name}</h1>
            <p className="text-muted text-sm">
              {society.is_nust_wide
                ? "NUST-Wide"
                : society.school_abbr || "Society"}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mb-6">
          <div className="flex items-center gap-1 text-sm text-secondary">
            <Users className="w-4 h-4 text-brand-500" />
            <span className="font-semibold text-primary">
              {society.member_count}
            </span>{" "}
            members
          </div>
          <div className="flex items-center gap-1 text-sm text-secondary">
            <Star className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-primary">
              {society.avg_rating}
            </span>
            <span>({society.rating_count})</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-secondary">
            <Calendar className="w-4 h-4 text-brand-500" />
            <span>{events.length} events</span>
          </div>
        </div>

        {/* Join Button */}
        <button
          onClick={() => {
            if (!requireAuth("Sign in to join societies")) return;
            if (!joinDisabled) {
              setJoinError(null);
              setShowJoinModal(true);
            }
          }}
          disabled={joinDisabled}
          className={`btn-primary w-full mb-3 ${joinDisabled ? "opacity-70 cursor-not-allowed" : ""}`}
        >
          {joinButtonLabel}
        </button>

        {joinStatus.request?.status === "INTERVIEW_SCHEDULED" && (
          <div className="card p-3 mb-6 text-sm">
            <p className="text-primary font-medium mb-1">Interview scheduled</p>
            {joinStatus.request.interview_scheduled_at && (
              <p className="text-secondary">
                {new Date(
                  joinStatus.request.interview_scheduled_at,
                ).toLocaleString()}
              </p>
            )}
            {joinStatus.request.interview_mode && (
              <p className="text-muted">
                Mode: {joinStatus.request.interview_mode}
              </p>
            )}
            {joinStatus.request.interview_location && (
              <p className="text-muted">
                Location: {joinStatus.request.interview_location}
              </p>
            )}
            {joinStatus.request.interview_meeting_link && (
              <a
                href={joinStatus.request.interview_meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-500 underline"
              >
                Open meeting link
              </a>
            )}
            {joinStatus.request.interview_notes && (
              <p className="text-muted mt-1">
                {joinStatus.request.interview_notes}
              </p>
            )}
          </div>
        )}

        {/* Tabs */}
        <div
          className="flex mb-4"
          style={{ borderBottom: "1px solid var(--border-primary)" }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 pb-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.key ? "text-brand-500" : "text-muted"
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="societyTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500"
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "about" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pb-6"
          >
            <p className="text-secondary leading-relaxed">
              {society.description || "No description available."}
            </p>
          </motion.div>
        )}

        {activeTab === "events" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3 pb-6"
          >
            {events.length > 0 ? (
              events.map((event) => (
                <EventCard key={event.id} event={event} variant="compact" />
              ))
            ) : (
              <p className="text-center text-muted py-8">No upcoming events</p>
            )}
          </motion.div>
        )}

        {activeTab === "wings" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3 pb-6"
          >
            {wings.length > 0 ? (
              wings.map((wing) => (
                <div key={wing.id} className="card p-4">
                  <h3 className="text-primary font-semibold">{wing.name}</h3>
                  <p className="text-muted text-sm mt-1">
                    {wing.description || "No description"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-center text-muted py-8">
                No wings created yet
              </p>
            )}
          </motion.div>
        )}
      </div>

      {showJoinModal && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
          <div className="card w-full max-w-xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-primary">
                Join Society Application
              </h3>
              <button
                onClick={() => setShowJoinModal(false)}
                className="btn-ghost p-1.5"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="input-field"
                  placeholder="Phone"
                  value={joinForm.phone}
                  onChange={(e) =>
                    setJoinForm((p) => ({ ...p, phone: e.target.value }))
                  }
                />
                <input
                  className="input-field"
                  placeholder="Department"
                  value={joinForm.department}
                  onChange={(e) =>
                    setJoinForm((p) => ({ ...p, department: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="input-field"
                  placeholder="Year/Semester"
                  value={joinForm.year_of_study}
                  onChange={(e) =>
                    setJoinForm((p) => ({
                      ...p,
                      year_of_study: e.target.value,
                    }))
                  }
                />
                <input
                  className="input-field"
                  placeholder="Availability (e.g. weekdays 4-7pm)"
                  value={joinForm.availability}
                  onChange={(e) =>
                    setJoinForm((p) => ({ ...p, availability: e.target.value }))
                  }
                />
              </div>

              <input
                className="input-field"
                placeholder="Skills (comma separated)"
                value={joinForm.skills}
                onChange={(e) =>
                  setJoinForm((p) => ({ ...p, skills: e.target.value }))
                }
              />

              {hasWingOptions ? (
                <>
                  <select
                    className="input-field"
                    value={joinForm.preferred_wing_id}
                    onChange={(e) =>
                      setJoinForm((p) => ({
                        ...p,
                        preferred_wing_id: e.target.value,
                        preferred_portfolio_id: "",
                      }))
                    }
                  >
                    <option value="">Select preferred wing *</option>
                    {wings.map((wing) => (
                      <option key={wing.id} value={wing.id}>
                        {wing.name}
                      </option>
                    ))}
                  </select>

                  <select
                    className="input-field"
                    value={joinForm.preferred_portfolio_id}
                    onChange={(e) =>
                      setJoinForm((p) => ({
                        ...p,
                        preferred_portfolio_id: e.target.value,
                      }))
                    }
                    disabled={
                      !joinForm.preferred_wing_id ||
                      availablePortfolios.length === 0
                    }
                  >
                    <option value="">
                      {joinForm.preferred_wing_id
                        ? availablePortfolios.length > 0
                          ? "Select preferred portfolio *"
                          : "No portfolios available for selected wing"
                        : "Select wing first"}
                    </option>
                    {availablePortfolios.map((portfolio) => (
                      <option key={portfolio.id} value={portfolio.id}>
                        {portfolio.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <div
                  className="rounded-xl px-4 py-3 text-sm text-muted"
                  style={{ border: "1px solid var(--border-primary)" }}
                >
                  This society has not configured wings yet. You can still submit
                  your request without selecting wing or portfolio.
                </div>
              )}

              <textarea
                className="input-field min-h-[90px]"
                placeholder="Why do you want to join? *"
                value={joinForm.motivation}
                onChange={(e) =>
                  setJoinForm((p) => ({ ...p, motivation: e.target.value }))
                }
              />

              <textarea
                className="input-field min-h-[80px]"
                placeholder="Prior experience (optional)"
                value={joinForm.prior_experience}
                onChange={(e) =>
                  setJoinForm((p) => ({
                    ...p,
                    prior_experience: e.target.value,
                  }))
                }
              />

              <textarea
                className="input-field min-h-[80px]"
                placeholder="How will you contribute? (optional)"
                value={joinForm.expected_contribution}
                onChange={(e) =>
                  setJoinForm((p) => ({
                    ...p,
                    expected_contribution: e.target.value,
                  }))
                }
              />

              {joinError && <p className="text-sm text-red-500">{joinError}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                className="btn-ghost px-4 py-2"
                onClick={() => setShowJoinModal(false)}
                disabled={joinSubmitting}
              >
                Cancel
              </button>
              <button
                className="btn-primary px-4 py-2"
                onClick={submitJoinRequest}
                disabled={
                  joinSubmitting ||
                  !joinForm.motivation.trim() ||
                  (hasWingOptions && !joinForm.preferred_wing_id) ||
                  (needsPortfolioSelection && !joinForm.preferred_portfolio_id)
                }
              >
                {joinSubmitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {joinToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-sm px-4 py-2 rounded-lg shadow-lg">
          {joinToast}
        </div>
      )}
    </div>
  );
}
