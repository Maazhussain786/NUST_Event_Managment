'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  Star,
  Calendar,
  MapPin,
  Mail,
  Phone,
  ExternalLink,
  Image as ImageIcon,
  UserCheck,
  MessageCircle,
  Share2,
  Loader2,
  ChevronRight,
  Clock,
  Shield,
  Globe,
  Instagram,
  Linkedin,
  Youtube,
  Settings,
} from 'lucide-react';
import { SmartImage } from '@/components/SmartImage';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Society {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  status: string;
  is_nust_wide: boolean;
  school_name: string | null;
  school_abbr: string | null;
  member_count: string;
  avg_rating: string;
  rating_count: string;
  created_at: string;
}

interface Profile {
  tagline: string | null;
  cover_url: string | null;
  mission: string | null;
  established_year: number | null;
  faculty_advisor: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  office_location: string | null;
  social_links: Record<string, string> | null;
  primary_color: string | null;
  accent_color: string | null;
  pin_announcement: string | null;
  featured_event_id: string | null;
  is_public: boolean;
}

interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  location: string | null;
  event_start: string;
  event_end: string | null;
  ticket_price: string | null;
  visibility: string;
  tickets_sold: string;
}

interface TeamMember {
  membership_id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role_name: string;
  hierarchy_level: number;
  wing_name: string | null;
  portfolio_name: string | null;
}

interface GalleryItem {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string;
  created_at: string;
  uploaded_by: string;
}

interface Wing {
  id: string;
  name: string;
  description: string | null;
  member_count: string;
}

