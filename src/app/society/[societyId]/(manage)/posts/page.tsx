'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  MessageSquare, Loader2, Edit3, X,
} from 'lucide-react';
import { fetchPosts, createPost, updatePost, deletePost, uploadSocietyMedia, SocietyApiError } from '../../../api';
import { PageLoader, ErrorState, EmptyState } from '../../../_components/Shared';
import PostComposer from '../../../_components/PostComposer';
import { Feed } from '../../../_components/Feed';
import type { SocietyPost } from '../../../types';

export default function SocietyPostsPage() {
  const { societyId } = useParams<{ societyId: string }>();
  const router = useRouter();
  const [posts, setPosts] = useState<SocietyPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Edit state
  const [editPost, setEditPost] = useState<SocietyPost | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Brand color placeholder
  const brandColor = '#6366f1';

  const load = useCallback(async (p = 1) => {
    try {
      if (p === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      const data = await fetchPosts(societyId, p);
      if (p === 1) {
        setPosts(data.posts);
      } else {
        setPosts(prev => [...prev, ...data.posts]);
      }
      setHasMore(data.pagination.hasMore);
      setPage(p);
    } catch (err) {
      if (err instanceof SocietyApiError) {
        if (err.status === 401) { router.push('/login'); return; }
        setError(err.message);
      } else {
        setError('Failed to load posts');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [societyId, router]);

  useEffect(() => { load(); }, [load]);

  const handlePost = async (data: {
    content: string;
    post_type: string;
    shared_event_id?: string;
    is_pinned?: boolean;
    images?: File[];
  }) => {
    // Upload images first
    const image_urls: { file_url: string; file_name: string; file_size_bytes: number; mime_type: string }[] = [];

    if (data.images && data.images.length > 0) {
      for (const file of data.images) {
        try {
          const result = await uploadSocietyMedia(societyId, 'gallery', file);
          image_urls.push({
            file_url: result.url,
            file_name: file.name,
            file_size_bytes: file.size,
            mime_type: file.type,
          });
        } catch (err) {
          setToast('Failed to upload image: ' + (err instanceof Error ? err.message : 'Unknown error'));
          return;
        }
      }
    }

    await createPost(societyId, {
      content: data.content,
      post_type: data.post_type as any,
      shared_event_id: data.shared_event_id,
      is_pinned: data.is_pinned,
      image_urls,
    });

    setToast('Post created!');
    load(1);
  };

  const handleEdit = async () => {
    if (!editPost) return;
    try {
      setSaving(true);
      await updatePost(societyId, editPost.id, { content: editContent });
      setToast('Post updated');
      setEditPost(null);
      load(1);
    } catch (err) {
      setToast(err instanceof SocietyApiError ? err.message : 'Failed to update post');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (postId: string) => {
    try {
      await deletePost(societyId, postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
      setToast('Post deleted');
    } catch (err) {
      setToast(err instanceof SocietyApiError ? err.message : 'Failed to delete post');
    }
  };

  const handlePin = async (postId: string, pinned: boolean) => {
    try {
      await updatePost(societyId, postId, { is_pinned: pinned });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_pinned: pinned } : p));
      setToast(pinned ? 'Post pinned' : 'Post unpinned');
    } catch (err) {
      setToast('Failed to update pin status');
    }
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare size={20} style={{ color: brandColor }} />
        <h2 className="text-lg font-semibold text-primary">Society Posts</h2>
      </div>

      {/* Composer */}
      <PostComposer
        societyId={societyId}
        authorName="You"
        authorAvatar={null}
        onPost={handlePost}
      />

      {/* Posts feed */}
      {loading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load()} />
      ) : posts.length === 0 ? (
        <EmptyState message="No posts yet. Create the first one!" />
      ) : (
        <Feed
          posts={posts}
          brandColor={brandColor}
          isManageMode={true}
          onEdit={(post) => { setEditPost(post); setEditContent(post.content || ''); }}
          onDelete={handleDelete}
          onPin={handlePin}
          onLoadMore={() => load(page + 1)}
          hasMore={hasMore}
          loading={loadingMore}
        />
      )}

      {/* Edit dialog */}
      {editPost && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setEditPost(null)}>
          <div className="card w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                <Edit3 size={18} /> Edit Post
              </h3>
              <button onClick={() => setEditPost(null)} className="text-muted hover:text-primary">
                <X size={20} />
              </button>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="input-field min-h-[120px] resize-none"
              placeholder="Post content..."
            />
            {editPost.images && editPost.images.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {editPost.images.map(img => (
                  <img key={img.id} src={img.file_url} alt="" className="h-16 w-16 rounded object-cover flex-shrink-0" />
                ))}
              </div>
            )}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setEditPost(null)} className="btn-ghost text-sm px-4 py-2" disabled={saving}>
                Cancel
              </button>
              <button onClick={handleEdit} disabled={saving} className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save
              </button>
            </div>
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
