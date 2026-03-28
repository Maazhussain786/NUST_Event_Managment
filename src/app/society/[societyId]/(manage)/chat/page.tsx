'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Send,
  Plus,
  Hash,
  MessageSquare,
  ArrowLeft,
  Users,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { PageLoader, EmptyState, ErrorState } from '../../../_components/Shared';
import {
  fetchChatChannels,
  createChatChannel,
  fetchChatMessages,
  sendChatMessage,
  SocietyApiError,
} from '../../../api';
import type { ChatChannel, ChatMessage } from '../../../types';
import { SmartImage } from '@/components/SmartImage';

export default function ChatPage() {
  const params = useParams();
  const societyId = params.societyId as string;

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [draft, setDraft] = useState('');
  const [showChannelList, setShowChannelList] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load channels
  useEffect(() => {
    setLoading(true);
    fetchChatChannels(societyId)
      .then(data => {
        setChannels(data);
        setActiveChannel(prev => prev ?? data[0] ?? null);
      })
      .catch(err => setError(err instanceof SocietyApiError ? err.message : 'Failed to load channels'))
      .finally(() => setLoading(false));
  }, [societyId]);

  // Load messages when channel changes
  useEffect(() => {
    const activeChannelId = activeChannel?.id;
    if (!activeChannelId) return;
    setMsgLoading(true);
    fetchChatMessages(societyId, activeChannelId)
      .then(data => {
        setMessages(data.messages);
        setHasMore(data.hasMore);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      })
      .catch(() => setMessages([]))
      .finally(() => setMsgLoading(false));
  }, [activeChannel?.id, societyId]);

  const handleSend = useCallback(async () => {
    if (!draft.trim() || !activeChannel || sending) return;
    setSending(true);
    try {
      const { message } = await sendChatMessage(societyId, activeChannel.id, { content: draft.trim() });
      setMessages(prev => [...prev, message]);
      setDraft('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      inputRef.current?.focus();
    } catch {
      // silent fail
    } finally {
      setSending(false);
    }
  }, [draft, activeChannel, societyId, sending]);

  const handleLoadMore = useCallback(async () => {
    if (!activeChannel || !hasMore || messages.length === 0) return;
    const oldest = messages[0].created_at;
    const data = await fetchChatMessages(societyId, activeChannel.id, oldest);
    setMessages(prev => [...data.messages, ...prev]);
    setHasMore(data.hasMore);
  }, [activeChannel, hasMore, messages, societyId]);

  const handleCreateChannel = useCallback(async () => {
    if (!newChannelName.trim()) return;
    try {
      const { channel } = await createChatChannel(societyId, {
        name: newChannelName.trim(),
        description: newChannelDesc.trim() || undefined,
      });
      setChannels(prev => [channel, ...prev]);
      setActiveChannel(channel);
      setShowNewChannel(false);
      setNewChannelName('');
      setNewChannelDesc('');
    } catch (err) {
      alert(err instanceof SocietyApiError ? err.message : 'Failed to create channel');
    }
  }, [newChannelName, newChannelDesc, societyId]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-xl overflow-hidden border border-themed bg-card">
      {/* ─── Channel List ─── */}
      <div className={`${showChannelList && !activeChannel ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-72 border-r border-themed shrink-0`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-themed">
          <h3 className="text-sm font-semibold text-primary">Channels</h3>
          <button onClick={() => setShowNewChannel(!showNewChannel)} className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-secondary text-muted">
            <Plus size={16} />
          </button>
        </div>

        {/* New channel form */}
        {showNewChannel && (
          <div className="p-3 border-b border-themed space-y-2">
            <input
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)}
              placeholder="Channel name"
              className="input-field text-sm w-full"
              autoFocus
            />
            <input
              value={newChannelDesc}
              onChange={e => setNewChannelDesc(e.target.value)}
              placeholder="Description (optional)"
              className="input-field text-sm w-full"
            />
            <div className="flex gap-2">
              <button onClick={handleCreateChannel} className="btn-primary text-xs flex-1">Create</button>
              <button onClick={() => setShowNewChannel(false)} className="btn-ghost text-xs">Cancel</button>
            </div>
          </div>
        )}

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto">
          {channels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <MessageSquare size={32} className="text-muted mb-2" />
              <p className="text-sm text-muted">No channels yet</p>
              <p className="text-xs text-muted mt-1">Create one to get started</p>
            </div>
          ) : (
            channels.map(ch => (
              <button
                key={ch.id}
                onClick={() => { setActiveChannel(ch); setShowChannelList(false); }}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-secondary transition-colors
                  ${activeChannel?.id === ch.id ? 'bg-brand-500/10' : ''}`}
              >
                <Hash size={16} className={activeChannel?.id === ch.id ? 'text-brand-500' : 'text-muted'} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${activeChannel?.id === ch.id ? 'text-brand-500' : 'text-primary'}`}>{ch.name}</p>
                  {ch.description && <p className="text-xs text-muted truncate">{ch.description}</p>}
                </div>
                {ch.message_count && Number(ch.message_count) > 0 && (
                  <span className="text-[10px] text-muted">{ch.message_count}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ─── Chat Area ─── */}
      <div className={`flex-1 flex flex-col ${!showChannelList || activeChannel ? '' : 'hidden md:flex'}`}>
        {activeChannel ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-themed">
              <button onClick={() => { setShowChannelList(true); setActiveChannel(null); }} className="md:hidden w-8 h-8 rounded-md flex items-center justify-center hover:bg-secondary text-muted">
                <ArrowLeft size={16} />
              </button>
              <Hash size={18} className="text-brand-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary truncate">{activeChannel.name}</p>
                {activeChannel.description && <p className="text-xs text-muted truncate">{activeChannel.description}</p>}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {hasMore && (
                <button onClick={handleLoadMore} className="w-full text-center text-xs text-brand-500 hover:underline py-2 flex items-center justify-center gap-1">
                  <ChevronDown size={12} className="rotate-180" /> Load older messages
                </button>
              )}

              {msgLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted">
                  <MessageSquare size={40} className="mb-3 opacity-30" />
                  <p className="text-sm">No messages yet. Say hello!</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className="flex gap-3 group">
                    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold bg-brand-500/10 text-brand-500">
                      {msg.sender_avatar ? (
                        <SmartImage src={msg.sender_avatar} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        msg.sender_name?.[0] || '?'
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-primary">{msg.sender_name}</span>
                        <span className="text-[10px] text-muted">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className={`text-sm text-secondary break-words ${msg.is_deleted ? 'italic text-muted' : ''}`}>
                        {msg.is_deleted ? 'This message was deleted' : msg.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-themed p-3">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={`Message #${activeChannel.name}`}
                  className="input-field text-sm flex-1"
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  className="btn-primary h-10 w-10 flex items-center justify-center shrink-0 disabled:opacity-50"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center text-muted">
            <div className="text-center">
              <MessageSquare size={48} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a channel to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


