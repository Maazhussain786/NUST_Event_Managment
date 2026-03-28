"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Search,
  UserMinus,
  Crown,
  ArrowUpDown,
  Pencil,
  Send,
  X,
} from "lucide-react";
import {
  fetchMembers,
  fetchMyRole,
  removeMember,
  fetchWings,
  fetchSocietyInvites,
  createSocietyInvite,
  fetchJoinRequests,
  reviewJoinRequest,
  SocietyApiError,
  type SocietyInvite,
  type SocietyJoinRequest,
} from "../../../api";
import {
  PageLoader,
  ErrorState,
  EmptyState,
  StatusBadge,
  ConfirmDialog,
} from "../../../_components/Shared";
import { RoleEditDialog } from "../../../_components/RoleEditDialog";
import type { SocietyMember, RoleName, MyRole, Wing } from "../../../types";
import { SmartImage } from '@/components/SmartImage';

const ROLE_COLORS: Record<string, string> = {
  President: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "Vice President": "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  Director: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "Deputy Director": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  Member: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
};

export default function MembersPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [members, setMembers] = useState<SocietyMember[]>([]);
  const [myRole, setMyRole] = useState<MyRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [removeTarget, setRemoveTarget] = useState<SocietyMember | null>(null);
  const [editTarget, setEditTarget] = useState<SocietyMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"hierarchy" | "name" | "date">(
    "hierarchy",
  );
  const [avatarLoadFailed, setAvatarLoadFailed] = useState<
    Record<string, boolean>
  >({});

  const [wings, setWings] = useState<Wing[]>([]);
  const [invites, setInvites] = useState<SocietyInvite[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleName | "">("");
  const [inviteWingId, setInviteWingId] = useState("");
  const [invitePortfolioId, setInvitePortfolioId] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<SocietyJoinRequest[]>([]);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(
    null,
  );
  const [showInterviewModalFor, setShowInterviewModalFor] =
    useState<SocietyJoinRequest | null>(null);
  const [interviewForm, setInterviewForm] = useState({
    interview_scheduled_at: "",
    interview_mode: "In-person",
    interview_location: "",
    interview_meeting_link: "",
    interview_notes: "",
    review_notes: "",
  });

  const isMemberView = (myRole?.role_name || "").toLowerCase() === "member";
  const isPresident = myRole?.role_name === "President";
  const canManageAssignments = isPresident;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, roleData] = await Promise.all([
        fetchMembers(societyId),
        fetchMyRole(societyId),
      ]);
      setMembers(data);
      setMyRole(roleData.role);

      if (roleData.role?.role_name === "President") {
        const [wingsData, invitesData, joinRequestsData] = await Promise.all([
          fetchWings(societyId),
          fetchSocietyInvites(societyId),
          fetchJoinRequests(societyId, "OPEN"),
        ]);
        setWings(wingsData);
        setInvites(invitesData);
        setJoinRequests(joinRequestsData.requests || []);
      } else {
        setWings([]);
        setInvites([]);
        setJoinRequests([]);
      }
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err.message);
      } else {
        setError("Failed to load members");
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      setRemoving(true);
      await removeMember(societyId, removeTarget.membership_id);
      setToast(`${removeTarget.full_name} removed`);
      setRemoveTarget(null);
      load();
    } catch (err) {
      if (err instanceof SocietyApiError) setToast(err.message);
      else setToast("Failed to remove member");
    } finally {
      setRemoving(false);
    }
  };

  const handleRoleUpdateSuccess = () => {
    setToast("Role updated successfully");
    load();
  };

  const resetInviteForm = () => {
    setInviteEmail("");
    setInviteRole("");
    setInviteWingId("");
    setInvitePortfolioId("");
    setInviteError(null);
  };

  const handleCreateInvite = async () => {
    if (!canManageAssignments) {
      setInviteError("Only President can send governance invites.");
      return;
    }

    const email = inviteEmail.trim().toLowerCase();
    if (!email || !inviteRole) {
      setInviteError("Email and role are required.");
      return;
    }

    if (inviteRole === "Vice President" && !inviteWingId) {
      setInviteError("Vice President invite requires a wing.");
      return;
    }

    if (
      (inviteRole === "Director" || inviteRole === "Deputy Director") &&
      (!inviteWingId || !invitePortfolioId)
    ) {
      setInviteError(
        "Director/Deputy Director invite requires wing and portfolio.",
      );
      return;
    }

    setInviteSubmitting(true);
    setInviteError(null);
    try {
      await createSocietyInvite({
        societyId,
        email,
        roleName: inviteRole,
        wingId: inviteWingId || undefined,
        portfolioId:
          inviteRole === "Director" || inviteRole === "Deputy Director"
            ? invitePortfolioId || undefined
            : undefined,
      });

      setToast(`Invite sent to ${email}`);
      setShowInviteModal(false);
      resetInviteForm();
      const latestInvites = await fetchSocietyInvites(societyId);
      setInvites(latestInvites);
    } catch (err) {
      if (err instanceof SocietyApiError) setInviteError(err.message);
      else setInviteError("Failed to create invite");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleApproveJoinRequest = async (request: SocietyJoinRequest) => {
    try {
      setReviewingRequestId(request.id);
      await reviewJoinRequest(societyId, request.id, {
        action: "APPROVE",
      });
      setToast(
        `${request.full_name || "Applicant"} approved and added as member`,
      );
      const latest = await fetchJoinRequests(societyId, "OPEN");
      setJoinRequests(latest.requests || []);
      load();
    } catch (err) {
      setToast(
        err instanceof SocietyApiError
          ? err.message
          : "Failed to approve join request",
      );
    } finally {
      setReviewingRequestId(null);
    }
  };

  const handleRejectJoinRequest = async (request: SocietyJoinRequest) => {
    const reason = window.prompt("Reason for rejection (optional):", "") || "";
    try {
      setReviewingRequestId(request.id);
      await reviewJoinRequest(societyId, request.id, {
        action: "REJECT",
        review_notes: reason,
      });
      setToast(`Rejected request from ${request.full_name || "applicant"}`);
      const latest = await fetchJoinRequests(societyId, "OPEN");
      setJoinRequests(latest.requests || []);
    } catch (err) {
      setToast(
        err instanceof SocietyApiError
          ? err.message
          : "Failed to reject join request",
      );
    } finally {
      setReviewingRequestId(null);
    }
  };

  const openInterviewModal = (request: SocietyJoinRequest) => {
    setShowInterviewModalFor(request);
    setInterviewForm({
      interview_scheduled_at: "",
      interview_mode: "In-person",
      interview_location: "",
      interview_meeting_link: "",
      interview_notes: "",
      review_notes: "",
    });
  };

  const handleScheduleInterview = async () => {
    if (!showInterviewModalFor) return;
    if (!interviewForm.interview_scheduled_at) {
      setToast("Interview date/time is required");
      return;
    }

    try {
      setReviewingRequestId(showInterviewModalFor.id);
      await reviewJoinRequest(societyId, showInterviewModalFor.id, {
        action: "SCHEDULE_INTERVIEW",
        interview_scheduled_at: interviewForm.interview_scheduled_at,
        interview_mode: interviewForm.interview_mode,
        interview_location: interviewForm.interview_location || undefined,
        interview_meeting_link:
          interviewForm.interview_meeting_link || undefined,
        interview_notes: interviewForm.interview_notes || undefined,
        review_notes: interviewForm.review_notes || undefined,
      });
      setToast(
        `Interview scheduled for ${showInterviewModalFor.full_name || "applicant"}`,
      );
      setShowInterviewModalFor(null);
      const latest = await fetchJoinRequests(societyId, "OPEN");
      setJoinRequests(latest.requests || []);
    } catch (err) {
      setToast(
        err instanceof SocietyApiError
          ? err.message
          : "Failed to schedule interview",
      );
    } finally {
      setReviewingRequestId(null);
    }
  };

  const canEditRole = (member: SocietyMember): boolean => {
    if (!canManageAssignments || !myRole) return false;
    if (isMemberView) return false;
    if (typeof member.hierarchy_level !== "number") return false;
    if (member.hierarchy_level >= myRole.hierarchy_level) return false;
    if (member.role_name === "President") return false;
    return true;
  };

  const canRemove = (member: SocietyMember): boolean => {
    if (!canManageAssignments || !myRole) return false;
    if (isMemberView) return false;
    if (typeof member.hierarchy_level !== "number") return false;
    if (member.hierarchy_level >= myRole.hierarchy_level) return false;
    if (member.role_name === "President") return false;
    return true;
  };

  let filtered = members.filter((m) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      m.full_name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q);
    const matchesRole = !roleFilter || m.role_name === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (sortBy === "name")
    filtered.sort((a, b) => a.full_name.localeCompare(b.full_name));
  else if (sortBy === "date") {
    filtered.sort(
      (a, b) =>
        new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime(),
    );
  }

  const roles = Array.from(new Set(members.map((m) => m.role_name)));
  const invitePortfolios =
    wings.find((w) => w.id === inviteWingId)?.portfolios || [];

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className="input-field pl-9"
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {canManageAssignments && (
            <button
              onClick={() => {
                resetInviteForm();
                setShowInviteModal(true);
              }}
              className="btn-primary flex items-center gap-1 px-3 py-2 text-sm"
              title="Invite member"
            >
              <Send size={14} /> Invite Member
            </button>
          )}
          <select
            className="input-field text-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All Roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              setSortBy(
                sortBy === "hierarchy"
                  ? "name"
                  : sortBy === "name"
                    ? "date"
                    : "hierarchy",
              )
            }
            className="btn-ghost flex items-center gap-1 px-3 py-2 text-sm"
            title={`Sort by ${sortBy}`}
          >
            <ArrowUpDown size={14} />{" "}
            {sortBy === "hierarchy"
              ? "Rank"
              : sortBy === "name"
                ? "Name"
                : "Date"}
          </button>
        </div>
      </div>

      <p className="text-xs text-muted">
        {filtered.length} member{filtered.length !== 1 ? "s" : ""}{" "}
        {roleFilter ? `(${roleFilter})` : ""}
      </p>

      {canManageAssignments && (
        <div className="rounded-lg border border-surface-300/70 p-3 dark:border-surface-700">
          <p className="mb-2 text-xs text-muted">Recent Invites</p>
          {invites.length === 0 ? (
            <p className="text-xs text-muted">No invites sent yet.</p>
          ) : (
            <div className="space-y-2">
              {invites.slice(0, 5).map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate text-primary">
                      {invite.invited_email}
                    </p>
                    <p className="text-muted">
                      {invite.role_name}
                      {invite.wing_name ? ` | ${invite.wing_name}` : ""}
                      {invite.portfolio_name
                        ? ` | ${invite.portfolio_name}`
                        : ""}
                    </p>
                  </div>
                  <StatusBadge status={invite.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canManageAssignments && (
        <div className="rounded-lg border border-surface-300/70 p-3 dark:border-surface-700">
          <p className="mb-2 text-xs text-muted">Join Requests</p>
          {joinRequests.length === 0 ? (
            <p className="text-xs text-muted">No pending join requests.</p>
          ) : (
            <div className="space-y-3">
              {joinRequests.map((request) => {
                const data = request.application_data;
                const applicantDetails = [
                  data.department,
                  data.year_of_study,
                  data.phone,
                ]
                  .filter((value): value is string => Boolean(value))
                  .join(" | ");

                return (
                  <div
                    key={request.id}
                    className="rounded-lg border border-themed p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-primary truncate">
                          {request.full_name || "Applicant"}
                        </p>
                        <p className="text-xs text-muted truncate">
                          {request.email || "No email"}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Applied{" "}
                          {new Date(request.created_at).toLocaleString()}
                        </p>
                      </div>
                      <StatusBadge status={request.status} />
                    </div>

                    {data.motivation && (
                      <p className="mt-2 text-xs text-secondary">
                        <span className="font-medium text-primary">
                          Motivation:
                        </span>{" "}
                        {data.motivation}
                      </p>
                    )}
                    {applicantDetails && (
                      <p className="mt-1 text-xs text-muted">
                        {applicantDetails}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleApproveJoinRequest(request)}
                        disabled={reviewingRequestId === request.id}
                        className="btn-primary px-3 py-1.5 text-xs"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => openInterviewModal(request)}
                        disabled={reviewingRequestId === request.id}
                        className="btn-ghost px-3 py-1.5 text-xs"
                      >
                        Schedule Interview
                      </button>
                      <button
                        onClick={() => handleRejectJoinRequest(request)}
                        disabled={reviewingRequestId === request.id}
                        className="btn-ghost px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState message="No members found" />
      ) : (
        <div className="space-y-2">
          {filtered.map((member) => (
            <div key={member.membership_id} className="card p-4">
              <div className="flex items-center gap-3">
                {member.avatar_url &&
                !avatarLoadFailed[member.membership_id] ? (
                  <SmartImage
                    src={member.avatar_url}
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                    onError={() => {
                      setAvatarLoadFailed((prev) => ({
                        ...prev,
                        [member.membership_id]: true,
                      }));
                    }}
                  />
                ) : (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-sm font-bold text-brand-500">
                    {member.full_name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-primary">
                      {member.full_name}
                    </p>
                    {member.role_name === "President" && (
                      <Crown
                        size={14}
                        className="flex-shrink-0 text-amber-500"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted">{member.email}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_COLORS[member.role_name] || ROLE_COLORS.Member}`}
                    >
                      {member.role_name}
                    </span>
                    {member.wing_name && (
                      <span className="text-[11px] text-muted">
                        {member.wing_name}
                        {member.portfolio_name
                          ? ` -> ${member.portfolio_name}`
                          : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {canEditRole(member) && (
                    <button
                      onClick={() => setEditTarget(member)}
                      className="btn-ghost px-2 py-1.5 text-xs text-brand-500 hover:bg-brand-500/10"
                      title="Edit role"
                    >
                      <Pencil size={16} />
                    </button>
                  )}

                  {canRemove(member) && (
                    <button
                      onClick={() => setRemoveTarget(member)}
                      className="btn-ghost px-2 py-1.5 text-xs text-red-500 hover:bg-red-500/10"
                      title="Remove member"
                    >
                      <UserMinus size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <RoleEditDialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        member={editTarget}
        societyId={societyId}
        myLevel={myRole?.hierarchy_level || 0}
        onSuccess={handleRoleUpdateSuccess}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove Member"
        message={`Remove ${removeTarget?.full_name} from this society? This action can be undone by re-inviting them.`}
        confirmText="Remove"
        variant="danger"
        loading={removing}
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-surface-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-surface-100 dark:text-surface-900">
          {toast}
        </div>
      )}

      {showInviteModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg space-y-3 rounded-xl border border-surface-300 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-primary">
                Invite Member
              </h3>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  resetInviteForm();
                }}
                className="btn-ghost p-1"
                aria-label="Close invite modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-primary">
                  Email
                </label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="member@seecs.edu.pk"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-primary">
                  Role
                </label>
                <select
                  className="input-field"
                  value={inviteRole}
                  onChange={(e) => {
                    const nextRole = e.target.value as RoleName | "";
                    setInviteRole(nextRole);
                    if (
                      nextRole !== "Director" &&
                      nextRole !== "Deputy Director"
                    ) {
                      setInvitePortfolioId("");
                    }
                  }}
                >
                  <option value="">Select role...</option>
                  <option value="Vice President">Vice President</option>
                  <option value="Director">Director</option>
                  <option value="Deputy Director">Deputy Director</option>
                  <option value="Member">Member</option>
                </select>
              </div>

              {(inviteRole === "Vice President" ||
                inviteRole === "Director" ||
                inviteRole === "Deputy Director" ||
                inviteRole === "Member") && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-primary">
                    Wing{inviteRole === "Member" ? " (optional)" : ""}
                  </label>
                  <select
                    className="input-field"
                    value={inviteWingId}
                    onChange={(e) => {
                      setInviteWingId(e.target.value);
                      setInvitePortfolioId("");
                    }}
                  >
                    <option value="">
                      {inviteRole === "Member" ? "No wing" : "Select wing..."}
                    </option>
                    {wings.map((wing) => (
                      <option key={wing.id} value={wing.id}>
                        {wing.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(inviteRole === "Director" ||
                inviteRole === "Deputy Director") &&
                inviteWingId && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-primary">
                      Portfolio
                    </label>
                    <select
                      className="input-field"
                      value={invitePortfolioId}
                      onChange={(e) => setInvitePortfolioId(e.target.value)}
                    >
                      <option value="">Select portfolio...</option>
                      {invitePortfolios.map((portfolio) => (
                        <option key={portfolio.id} value={portfolio.id}>
                          {portfolio.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

              {inviteError && (
                <div className="rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
                  {inviteError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  className="btn-ghost px-3 py-2 text-xs"
                  onClick={() => {
                    setShowInviteModal(false);
                    resetInviteForm();
                  }}
                  disabled={inviteSubmitting}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary px-3 py-2 text-xs"
                  onClick={handleCreateInvite}
                  disabled={
                    inviteSubmitting || !inviteEmail.trim() || !inviteRole
                  }
                >
                  {inviteSubmitting ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showInterviewModalFor && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg space-y-3 rounded-xl border border-surface-300 bg-surface-0 p-4 dark:border-surface-700 dark:bg-surface-900">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-primary">
                Schedule Interview
              </h3>
              <button
                onClick={() => setShowInterviewModalFor(null)}
                className="btn-ghost p-1"
                aria-label="Close interview modal"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-muted">
              Applicant: {showInterviewModalFor.full_name || "Applicant"}
            </p>

            <div className="space-y-2">
              <input
                type="datetime-local"
                className="input-field"
                value={interviewForm.interview_scheduled_at}
                onChange={(e) =>
                  setInterviewForm((p) => ({
                    ...p,
                    interview_scheduled_at: e.target.value,
                  }))
                }
              />
              <input
                className="input-field"
                placeholder="Mode (In-person / Online)"
                value={interviewForm.interview_mode}
                onChange={(e) =>
                  setInterviewForm((p) => ({
                    ...p,
                    interview_mode: e.target.value,
                  }))
                }
              />
              <input
                className="input-field"
                placeholder="Location"
                value={interviewForm.interview_location}
                onChange={(e) =>
                  setInterviewForm((p) => ({
                    ...p,
                    interview_location: e.target.value,
                  }))
                }
              />
              <input
                className="input-field"
                placeholder="Meeting link (optional)"
                value={interviewForm.interview_meeting_link}
                onChange={(e) =>
                  setInterviewForm((p) => ({
                    ...p,
                    interview_meeting_link: e.target.value,
                  }))
                }
              />
              <textarea
                className="input-field min-h-[80px]"
                placeholder="Interview instructions for applicant"
                value={interviewForm.interview_notes}
                onChange={(e) =>
                  setInterviewForm((p) => ({
                    ...p,
                    interview_notes: e.target.value,
                  }))
                }
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                className="btn-ghost px-3 py-2 text-xs"
                onClick={() => setShowInterviewModalFor(null)}
                disabled={reviewingRequestId === showInterviewModalFor.id}
              >
                Cancel
              </button>
              <button
                className="btn-primary px-3 py-2 text-xs"
                onClick={handleScheduleInterview}
                disabled={reviewingRequestId === showInterviewModalFor.id}
              >
                {reviewingRequestId === showInterviewModalFor.id
                  ? "Saving..."
                  : "Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