type Tab = 'home' | 'about' | 'events' | 'photos' | 'team' | 'contact';

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PublicSocietyPage() {
  const params = useParams();
  const router = useRouter();
  const societyId = params.societyId as string;

  const [society, setSociety] = useState<Society | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [wings, setWings] = useState<Wing[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New: posts & albums for Home/Photos tabs
  const [posts, setPosts] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/societies/${societyId}/public`).then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); }),
      fetch(`/api/societies/${societyId}/posts?limit=10`).then(r => r.ok ? r.json() : { posts: [] }).catch(() => ({ posts: [] })),
      fetch(`/api/societies/${societyId}/albums`).then(r => r.ok ? r.json() : { albums: [] }).catch(() => ({ albums: [] })),
    ])
      .then(([data, postsData, albumsData]) => {
        setSociety(data.society);
        setProfile(data.profile);
        setEvents(data.events || []);
        setTeam(data.team || []);
        setGallery(data.gallery || []);
        setWings(data.wings || []);
        setPosts(postsData.posts || []);
        setAlbums(albumsData.albums || []);
      })
      .catch(() => setError('Society not found'))
      .finally(() => setLoading(false));
  }, [societyId]);

  const brandColor = profile?.primary_color || '#FF9F43';

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({ title: society?.name, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }, [society]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: brandColor }} />
      </div>
    );
  }

  if (error || !society) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-primary">
        <p className="text-muted text-lg">Society not found</p>
        <button onClick={() => router.push('/home')} className="btn-primary">Go Home</button>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'home', label: 'Home' },
    { key: 'about', label: 'About' },
    { key: 'events', label: 'Events', count: events.length },
    { key: 'photos', label: 'Photos', count: albums.length },
    { key: 'team', label: 'Team', count: team.length },
    { key: 'contact', label: 'Contact' },
  ];

  return (
    <div className="min-h-screen bg-primary">
      {/* ─── Cover Banner ─── */}
      <div className="relative h-52 sm:h-64" style={{ background: profile?.cover_url ? undefined : `linear-gradient(135deg, ${brandColor}, ${profile?.accent_color || '#e08a30'})` }}>
        {profile?.cover_url && (
          <SmartImage src={profile.cover_url} alt="Cover" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute top-4 left-4 right-4 flex justify-between z-10">
          <button onClick={() => router.back()} className="w-10 h-10 rounded-2xl bg-black/30 backdrop-blur-md flex items-center justify-center text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            <button onClick={handleShare} className="w-10 h-10 rounded-2xl bg-black/30 backdrop-blur-md flex items-center justify-center text-white">
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Society Info ─── */}
      <div className="px-5 -mt-14 relative z-10 max-w-3xl mx-auto">
        <div className="flex items-end gap-4 mb-3">
          <div className="w-24 h-24 rounded-2xl shrink-0 border-4 flex items-center justify-center text-3xl font-bold overflow-hidden" style={{ background: 'var(--bg-primary)', borderColor: 'var(--bg-primary)', color: brandColor }}>
            {society.logo_url ? (
              <SmartImage src={society.logo_url} alt={society.name} className="w-full h-full object-cover" />
            ) : (
              society.name[0]
            )}
          </div>
          <div className="pb-1 flex-1 min-w-0">
            <h1 className="text-xl font-bold text-primary truncate">{society.name}</h1>
            {profile?.tagline && <p className="text-muted text-sm mt-0.5">{profile.tagline}</p>}
            <p className="text-muted text-xs mt-0.5">
              {society.is_nust_wide ? 'NUST-Wide' : society.school_abbr || 'Society'}
              {profile?.established_year && ` · Est. ${profile.established_year}`}
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-1 text-sm text-secondary">
            <Users className="w-4 h-4" style={{ color: brandColor }} />
            <span className="font-semibold text-primary">{Number(society.member_count)}</span> members
          </div>
          <div className="flex items-center gap-1 text-sm text-secondary">
            <Star className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-primary">{society.avg_rating}</span>
            <span>({society.rating_count})</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-secondary">
            <Calendar className="w-4 h-4" style={{ color: brandColor }} />
            <span>{events.length} events</span>
          </div>
        </div>

        {/* Pinned announcement - visible on non-home tabs */}
        {profile?.pin_announcement && activeTab !== 'home' && (
          <div className="card p-3 mb-4 border-l-4 flex items-start gap-2" style={{ borderLeftColor: brandColor }}>
            <MessageCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: brandColor }} />
            <p className="text-sm text-secondary">{profile.pin_announcement}</p>
          </div>
        )}

        {/* ─── Tabs ─── */}
        <div className="flex overflow-x-auto gap-1 mb-5 -mx-1 px-1 scrollbar-hide" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap pb-3 px-3 text-sm font-medium transition-colors relative ${activeTab === tab.key ? '' : 'text-muted'}`}
              style={activeTab === tab.key ? { color: brandColor } : undefined}
            >
              {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ''}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: brandColor }} />
              )}
            </button>
          ))}
        </div>

        {/* ─── Tab Content ─── */}
        <div className="pb-8">
          {activeTab === 'home' && <HomeTab posts={posts} profile={profile} events={events} brandColor={brandColor} router={router} />}
          {activeTab === 'about' && <AboutTab society={society} profile={profile} wings={wings} brandColor={brandColor} />}
          {activeTab === 'events' && <EventsTab events={events} brandColor={brandColor} router={router} />}
          {activeTab === 'photos' && <PhotosTab albums={albums} gallery={gallery} brandColor={brandColor} />}
          {activeTab === 'team' && <TeamTab team={team} brandColor={brandColor} />}
          {activeTab === 'contact' && <ContactTab profile={profile} society={society} brandColor={brandColor} />}
        </div>
      </div>
    </div>
  );
}

// ─── Home Tab (Feed) ────────────────────────────────────────────────────────

