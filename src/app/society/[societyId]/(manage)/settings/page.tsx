'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Settings,
  Save,
  Palette,
  Globe,
  Shield,
  Bell,
  Ticket,
  Users,
  MapPin,
  Mail,
  Phone,
  ImageIcon,
  Loader2,
  Check,
  AlertCircle,
  Upload,
  X,
  ArrowRightLeft,
  Search,
} from 'lucide-react';
import { PageLoader, ErrorState } from '../../../_components/Shared';
import {
  fetchSettings,
  updateSettings,
  fetchSocietyProfile,
  updateSocietyProfile,
  uploadSocietyMedia,
  transferPresidency,
  SocietyApiError,
} from '../../../api';
import type { SocietySettings, SocietyProfile } from '../../../types';

type TabKey = 'operations' | 'profile' | 'branding';

export default function SettingsPage() {
  const params = useParams();
  const societyId = params.societyId as string;

  const [activeTab, setActiveTab] = useState<TabKey>('operations');
  const [settings, setSettings] = useState<SocietySettings | null>(null);
  const [profile, setProfile] = useState<SocietyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchSettings(societyId),
      fetchSocietyProfile(societyId),
    ])
      .then(([s, p]) => { setSettings(s); setProfile(p); })
      .catch(err => setError(err instanceof SocietyApiError ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, [societyId]);

  const handleSaveOperations = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await updateSettings(societyId, settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      alert(err instanceof SocietyApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [settings, societyId]);

  const handleSaveProfile = useCallback(async () => {
    if (!profile) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await updateSocietyProfile(societyId, profile);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      alert(err instanceof SocietyApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [profile, societyId]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'operations', label: 'Operations', icon: <Settings size={16} /> },
    { key: 'profile', label: 'Public Profile', icon: <Globe size={16} /> },
    { key: 'branding', label: 'Branding', icon: <Palette size={16} /> },
  ];

  const roleOptions = ['President', 'Vice President', 'Director', 'Deputy Director', 'Member'];

  return (
    <div className="max-w-3xl space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-secondary p-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors
              ${activeTab === tab.key ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'}
            `}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ─── Operations Tab ─── */}
      {activeTab === 'operations' && settings && (
        <div className="space-y-4">
          <div className="card p-5 space-y-5">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Shield size={16} className="text-brand-500" /> Role Permissions</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-secondary mb-1">Event Creation (Min Role)</label>
                <select
                  value={settings.event_creation_role}
                  onChange={e => setSettings({ ...settings, event_creation_role: e.target.value as any })}
                  className="input-field text-sm w-full"
                >
                  {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm text-secondary mb-1">Chat Management (Min Role)</label>
                <select
                  value={settings.chat_management_role}
                  onChange={e => setSettings({ ...settings, chat_management_role: e.target.value as any })}
                  className="input-field text-sm w-full"
                >
                  {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm text-secondary mb-1">Content Upload (Min Role)</label>
                <select
                  value={settings.content_upload_role}
                  onChange={e => setSettings({ ...settings, content_upload_role: e.target.value as any })}
                  className="input-field text-sm w-full"
                >
                  {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="card p-5 space-y-5">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Ticket size={16} className="text-brand-500" /> Ticketing</h3>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.ticketing_enabled}
                onChange={e => setSettings({ ...settings, ticketing_enabled: e.target.checked })}
                className="w-4 h-4 rounded accent-brand-500"
              />
              <span className="text-sm text-secondary">Enable ticketing for events</span>
            </label>

            <div>
              <label className="block text-sm text-secondary mb-1">Transfer Policy</label>
              <select
                value={settings.transfer_policy}
                onChange={e => setSettings({ ...settings, transfer_policy: e.target.value as any })}
                className="input-field text-sm w-full"
              >
                <option value="ALLOWED">Allowed</option>
                <option value="RESTRICTED">Restricted</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-secondary mb-1">Transfer Deadline (hours before event)</label>
              <input
                type="number"
                value={settings.transfer_deadline_hours}
                onChange={e => setSettings({ ...settings, transfer_deadline_hours: parseInt(e.target.value) || 0 })}
                className="input-field text-sm w-full"
                min={0}
                max={168}
              />
            </div>
          </div>

          <TransferPresidencySection societyId={societyId} />

          <button
            onClick={handleSaveOperations}
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : saveSuccess ? <Check size={16} /> : <Save size={16} />}
            {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Operations Settings'}
          </button>
        </div>
      )}

      {/* ─── Profile Tab ─── */}
      {activeTab === 'profile' && profile && (
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Globe size={16} className="text-brand-500" /> Public Information</h3>

            <div>
              <label className="block text-sm text-secondary mb-1">Tagline</label>
              <input
                value={profile.tagline || ''}
                onChange={e => setProfile({ ...profile, tagline: e.target.value || null })}
                placeholder="A short catchy tagline..."
                className="input-field text-sm w-full"
                maxLength={300}
              />
            </div>

            <div>
              <label className="block text-sm text-secondary mb-1">Mission Statement</label>
              <textarea
                value={profile.mission || ''}
                onChange={e => setProfile({ ...profile, mission: e.target.value || null })}
                placeholder="What drives your society..."
                className="input-field text-sm w-full resize-none"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-secondary mb-1">Established Year</label>
                <input
                  type="number"
                  value={profile.established_year || ''}
                  onChange={e => setProfile({ ...profile, established_year: parseInt(e.target.value) || null })}
                  placeholder="e.g. 2015"
                  className="input-field text-sm w-full"
                  min={1900}
                  max={2100}
                />
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">Faculty Advisor</label>
                <input
                  value={profile.faculty_advisor || ''}
                  onChange={e => setProfile({ ...profile, faculty_advisor: e.target.value || null })}
                  placeholder="Dr. Name"
                  className="input-field text-sm w-full"
                />
              </div>
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Mail size={16} className="text-brand-500" /> Contact Details</h3>

            <div>
              <label className="block text-sm text-secondary mb-1">Contact Email</label>
              <input
                value={profile.contact_email || ''}
                onChange={e => setProfile({ ...profile, contact_email: e.target.value || null })}
                placeholder="society@example.com"
                className="input-field text-sm w-full"
                type="email"
              />
            </div>

            <div>
              <label className="block text-sm text-secondary mb-1">Contact Phone</label>
              <input
                value={profile.contact_phone || ''}
                onChange={e => setProfile({ ...profile, contact_phone: e.target.value || null })}
                placeholder="+92 ..."
                className="input-field text-sm w-full"
              />
            </div>

            <div>
              <label className="block text-sm text-secondary mb-1">Office Location</label>
              <input
                value={profile.office_location || ''}
                onChange={e => setProfile({ ...profile, office_location: e.target.value || null })}
                placeholder="Building, Room #"
                className="input-field text-sm w-full"
              />
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Globe size={16} className="text-brand-500" /> Social Media Links</h3>
            {['instagram', 'facebook', 'twitter', 'linkedin', 'website', 'youtube'].map(key => (
              <div key={key}>
                <label className="block text-sm text-secondary mb-1 capitalize">{key}</label>
                <input
                  value={(profile.social_links || {})[key] || ''}
                  onChange={e => setProfile({
                    ...profile,
                    social_links: { ...(profile.social_links || {}), [key]: e.target.value || '' }
                  })}
                  placeholder={`https://${key}.com/...`}
                  className="input-field text-sm w-full"
                />
              </div>
            ))}
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Bell size={16} className="text-brand-500" /> Pinned Announcement</h3>
            <textarea
              value={profile.pin_announcement || ''}
              onChange={e => setProfile({ ...profile, pin_announcement: e.target.value || null })}
              placeholder="Optional announcement shown on your public page"
              className="input-field text-sm w-full resize-none"
              rows={2}
            />
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Shield size={16} className="text-brand-500" /> Access Control</h3>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={profile.is_public}
                onChange={e => setProfile({ ...profile, is_public: e.target.checked })}
                className="w-4 h-4 rounded accent-brand-500"
              />
              <span className="text-sm text-secondary">Public page visible to everyone</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={profile.member_approval}
                onChange={e => setProfile({ ...profile, member_approval: e.target.checked })}
                className="w-4 h-4 rounded accent-brand-500"
              />
              <span className="text-sm text-secondary">Require approval for new member requests</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={profile.auto_approve_ticket}
                onChange={e => setProfile({ ...profile, auto_approve_ticket: e.target.checked })}
                className="w-4 h-4 rounded accent-brand-500"
              />
              <span className="text-sm text-secondary">Auto-approve ticket purchases</span>
            </label>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : saveSuccess ? <Check size={16} /> : <Save size={16} />}
            {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Profile Settings'}
          </button>
        </div>
      )}

      {/* ─── Branding Tab ─── */}
      {activeTab === 'branding' && profile && (
        <div className="space-y-4">
          <div className="card p-5 space-y-5">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Palette size={16} className="text-brand-500" /> Brand Colors</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-secondary mb-1">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={profile.primary_color || '#FF9F43'}
                    onChange={e => setProfile({ ...profile, primary_color: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-themed cursor-pointer"
                  />
                  <input
                    value={profile.primary_color || '#FF9F43'}
                    onChange={e => setProfile({ ...profile, primary_color: e.target.value })}
                    className="input-field text-sm flex-1"
                    maxLength={7}
                    placeholder="#FF9F43"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={profile.accent_color || '#e08a30'}
                    onChange={e => setProfile({ ...profile, accent_color: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-themed cursor-pointer"
                  />
                  <input
                    value={profile.accent_color || '#e08a30'}
                    onChange={e => setProfile({ ...profile, accent_color: e.target.value })}
                    className="input-field text-sm flex-1"
                    maxLength={7}
                    placeholder="#e08a30"
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div>
              <p className="text-xs text-muted mb-2">Preview</p>
              <div className="rounded-xl overflow-hidden border border-themed">
                <div className="h-16" style={{ background: `linear-gradient(135deg, ${profile.primary_color || '#FF9F43'}, ${profile.accent_color || '#e08a30'})` }} />
                <div className="p-3 bg-card flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg" style={{ background: profile.primary_color || '#FF9F43' }} />
                  <div>
                    <p className="text-xs font-semibold text-primary">Society Name</p>
                    <p className="text-[10px]" style={{ color: profile.primary_color || '#FF9F43' }}>Brand accent text</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><ImageIcon size={16} className="text-brand-500" /> Cover Image</h3>
            <CoverUploader
              societyId={societyId}
              currentUrl={profile.cover_url}
              onUploaded={(url) => setProfile({ ...profile, cover_url: url })}
              onRemoved={() => setProfile({ ...profile, cover_url: null })}
            />
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><ImageIcon size={16} className="text-brand-500" /> Society Logo</h3>
            <LogoUploader
              societyId={societyId}
              currentUrl={profile.logo_url}
              onUploaded={(url) => setProfile({ ...profile, logo_url: url })}
              onRemoved={() => setProfile({ ...profile, logo_url: null })}
            />
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Ticket size={16} className="text-brand-500" /> Ticket Customization</h3>
            <div>
              <label className="block text-sm text-secondary mb-1">Ticket Footer Text</label>
              <textarea
                value={profile.ticket_footer_text || ''}
                onChange={e => setProfile({ ...profile, ticket_footer_text: e.target.value || null })}
                placeholder="Custom text shown on generated tickets"
                className="input-field text-sm w-full resize-none"
                rows={2}
              />
            </div>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : saveSuccess ? <Check size={16} /> : <Save size={16} />}
            {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Branding Settings'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Cover Image Uploader ───────────────────────────────────────────────────

function CoverUploader({
  societyId,
  currentUrl,
  onUploaded,
  onRemoved,
}: {
  societyId: string;
  currentUrl: string | null | undefined;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Must be an image'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Max 8MB'); return; }
    try {
      setUploading(true);
      setError(null);
      const result = await uploadSocietyMedia(societyId, 'cover', file);
      onUploaded(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {currentUrl ? (
        <div className="relative group rounded-lg overflow-hidden">
          <img src={currentUrl} alt="Cover" className="w-full h-40 object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-white/90 text-gray-800 text-xs font-medium hover:bg-white flex items-center gap-1.5">
              <Upload size={12} /> Replace
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            <button
              onClick={onRemoved}
              className="px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-medium hover:bg-red-600 flex items-center gap-1.5"
            >
              <X size={12} /> Remove
            </button>
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-white" />
            </div>
          )}
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-40 rounded-lg border-2 border-dashed border-themed cursor-pointer hover:border-brand-500/50 transition-colors">
          {uploading ? (
            <Loader2 size={24} className="animate-spin text-muted" />
          ) : (
            <>
              <Upload size={24} className="text-muted mb-2" />
              <span className="text-sm text-muted">Click to upload cover image</span>
              <span className="text-xs text-muted mt-1">Recommended: 1200x400, max 8MB</span>
            </>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ─── Logo Uploader ──────────────────────────────────────────────────────────

function LogoUploader({
  societyId,
  currentUrl,
  onUploaded,
  onRemoved,
}: {
  societyId: string;
  currentUrl: string | null | undefined;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Must be an image'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Max 8MB'); return; }
    try {
      setUploading(true);
      setError(null);
      const result = await uploadSocietyMedia(societyId, 'logo', file);
      onUploaded(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative group">
        {currentUrl ? (
          <div className="relative w-20 h-20 rounded-xl overflow-hidden">
            <img src={currentUrl} alt="Logo" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <label className="cursor-pointer w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                <Upload size={12} className="text-gray-800" />
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
            {uploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 size={16} className="animate-spin text-white" />
              </div>
            )}
          </div>
        ) : (
          <label className="w-20 h-20 rounded-xl border-2 border-dashed border-themed flex items-center justify-center cursor-pointer hover:border-brand-500/50 transition-colors">
            {uploading ? (
              <Loader2 size={16} className="animate-spin text-muted" />
            ) : (
              <Upload size={20} className="text-muted" />
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm text-secondary">Society Logo</p>
        <p className="text-xs text-muted">Square image, recommended 200x200, max 8MB</p>
        {currentUrl && (
          <button onClick={onRemoved} className="text-xs text-red-500 hover:text-red-600 mt-1">
            Remove logo
          </button>
        )}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  );
}

// ─── Transfer Presidency ────────────────────────────────────────────────────

function TransferPresidencySection({ societyId }: { societyId: string }) {
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [members, setMembers] = useState<{ id: string; user_id: string; full_name: string; email: string; role_name: string }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadMembers = async () => {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/societies/${societyId}/governance/members`);
      if (res.ok) {
        const data = await res.json();
        // Filter out current president and suspended members
        const eligible = (data.members || data || []).filter(
          (m: { role_name: string; is_active: boolean; suspended_at?: string | null }) =>
            m.role_name !== 'President' && m.is_active && !m.suspended_at
        );
        setMembers(eligible);
      }
    } catch {
      setError('Failed to load members');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleOpenModal = async () => {
    setShowModal(true);
    setError(null);
    setSuccess(false);
    setSelectedUser(null);
    setConfirming(false);
    setSearchQuery('');
    await loadMembers();
  };

  const handleTransfer = async () => {
    if (!selectedUser) return;
    setTransferring(true);
    setError(null);
    try {
      await transferPresidency(societyId, { targetUserId: selectedUser });
      setSuccess(true);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setTransferring(false);
    }
  };

  const filteredMembers = members.filter(m =>
    m.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="card p-5 space-y-3 border-red-500/20" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
          <ArrowRightLeft size={16} className="text-red-500" /> Transfer Presidency
        </h3>
        <p className="text-xs text-muted">
          Transfer the President role to another active society member. This action is irreversible and
          you will be demoted to a regular member.
        </p>
        <button
          onClick={handleOpenModal}
          className="px-4 py-2 rounded-lg border text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
          style={{ borderColor: 'rgba(239,68,68,0.3)' }}
        >
          Transfer Presidency
        </button>
      </div>

      {/* Transfer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <div className="card p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            {success ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <Check size={32} className="text-green-500" />
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">Presidency Transferred</h3>
                <p className="text-sm text-muted">The page will reload shortly.</p>
              </div>
            ) : confirming && selectedUser ? (
              <div>
                <h3 className="text-lg font-bold text-primary mb-2">Confirm Transfer</h3>
                <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--bg-input)' }}>
                  <p className="text-sm text-secondary">
                    You are about to transfer presidency to{' '}
                    <strong>{members.find(m => m.user_id === selectedUser)?.full_name}</strong>.
                  </p>
                  <p className="text-xs text-red-500 mt-2">
                    This action cannot be undone. You will be demoted to a Member role.
                  </p>
                </div>
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 text-red-500 text-sm mb-4">
                    <AlertCircle size={14} /> {error}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setConfirming(false); setError(null); }}
                    className="btn-secondary flex-1 text-sm"
                    disabled={transferring}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleTransfer}
                    disabled={transferring}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {transferring ? <Loader2 size={14} className="animate-spin" /> : null}
                    {transferring ? 'Transferring...' : 'Confirm Transfer'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-primary">Select New President</h3>
                  <button onClick={() => setShowModal(false)} className="p-1 text-muted hover:text-primary">
                    <X size={20} />
                  </button>
                </div>

                {/* Search */}
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search members..."
                    className="input-field pl-9 text-sm w-full"
                  />
                </div>

                {/* Members List */}
                <div className="flex-1 overflow-y-auto space-y-1 max-h-60">
                  {loadingMembers ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={20} className="animate-spin text-brand-500" />
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <p className="text-sm text-muted text-center py-8">No eligible members found</p>
                  ) : (
                    filteredMembers.map(m => (
                      <button
                        key={m.user_id}
                        onClick={() => setSelectedUser(m.user_id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                          selectedUser === m.user_id
                            ? 'bg-brand-500/10 border border-brand-500/30'
                            : 'hover:bg-secondary'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center text-xs font-bold text-brand-500">
                          {m.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-primary truncate">{m.full_name}</p>
                          <p className="text-xs text-muted truncate">{m.email} &middot; {m.role_name}</p>
                        </div>
                        {selectedUser === m.user_id && (
                          <Check size={16} className="text-brand-500 flex-shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-themed">
                  <button
                    onClick={() => setShowModal(false)}
                    className="btn-secondary flex-1 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!selectedUser}
                    onClick={() => setConfirming(true)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}