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
} from 'lucide-react';
import { PageLoader, ErrorState } from '../../../_components/Shared';
import {
  fetchSettings,
  updateSettings,
  fetchSocietyProfile,
  updateSocietyProfile,
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
            <div>
              <label className="block text-sm text-secondary mb-1">Cover Image URL</label>
              <input
                value={profile.cover_url || ''}
                onChange={e => setProfile({ ...profile, cover_url: e.target.value || null })}
                placeholder="https://..."
                className="input-field text-sm w-full"
              />
            </div>
            {profile.cover_url && (
              <img src={profile.cover_url} alt="Cover preview" className="w-full h-32 object-cover rounded-lg" />
            )}
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
