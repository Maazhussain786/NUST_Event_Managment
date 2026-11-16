'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronDown, Shield, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { fetchRoles, fetchWings, fetchPortfolios, updateMemberRole, SocietyApiError } from '../api';
import type { Role, Portfolio } from '../api';
import type { SocietyMember, Wing, RoleName } from '../types';

const ROLE_COLORS: Record<string, string> = {
  'President': 'text-amber-600 dark:text-amber-400',
  'Vice President': 'text-purple-600 dark:text-purple-400',
  'Director': 'text-blue-600 dark:text-blue-400',
  'Deputy Director': 'text-cyan-600 dark:text-cyan-400',
  'Member': 'text-gray-600 dark:text-gray-400',
};

interface RoleEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: SocietyMember | null;
  societyId: string;
  myLevel: number;
  onSuccess: () => void;
}

export function RoleEditDialog({
  open,
  onOpenChange,
  member,
  societyId,
  myLevel,
  onSuccess,
}: RoleEditDialogProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [wings, setWings] = useState<Wing[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedWingId, setSelectedWingId] = useState('');
  const [selectedPortfolioId, setSelectedPortfolioId] = useState('');
  const [reason, setReason] = useState('');

  // Get details about selected role
  const selectedRole = roles.find(r => r.id === selectedRoleId);
  // Officer roles may optionally be tied to a wing (e.g. VP of a wing). Team Lead / Executive
  // places are per event and are assigned from the event workspace, not here.
  const needsWing = selectedRole?.tier === 'OFFICER';
  const needsPortfolio = false;

  // Filter roles user can assign (lower than their level, excluding President)
  // and keep assignment limited to governance/member workflow roles.
  const assignableRoles = roles.filter(r =>
    r.hierarchy_level < myLevel &&
    r.name !== 'President' &&
    r.tier !== 'FACULTY_SPONSOR'
  );

  // Filter portfolios by selected wing
  const availablePortfolios = portfolios.filter(p => p.wing_id === selectedWingId);

  // Load data when dialog opens
  const loadData = useCallback(async () => {
    if (!open || !member) return;

    setLoading(true);
    setError(null);

    try {
      const [rolesData, wingsData] = await Promise.all([
        fetchRoles(societyId),
        fetchWings(societyId),
      ]);

      setRoles(rolesData);
      setWings(wingsData);

      // Pre-select current values
      const currentRole = rolesData.find(r => r.name === member.role_name);
      if (currentRole) {
        setSelectedRoleId(currentRole.id);
      }
      if (member.wing_id) {
        setSelectedWingId(member.wing_id);
        // Load portfolios for the current wing
        const portfoliosData = await fetchPortfolios(societyId, member.wing_id);
        setPortfolios(portfoliosData);
      }
      if (member.portfolio_id) {
        setSelectedPortfolioId(member.portfolio_id);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load role data');
    } finally {
      setLoading(false);
    }
  }, [open, member, societyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load portfolios when wing changes
  useEffect(() => {
    if (!selectedWingId || !open) {
      setPortfolios([]);
      setSelectedPortfolioId('');
      return;
    }

    const loadPortfolios = async () => {
      try {
        const data = await fetchPortfolios(societyId, selectedWingId);
        setPortfolios(data);
      } catch (err) {
        console.error('Failed to load portfolios:', err);
      }
    };

    loadPortfolios();
  }, [selectedWingId, societyId, open]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedRoleId('');
      setSelectedWingId('');
      setSelectedPortfolioId('');
      setReason('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!member || !selectedRoleId) return;

    // Validate inputs
    if (reason.trim().length < 3) {
      setError('Please give a reason; it is recorded in the role history');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await updateMemberRole(societyId, member.membership_id, {
        roleId: selectedRoleId,
        wingId: needsWing && selectedWingId ? selectedWingId : undefined,
        reason: reason.trim(),
      });

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        setError(err.message);
      } else {
        setError('Failed to update role');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isChanged = () => {
    if (!member) return false;
    const currentRole = roles.find(r => r.name === member.role_name);
    const roleChanged = currentRole?.id !== selectedRoleId;
    const wingChanged = (member.wing_id || '') !== (needsWing ? selectedWingId : '');
    const portfolioChanged = (member.portfolio_id || '') !== (needsPortfolio ? selectedPortfolioId : '');
    return roleChanged || wingChanged || portfolioChanged;
  };

  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-brand-500" />
            Change Role
          </DialogTitle>
          <DialogDescription>
            Update the role and scope for {member.full_name}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current Role Info */}
            <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-3">
              <p className="text-xs text-muted mb-1">Current Role</p>
              <p className={`font-medium ${ROLE_COLORS[member.role_name] || 'text-gray-600'}`}>
                {member.role_name}
                {member.wing_name && (
                  <span className="text-muted font-normal"> in {member.wing_name}</span>
                )}
                {member.portfolio_name && (
                  <span className="text-muted font-normal"> / {member.portfolio_name}</span>
                )}
              </p>
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">New Role</label>
              <div className="relative">
                <select
                  value={selectedRoleId}
                  onChange={(e) => {
                    setSelectedRoleId(e.target.value);
                    // Reset wing/portfolio when role changes
                    const newRole = roles.find(r => r.id === e.target.value);
                    if (!newRole || newRole.tier !== 'OFFICER') {
                      setSelectedWingId('');
                      setSelectedPortfolioId('');
                    }
                  }}
                  className="input-field w-full appearance-none pr-10"
                >
                  <option value="">Select role...</option>
                  {assignableRoles.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.name}{role.tier_label ? ` — ${role.tier_label}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
              </div>
              {assignableRoles.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No roles available to assign</p>
              )}
            </div>

            {/* Wing Selection */}
            {needsWing && (
              <div>
                <label className="block text-sm font-medium text-primary mb-1.5">Wing</label>
                <div className="relative">
                  <select
                    value={selectedWingId}
                    onChange={(e) => {
                      setSelectedWingId(e.target.value);
                      setSelectedPortfolioId(''); // Reset portfolio when wing changes
                    }}
                    className="input-field w-full appearance-none pr-10"
                  >
                    <option value="">No wing (society-wide)</option>
                    {wings.map(wing => (
                      <option key={wing.id} value={wing.id}>
                        {wing.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                </div>
              </div>
            )}

            {/* Portfolio Selection */}
            {needsPortfolio && selectedWingId && (
              <div>
                <label className="block text-sm font-medium text-primary mb-1.5">Portfolio</label>
                <div className="relative">
                  <select
                    value={selectedPortfolioId}
                    onChange={(e) => setSelectedPortfolioId(e.target.value)}
                    className="input-field w-full appearance-none pr-10"
                  >
                    <option value="">Select portfolio...</option>
                    {availablePortfolios.map(portfolio => (
                      <option key={portfolio.id} value={portfolio.id}>
                        {portfolio.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                </div>
                {availablePortfolios.length === 0 && (
                  <p className="text-xs text-muted mt-1">No portfolios in this wing</p>
                )}
              </div>
            )}

            {/* Reason (Optional) */}
            <div>
              <label className="block text-sm font-medium text-primary mb-1.5">
                Reason <span className="text-muted font-normal">(required — kept in the role history)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for role change..."
                className="input-field w-full resize-none h-20"
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="flex items-center gap-2 text-red-500 text-sm bg-red-500/10 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="btn-ghost text-sm px-4 py-2"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || loading || !selectedRoleId || !isChanged()}
            className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Updating...
              </>
            ) : (
              'Update Role'
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
