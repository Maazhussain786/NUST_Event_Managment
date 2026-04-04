"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Users,
  Star,
  Calendar,
  Loader2,
  X,
  Building2,
  Shield,
  Sparkles,
  Mail,
  Phone,
  MapPin,
  Globe,
  Instagram,
  Linkedin,
  Youtube,
  Facebook,
  Twitter,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import EventCard from "@/components/EventCard";
import { SmartImage } from "@/components/SmartImage";
import { useAuth } from "@/components/AuthProvider";
import type { LucideIcon } from "lucide-react";

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

interface SocietyProfile {
  tagline?: string | null;
  cover_url?: string | null;
  mission?: string | null;
  established_year?: number | null;
  faculty_advisor?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  office_location?: string | null;
  social_links?: Record<string, string> | null;
  primary_color?: string | null;
  accent_color?: string | null;
  pin_announcement?: string | null;
}

interface Wing {
  id: string;
  name: string;
  description: string;
  portfolios?: Array<{ id: string; name: string }>;
}

interface SocietyMember {
  membership_id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role_name: string;
  hierarchy_level: number;
  wing_name: string | null;
  portfolio_name: string | null;
  assigned_at: string;
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

type SocialPlatform =
  | "instagram"
  | "linkedin"
  | "youtube"
  | "x"
  | "facebook"
  | "website";

interface SocialLinkItem {
  platform: SocialPlatform;
  label: string;
  href: string;
  icon: LucideIcon;
}

const SOCIAL_PLATFORM_MAP: Record<
  SocialPlatform,
  { label: string; icon: LucideIcon; hosts: string[]; aliases: string[] }
> = {
  instagram: {
    label: "Instagram",
    icon: Instagram,
    hosts: ["instagram.com", "www.instagram.com"],
    aliases: ["instagram", "insta", "instagram_url"],
  },
  linkedin: {
    label: "LinkedIn",
    icon: Linkedin,
    hosts: ["linkedin.com", "www.linkedin.com"],
    aliases: ["linkedin", "linkedin_url"],
  },
  youtube: {
    label: "YouTube",
    icon: Youtube,
    hosts: ["youtube.com", "www.youtube.com", "youtu.be"],
    aliases: ["youtube", "youtube_url", "yt", "yt_url"],
  },
  x: {
    label: "X",
    icon: Twitter,
    hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
    aliases: ["x", "x_url", "twitter", "twitter_url"],
  },
  facebook: {
    label: "Facebook",
    icon: Facebook,
    hosts: ["facebook.com", "www.facebook.com", "fb.com", "www.fb.com"],
    aliases: ["facebook", "facebook_url", "fb", "fb_url"],
  },
  website: {
    label: "Website",
    icon: Globe,
    hosts: [],
    aliases: ["website", "site", "url", "web", "homepage"],
  },
};

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildSocialLinks(socialLinks: SocietyProfile["social_links"]): SocialLinkItem[] {
  if (!socialLinks || typeof socialLinks !== "object") return [];

  const normalizedInput = Object.entries(socialLinks).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (typeof value === "string") {
        acc[key.trim().toLowerCase()] = value;
      }
      return acc;
    },
    {},
  );

  const output: SocialLinkItem[] = [];

  (Object.keys(SOCIAL_PLATFORM_MAP) as SocialPlatform[]).forEach((platform) => {
    const config = SOCIAL_PLATFORM_MAP[platform];
    const raw = config.aliases
      .map((alias) => normalizedInput[alias])
      .find((candidate) => !!candidate?.trim());

    if (!raw) return;

    const href = normalizeUrl(raw);
    if (!href) return;

    if (config.hosts.length > 0) {
      try {
        const host = new URL(href).hostname.toLowerCase();
        const matches = config.hosts.some(
          (allowed) => host === allowed || host.endsWith(`.${allowed}`),
        );
        if (!matches) return;
      } catch {
        return;
      }
    }

    output.push({
      platform,
      label: config.label,
      href,
      icon: config.icon,
    });
  });

  return output;
}

const hierarchyLabel = (level: number) => {
  if (level >= 4) return "Executive Leadership";
  if (level === 3) return "Directors";
  if (level === 2) return "Deputy Directors";
  return "Members";
};

