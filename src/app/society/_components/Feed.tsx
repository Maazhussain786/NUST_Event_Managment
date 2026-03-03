'use client';

import { useState } from 'react';
import {
  Pin, MoreHorizontal, Edit3, Trash2, Calendar,
  Heart, MessageCircle, Share2, Clock, X,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { SocietyPost } from '../types';

// ─── Post Card ──────────────────────────────────────────────────────────────

interface PostCardProps {
  post: SocietyPost;
  brandColor: string;
  isManageMode?: boolean;
  onEdit?: (post: SocietyPost) => void;
  onDelete?: (postId: string) => void;
  onPin?: (postId: string, pinned: boolean) => void;
}

export function PostCard({ post, brandColor, isManageMode, onEdit, onDelete, onPin }: PostCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const timeAgo = getTimeAgo(post.created_at);
  const images = post.images || [];

  return (
    <>
      <div className="card overflow-hidden">
        {/* Pinned badge */}
        {post.is_pinned && (
          <div className="px-4 pt-2 flex items-center gap-1.5 text-xs text-amber-500">
            <Pin size={12} /> Pinned Post
          </div>
        )}

        {/* Author header */}
        <div className="p-4 pb-2 flex items-start gap-3">
          {post.author_avatar ? (
            <img src={post.author_avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0" style={{ background: `${brandColor}15`, color: brandColor }}>
              {post.author_name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-primary">{post.author_name}</p>
              {post.author_role && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/10" style={{ color: brandColor }}>
                  {post.author_role}
                </span>
              )}
            </div>
            <p className="text-xs text-muted flex items-center gap-1">
              <Clock size={10} /> {timeAgo}
            </p>
          </div>

          {/* Menu */}
          {isManageMode && (
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center text-muted">
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-8 z-50 w-40 rounded-lg border border-themed bg-card shadow-xl py-1">
                    <button
                      onClick={() => { onEdit?.(post); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-secondary flex items-center gap-2"
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                    <button
                      onClick={() => { onPin?.(post.id, !post.is_pinned); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-secondary flex items-center gap-2"
                    >
                      <Pin size={14} /> {post.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      onClick={() => { setConfirmDelete(true); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-500/5 flex items-center gap-2"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {post.content && (
          <div className="px-4 pb-2">
            <p className="text-sm text-secondary whitespace-pre-wrap leading-relaxed">{post.content}</p>
          </div>
        )}

        {/* Images */}
        {images.length > 0 && (
          <div className={`${images.length === 1 ? '' : 'grid gap-0.5'} ${images.length === 2 ? 'grid-cols-2' : images.length === 3 ? 'grid-cols-2' : images.length >= 4 ? 'grid-cols-2' : ''}`}>
            {images.slice(0, 4).map((img, i) => (
              <button
                key={img.id}
                onClick={() => setLightbox({ images: images.map(im => im.file_url), index: i })}
                className={`relative overflow-hidden ${images.length === 1 ? 'w-full max-h-[500px]' : images.length === 3 && i === 0 ? 'row-span-2' : ''}`}
              >
                <img
                  src={img.file_url}
                  alt=""
                  className={`w-full object-cover ${images.length === 1 ? 'max-h-[500px]' : 'aspect-square'}`}
                />
                {i === 3 && images.length > 4 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white text-2xl font-bold">+{images.length - 4}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Shared event */}
        {post.shared_event_title && (
          <div className="mx-4 mb-3 rounded-lg border border-themed overflow-hidden">
            {post.shared_event_banner && (
              <img src={post.shared_event_banner} alt="" className="w-full h-32 object-cover" />
            )}
            <div className="p-3">
              <p className="text-sm font-semibold text-primary">{post.shared_event_title}</p>
              {post.shared_event_date && (
                <p className="text-xs text-muted flex items-center gap-1 mt-1">
                  <Calendar size={12} />
                  {new Date(post.shared_event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Engagement bar */}
        <div className="border-t border-themed px-4 py-2 flex items-center gap-4">
          <button className="flex items-center gap-1.5 text-xs text-muted hover:text-red-500 transition-colors">
            <Heart size={16} /> {post.like_count > 0 ? post.like_count : ''}
          </button>
          <button className="flex items-center gap-1.5 text-xs text-muted hover:text-blue-500 transition-colors">
            <MessageCircle size={16} /> {post.comment_count > 0 ? post.comment_count : ''}
          </button>
          <button className="flex items-center gap-1.5 text-xs text-muted hover:text-green-500 transition-colors ml-auto">
            <Share2 size={16} />
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(false)}>
          <div className="card p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-primary mb-2">Delete Post?</h3>
            <p className="text-sm text-muted mb-4">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="btn-ghost text-sm px-4 py-2">Cancel</button>
              <button
                onClick={() => { onDelete?.(post.id); setConfirmDelete(false); }}
                className="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-lg font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}

// ─── Image Lightbox ─────────────────────────────────────────────────────────

function ImageLightbox({ images, initialIndex, onClose }: { images: string[]; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex);

  const prev = () => setIndex(i => (i > 0 ? i - 1 : images.length - 1));
  const next = () => setIndex(i => (i < images.length - 1 ? i + 1 : 0));

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 z-10">
        <X size={20} />
      </button>

      {images.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 z-10">
            <ChevronLeft size={20} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 z-10">
            <ChevronRight size={20} />
          </button>
        </>
      )}

      <img
        src={images[index]}
        alt=""
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        onClick={e => e.stopPropagation()}
      />

      {images.length > 1 && (
        <div className="absolute bottom-4 flex gap-1.5">
          {images.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full ${i === index ? 'bg-white' : 'bg-white/30'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Feed ───────────────────────────────────────────────────────────────────

interface FeedProps {
  posts: SocietyPost[];
  brandColor: string;
  isManageMode?: boolean;
  onEdit?: (post: SocietyPost) => void;
  onDelete?: (postId: string) => void;
  onPin?: (postId: string, pinned: boolean) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
}

export function Feed({ posts, brandColor, isManageMode, onEdit, onDelete, onPin, onLoadMore, hasMore, loading }: FeedProps) {
  if (posts.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        <MessageCircle size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No posts yet</p>
      </div>
    );
  }

  // Sort: pinned first, then by date
  const sorted = [...posts].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="space-y-4">
      {sorted.map(post => (
        <PostCard
          key={post.id}
          post={post}
          brandColor={brandColor}
          isManageMode={isManageMode}
          onEdit={onEdit}
          onDelete={onDelete}
          onPin={onPin}
        />
      ))}
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className="w-full text-center text-sm text-brand-500 hover:text-brand-600 py-3"
        >
          {loading ? 'Loading...' : 'Load more posts'}
        </button>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
