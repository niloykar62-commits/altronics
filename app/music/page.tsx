'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  onSnapshot, serverTimestamp, deleteDoc, query, where,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';

// ─── Types ────────────────────────────────────────────────────────────────────
interface MusicRoom {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  memberIds: string[];
  members: { uid: string; name: string; photoURL?: string }[];
  currentTrack: {
    videoId: string;
    title: string;
    thumbnail: string;
    startedAt: number; // epoch ms
    paused: boolean;
    pausedAt: number;  // seconds into track when paused
  } | null;
  queue: { videoId: string; title: string; thumbnail: string; addedBy: string }[];
  createdAt: any;
}

// ─── YouTube search via oEmbed + noembed ─────────────────────────────────────
// We use YouTube's public search page scrape-free approach:
// User pastes a YouTube URL or searches by title using the free Invidious API
async function searchYouTube(q: string): Promise<{ videoId: string; title: string; thumbnail: string }[]> {
  try {
    const res = await fetch(`https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(q)}&type=video&fields=videoId,title,videoThumbnails`);
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    return (data || []).slice(0, 8).map((v: any) => ({
      videoId: v.videoId,
      title: v.title,
      thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
    }));
  } catch {
    // Fallback: try parsing as YouTube URL
    return [];
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function getVideoInfo(videoId: string): Promise<{ title: string; thumbnail: string }> {
  try {
    const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    const data = await res.json();
    return {
      title: data.title || 'Unknown track',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    };
  } catch {
    return { title: 'Unknown track', thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` };
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  card: { background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 20 } as React.CSSProperties,
  btn: (active?: boolean, danger?: boolean): React.CSSProperties => ({
    padding: '10px 20px', borderRadius: 14, fontFamily: 'Inter,sans-serif', fontWeight: 700,
    fontSize: 13, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
    background: danger ? 'rgba(239,68,68,0.12)' : active ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(139,92,246,0.12)',
    color: danger ? '#f87171' : active ? 'white' : '#a78bfa',
  }),
  input: {
    width: '100%', padding: '11px 15px', borderRadius: 14,
    background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(139,92,246,0.25)',
    color: '#f3f4f6', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box',
  } as React.CSSProperties,
};

// ─── YouTube Player Component ─────────────────────────────────────────────────
function YouTubePlayer({ room, user, isHost }: { room: MusicRoom; user: any; isHost: boolean }) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const syncIntervalRef = useRef<any>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [localPaused, setLocalPaused] = useState(false);

  const track = room.currentTrack;

  // Load YouTube IFrame API
  useEffect(() => {
    if ((window as any).YT?.Player) { initPlayer(); return; }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    (window as any).onYouTubeIframeAPIReady = () => initPlayer();
    return () => { (window as any).onYouTubeIframeAPIReady = null; };
  }, []);

  const initPlayer = () => {
    if (!containerRef.current) return;
    if (playerRef.current) { playerRef.current.destroy(); }
    playerRef.current = new (window as any).YT.Player(containerRef.current, {
      height: '100%', width: '100%',
      videoId: track?.videoId || '',
      playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, iv_load_policy: 3 },
      events: {
        onReady: () => setPlayerReady(true),
        onStateChange: (e: any) => {
          // YT.PlayerState: PLAYING=1, PAUSED=2
          if (!isHost) return;
          if (e.data === 1) handleHostPlay();
          if (e.data === 2) handleHostPause();
        },
      },
    });
  };

  // Re-init when track changes
  useEffect(() => {
    if (!playerReady || !track?.videoId) return;
    playerRef.current?.loadVideoById(track.videoId);
    setTimeout(() => seekToSync(), 800);
  }, [track?.videoId]);

  // Sync position from Firestore
  useEffect(() => {
    if (!playerReady || !track) return;
    if (track.paused) {
      playerRef.current?.pauseAt?.(track.pausedAt);
      playerRef.current?.seekTo(track.pausedAt, true);
      playerRef.current?.pauseVideo();
      setLocalPaused(true);
    } else {
      seekToSync();
      setLocalPaused(false);
    }
  }, [playerReady, track?.paused, track?.startedAt]);

  const seekToSync = () => {
    if (!track || track.paused) return;
    const elapsed = (Date.now() - track.startedAt) / 1000;
    playerRef.current?.seekTo(elapsed, true);
    playerRef.current?.playVideo();
  };

  // Periodic re-sync every 5s for guests
  useEffect(() => {
    if (!playerReady || isHost) return;
    syncIntervalRef.current = setInterval(() => {
      if (!room.currentTrack || room.currentTrack.paused) return;
      const elapsed = (Date.now() - room.currentTrack.startedAt) / 1000;
      const current = playerRef.current?.getCurrentTime?.() || 0;
      if (Math.abs(current - elapsed) > 3) {
        playerRef.current?.seekTo(elapsed, true);
      }
    }, 5000);
    return () => clearInterval(syncIntervalRef.current);
  }, [playerReady, isHost, room.currentTrack]);

  const handleHostPlay = async () => {
    if (!isHost || !track) return;
    const currentTime = playerRef.current?.getCurrentTime?.() || 0;
    await updateDoc(doc(db, 'musicRooms', room.id), {
      'currentTrack.paused': false,
      'currentTrack.startedAt': Date.now() - currentTime * 1000,
    });
  };

  const handleHostPause = async () => {
    if (!isHost || !track) return;
    const currentTime = playerRef.current?.getCurrentTime?.() || 0;
    await updateDoc(doc(db, 'musicRooms', room.id), {
      'currentTrack.paused': true,
      'currentTrack.pausedAt': currentTime,
    });
  };

  const togglePlayPause = async () => {
    if (!track) return;
    if (localPaused) {
      playerRef.current?.playVideo();
      await handleHostPlay();
    } else {
      playerRef.current?.pauseVideo();
      await handleHostPause();
    }
    setLocalPaused(!localPaused);
  };

  const playNext = async () => {
    if (!isHost || !room.queue?.length) return;
    const [next, ...rest] = room.queue;
    await updateDoc(doc(db, 'musicRooms', room.id), {
      currentTrack: { videoId: next.videoId, title: next.title, thumbnail: next.thumbnail, startedAt: Date.now(), paused: false, pausedAt: 0 },
      queue: rest,
    });
  };

  useEffect(() => {
    return () => { playerRef.current?.destroy?.(); clearInterval(syncIntervalRef.current); };
  }, []);

  if (!track) return null;

  return (
    <div>
      {/* Hidden YT player */}
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        <div ref={containerRef} />
      </div>

      {/* Now Playing Card */}
      <div style={{ ...S.card, overflow: 'hidden', marginBottom: 16 }}>
        {/* Thumbnail */}
        <div style={{ position: 'relative', width: '100%', paddingTop: '45%', overflow: 'hidden', background: '#0d0d18' }}>
          <img src={track.thumbnail} alt={track.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, rgba(10,10,15,0.9))' }} />
          <div style={{ position: 'absolute', bottom: 14, left: 16, right: 16 }}>
            <p style={{ color: '#a78bfa', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>🎵 Now Playing</p>
            <p style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 15, lineHeight: 1.3 }}>{track.title}</p>
          </div>
          {/* Animated bars when playing */}
          {!localPaused && (
            <div style={{ position: 'absolute', top: 14, right: 16, display: 'flex', gap: 3, alignItems: 'flex-end', height: 20 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ width: 3, borderRadius: 2, background: '#a78bfa', animation: `bar${i} 0.8s ease-in-out infinite alternate`, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          {isHost ? (
            <>
              <button onClick={togglePlayPause} style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {localPaused ? '▶️' : '⏸'}
              </button>
              <button onClick={playNext} disabled={!room.queue?.length} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(139,92,246,0.12)', border: '0.5px solid rgba(139,92,246,0.3)', fontSize: 18, cursor: room.queue?.length ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: room.queue?.length ? 1 : 0.4 }}>
                ⏭
              </button>
              <p style={{ color: '#6b7280', fontSize: 11, flex: 1 }}>You are the DJ 🎧</p>
            </>
          ) : (
            <>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(139,92,246,0.1)', border: '0.5px solid rgba(139,92,246,0.2)', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {localPaused ? '⏸' : '🎵'}
              </div>
              <p style={{ color: '#6b7280', fontSize: 11, flex: 1 }}>Synced with {room.hostName} 🔗</p>
            </>
          )}
          <a href={`https://youtube.com/watch?v=${track.videoId}`} target="_blank" rel="noopener noreferrer"
            style={{ padding: '6px 12px', borderRadius: 10, background: 'rgba(255,0,0,0.1)', border: '0.5px solid rgba(255,0,0,0.25)', color: '#f87171', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
            YT ↗
          </a>
        </div>
      </div>

      <style>{`
        @keyframes bar1{from{height:6px}to{height:18px}}
        @keyframes bar2{from{height:10px}to{height:14px}}
        @keyframes bar3{from{height:4px}to{height:20px}}
        @keyframes bar4{from{height:8px}to{height:12px}}
      `}</style>
    </div>
  );
}

// ─── Add to Queue ─────────────────────────────────────────────────────────────
function AddToQueue({ room, user, userProfile }: { room: MusicRoom; user: any; userProfile: any }) {
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<{ videoId: string; title: string; thumbnail: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');

  const search = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    setResults([]);
    const res = await searchYouTube(searchQ);
    setResults(res);
    setSearching(false);
  };

  const addByUrl = async () => {
    const vid = extractVideoId(urlInput.trim());
    if (!vid) return;
    setAdding(vid);
    const info = await getVideoInfo(vid);
    await addToQueue({ videoId: vid, ...info });
    setUrlInput('');
    setAdding(null);
  };

  const addToQueue = async (track: { videoId: string; title: string; thumbnail: string }) => {
    setAdding(track.videoId);
    const entry = { ...track, addedBy: userProfile?.fullName || 'Someone' };
    if (!room.currentTrack) {
      // Play immediately
      await updateDoc(doc(db, 'musicRooms', room.id), {
        currentTrack: { ...track, startedAt: Date.now(), paused: false, pausedAt: 0 },
      });
    } else {
      await updateDoc(doc(db, 'musicRooms', room.id), {
        queue: [...(room.queue || []), entry],
      });
    }
    setAdding(null);
    setResults([]);
    setSearchQ('');
  };

  return (
    <div style={{ ...S.card, padding: '16px', marginBottom: 16 }}>
      <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>➕ Add to Queue</p>

      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Search song or artist..." style={{ ...S.input, flex: 1 }} />
        <button onClick={search} disabled={searching} style={{ ...S.btn(true), flexShrink: 0, padding: '10px 16px' }}>{searching ? '...' : '🔍'}</button>
      </div>

      {/* URL input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: results.length ? 12 : 0 }}>
        <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addByUrl()} placeholder="Or paste YouTube URL..." style={{ ...S.input, flex: 1, fontSize: 12 }} />
        <button onClick={addByUrl} disabled={!urlInput.trim()} style={{ ...S.btn(false), flexShrink: 0, padding: '10px 14px', opacity: urlInput.trim() ? 1 : 0.4 }}>Add</button>
      </div>

      {/* Results */}
      {results.map((r) => (
        <div key={r.videoId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
          <img src={r.thumbnail} alt="" style={{ width: 52, height: 36, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
          <p style={{ flex: 1, color: '#d1d5db', fontSize: 12, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.title}</p>
          <button onClick={() => addToQueue(r)} disabled={adding === r.videoId} style={{ ...S.btn(true), padding: '6px 12px', fontSize: 11, flexShrink: 0 }}>
            {adding === r.videoId ? '...' : '+ Add'}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Music Page ──────────────────────────────────────────────────────────
export default function MusicPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  const [rooms, setRooms] = useState<MusicRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<MusicRoom | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [inviteSearch, setInviteSearch] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fu) => {
      if (!fu) { router.push('/login'); return; }
      setUser(fu);
      const pd = await getDoc(doc(db, 'users', fu.uid));
      if (pd.exists()) setUserProfile({ id: pd.id, ...pd.data() });
      const snap = await getDocs(collection(db, 'users'));
      setAllUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u: any) => u.id !== fu.uid));
      setPageLoading(false);
    });
    return () => unsub();
  }, []);

  // Live rooms
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'musicRooms'), where('memberIds', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MusicRoom[];
      setRooms(data);
      if (activeRoom) {
        const updated = data.find((r) => r.id === activeRoom.id);
        if (updated) setActiveRoom(updated);
      }
    });
    return () => unsub();
  }, [user, activeRoom?.id]);

  const createRoom = async () => {
    if (!user || !roomName.trim()) return;
    setCreating(true);
    const memberIds = [user.uid, ...invitedUsers];
    const members = [
      { uid: user.uid, name: userProfile?.fullName || 'Host', photoURL: userProfile?.photoURL },
      ...invitedUsers.map((uid) => {
        const u = allUsers.find((x) => x.id === uid);
        return { uid, name: u?.fullName || 'Member', photoURL: u?.photoURL };
      }),
    ];
    const ref = await addDoc(collection(db, 'musicRooms'), {
      name: roomName.trim(),
      hostId: user.uid,
      hostName: userProfile?.fullName || 'Host',
      memberIds,
      members,
      currentTrack: null,
      queue: [],
      createdAt: serverTimestamp(),
    });
    const newRoom: MusicRoom = { id: ref.id, name: roomName.trim(), hostId: user.uid, hostName: userProfile?.fullName, memberIds, members, currentTrack: null, queue: [], createdAt: null };
    setActiveRoom(newRoom);
    setShowCreate(false);
    setRoomName('');
    setInvitedUsers([]);
    setCreating(false);
  };

  const leaveRoom = () => setActiveRoom(null);

  const endRoom = async () => {
    if (!activeRoom) return;
    await deleteDoc(doc(db, 'musicRooms', activeRoom.id));
    setActiveRoom(null);
  };

  const removeFromQueue = async (idx: number) => {
    if (!activeRoom) return;
    const newQ = activeRoom.queue.filter((_, i) => i !== idx);
    await updateDoc(doc(db, 'musicRooms', activeRoom.id), { queue: newQ });
  };

  const filteredUsers = allUsers.filter((u) =>
    (u.fullName?.toLowerCase().includes(inviteSearch.toLowerCase()) || u.username?.toLowerCase().includes(inviteSearch.toLowerCase())) &&
    !invitedUsers.includes(u.id)
  );

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Active Room ───────────────────────────────────────────────────────────
  if (activeRoom) {
    const isHost = activeRoom.hostId === user.uid;
    return (
      <>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
        <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 40 }}>
          {/* Header */}
          <div style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(20px)', borderBottom: '0.5px solid rgba(139,92,246,0.15)', padding: '14px 20px', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={leaveRoom} style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
                <div>
                  <p style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 15, margin: 0 }}>🎵 {activeRoom.name}</p>
                  <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>{activeRoom.members.length} listener{activeRoom.members.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Member avatars */}
                <div style={{ display: 'flex' }}>
                  {activeRoom.members.slice(0, 4).map((m, i) => (
                    <div key={m.uid} title={m.name} style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', border: '1.5px solid #0a0a0f', marginLeft: i > 0 ? -8 : 0, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white' }}>
                      {m.photoURL ? <img src={m.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.name[0]?.toUpperCase()}
                    </div>
                  ))}
                </div>
                {isHost && (
                  <button onClick={endRoom} style={{ ...S.btn(false, true), padding: '5px 12px', fontSize: 11 }}>End</button>
                )}
              </div>
            </div>
          </div>

          <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 20px' }}>
            {/* Player */}
            {activeRoom.currentTrack ? (
              <YouTubePlayer room={activeRoom} user={user} isHost={isHost} />
            ) : (
              <div style={{ ...S.card, padding: '40px 20px', textAlign: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 48, marginBottom: 12 }}>🎵</p>
                <p style={{ color: '#9ca3af', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No track playing</p>
                <p style={{ color: '#4b5563', fontSize: 13 }}>Search and add a song below to start the party!</p>
              </div>
            )}

            {/* Add to queue — everyone can add */}
            <AddToQueue room={activeRoom} user={user} userProfile={userProfile} />

            {/* Queue */}
            {activeRoom.queue?.length > 0 && (
              <div style={{ ...S.card, padding: '16px', marginBottom: 16 }}>
                <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>📋 Up Next ({activeRoom.queue.length})</p>
                {activeRoom.queue.map((track, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#4b5563', fontSize: 11, width: 16, flexShrink: 0 }}>{i + 1}</span>
                    <img src={track.thumbnail} alt="" style={{ width: 48, height: 34, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#d1d5db', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{track.title}</p>
                      <p style={{ color: '#4b5563', fontSize: 10, margin: 0 }}>Added by {track.addedBy}</p>
                    </div>
                    {isHost && (
                      <button onClick={() => removeFromQueue(i)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 16, cursor: 'pointer', padding: '4px 6px' }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Members */}
            <div style={{ ...S.card, padding: '16px' }}>
              <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>👥 Listeners</p>
              {activeRoom.members.map((m) => (
                <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(139,92,246,0.3)', flexShrink: 0, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>
                    {m.photoURL ? <img src={m.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.name[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 600, margin: 0 }}>{m.name}{m.uid === user.uid ? ' (You)' : ''}</p>
                    {m.uid === activeRoom.hostId && <p style={{ color: '#a78bfa', fontSize: 10, margin: 0 }}>🎧 DJ</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 100 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 20px' }}>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#f3f4f6', marginBottom: 4, letterSpacing: -0.5 }}>🎵 Sync Music</h1>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Listen together in real time — one aux, shared with friends</p>
          </div>

          {/* Create room button */}
          <button onClick={() => setShowCreate(true)} style={{ ...S.btn(true), width: '100%', padding: '14px', fontSize: 15, marginBottom: 24 }}>
            🎧 Create a Listening Room
          </button>

          {/* How it works */}
          <div style={{ ...S.card, padding: '18px 20px', marginBottom: 24 }}>
            <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>How it works</p>
            {[
              { icon: '🎧', text: 'Create a room and invite friends' },
              { icon: '🔍', text: 'Search any song on YouTube or paste a URL' },
              { icon: '🔗', text: 'Everyone hears it at the exact same time' },
              { icon: '📋', text: 'Anyone can add songs to the queue' },
              { icon: '🎚️', text: 'Host controls play/pause/skip' },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{icon}</span>
                <span style={{ color: '#9ca3af', fontSize: 13 }}>{text}</span>
              </div>
            ))}
          </div>

          {/* Active rooms */}
          {rooms.length > 0 && (
            <>
              <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Your Rooms</p>
              {rooms.map((r) => (
                <div key={r.id} onClick={() => setActiveRoom(r)} style={{ ...S.card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: 10 }}>
                  <span style={{ fontSize: 28 }}>🎵</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, margin: 0 }}>{r.name}</p>
                    <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>
                      {r.currentTrack ? `▶ ${r.currentTrack.title.slice(0, 30)}...` : 'No track playing'} · {r.members.length} listeners
                    </p>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 20, background: r.currentTrack ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.05)', color: r.currentTrack ? '#a78bfa' : '#4b5563', fontSize: 10, fontWeight: 600 }}>
                    {r.currentTrack ? '🎵 Live' : 'Idle'}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#111118', borderRadius: '24px 24px 0 0', border: '0.5px solid rgba(139,92,246,0.25)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 20px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 17, margin: 0 }}>🎧 New Listening Room</h2>
                <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
              <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Room name (e.g. Late Night Vibes)" style={{ ...S.input, marginBottom: 12 }} />
              <input value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} placeholder="Search friends to invite..." style={{ ...S.input, marginBottom: 12 }} />
              {invitedUsers.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {invitedUsers.map((uid) => {
                    const u = allUsers.find((x) => x.id === uid);
                    return (
                      <span key={uid} onClick={() => setInvitedUsers((p) => p.filter((id) => id !== uid))} style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(139,92,246,0.2)', color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {u?.fullName} ✕
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px' }}>
              {filteredUsers.slice(0, 20).map((u) => (
                <div key={u.id} onClick={() => setInvitedUsers((p) => [...p, u.id])} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(139,92,246,0.3)', flexShrink: 0, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white' }}>
                    {u.photoURL ? <img src={u.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : u.fullName?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p style={{ color: '#f3f4f6', fontSize: 14, fontWeight: 600, margin: 0 }}>{u.fullName}</p>
                    <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>@{u.username}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '14px 20px 28px', flexShrink: 0 }}>
              <button onClick={createRoom} disabled={!roomName.trim() || creating} style={{ ...S.btn(true), width: '100%', padding: '14px', fontSize: 15, opacity: roomName.trim() ? 1 : 0.4 }}>
                {creating ? 'Creating...' : `🎵 Create Room${invitedUsers.length ? ` with ${invitedUsers.length} friend${invitedUsers.length > 1 ? 's' : ''}` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
