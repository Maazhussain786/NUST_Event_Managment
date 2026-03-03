'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Image as ImageIcon, Calendar, Pin, Send, X,
  Loader2, Smile, Type, AlertCircle,
} from 'lucide-react';

interface PostComposerProps {
  societyId: string;
  authorName: string;
  authorAvatar: string | null;
  events?: { id: string; title: string }[];
  onPost: (data: {
    content: string;
    post_type: string;
    shared_event_id?: string;
    is_pinned?: boolean;
    images?: File[];
  }) => Promise<void>;
}

export default function PostComposer({
  societyId,
  authorName,
  authorAvatar,
  events = [],
  onPost,
}: PostComposerProps) {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<{ id: string; title: string } | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasContent = content.trim().length > 0 || images.length > 0 || selectedEvent;

  const handleAddImages = (files: FileList) => {
    const newImages = Array.from(files)
      .filter(f => f.type.startsWith('image/') && f.size <= 8 * 1024 * 1024)
      .slice(0, 10 - images.length)
      .map(file => ({ file, preview: URL.createObjectURL(file) }));

    setImages(prev => [...prev, ...newImages]);
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async () => {
    if (!hasContent || posting) return;
    setPosting(true);
    setError(null);

    try {
      const postType = images.length > 1 ? 'GALLERY'
        : images.length === 1 ? 'IMAGE'
        : selectedEvent ? 'EVENT_SHARE'
        : 'TEXT';

      await onPost({
        content: content.trim(),
        post_type: postType,
        shared_event_id: selectedEvent?.id,
        is_pinned: isPinned,
        images: images.map(i => i.file),
      });

      // Reset
      setContent('');
      images.forEach(i => URL.revokeObjectURL(i.preview));
      setImages([]);
      setSelectedEvent(null);
      setIsPinned(false);
      setExpanded(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      {/* Author row */}
      <div className="p-4 pb-2 flex items-start gap-3">
        {authorAvatar ? (
          <img src={authorAvatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-500 font-bold text-sm flex-shrink-0">
            {authorName[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted mb-1">{authorName}</p>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder="What's on your society's mind?"
            className="w-full bg-transparent text-primary text-sm resize-none border-none outline-none placeholder:text-muted"
            rows={expanded ? 3 : 1}
          />
        </div>
      </div>

      {/* Image previews */}
      {images.length > 0 && (
        <div className="px-4 pb-2">
          <div className={`grid gap-1.5 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {images.map((img, i) => (
              <div key={i} className="relative rounded-lg overflow-hidden aspect-square group">
                <img src={img.preview} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => handleRemoveImage(i)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared event preview */}
      {selectedEvent && (
        <div className="mx-4 mb-2 rounded-lg border border-themed p-3 flex items-center justify-between bg-secondary">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar size={16} className="text-brand-500 flex-shrink-0" />
            <span className="text-sm text-primary truncate">{selectedEvent.title}</span>
          </div>
          <button onClick={() => setSelectedEvent(null)}>
            <X size={14} className="text-muted" />
          </button>
        </div>
      )}

      {/* Pin indicator */}
      {isPinned && (
        <div className="mx-4 mb-2 flex items-center gap-1.5 text-xs text-amber-500">
          <Pin size={12} /> This post will be pinned to top
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 text-red-500 text-xs">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Actions bar */}
      <div className="border-t border-themed px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-secondary hover:bg-secondary transition-colors"
            disabled={images.length >= 10}
          >
            <ImageIcon size={16} className="text-green-500" /> Photo
          </button>
          <button
            onClick={() => setShowEventPicker(!showEventPicker)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-secondary hover:bg-secondary transition-colors"
          >
            <Calendar size={16} className="text-blue-500" /> Event
          </button>
          <button
            onClick={() => setIsPinned(!isPinned)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${isPinned ? 'text-amber-500 bg-amber-500/10' : 'text-secondary hover:bg-secondary'}`}
          >
            <Pin size={16} /> Pin
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!hasContent || posting}
          className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
        >
          {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Post
        </button>
      </div>

      {/* Event picker dropdown */}
      {showEventPicker && events.length > 0 && (
        <div className="border-t border-themed px-4 py-2 max-h-40 overflow-y-auto">
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Share an event</p>
          {events.map(e => (
            <button
              key={e.id}
              onClick={() => { setSelectedEvent(e); setShowEventPicker(false); }}
              className="w-full text-left px-2 py-1.5 rounded-md text-sm text-secondary hover:bg-secondary transition-colors truncate"
            >
              {e.title}
            </button>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={e => e.target.files && handleAddImages(e.target.files)}
        className="hidden"
      />
    </div>
  );
}