export default function SocietyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { requireAuth, isLoggedIn } = useAuth();

  const [society, setSociety] = useState<Society | null>(null);
  const [profile, setProfile] = useState<SocietyProfile | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [wings, setWings] = useState<Wing[]>([]);
  const [members, setMembers] = useState<SocietyMember[]>([]);

  const [activeTab, setActiveTab] = useState<"about" | "members" | "events" | "wings">("about");
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
      status: "PENDING" | "INTERVIEW_SCHEDULED" | "APPROVED" | "REJECTED" | "WITHDRAWN";
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
        setProfile(data.profile || null);
        setEvents(data.events || []);
        setWings(data.wings || []);
        setMembers(data.members || []);
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
        return await res.json();
      })
      .then((payload) => {
        if (!payload) return;
        setJoinStatus(payload);
      })
      .catch(() => {
        // Keep page usable even if this endpoint fails.
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
    if (hasWingOptions && selectedWingPortfolios.length > 0 && !joinForm.preferred_portfolio_id) {
      setJoinError("Please select a preferred portfolio.");
      return;
    }

    setJoinSubmitting(true);
    setJoinError(null);

    try {
      const response = await fetch(`/api/societies/${params.id}/join-requests`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...joinForm,
          preferred_wing_id: joinForm.preferred_wing_id || undefined,
          preferred_portfolio_id: joinForm.preferred_portfolio_id || undefined,
          skills: joinForm.skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });

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
      setJoinToast("Join request submitted. You will be notified after review.");
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Failed to submit join request");
    } finally {
      setJoinSubmitting(false);
    }
  };

  const requestStatus = joinStatus.request?.status;
  const hasWingOptions = wings.length > 0;
  const selectedWing = wings.find((w) => w.id === joinForm.preferred_wing_id);
  const availablePortfolios = selectedWing?.portfolios || [];
  const needsPortfolioSelection = hasWingOptions && !!joinForm.preferred_wing_id && availablePortfolios.length > 0;

  const joinButtonLabel = (() => {
    if (joinStatusLoading) return "Checking...";
    if (joinStatus.is_member) return joinStatus.role_name ? `Member · ${joinStatus.role_name}` : "Already a Member";
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

  const groupedMembers = useMemo(() => {
    const groups = new Map<number, SocietyMember[]>();
    for (const member of members) {
      const bucket = groups.get(member.hierarchy_level) || [];
      bucket.push(member);
      groups.set(member.hierarchy_level, bucket);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0] - a[0]);
  }, [members]);

  const socialLinks = useMemo(
    () => buildSocialLinks(profile?.social_links || null),
    [profile?.social_links],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!society) {
    return <div className="min-h-screen flex items-center justify-center text-muted">Society not found</div>;
  }

  const tabs = [
    { key: "about", label: "About" },
    { key: "members", label: `Members (${members.length})` },
    { key: "events", label: `Events (${events.length})` },
    { key: "wings", label: `Wings (${wings.length})` },
  ] as const;

  return (
    <div className="min-h-screen pb-20" style={{ background: "var(--bg-primary)" }}>
      <section className="relative overflow-hidden">
        <div className="h-56 md:h-64 w-full relative">
          {profile?.cover_url ? (
            <SmartImage src={profile.cover_url} alt={`${society.name} cover`} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: profile?.primary_color
                  ? `linear-gradient(120deg, ${profile.primary_color} 0%, ${profile.accent_color || "#f59e0b"} 100%)`
                  : "linear-gradient(120deg, #fb923c 0%, #f97316 55%, #ea580c 100%)",
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/30 to-[var(--bg-primary)]" />

          <button
            onClick={() => router.back()}
            className="absolute top-6 left-4 z-10 w-10 h-10 rounded-2xl bg-black/35 backdrop-blur-md flex items-center justify-center text-white"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 -mt-14 relative z-20">
          <div className="card p-4 md:p-5">
            <div className="flex items-start gap-4">
              <div
                className="w-20 h-20 rounded-2xl shrink-0 border"
                style={{ borderColor: "var(--border-primary)", background: "var(--bg-secondary)" }}
              >
                {society.logo_url ? (
                  <SmartImage src={society.logo_url} alt={society.name} className="w-full h-full rounded-2xl object-cover" />
                ) : (
                  <div className="w-full h-full rounded-2xl flex items-center justify-center text-2xl font-bold text-brand-500">
                    {society.name[0]}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-primary leading-tight">{society.name}</h1>
                <p className="text-sm text-muted mt-1">
                  {profile?.tagline || (society.is_nust_wide ? "NUST-Wide Society" : society.school_name || society.school_abbr || "Society")}
                </p>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full px-2.5 py-1 bg-brand-500/10 text-brand-500 font-medium inline-flex items-center gap-1">
                    <Users className="w-3 h-3" /> {society.member_count} members
                  </span>
                  <span className="rounded-full px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium inline-flex items-center gap-1">
                    <Star className="w-3 h-3" /> {Number(society.avg_rating || 0).toFixed(2)} ({society.rating_count})
                  </span>
                  <span className="rounded-full px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {events.length} events
                  </span>
                  <span className="rounded-full px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> {wings.length} wings
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                if (!requireAuth("Sign in to join societies")) return;
                if (!joinDisabled) {
                  setJoinError(null);
                  setShowJoinModal(true);
                }
              }}
              disabled={joinDisabled}
              className={`btn-primary w-full mt-4 ${joinDisabled ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              {joinButtonLabel}
            </button>
          </div>
        </div>
      </section>

      <div className="px-5 mt-4 space-y-4">
        {(profile?.pin_announcement ||
          profile?.faculty_advisor ||
          profile?.contact_email ||
          profile?.contact_phone ||
          profile?.office_location ||
          socialLinks.length > 0) && (
          <div className="card p-4 space-y-3">
            {profile?.pin_announcement && (
              <div className="rounded-xl px-3 py-2.5 bg-brand-500/10 text-brand-600 dark:text-brand-400 text-sm font-medium inline-flex items-start gap-2 w-full">
                <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{profile.pin_announcement}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
              {profile?.faculty_advisor && (
                <div className="rounded-xl px-3 py-2 border border-border bg-surface-50 dark:bg-surface-900/30 inline-flex items-center gap-2 text-secondary">
                  <Shield className="w-4 h-4 text-brand-500" />
                  Faculty Advisor: {profile.faculty_advisor}
                </div>
              )}
              {profile?.contact_email && (
                <div className="rounded-xl px-3 py-2 border border-border bg-surface-50 dark:bg-surface-900/30 inline-flex items-center gap-2 text-secondary">
                  <Mail className="w-4 h-4 text-brand-500" />
                  {profile.contact_email}
                </div>
              )}
              {profile?.contact_phone && (
                <div className="rounded-xl px-3 py-2 border border-border bg-surface-50 dark:bg-surface-900/30 inline-flex items-center gap-2 text-secondary">
                  <Phone className="w-4 h-4 text-brand-500" />
                  {profile.contact_phone}
                </div>
              )}
              {profile?.office_location && (
                <div className="rounded-xl px-3 py-2 border border-border bg-surface-50 dark:bg-surface-900/30 inline-flex items-center gap-2 text-secondary">
                  <MapPin className="w-4 h-4 text-brand-500" />
                  {profile.office_location}
                </div>
              )}
            </div>

            {socialLinks.length > 0 && (
              <div className="pt-1">
                <p className="text-xs font-semibold text-muted mb-2">Social Links</p>
                <div className="flex flex-wrap gap-2">
                  {socialLinks.map((item) => {
                    const Icon = item.icon;
                    return (
                      <a
                        key={item.platform}
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border border-border bg-surface-50 dark:bg-surface-900/30 hover:border-brand-400 hover:text-brand-500 transition-colors"
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {item.label}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex mb-1" style={{ borderBottom: "1px solid var(--border-primary)" }}>
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
                <motion.div layoutId="societyTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
              )}
            </button>
          ))}
        </div>

        {activeTab === "about" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 pb-6">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-2">About Society</h3>
              <p className="text-secondary leading-relaxed">{society.description || "No description available."}</p>
            </div>
            {profile?.mission && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-primary mb-2">Mission</h3>
                <p className="text-secondary leading-relaxed">{profile.mission}</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "members" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 pb-6">
            {groupedMembers.length > 0 ? (
              groupedMembers.map(([level, people]) => (
                <div key={level} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-primary">{hierarchyLabel(level)}</h3>
                    <span className="text-xs text-muted">{people.length} members</span>
                  </div>

                  <div className="space-y-2">
                    {people.map((member) => (
                      <div
                        key={member.membership_id}
                        className="rounded-xl border border-border px-3 py-2.5 bg-surface-50 dark:bg-surface-900/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-brand-500/10 shrink-0">
                            {member.avatar_url ? (
                              <SmartImage src={member.avatar_url} alt={member.full_name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-brand-500 font-semibold">
                                {member.full_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-primary truncate">{member.full_name}</p>
                            <p className="text-xs text-muted truncate">
                              {member.role_name}
                              {member.wing_name ? ` • ${member.wing_name}` : ""}
                              {member.portfolio_name ? ` • ${member.portfolio_name}` : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted py-8">No members found</p>
            )}
          </motion.div>
        )}

        {activeTab === "events" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 pb-6">
            {events.length > 0 ? (
              events.map((event) => <EventCard key={event.id} event={event} variant="compact" />)
            ) : (
              <p className="text-center text-muted py-8">No upcoming events</p>
            )}
          </motion.div>
        )}

        {activeTab === "wings" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 pb-6">
            {wings.length > 0 ? (
              wings.map((wing) => (
                <div key={wing.id} className="card p-4">
                  <h3 className="text-primary font-semibold">{wing.name}</h3>
                  <p className="text-muted text-sm mt-1">{wing.description || "No description"}</p>
                  {wing.portfolios && wing.portfolios.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {wing.portfolios.map((portfolio) => (
                        <span key={portfolio.id} className="text-xs rounded-full px-2.5 py-1 bg-brand-500/10 text-brand-500">
                          {portfolio.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-center text-muted py-8">No wings created yet</p>
            )}
          </motion.div>
        )}
      </div>

      {showJoinModal && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
          <div className="card w-full max-w-xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-primary">Join Society Application</h3>
              <button onClick={() => setShowJoinModal(false)} className="btn-ghost p-1.5">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="input-field"
                  placeholder="Phone"
                  value={joinForm.phone}
                  onChange={(e) => setJoinForm((p) => ({ ...p, phone: e.target.value }))}
                />
                <input
                  className="input-field"
                  placeholder="Department"
                  value={joinForm.department}
                  onChange={(e) => setJoinForm((p) => ({ ...p, department: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="input-field"
                  placeholder="Year/Semester"
                  value={joinForm.year_of_study}
                  onChange={(e) => setJoinForm((p) => ({ ...p, year_of_study: e.target.value }))}
                />
                <input
                  className="input-field"
                  placeholder="Availability (e.g. weekdays 4-7pm)"
                  value={joinForm.availability}
                  onChange={(e) => setJoinForm((p) => ({ ...p, availability: e.target.value }))}
                />
              </div>

              <input
                className="input-field"
                placeholder="Skills (comma separated)"
                value={joinForm.skills}
                onChange={(e) => setJoinForm((p) => ({ ...p, skills: e.target.value }))}
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
                    disabled={!joinForm.preferred_wing_id || availablePortfolios.length === 0}
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
                <div className="rounded-xl px-4 py-3 text-sm text-muted" style={{ border: "1px solid var(--border-primary)" }}>
                  This society has not configured wings yet. You can still submit your request without selecting wing or
                  portfolio.
                </div>
              )}

              <textarea
                className="input-field min-h-[90px]"
                placeholder="Why do you want to join? *"
                value={joinForm.motivation}
                onChange={(e) => setJoinForm((p) => ({ ...p, motivation: e.target.value }))}
              />

              <textarea
                className="input-field min-h-[80px]"
                placeholder="Prior experience (optional)"
                value={joinForm.prior_experience}
                onChange={(e) => setJoinForm((p) => ({ ...p, prior_experience: e.target.value }))}
              />

              <textarea
                className="input-field min-h-[80px]"
                placeholder="How will you contribute? (optional)"
                value={joinForm.expected_contribution}
                onChange={(e) => setJoinForm((p) => ({ ...p, expected_contribution: e.target.value }))}
              />

              {joinError && <p className="text-sm text-red-500">{joinError}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-ghost px-4 py-2" onClick={() => setShowJoinModal(false)} disabled={joinSubmitting}>
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