function HomeTab({ posts, profile, events, brandColor, router }: { posts: any[]; profile: Profile | null; events: PublicEvent[]; brandColor: string; router: ReturnType<typeof useRouter> }) {
  // Featured/upcoming event
  const upcomingEvent = events.find(e => new Date(e.event_start) > new Date());

  return (
    <div className="space-y-4">
      {/* Pinned announcement */}
      {profile?.pin_announcement && (
        <div className="card p-3 border-l-4 flex items-start gap-2" style={{ borderLeftColor: brandColor }}>
          <MessageCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: brandColor }} />
          <p className="text-sm text-secondary">{profile.pin_announcement}</p>
        </div>
      )}

      {/* Featured event card */}
      {upcomingEvent && (
        <button
          onClick={() => router.push(`/events/${upcomingEvent.id}`)}
          className="card p-0 w-full text-left overflow-hidden"
        >
          {upcomingEvent.banner_url ? (
            <SmartImage src={upcomingEvent.banner_url} alt="" className="w-full h-40 object-cover" />
          ) : (
            <div className="w-full h-40 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${brandColor}33, ${brandColor}11)` }}>
              <Calendar size={40} style={{ color: brandColor }} />
            </div>
          )}
          <div className="p-4">
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 mb-2 inline-block">Upcoming Event</span>
            <h4 className="text-sm font-semibold text-primary">{upcomingEvent.title}</h4>
            <p className="text-xs text-muted mt-1 flex items-center gap-1">
              <Calendar size={12} />
              {new Date(upcomingEvent.event_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </button>
      )}

      {/* Posts feed */}
      {posts.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <MessageCircle size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No posts yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post: any) => (
            <div key={post.id} className="card overflow-hidden">
              {/* Post pinned badge */}
              {post.is_pinned && (
                <div className="px-4 pt-2 flex items-center gap-1.5 text-xs text-amber-500">
                  <Shield size={12} /> Pinned
                </div>
              )}
              {/* Author */}
              <div className="p-4 pb-2 flex items-center gap-3">
                {post.author_avatar ? (
                  <SmartImage src={post.author_avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: `${brandColor}15`, color: brandColor }}>
                    {post.author_name?.[0] || '?'}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-primary">{post.author_name}</p>
                  <p className="text-xs text-muted">{getTimeAgo(post.created_at)}</p>
                </div>
              </div>
              {/* Content */}
              {post.content && (
                <p className="px-4 pb-2 text-sm text-secondary whitespace-pre-wrap">{post.content}</p>
              )}
              {/* Images */}
              {post.images && post.images.length > 0 && (
                <div className={`${post.images.length === 1 ? '' : 'grid gap-0.5 grid-cols-2'}`}>
                  {post.images.slice(0, 4).map((img: any, i: number) => (
                    <SmartImage key={img.id} src={img.file_url} alt="" className={`w-full object-cover ${post.images.length === 1 ? 'max-h-[400px]' : 'aspect-square'}`} />
                  ))}
                </div>
              )}
              {/* Shared event */}
              {post.shared_event_title && (
                <div className="mx-4 mb-3 rounded-lg border border-themed p-3">
                  <p className="text-sm font-semibold text-primary">{post.shared_event_title}</p>
                  {post.shared_event_date && (
                    <p className="text-xs text-muted flex items-center gap-1 mt-1"><Calendar size={12} />{new Date(post.shared_event_date).toLocaleDateString()}</p>
                  )}
                </div>
              )}
              {/* Engagement */}
              <div className="border-t border-themed px-4 py-2 flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1"><Star size={14} /> {post.like_count || 0}</span>
                <span className="flex items-center gap-1"><MessageCircle size={14} /> {post.comment_count || 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── About Tab ──────────────────────────────────────────────────────────────

function AboutTab({ society, profile, wings, brandColor }: { society: Society; profile: Profile | null; wings: Wing[]; brandColor: string }) {
  return (
    <div className="space-y-5">
      {/* Mission */}
      {profile?.mission && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
            <Shield size={16} style={{ color: brandColor }} /> Our Mission
          </h3>
          <p className="text-secondary text-sm leading-relaxed">{profile.mission}</p>
        </div>
      )}

      {/* Description */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-primary mb-2">Description</h3>
        <p className="text-secondary text-sm leading-relaxed">{society.description || 'No description available.'}</p>
      </div>

      {/* Faculty Advisor */}
      {profile?.faculty_advisor && (
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center">
            <UserCheck size={18} style={{ color: brandColor }} />
          </div>
          <div>
            <p className="text-xs text-muted">Faculty Advisor</p>
            <p className="text-sm font-medium text-primary">{profile.faculty_advisor}</p>
          </div>
        </div>
      )}

      {/* Wings */}
      {wings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-primary mb-3">Wings ({wings.length})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {wings.map(wing => (
              <div key={wing.id} className="card p-4">
                <h4 className="text-sm font-semibold text-primary">{wing.name}</h4>
                <p className="text-xs text-muted mt-1 line-clamp-2">{wing.description || 'No description'}</p>
                <p className="text-xs text-muted mt-2 flex items-center gap-1">
                  <Users size={12} /> {Number(wing.member_count)} members
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick info */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-primary mb-2">Info</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-secondary">
            <Calendar size={14} className="text-muted" />
            <span>Founded {new Date(society.created_at).getFullYear()}</span>
          </div>
          {profile?.established_year && (
            <div className="flex items-center gap-2 text-secondary">
              <Clock size={14} className="text-muted" />
              <span>Established {profile.established_year}</span>
            </div>
          )}
          {profile?.office_location && (
            <div className="flex items-center gap-2 text-secondary">
              <MapPin size={14} className="text-muted" />
              <span>{profile.office_location}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Events Tab ─────────────────────────────────────────────────────────────

function EventsTab({ events, brandColor, router }: { events: PublicEvent[]; brandColor: string; router: ReturnType<typeof useRouter> }) {
  if (events.length === 0) {
    return <p className="text-center text-muted py-12">No events yet</p>;
  }

  const now = new Date();

  return (
    <div className="space-y-3">
      {events.map(ev => {
        const start = new Date(ev.event_start);
        const end = ev.event_end ? new Date(ev.event_end) : null;
        const isUpcoming = start > now;
        const isOngoing = start <= now && (!end || end >= now);

        return (
          <button key={ev.id} onClick={() => router.push(`/events/${ev.id}`)} className="card p-0 w-full text-left overflow-hidden flex flex-col sm:flex-row">
            {ev.banner_url ? (
              <SmartImage src={ev.banner_url} alt={ev.title} className="w-full sm:w-40 h-32 sm:h-auto object-cover shrink-0" />
            ) : (
              <div className="w-full sm:w-40 h-32 sm:h-auto shrink-0 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${brandColor}33, ${brandColor}11)` }}>
                <Calendar size={32} style={{ color: brandColor }} />
              </div>
            )}
            <div className="p-4 flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {isOngoing && <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">Ongoing</span>}
                {isUpcoming && <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">Upcoming</span>}
                {!isUpcoming && !isOngoing && <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-500">Past</span>}
              </div>
              <h4 className="text-sm font-semibold text-primary truncate">{ev.title}</h4>
              <p className="text-xs text-muted mt-1">{start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              {ev.location && <p className="text-xs text-muted flex items-center gap-1 mt-0.5"><MapPin size={10} /> {ev.location}</p>}
              <div className="flex items-center gap-3 mt-2">
                {ev.ticket_price && Number(ev.ticket_price) > 0 && (
                  <span className="text-xs font-medium" style={{ color: brandColor }}>PKR {Number(ev.ticket_price).toLocaleString()}</span>
                )}
                <span className="text-xs text-muted">{Number(ev.tickets_sold)} attended</span>
              </div>
            </div>
            <div className="hidden sm:flex items-center pr-3"><ChevronRight size={16} className="text-muted" /></div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Photos Tab ─────────────────────────────────────────────────────────────

function PhotosTab({ albums, gallery, brandColor }: { albums: any[]; gallery: GalleryItem[]; brandColor: string }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <>
      {/* Albums */}
      {albums.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-primary mb-3">Albums</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {albums.map((album: any) => (
              <div key={album.id} className="card overflow-hidden group cursor-pointer">
                <div className="aspect-[4/3] bg-surface-100 dark:bg-surface-800 relative overflow-hidden">
                  {album.cover_photo_url ? (
                    <SmartImage src={album.cover_photo_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={28} className="text-muted opacity-30" />
                    </div>
                  )}
                  <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded-full bg-black/50 text-white">{album.category}</span>
                </div>
                <div className="p-2.5">
                  <p className="text-sm font-semibold text-primary truncate">{album.name}</p>
                  <p className="text-xs text-muted">{album.photo_count} photo{album.photo_count !== 1 ? 's' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legacy gallery */}
      {gallery.length > 0 && (
        <div>
          {albums.length > 0 && <h3 className="text-sm font-semibold text-primary mb-3">Gallery</h3>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {gallery.map(item => (
              <button
                key={item.id}
                onClick={() => item.file_type?.startsWith('image') && setLightbox(item.file_url)}
                className="relative overflow-hidden rounded-xl aspect-square group"
              >
                {item.file_type?.startsWith('image') ? (
                  <SmartImage src={item.file_url} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full bg-secondary flex items-center justify-center">
                    <ImageIcon size={32} className="text-muted" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                  <p className="text-white text-xs truncate">{item.title}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {albums.length === 0 && gallery.length === 0 && (
        <p className="text-center text-muted py-12">No photos yet</p>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <SmartImage src={lightbox} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </>
  );
}

// ─── Team Tab ───────────────────────────────────────────────────────────────

function TeamTab({ team, brandColor }: { team: TeamMember[]; brandColor: string }) {
  if (team.length === 0) {
    return <p className="text-center text-muted py-12">Team info not available</p>;
  }

  // Group by hierarchy
  const leadership = team.filter(m => m.hierarchy_level >= 8);
  const directors = team.filter(m => m.hierarchy_level >= 3 && m.hierarchy_level < 8);

  return (
    <div className="space-y-6">
      {/* Leadership */}
      {leadership.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-primary mb-3">Leadership</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {leadership.map(m => (
              <div key={m.membership_id} className="card p-4 flex items-center gap-3">
                {m.avatar_url ? (
                  <SmartImage src={m.avatar_url} alt={m.full_name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: `${brandColor}15`, color: brandColor }}>
                    {m.full_name[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary truncate">{m.full_name}</p>
                  <p className="text-xs font-medium" style={{ color: brandColor }}>{m.role_name}</p>
                  {m.wing_name && <p className="text-xs text-muted">{m.wing_name}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Directors */}
      {directors.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-primary mb-3">Directors</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {directors.map(m => (
              <div key={m.membership_id} className="card p-3 flex items-center gap-3">
                {m.avatar_url ? (
                  <SmartImage src={m.avatar_url} alt={m.full_name} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-secondary text-primary">
                    {m.full_name[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-primary truncate">{m.full_name}</p>
                  <p className="text-xs text-muted">{m.role_name}{m.wing_name ? ` · ${m.wing_name}` : ''}{m.portfolio_name ? ` · ${m.portfolio_name}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contact Tab ────────────────────────────────────────────────────────────

function ContactTab({ profile, society, brandColor }: { profile: Profile | null; society: Society; brandColor: string }) {
  const socials = profile?.social_links || {};
  const hasSocials = Object.values(socials).some(v => v);
  const hasContactInfo = profile?.contact_email || profile?.contact_phone || profile?.office_location;

  if (!hasContactInfo && !hasSocials) {
    return <p className="text-center text-muted py-12">No contact information available</p>;
  }

  const socialIcons: Record<string, React.ReactNode> = {
    instagram: <Instagram size={18} />,
    linkedin: <Linkedin size={18} />,
    youtube: <Youtube size={18} />,
    website: <Globe size={18} />,
  };

  return (
    <div className="space-y-5">
      {/* Contact info */}
      {hasContactInfo && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-primary">Contact Details</h3>
          {profile?.contact_email && (
            <a href={`mailto:${profile.contact_email}`} className="flex items-center gap-3 text-sm text-secondary hover:text-primary transition-colors">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${brandColor}10` }}>
                <Mail size={16} style={{ color: brandColor }} />
              </div>
              {profile.contact_email}
            </a>
          )}
          {profile?.contact_phone && (
            <a href={`tel:${profile.contact_phone}`} className="flex items-center gap-3 text-sm text-secondary hover:text-primary transition-colors">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${brandColor}10` }}>
                <Phone size={16} style={{ color: brandColor }} />
              </div>
              {profile.contact_phone}
            </a>
          )}
          {profile?.office_location && (
            <div className="flex items-center gap-3 text-sm text-secondary">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${brandColor}10` }}>
                <MapPin size={16} style={{ color: brandColor }} />
              </div>
              {profile.office_location}
            </div>
          )}
        </div>
      )}

      {/* Social links */}
      {hasSocials && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-primary mb-3">Social Media</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(socials).filter(([, v]) => v).map(([key, url]) => (
              <a
                key={key}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-secondary hover:text-primary transition-colors"
                style={{ background: `${brandColor}08` }}
              >
                {socialIcons[key] || <ExternalLink size={16} />}
                <span className="capitalize">{key}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}


