"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Users,
  Calendar,
  HardDrive,
  CheckCircle2,
  XCircle,
  Ban,
  RotateCcw,
  ArrowRightLeft,
  Save,
  MessageCircle,
  Search,
} from "lucide-react";
import { StatusBadge } from "../../_components/StatusBadge";
import { PageLoader, ErrorState } from "../../_components/Shared";
import {
  fetchSocieties,
  patchSociety,
  suspendSociety,
  reactivateSociety,
  forceTransferPresidency,
  searchSocietyMembersForTransfer,
  updateStorageLimit,
} from "../../api";
import type { AdminSociety, SocietyTransferMember } from "../../types";
import { SmartImage } from '@/components/SmartImage';

export default function SocietyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [society, setSociety] = useState<AdminSociety | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modals
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [showInfoRequestModal, setShowInfoRequestModal] = useState(false);
  const [reason, setReason] = useState("");
  const [transferSearch, setTransferSearch] = useState("");
  const [transferMembers, setTransferMembers] = useState<
    SocietyTransferMember[]
  >([]);
  const [transferLoadingMembers, setTransferLoadingMembers] = useState(false);
  const [selectedTransferMember, setSelectedTransferMember] =
    useState<SocietyTransferMember | null>(null);
  const [storageLimitMB, setStorageLimitMB] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const all = await fetchSocieties();
      const data = all.find((s) => s.id === id) || null;
      setSociety(data);
      if (data?.storage_quota_bytes) {
        setStorageLimitMB(
          String(Math.round(data.storage_quota_bytes / (1024 * 1024))),
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load society");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async () => {
    setActionLoading("approve");
    try {
      await patchSociety(id, "APPROVED");
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!reason.trim()) return;
    setActionLoading("reject");
    try {
      await patchSociety(id, "REJECTED", reason);
      setShowRejectModal(false);
      setReason("");
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestInfo = async () => {
    if (!reason.trim()) return;
    setActionLoading("info-request");
    try {
      await patchSociety(id, "INFO_REQUESTED", reason);
      setShowInfoRequestModal(false);
      setReason("");
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async () => {
    if (!reason.trim()) return;
    setActionLoading("suspend");
    try {
      await suspendSociety(id, reason);
      setShowSuspendModal(false);
      setReason("");
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async () => {
    setActionLoading("reactivate");
    try {
      await reactivateSociety(id);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleTransfer = async () => {
    if (!selectedTransferMember || !reason.trim()) return;
    setActionLoading("transfer");
    try {
      await forceTransferPresidency(id, selectedTransferMember.id, reason);
      setShowTransferModal(false);
      setTransferSearch("");
      setTransferMembers([]);
      setSelectedTransferMember(null);
      setReason("");
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    if (!showTransferModal) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        setTransferLoadingMembers(true);
        const members = await searchSocietyMembersForTransfer(
          id,
          transferSearch,
        );
        if (cancelled) return;
        setTransferMembers(members);

        // Keep selection in sync with latest search results without retriggering fetches.
        setSelectedTransferMember((prev) => {
          if (!prev) return null;
          return members.find((m) => m.id === prev.id) || null;
        });
      } catch {
        if (cancelled) return;
        setTransferMembers([]);
      } finally {
        if (cancelled) return;
        setTransferLoadingMembers(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, showTransferModal, transferSearch]);

  const handleStorageUpdate = async () => {
    const bytes = parseInt(storageLimitMB) * 1024 * 1024;
    if (isNaN(bytes) || bytes <= 0) return;
    setActionLoading("storage");
    try {
      await updateStorageLimit(id, bytes);
      setShowStorageModal(false);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <PageLoader />;
  if (error || !society)
    return <ErrorState message={error || "Not found"} onRetry={load} />;

  const storageUsedMB = society.storage_used_bytes
    ? (society.storage_used_bytes / (1024 * 1024)).toFixed(1)
    : "0";
  const storageLimitMBVal = society.storage_quota_bytes
    ? (society.storage_quota_bytes / (1024 * 1024)).toFixed(0)
    : "500";
  const storagePct =
    society.storage_quota_bytes && society.storage_used_bytes
      ? Math.min(
          100,
          Math.round(
            (society.storage_used_bytes / society.storage_quota_bytes) * 100,
          ),
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
        >
          <ArrowLeft
            className="w-5 h-5"
            style={{ color: "var(--text-secondary)" }}
          />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center shrink-0 overflow-hidden">
            {society.logo_url ? (
              <SmartImage
                src={society.logo_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <Building2
                className="w-5 h-5"
                style={{ color: "var(--text-muted)" }}
              />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1
                className="text-xl font-bold truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {society.name}
              </h1>
              <StatusBadge status={society.status} />
            </div>
            {society.category && (
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                {society.category}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-4">
        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Actions
        </h2>
        <div className="flex flex-wrap gap-2">
          {(society.status === "PENDING" ||
            society.status === "INFO_REQUESTED") && (
            <>
              <button
                onClick={handleApprove}
                disabled={!!actionLoading}
                className="btn-primary text-sm py-2.5 px-4 flex items-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" /> Approve
              </button>
              <button
                onClick={() => {
                  setShowRejectModal(true);
                  setReason("");
                }}
                disabled={!!actionLoading}
                className="bg-red-500 hover:bg-red-600 text-white text-sm py-2.5 px-4 rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>
              <button
                onClick={() => {
                  setShowInfoRequestModal(true);
                  setReason("");
                }}
                disabled={!!actionLoading}
                className="bg-sky-500 hover:bg-sky-600 text-white text-sm py-2.5 px-4 rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> Request More Info
              </button>
            </>
          )}
          {society.status === "APPROVED" && (
            <button
              onClick={() => {
                setShowSuspendModal(true);
                setReason("");
              }}
              disabled={!!actionLoading}
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm py-2.5 px-4 rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              <Ban className="w-4 h-4" /> Suspend
            </button>
          )}
          {(society.status === "SUSPENDED" ||
            society.status === "DEACTIVATED") && (
            <button
              onClick={handleReactivate}
              disabled={!!actionLoading}
              className="bg-blue-500 hover:bg-blue-600 text-white text-sm py-2.5 px-4 rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Reactivate
            </button>
          )}
          {society.status === "APPROVED" && (
            <button
              onClick={() => {
                setShowTransferModal(true);
                setTransferSearch("");
                setTransferMembers([]);
                setSelectedTransferMember(null);
                setReason("");
              }}
              disabled={!!actionLoading}
              className="btn-secondary text-sm py-2.5 px-4 flex items-center gap-2 disabled:opacity-50"
            >
              <ArrowRightLeft className="w-4 h-4" /> Force Transfer Presidency
            </button>
          )}
          <button
            onClick={() => setShowStorageModal(true)}
            disabled={!!actionLoading}
            className="btn-secondary text-sm py-2.5 px-4 flex items-center gap-2 disabled:opacity-50"
          >
            <HardDrive className="w-4 h-4" /> Adjust Storage Limit
          </button>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Info */}
        <div className="card p-4 space-y-4">
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Details
          </h2>
          <div className="space-y-3 text-sm">
            <InfoRow label="Description" value={society.description || "—"} />
            <InfoRow label="Category" value={society.category || "—"} />
            <InfoRow
              label="Created By"
              value={society.created_by_name || "—"}
            />
            <InfoRow
              label="Created"
              value={new Date(society.created_at).toLocaleDateString()}
            />
            {society.president_name && (
              <InfoRow label="President" value={society.president_name} />
            )}
            {society.faculty_advisor_name && (
              <InfoRow
                label="Faculty Advisor"
                value={society.faculty_advisor_name}
              />
            )}
            {society.justification && (
              <InfoRow label="Justification" value={society.justification} />
            )}
            {society.contact_email && (
              <InfoRow label="Contact Email" value={society.contact_email} />
            )}
          </div>
          {society.status === "INFO_REQUESTED" && society.admin_message && (
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <p className="text-xs font-semibold text-sky-600 dark:text-sky-400 mb-1">
                Admin Message
              </p>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                {society.admin_message}
              </p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p
                  className="text-2xl font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {society.member_count}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Members
                </p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                <Calendar className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p
                  className="text-2xl font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {society.event_count}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Events
                </p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                <HardDrive className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p
                  className="text-2xl font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {storageUsedMB} MB
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  of {storageLimitMBVal} MB used
                </p>
              </div>
            </div>
            <div className="mt-3 h-2 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${storagePct}%`,
                  backgroundColor:
                    storagePct > 90
                      ? "#ef4444"
                      : storagePct > 70
                        ? "#f59e0b"
                        : "#10b981",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <Modal title="Reject Society" onClose={() => setShowRejectModal(false)}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection..."
            rows={3}
            className="input-field mb-4 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowRejectModal(false)}
              className="btn-secondary text-sm py-2.5 px-4"
            >
              Cancel
            </button>
            <button
              disabled={!reason.trim() || actionLoading === "reject"}
              onClick={handleReject}
              className="bg-red-500 hover:bg-red-600 text-white text-sm py-2.5 px-4 rounded-xl font-semibold disabled:opacity-50 transition-colors"
            >
              {actionLoading === "reject" ? "Rejecting..." : "Reject"}
            </button>
          </div>
        </Modal>
      )}

      {/* Request Info Modal */}
      {showInfoRequestModal && (
        <Modal
          title="Request More Information"
          onClose={() => setShowInfoRequestModal(false)}
        >
          <p
            className="text-xs mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Ask the applicant to provide additional information before you can
            approve their society.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What additional information do you need? e.g., 'Please provide a faculty advisor letter and a detailed budget plan.'"
            rows={4}
            className="input-field mb-4 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowInfoRequestModal(false)}
              className="btn-secondary text-sm py-2.5 px-4"
            >
              Cancel
            </button>
            <button
              disabled={!reason.trim() || actionLoading === "info-request"}
              onClick={handleRequestInfo}
              className="bg-sky-500 hover:bg-sky-600 text-white text-sm py-2.5 px-4 rounded-xl font-semibold disabled:opacity-50 transition-colors"
            >
              {actionLoading === "info-request" ? "Sending..." : "Send Request"}
            </button>
          </div>
        </Modal>
      )}

      {/* Suspend Modal */}
      {showSuspendModal && (
        <Modal
          title="Suspend Society"
          onClose={() => setShowSuspendModal(false)}
        >
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for suspension..."
            rows={3}
            className="input-field mb-4 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowSuspendModal(false)}
              className="btn-secondary text-sm py-2.5 px-4"
            >
              Cancel
            </button>
            <button
              disabled={!reason.trim() || actionLoading === "suspend"}
              onClick={handleSuspend}
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm py-2.5 px-4 rounded-xl font-semibold disabled:opacity-50 transition-colors"
            >
              {actionLoading === "suspend" ? "Suspending..." : "Suspend"}
            </button>
          </div>
        </Modal>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <Modal
          title="Force Transfer Presidency"
          onClose={() => setShowTransferModal(false)}
        >
          <p
            className="text-xs mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Transfer the President role to another user. The current President
            will be demoted.
          </p>

          <div className="relative mb-3">
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              value={transferSearch}
              onChange={(e) => setTransferSearch(e.target.value)}
              placeholder="Search member by name or email"
              className="input-field pl-9"
            />
          </div>

          <div
            className="mb-3 max-h-44 overflow-y-auto rounded-xl border"
            style={{ borderColor: "var(--border-default)" }}
          >
            {transferMembers.length === 0 ? (
              <p
                className="px-3 py-2 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                {transferLoadingMembers
                  ? "Searching members..."
                  : "No active members found"}
              </p>
            ) : (
              <div
                className="divide-y"
                style={{ borderColor: "var(--border-default)" }}
              >
                {transferMembers.map((member) => {
                  const disabled = member.is_current_president;
                  const isSelected = selectedTransferMember?.id === member.id;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedTransferMember(member)}
                      className={`w-full text-left px-3 py-2 transition-colors ${
                        isSelected
                          ? "bg-brand-500/10"
                          : "hover:bg-surface-50 dark:hover:bg-surface-800"
                      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {member.full_name}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {member.email} • {member.role_name}
                        {disabled ? " (Current President)" : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {transferLoadingMembers && transferMembers.length > 0 && (
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
              Updating results...
            </p>
          )}

          {selectedTransferMember && (
            <p
              className="text-xs mb-3"
              style={{ color: "var(--text-secondary)" }}
            >
              Selected:{" "}
              <span style={{ color: "var(--text-primary)" }}>
                {selectedTransferMember.full_name}
              </span>
            </p>
          )}

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for transfer..."
            rows={2}
            className="input-field mb-4 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowTransferModal(false)}
              className="btn-secondary text-sm py-2.5 px-4"
            >
              Cancel
            </button>
            <button
              disabled={
                !reason.trim() ||
                !selectedTransferMember ||
                actionLoading === "transfer"
              }
              onClick={handleTransfer}
              className="btn-primary text-sm py-2.5 px-4 disabled:opacity-50"
            >
              {actionLoading === "transfer" ? "Transferring..." : "Transfer"}
            </button>
          </div>
        </Modal>
      )}

      {/* Storage Modal */}
      {showStorageModal && (
        <Modal
          title="Adjust Storage Limit"
          onClose={() => setShowStorageModal(false)}
        >
          <p
            className="text-xs mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Current usage: {storageUsedMB} MB / {storageLimitMBVal} MB
          </p>
          <div className="flex items-center gap-2 mb-4">
            <input
              type="number"
              value={storageLimitMB}
              onChange={(e) => setStorageLimitMB(e.target.value)}
              placeholder="New limit"
              className="input-field"
              min="1"
            />
            <span
              className="text-sm font-medium shrink-0"
              style={{ color: "var(--text-secondary)" }}
            >
              MB
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowStorageModal(false)}
              className="btn-secondary text-sm py-2.5 px-4"
            >
              Cancel
            </button>
            <button
              disabled={!storageLimitMB || actionLoading === "storage"}
              onClick={handleStorageUpdate}
              className="btn-primary text-sm py-2.5 px-4 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {actionLoading === "storage" ? "Saving..." : "Update"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-0.5" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="card p-6 w-full max-w-md">
        <h3
          className="text-lg font-bold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}


