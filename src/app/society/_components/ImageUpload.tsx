'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, X, Loader2, AlertCircle, CheckCircle2,
  Image as ImageIcon, Trash2, GripVertical,
} from 'lucide-react';
import { SmartImage } from '@/components/SmartImage';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ImagePreview {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  url?: string;
  error?: string;
}

interface ImageUploadProps {
  /** Upload handler — should return the uploaded URL */
  onUpload: (file: File) => Promise<{ url: string }>;
  /** Called when an existing image is removed */
  onRemove?: (url: string) => void;
  /** Label above the drop zone */
  label?: string;
  /** Hint text below label */
  hint?: string;
  /** Whether to allow multiple files */
  multiple?: boolean;
  /** Max number of files (for multiple mode) */
  maxFiles?: number;
  /** Max file size in bytes */
  maxSize?: number;
  /** Existing image URL(s) for pre-populating */
  existingUrls?: string[];
  /** Aspect ratio class for preview container */
  aspectRatio?: string;
  /** Called with all current URLs whenever images change */
  onChange?: (urls: string[]) => void;
  /** Disable the uploader */
  disabled?: boolean;
  /** Show quota indicator */
  quotaUsed?: number;
  quotaTotal?: number;
  /** Compact mode (smaller height) */
  compact?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ImageUpload({
  onUpload,
  onRemove,
  label,
  hint,
  multiple = false,
  maxFiles = 10,
  maxSize = 8 * 1024 * 1024,
  existingUrls = [],
  aspectRatio = 'aspect-video',
  onChange,
  disabled = false,
  quotaUsed,
  quotaTotal,
  compact = false,
}: ImageUploadProps) {
  const [previews, setPreviews] = useState<ImagePreview[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>(existingUrls);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setExistingImages(existingUrls);
  }, [existingUrls]);

  // Notify parent of URL changes
  useEffect(() => {
    const uploadedUrls = previews.filter(p => p.status === 'done' && p.url).map(p => p.url!);
    const allUrls = [...existingImages, ...uploadedUrls];
    onChange?.(allUrls);
  }, [existingImages, previews, onChange]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    const fileArray = Array.from(files);

    // Validate count
    const currentCount = existingImages.length + previews.length;
    const maxAllowed = multiple ? maxFiles - currentCount : 1;
    if (fileArray.length > maxAllowed) {
      setError(`Max ${multiple ? maxFiles : 1} image(s) allowed`);
      return;
    }

    // For single mode, clear existing
    if (!multiple) {
      previews.forEach(p => URL.revokeObjectURL(p.preview));
      setPreviews([]);
    }

    // Create previews and start uploads
    const newPreviews: ImagePreview[] = [];

    for (const file of fileArray) {
      // Validation
      if (!file.type.startsWith('image/')) {
        setError(`${file.name}: Not an image file`);
        continue;
      }
      if (file.size > maxSize) {
        setError(`${file.name}: Exceeds ${(maxSize / 1024 / 1024).toFixed(0)}MB limit`);
        continue;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const preview: ImagePreview = {
        id,
        file,
        preview: URL.createObjectURL(file),
        status: 'pending',
        progress: 0,
      };
      newPreviews.push(preview);
    }

    if (newPreviews.length === 0) return;

    setPreviews(prev => [...prev, ...newPreviews]);

    // Upload each file
    for (const preview of newPreviews) {
      setPreviews(prev =>
        prev.map(p => p.id === preview.id ? { ...p, status: 'uploading', progress: 30 } : p)
      );

      try {
        const result = await onUpload(preview.file);
        setPreviews(prev =>
          prev.map(p =>
            p.id === preview.id
              ? { ...p, status: 'done', progress: 100, url: result.url }
              : p
          )
        );
      } catch (err: any) {
        setPreviews(prev =>
          prev.map(p =>
            p.id === preview.id
              ? { ...p, status: 'error', error: err?.message || 'Upload failed' }
              : p
          )
        );
      }
    }
  }, [existingImages, previews, multiple, maxFiles, maxSize, onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  }, [handleFiles, disabled]);

  const handleRemovePreview = useCallback((id: string) => {
    setPreviews(prev => {
      const item = prev.find(p => p.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter(p => p.id !== id);
    });
  }, []);

  const handleRemoveExisting = useCallback((url: string) => {
    setExistingImages(prev => prev.filter(u => u !== url));
    onRemove?.(url);
  }, [onRemove]);

  const isUploading = previews.some(p => p.status === 'uploading');
  const quotaPercent = quotaTotal && quotaUsed !== undefined
    ? Math.round((quotaUsed / quotaTotal) * 100)
    : null;

  return (
    <div className="space-y-2">
      {/* Label */}
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-primary">{label}</label>
          {quotaPercent !== null && (
            <span className={`text-xs ${quotaPercent > 90 ? 'text-red-500' : 'text-muted'}`}>
              {quotaPercent}% storage used
            </span>
          )}
        </div>
      )}

