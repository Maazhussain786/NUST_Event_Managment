"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Camera,
  FolderPlus,
  Image as ImageIcon,
  Grid3X3,
  Star,
  Trash2,
  Edit3,
  X,
  MoreHorizontal,
  ArrowLeft,
  Upload,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  fetchAlbums,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  fetchAlbumPhotos,
  deleteAlbumPhoto,
  setFeaturedPhoto,
  uploadAlbumPhoto,
  fetchMyPermissions,
  SocietyApiError,
} from "../../../api";
import {
  PageLoader,
  ErrorState,
  EmptyState,
} from "../../../_components/Shared";
import type { SocietyAlbum, AlbumPhoto, AlbumCategory } from "../../../types";
import { SmartImage } from '@/components/SmartImage';

const CATEGORIES: { label: string; value: AlbumCategory }[] = [
  { label: "General", value: "GENERAL" },
  { label: "Events", value: "EVENTS" },
  { label: "Achievements", value: "ACHIEVEMENTS" },
  { label: "Team", value: "TEAM" },
  { label: "Other", value: "OTHER" },
];

export default function SocietyPhotosPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();

  // View state
  const [view, setView] = useState<"albums" | "detail">("albums");
  const [albums, setAlbums] = useState<SocietyAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<SocietyAlbum | null>(null);
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [canManagePhotos, setCanManagePhotos] = useState(false);

  // Create album dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    category: "GENERAL",
  });
  const [creating, setCreating] = useState(false);

  // Edit album dialog
  const [editAlbum, setEditAlbum] = useState<SocietyAlbum | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    category: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox
  const [lightbox, setLightbox] = useState<{ index: number } | null>(null);

  // Photo menu
  const [photoMenu, setPhotoMenu] = useState<string | null>(null);

  const brandColor = "#6366f1";

  // Load albums
  const loadAlbums = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAlbums(societyId);
      setAlbums(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err.message);
      } else {
        setError("Failed to load albums");
      }
    } finally {
      setLoading(false);
    }
  }, [societyId, router]);

  // Load album photos
  const loadPhotos = useCallback(
    async (albumId: string) => {
      try {
        setLoadingPhotos(true);
        const data = await fetchAlbumPhotos(societyId, albumId);
        setPhotos(Array.isArray(data) ? data : []);
      } catch (err) {
        setToast("Failed to load photos");
      } finally {
        setLoadingPhotos(false);
      }
    },
    [societyId],
  );

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const perms = await fetchMyPermissions(societyId);
        setCanManagePhotos(Boolean(perms.can_manage_content));
      } catch {
        setCanManagePhotos(false);
      }
    };

    loadPermissions();
  }, [societyId]);

  const openAlbum = (album: SocietyAlbum) => {
    setSelectedAlbum(album);
    setView("detail");
    loadPhotos(album.id);
  };

  const backToAlbums = () => {
    setView("albums");
    setSelectedAlbum(null);
    setPhotos([]);
    loadAlbums();
  };

  // Create album
  const handleCreateAlbum = async () => {
    if (!createForm.name.trim()) {
      setToast("Album name is required");
      return;
    }
    try {
      setCreating(true);
      await createAlbum(societyId, {
        name: createForm.name,
        description: createForm.description || undefined,
        category: createForm.category as AlbumCategory,
      });
      setToast("Album created!");
      setShowCreate(false);
      setCreateForm({ name: "", description: "", category: "GENERAL" });
      loadAlbums();
    } catch (err) {
      setToast(
        err instanceof SocietyApiError ? err.message : "Failed to create album",
      );
    } finally {
      setCreating(false);
    }
  };

  // Edit album
  const handleEditAlbum = async () => {
    if (!editAlbum) return;
    try {
      setSavingEdit(true);
      await updateAlbum(societyId, editAlbum.id, {
        name: editForm.name,
        description: editForm.description || undefined,
        category: editForm.category as AlbumCategory,
      });
      setToast("Album updated");
      setEditAlbum(null);
      if (view === "detail" && selectedAlbum?.id === editAlbum.id) {
        setSelectedAlbum({
          ...selectedAlbum!,
          name: editForm.name,
          description: editForm.description,
          category: editForm.category as AlbumCategory,
        });
      }
      loadAlbums();
    } catch (err) {
      setToast(
        err instanceof SocietyApiError ? err.message : "Failed to update album",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete album
  const handleDeleteAlbum = async (albumId: string) => {
    if (!confirm("Delete this album and all its photos?")) return;
    try {
      await deleteAlbum(societyId, albumId);
      setToast("Album deleted");
      if (view === "detail" && selectedAlbum?.id === albumId) {
        backToAlbums();
      } else {
        loadAlbums();
      }
    } catch (err) {
      setToast(
        err instanceof SocietyApiError ? err.message : "Failed to delete album",
      );
    }
  };

  // Upload photos
  const handleUploadPhotos = async (files: FileList) => {
    if (!selectedAlbum) return;
    try {
      setUploading(true);
      const total = files.length;
      let done = 0;

      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
          setToast(`Skipped ${file.name}: must be image under 8MB`);
          continue;
        }
        await uploadAlbumPhoto(societyId, selectedAlbum.id, file);
        done++;
        setUploadProgress(Math.round((done / total) * 100));
      }

      setToast(`${done} photo(s) uploaded!`);
      loadPhotos(selectedAlbum.id);
    } catch (err) {
      setToast(
        "Upload failed: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Delete photo
  const handleDeletePhoto = async (photoId: string) => {
    if (!selectedAlbum) return;
    try {
      await deleteAlbumPhoto(societyId, selectedAlbum.id, photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setToast("Photo deleted");
    } catch (err) {
      setToast("Failed to delete photo");
    }
  };

  // Set featured photo
  const handleSetFeatured = async (photoId: string) => {
    if (!selectedAlbum) return;
    try {
      await setFeaturedPhoto(societyId, selectedAlbum.id, photoId);
      setPhotos((prev) =>
        prev.map((p) => ({ ...p, is_featured: p.id === photoId })),
      );
      setToast("Cover photo updated");
    } catch (err) {
      setToast("Failed to set cover photo");
    }
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  return (
    <div className="space-y-4">
      {/* ── Albums List View ─── */}
      {view === "albums" && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera size={20} style={{ color: brandColor }} />
              <h2 className="text-lg font-semibold text-primary">
                Photos & Albums
              </h2>
            </div>
            {canManagePhotos && (
              <button
                onClick={() => setShowCreate(true)}
                className="btn-primary text-sm px-3 py-2 flex items-center gap-1.5"
              >
                <FolderPlus size={16} /> New Album
              </button>
            )}
          </div>

          {loading ? (
            <PageLoader />
          ) : error ? (
            <ErrorState message={error} onRetry={loadAlbums} />
          ) : albums.length === 0 ? (
            <EmptyState message="No albums yet. Create one to start uploading photos!" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {albums.map((album) => (
                <div
                  key={album.id}
                  className="card overflow-hidden cursor-pointer hover:border-brand-500/30 transition-all group"
                  onClick={() => openAlbum(album)}
                >
                  {/* Cover image */}
                  <div className="aspect-[4/3] bg-surface-100 dark:bg-surface-800 relative overflow-hidden">
                    {album.cover_photo_url ? (
                      <SmartImage
                        src={album.cover_photo_url}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={(e) => {
                          e.currentTarget.src = "/images/placeholders/media.svg";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Grid3X3 size={32} className="text-muted opacity-30" />
                      </div>
                    )}
                    {/* Category badge */}
                    <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded-full bg-black/50 text-white backdrop-blur-sm">
                      {album.category}
                    </span>
                    {/* Actions (hidden until hover) */}
                    {canManagePhotos && (
                      <div
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            setEditAlbum(album);
                            setEditForm({
                              name: album.name,
                              description: album.description || "",
                              category: album.category,
                            });
                          }}
                          className="w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteAlbum(album.id)}
                          className="w-7 h-7 rounded-full bg-red-500/80 text-white flex items-center justify-center hover:bg-red-600"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-primary truncate">
                      {album.name}
                    </h3>
                    <p className="text-xs text-muted">
                      {album.photo_count} photo
                      {album.photo_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Album Detail View ─── */}
      {view === "detail" && selectedAlbum && (
        <>
          <div className="flex items-center gap-3">
            <button onClick={backToAlbums} className="btn-ghost p-2">
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-primary truncate">
                {selectedAlbum.name}
              </h2>
              {selectedAlbum.description && (
                <p className="text-xs text-muted truncate">
                  {selectedAlbum.description}
                </p>
              )}
            </div>
            {canManagePhotos && (
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="btn-primary text-sm px-3 py-2 flex items-center gap-1.5"
                >
                  {uploading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  {uploading ? `${uploadProgress}%` : "Upload"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) =>
                    e.target.files && handleUploadPhotos(e.target.files)
                  }
                />
              </div>
            )}
          </div>

          {loadingPhotos ? (
            <PageLoader />
          ) : photos.length === 0 ? (
            <EmptyState message="No photos in this album yet" />
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {photos.map((photo, idx) => (
                <div
                  key={photo.id}
                  className="relative group aspect-square rounded-lg overflow-hidden cursor-pointer"
                >
                  <SmartImage
                    src={photo.file_url}
                    alt={photo.caption || ""}
                    className="w-full h-full object-cover"
                    onClick={() => setLightbox({ index: idx })}
                    onError={(e) => {
                      e.currentTarget.src = "/images/placeholders/media.svg";
                    }}
                  />
                  {/* Featured badge */}
                  {photo.is_featured && (
                    <div className="absolute top-1.5 left-1.5">
                      <Star
                        size={14}
                        className="text-amber-400 fill-amber-400"
                      />
                    </div>
                  )}
                  {/* Hover actions */}
                  {canManagePhotos && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetFeatured(photo.id);
                        }}
                        className="text-[10px] px-2 py-1 rounded bg-white/90 text-gray-800 hover:bg-white font-medium"
                      >
                        Set Cover
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePhoto(photo.id);
                        }}
                        className="w-7 h-7 rounded-full bg-red-500/80 text-white flex items-center justify-center hover:bg-red-600"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Create Album Dialog ─── */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="card w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-primary mb-4">
              Create Album
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">
                  Name *
                </label>
                <input
                  className="input-field"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                  placeholder="Album name"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">
                  Description
                </label>
                <textarea
                  className="input-field min-h-[60px]"
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">
                  Category
                </label>
                <select
                  className="input-field"
                  value={createForm.category}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, category: e.target.value })
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button
                onClick={() => setShowCreate(false)}
                className="btn-ghost text-sm px-4 py-2"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAlbum}
                disabled={creating}
                className="btn-primary text-sm px-4 py-2"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Album Dialog ─── */}
      {editAlbum && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEditAlbum(null)}
        >
          <div
            className="card w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-primary mb-4">
              Edit Album
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">
                  Name
                </label>
                <input
                  className="input-field"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">
                  Description
                </label>
                <textarea
                  className="input-field min-h-[60px]"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">
                  Category
                </label>
                <select
                  className="input-field"
                  value={editForm.category}
                  onChange={(e) =>
                    setEditForm({ ...editForm, category: e.target.value })
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button
                onClick={() => setEditAlbum(null)}
                className="btn-ghost text-sm px-4 py-2"
                disabled={savingEdit}
              >
                Cancel
              </button>
              <button
                onClick={handleEditAlbum}
                disabled={savingEdit}
                className="btn-primary text-sm px-4 py-2"
              >
                {savingEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ─── */}
      {lightbox && photos.length > 0 && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 z-10"
          >
            <X size={20} />
          </button>
          {photos.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox({
                    index: (lightbox.index - 1 + photos.length) % photos.length,
                  });
                }}
                className="absolute left-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 z-10"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox({ index: (lightbox.index + 1) % photos.length });
                }}
                className="absolute right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 z-10"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
          <SmartImage
            src={photos[lightbox.index].file_url}
            alt={photos[lightbox.index].caption || ""}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              e.currentTarget.src = "/images/placeholders/media.svg";
            }}
          />
          {photos[lightbox.index].caption && (
            <div className="absolute bottom-12 text-center text-white text-sm bg-black/50 px-4 py-2 rounded-lg">
              {photos[lightbox.index].caption}
            </div>
          )}
          <div className="absolute bottom-4 text-white/50 text-xs">
            {lightbox.index + 1} / {photos.length}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}



