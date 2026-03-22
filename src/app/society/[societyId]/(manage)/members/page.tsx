"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Users,
  Search,
  Shield,
  UserMinus,
  UserPlus,
  Crown,
  ArrowUpDown,
  Filter,
  Pencil,
} from "lucide-react";
import {
  fetchMembers,
  fetchMyRole,
  removeMember,
  SocietyApiError,
} from "../../../api";
import {
  PageLoader,
  ErrorState,
  EmptyState,
  StatusBadge,
  ConfirmDialog,
} from "../../../_components/Shared";
import { RoleEditDialog } from "../../../_components/RoleEditDialog";
import type { SocietyMember, RoleName, MyRole } from "../../../types";

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

  const isMemberView = (myRole?.role_name || "").toLowerCase() === "member";

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

  // Check if current user can edit a member's role
  const canEditRole = (member: SocietyMember): boolean => {
    if (!myRole) return false;
    if (isMemberView) return false;
    // VP+ can edit lower-ranked members
    if (myRole.hierarchy_level < 8) return false;
    if (typeof member.hierarchy_level !== "number") return false;
    // Cannot edit equal or higher ranked members
    if (member.hierarchy_level >= myRole.hierarchy_level) return false;
    // Cannot edit President (use transfer-presidency)
    if (member.role_name === "President") return false;
    return true;
  };

  // Check if current user can remove a member
  const canRemove = (member: SocietyMember): boolean => {
    if (!myRole) return false;
    if (isMemberView) return false;
    if (typeof member.hierarchy_level !== "number") return false;
    if (myRole.hierarchy_level < 3) return false;
    if (member.hierarchy_level >= myRole.hierarchy_level) return false;
    if (member.role_name === "President") return false;
    return true;
  };

  // Filter & sort
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
  else if (sortBy === "date")
    filtered.sort(
      (a, b) =>
        new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime(),
    );
  // hierarchy is default from API

  const roles = Array.from(new Set(members.map((m) => m.role_name)));

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
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
            className="btn-ghost text-sm px-3 py-2 flex items-center gap-1"
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

      {/* Count */}
      <p className="text-xs text-muted">
        {filtered.length} member{filtered.length !== 1 ? "s" : ""}{" "}
        {roleFilter ? `(${roleFilter})` : ""}
      </p>

      {/* Members list */}
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
                {member.avatar_url ? (
                  !avatarLoadFailed[member.membership_id] ? (
                    <img
                      src={member.avatar_url}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                      onError={() => {
                        setAvatarLoadFailed((prev) => ({
                          ...prev,
                          [member.membership_id]: true,
                        }));
                      }}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {member.full_name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                  )
                ) : (
                  <div className="h-10 w-10 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {member.full_name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-primary truncate">
                      {member.full_name}
                    </p>
                    {member.role_name === "President" && (
                      <Crown
                        size={14}
                        className="text-amber-500 flex-shrink-0"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted">{member.email}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[member.role_name] || ROLE_COLORS.Member}`}
                    >
                      {member.role_name}
                    </span>
                    {member.wing_name && (
                      <span className="text-[11px] text-muted">
                        {member.wing_name}
                        {member.portfolio_name
                          ? ` → ${member.portfolio_name}`
                          : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {/* Edit role button (VP+ only, for lower-ranked members) */}
                  {canEditRole(member) && (
                    <button
                      onClick={() => setEditTarget(member)}
                      className="btn-ghost text-xs px-2 py-1.5 text-brand-500 hover:bg-brand-500/10"
                      title="Edit role"
                    >
                      <Pencil size={16} />
                    </button>
                  )}

                  {/* Remove action (only if you outrank them) */}
                  {canRemove(member) && (
                    <button
                      onClick={() => setRemoveTarget(member)}
                      className="btn-ghost text-xs px-2 py-1.5 text-red-500 hover:bg-red-500/10"
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

      {/* Role Edit Dialog */}
      <RoleEditDialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        member={editTarget}
        societyId={societyId}
        myLevel={myRole?.hierarchy_level || 0}
        onSuccess={handleRoleUpdateSuccess}
      />

      {/* Remove confirm */}
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