      {/* Existing images */}
      {existingImages.length > 0 && (
        <div className={`grid gap-2 ${multiple ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'}`}>
          {existingImages.map((url, i) => (
            <div key={i} className={`relative group rounded-xl overflow-hidden border border-themed ${!multiple ? aspectRatio : 'aspect-square'}`}>
              <SmartImage src={url} alt="" className="w-full h-full object-cover" />
              {!disabled && (
                <button
                  onClick={() => handleRemoveExisting(url)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] text-white">Current image</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload previews */}
      {previews.length > 0 && (
        <div className={`grid gap-2 ${multiple ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'}`}>
          {previews.map(p => (
            <div key={p.id} className={`relative rounded-xl overflow-hidden border border-themed ${!multiple ? aspectRatio : 'aspect-square'}`}>
              <SmartImage src={p.preview} alt="" className="w-full h-full object-cover" />

              {/* Status overlay */}
              {p.status === 'uploading' && (
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
                  <Loader2 size={24} className="animate-spin text-white" />
                  <div className="w-3/4 h-1.5 rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-white transition-all" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
              )}

              {p.status === 'done' && (
                <div className="absolute top-2 left-2">
                  <CheckCircle2 size={20} className="text-green-500 drop-shadow-lg" />
                </div>
              )}

              {p.status === 'error' && (
                <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                  <div className="text-center px-2">
                    <AlertCircle size={20} className="text-red-500 mx-auto mb-1" />
                    <p className="text-[10px] text-red-500">{p.error}</p>
                  </div>
                </div>
              )}

              {/* Remove button */}
              {!isUploading && (
                <button
                  onClick={() => handleRemovePreview(p.id)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity shadow-lg"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {(multiple || (existingImages.length === 0 && previews.length === 0)) && !disabled && (
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => inputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-xl cursor-pointer transition-colors
            flex flex-col items-center justify-center text-center gap-2
            ${compact ? 'py-4 px-3' : 'py-8 px-4'}
            ${dragOver ? 'border-brand-500 bg-brand-500/5' : 'border-themed hover:border-brand-500/50'}
            ${isUploading ? 'pointer-events-none opacity-50' : ''}
          `}
        >
          <div className={`rounded-full flex items-center justify-center ${compact ? 'w-8 h-8' : 'w-12 h-12'} bg-brand-500/10`}>
            <Upload size={compact ? 16 : 20} className="text-brand-500" />
          </div>
          <div>
            <p className={`font-medium text-primary ${compact ? 'text-xs' : 'text-sm'}`}>
              {dragOver ? 'Drop image here' : 'Click or drag to upload'}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {hint || `JPG, PNG, WebP · Max ${(maxSize / 1024 / 1024).toFixed(0)}MB`}
              {multiple && ` · Up to ${maxFiles} images`}
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple={multiple}
            onChange={e => e.target.files && handleFiles(e.target.files)}
            className="hidden"
          />
        </div>
      )}

      {/* Quota bar */}
      {quotaPercent !== null && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all ${quotaPercent > 90 ? 'bg-red-500' : quotaPercent > 70 ? 'bg-amber-500' : 'bg-brand-500'}`}
              style={{ width: `${Math.min(quotaPercent, 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-muted whitespace-nowrap">
            {((quotaUsed || 0) / 1024 / 1024).toFixed(0)}MB / {((quotaTotal || 0) / 1024 / 1024).toFixed(0)}MB
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-500 text-xs">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}
    </div>
  );
}

// ─── Simple Single Image Upload (for logo/cover) ───────────────────────────

interface SingleImageUploadProps {
  label: string;
  currentUrl?: string | null;
  onUpload: (file: File) => Promise<{ url: string }>;
  onRemove?: () => void;
  aspectRatio?: string;
  disabled?: boolean;
  compact?: boolean;
}

export function SingleImageUpload({
  label,
  currentUrl,
  onUpload,
  onRemove,
  aspectRatio = 'aspect-video',
  disabled = false,
  compact = false,
}: SingleImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayUrl = uploadedUrl || currentUrl;

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Image must be under 8MB');
      return;
    }

    setError(null);
    setPreview(URL.createObjectURL(file));
    setUploading(true);

    try {
      const result = await onUpload(file);
      setUploadedUrl(result.url);
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setUploadedUrl(null);
    onRemove?.();
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-primary">{label}</label>

      {(preview || displayUrl) ? (
        <div className={`relative group rounded-xl overflow-hidden border border-themed ${aspectRatio}`}>
          <SmartImage src={preview || displayUrl!} alt={label} className="w-full h-full object-cover" />

          {uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-white" />
            </div>
          )}

          {!disabled && !uploading && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
              <button
                onClick={() => inputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-white/90 text-gray-900 text-xs font-medium hover:bg-white transition-colors"
              >
                Replace
              </button>
              <button
                onClick={handleRemove}
                className="px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-medium hover:bg-red-500 transition-colors"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          onClick={() => !disabled && inputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl cursor-pointer transition-colors
            flex flex-col items-center justify-center gap-2 border-themed hover:border-brand-500/50
            ${compact ? 'py-4' : 'py-8'} ${aspectRatio}
            ${disabled ? 'opacity-50 pointer-events-none' : ''}
          `}
        >
          <ImageIcon size={compact ? 20 : 28} className="text-muted" />
          <p className="text-xs text-muted">Click to upload {label.toLowerCase()}</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="hidden"
        disabled={disabled}
      />

      {error && (
        <p className="text-red-500 text-xs flex items-center gap-1">
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </div>
  );
}


