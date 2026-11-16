"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Camera,
  Globe,
  Loader2,
  Plus,
  Save,
  Shield,
  Trash2,
  Upload,
} from "lucide-react";
import { SmartImage } from "@/components/SmartImage";
import { ErrorState } from "../_components/Shared";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createSocietyAlbumAdmin,
  deleteSocietyAlbumAdmin,
  fetchNustAdministrationSociety,
  fetchSocietyAlbumsAdmin,
  fetchSocietyProfileAdmin,
  uploadSocietyMediaAdmin,
  updateSocietyProfileAdmin,
} from "../api";
import type {
  AdminSociety,
  SocietyAlbumAdmin,
  SocietyProfileAdmin,
} from "../types";

type AlbumCategory = "GENERAL" | "EVENTS" | "ACHIEVEMENTS" | "TEAM" | "OTHER";

const ALBUM_CATEGORIES: AlbumCategory[] = [
  "GENERAL",
  "EVENTS",
  "ACHIEVEMENTS",
  "TEAM",
  "OTHER",
];

function NustAdministrationSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="card p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <Skeleton className="w-20 h-20 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-24" />
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-9 w-32 rounded-md" />
              <Skeleton className="h-9 w-32 rounded-md" />
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-xl overflow-hidden border border-border bg-card">
          <Skeleton className="w-full h-44" />
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <Skeleton className="h-5 w-48 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
           {[1, 2, 3, 4, 5, 6].map(i => (
             <div key={i} className={i >= 5 ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}>
                <Skeleton className="h-3 w-24" />
                <Skeleton className={i === 6 ? "h-[100px] w-full" : "h-10 w-full"} />
             </div>
           ))}
        </div>
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="flex justify-end">
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Skeleton className="h-10 w-full md:col-span-2 rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        <Skeleton className="h-[72px] w-full rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {[1, 2].map(i => (
            <div key={i} className="rounded-xl border border-border p-3 space-y-3">
              <Skeleton className="w-full h-36 rounded-lg" />
               <div className="space-y-2">
                 <Skeleton className="h-4 w-32" />
                 <Skeleton className="h-3 w-48" />
               </div>
               <div className="flex gap-2">
                 <Skeleton className="h-8 w-28 rounded-lg" />
                 <Skeleton className="h-8 w-24 rounded-lg" />
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function NustAdministrationPage() {
  const [society, setSociety] = useState<AdminSociety | null>(null);
  const [profile, setProfile] = useState<SocietyProfileAdmin | null>(null);
  const [albums, setAlbums] = useState<SocietyAlbumAdmin[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAlbum, setUploadingAlbum] = useState<string | null>(null);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [deletingAlbumId, setDeletingAlbumId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDescription, setNewAlbumDescription] = useState("");
  const [newAlbumCategory, setNewAlbumCategory] = useState<AlbumCategory>("GENERAL");

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const adminSociety = await fetchNustAdministrationSociety();
      const [profileData, albumData] = await Promise.all([
        fetchSocietyProfileAdmin(adminSociety.id),
        fetchSocietyAlbumsAdmin(adminSociety.id),
      ]);

      setSociety(adminSociety);
      setProfile(profileData);
      setAlbums(albumData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SEECS Administration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const cannotRender = loading || !society || !profile;

  const isPublicLabel = useMemo(() => {
    if (!profile) return "Unknown";
    return profile.is_public ? "Public" : "Private";
  }, [profile]);

  const patchProfile = (patch: Partial<SocietyProfileAdmin>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const onSaveProfile = async () => {
    if (!society || !profile) return;
    try {
      setSavingProfile(true);
      await updateSocietyProfileAdmin(society.id, {
        tagline: profile.tagline,
        mission: profile.mission,
        contact_email: profile.contact_email,
        contact_phone: profile.contact_phone,
        office_location: profile.office_location,
        faculty_advisor: profile.faculty_advisor,
        established_year: profile.established_year,
        is_public: profile.is_public,
        primary_color: profile.primary_color,
        accent_color: profile.accent_color,
      });
      setToast("SEECS Administration profile updated");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadSingle = async (kind: "logo" | "cover", file: File) => {
    if (!society) return;

    try {
      if (kind === "logo") setUploadingLogo(true);
      if (kind === "cover") setUploadingCover(true);

      await uploadSocietyMediaAdmin(society.id, kind, file);

      const [latestSociety, latestProfile] = await Promise.all([
        fetchNustAdministrationSociety(),
        fetchSocietyProfileAdmin(society.id),
      ]);
      setSociety(latestSociety);
      setProfile(latestProfile);
      setToast(`${kind === "logo" ? "Logo" : "Cover"} updated`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : `Failed to upload ${kind}`);
    } finally {
      if (kind === "logo") setUploadingLogo(false);
      if (kind === "cover") setUploadingCover(false);
    }
  };

  const onCreateAlbum = async () => {
    if (!society) return;
    if (!newAlbumName.trim()) {
      setToast("Album name is required");
      return;
    }

    try {
      setCreatingAlbum(true);
      await createSocietyAlbumAdmin(society.id, {
        name: newAlbumName.trim(),
        description: newAlbumDescription.trim() || undefined,
        category: newAlbumCategory,
      });

      setNewAlbumName("");
      setNewAlbumDescription("");
      setNewAlbumCategory("GENERAL");

      const albumData = await fetchSocietyAlbumsAdmin(society.id);
      setAlbums(albumData);
      setToast("Album created");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to create album");
    } finally {
      setCreatingAlbum(false);
    }
  };

  const onDeleteAlbum = async (albumId: string) => {
    if (!society) return;
    if (!window.confirm("Delete this album and all photos?")) return;

    try {
      setDeletingAlbumId(albumId);
      await deleteSocietyAlbumAdmin(society.id, albumId);
      setAlbums((prev) => prev.filter((item) => item.id !== albumId));
      setToast("Album deleted");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to delete album");
    } finally {
      setDeletingAlbumId(null);
    }
  };

  const onUploadAlbumPhotos = async (albumId: string, fileList: FileList | null) => {
    if (!society || !fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    try {
      setUploadingAlbum(albumId);
      for (const file of files) {
        await uploadSocietyMediaAdmin(society.id, "gallery", file, albumId);
      }

      const albumData = await fetchSocietyAlbumsAdmin(society.id);
      setAlbums(albumData);
      setToast(`${files.length} photo(s) uploaded`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Album upload failed");
    } finally {
      setUploadingAlbum(null);
    }
  };

  if (loading) {
    return <NustAdministrationSkeleton />;
  }

  if (error || cannotRender) {
    return <ErrorState message={error || "Failed to load page"} onRetry={loadAll} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          SEECS Administration
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Manage official profile, branding, visibility, and society albums from one place.
        </p>
      </div>

      <div className="card p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
            {society.logo_url ? (
              <SmartImage src={society.logo_url} alt="SEECS Administration logo" className="w-full h-full object-cover" />
            ) : (
              <Building2 className="w-8 h-8" style={{ color: "var(--text-muted)" }} />
            )}
          </div>
          <div className="flex-1 min-w-[240px]">
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              {society.name}
            </h2>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Visibility: {isPublicLabel}
            </p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="btn-secondary text-sm px-3 py-2 disabled:opacity-60"
              >
                {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload Logo
              </button>
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                className="btn-secondary text-sm px-3 py-2 disabled:opacity-60"
              >
                {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Upload Cover
              </button>
            </div>
            <input
              ref={logoInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadSingle("logo", file);
                e.currentTarget.value = "";
              }}
            />
            <input
              ref={coverInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadSingle("cover", file);
                e.currentTarget.value = "";
              }}
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl overflow-hidden border border-themed bg-surface-50 dark:bg-surface-900/40">
          {profile.cover_url ? (
            <SmartImage src={profile.cover_url} alt="SEECS Administration cover" className="w-full h-44 object-cover" />
          ) : (
            <div className="h-44 flex items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
              No cover image uploaded
            </div>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-brand-500" />
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Profile And Visibility
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-secondary)" }}>Tagline</label>
            <input
              className="input-field"
              value={profile.tagline || ""}
              onChange={(e) => patchProfile({ tagline: e.target.value || null })}
              placeholder="Official society tagline"
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-secondary)" }}>Faculty Advisor</label>
            <input
              className="input-field"
              value={profile.faculty_advisor || ""}
              onChange={(e) => patchProfile({ faculty_advisor: e.target.value || null })}
              placeholder="Advisor name"
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-secondary)" }}>Contact Email</label>
            <input
              className="input-field"
              value={profile.contact_email || ""}
              onChange={(e) => patchProfile({ contact_email: e.target.value || null })}
              placeholder="official@nust.edu.pk"
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-secondary)" }}>Contact Phone</label>
            <input
              className="input-field"
              value={profile.contact_phone || ""}
              onChange={(e) => patchProfile({ contact_phone: e.target.value || null })}
              placeholder="+92 ..."
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs mb-1 block" style={{ color: "var(--text-secondary)" }}>Office Location</label>
            <input
              className="input-field"
              value={profile.office_location || ""}
              onChange={(e) => patchProfile({ office_location: e.target.value || null })}
              placeholder="Main campus, admin block"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs mb-1 block" style={{ color: "var(--text-secondary)" }}>Mission</label>
            <textarea
              className="input-field min-h-[100px] resize-none"
              value={profile.mission || ""}
              onChange={(e) => patchProfile({ mission: e.target.value || null })}
              placeholder="Official mission and purpose"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-themed px-4 py-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-brand-500" />
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Public Profile Visibility</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Control whether SEECS Administration profile is publicly visible.
              </p>
            </div>
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only"
              checked={profile.is_public}
              onChange={(e) => patchProfile({ is_public: e.target.checked })}
            />
            <span className={`w-12 h-6 rounded-full relative transition-colors ${profile.is_public ? "bg-brand-500" : "bg-surface-300 dark:bg-surface-700"}`}>
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${profile.is_public ? "left-6" : "left-0.5"}`}
              />
            </span>
          </label>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onSaveProfile}
            disabled={savingProfile}
            className="btn-primary text-sm px-4 py-2 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Profile
          </button>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Albums Manager
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            className="input-field md:col-span-2"
            value={newAlbumName}
            onChange={(e) => setNewAlbumName(e.target.value)}
            placeholder="New album name"
          />
          <select
            className="input-field"
            value={newAlbumCategory}
            onChange={(e) => setNewAlbumCategory(e.target.value as AlbumCategory)}
          >
            {ALBUM_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button
            onClick={onCreateAlbum}
            disabled={creatingAlbum}
            className="btn-primary text-sm px-3 py-2 disabled:opacity-60 inline-flex items-center justify-center gap-1"
          >
            {creatingAlbum ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
          </button>
        </div>
        <textarea
          className="input-field min-h-[72px] resize-none"
          value={newAlbumDescription}
          onChange={(e) => setNewAlbumDescription(e.target.value)}
          placeholder="Album description (optional)"
        />

        {albums.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No albums yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {albums.map((album) => (
              <div key={album.id} className="rounded-xl border border-themed p-3 space-y-3">
                <div className="w-full h-36 rounded-lg overflow-hidden bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
                  {album.cover_photo_url ? (
                    <SmartImage src={album.cover_photo_url} alt={album.name} className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-6 h-6" style={{ color: "var(--text-muted)" }} />
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{album.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {album.category} · {album.photo_count} photo(s)
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <label className="btn-secondary text-xs px-3 py-2 cursor-pointer inline-flex items-center gap-1">
                    {uploadingAlbum === album.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload Photos
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void onUploadAlbumPhotos(album.id, e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>

                  <button
                    onClick={() => onDeleteAlbum(album.id)}
                    disabled={deletingAlbumId === album.id}
                    className="text-xs px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 disabled:opacity-60 inline-flex items-center gap-1"
                  >
                    {deletingAlbumId === album.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[90] rounded-xl bg-surface-900 text-white dark:bg-surface-100 dark:text-surface-900 px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
