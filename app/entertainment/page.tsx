'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  onSnapshot, serverTimestamp, deleteDoc, query, where, orderBy,
  setDoc,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';

// ─── Shared Styles ────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 100 } as React.CSSProperties,
  card: { background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 20 } as React.CSSProperties,
  btn: (active?: boolean, danger?: boolean): React.CSSProperties => ({
    padding: '11px 22px', borderRadius: 14, fontFamily: 'Inter,sans-serif', fontWeight: 700,
    fontSize: 13, cursor: 'pointer', border: 'none',
    background: danger ? 'rgba(239,68,68,0.12)' : active ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(139,92,246,0.12)',
    color: danger ? '#f87171' : active ? 'white' : '#a78bfa',
  }),
  input: {
    width: '100%', padding: '11px 15px', borderRadius: 14,
    background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(139,92,246,0.25)',
    color: '#f3f4f6', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box',
  } as React.CSSProperties,
};

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — MUSIC
// ══════════════════════════════════════════════════════════════════════════════

interface MusicRoom {
  id: string; name: string; hostId: string; hostName: string;
  memberIds: string[];
  members: { uid: string; name: string; photoURL?: string }[];
  currentTrack: {
    videoId: string; title: string; thumbnail: string;
    startedAt: number; paused: boolean; pausedAt: number;
  } | null;
  queue: { videoId: string; title: string; thumbnail: string; addedBy: string }[];
  createdAt: any;
}

async function searchYouTube(q: string): Promise<{ videoId: string; title: string; thumbnail: string }[]> {
  try {
    const res = await fetch(`https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(q)}&type=video&fields=videoId,title,videoThumbnails`);
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    return (data || []).slice(0, 8).map((v: any) => ({
      videoId: v.videoId, title: v.title,
      thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
    }));
  } catch { return []; }
}

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function getVideoInfo(videoId: string): Promise<{ title: string; thumbnail: string }> {
  try {
    const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    const data = await res.json();
    return { title: data.title || 'Unknown track', thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` };
  } catch { return { title: 'Unknown track', thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` }; }
}

function YouTubePlayer({ room, user, isHost }: { room: MusicRoom; user: any; isHost: boolean }) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const syncIntervalRef = useRef<any>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [localPaused, setLocalPaused] = useState(false);
  const track = room.currentTrack;

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
    playerRef.current?.destroy?.();
    playerRef.current = new (window as any).YT.Player(containerRef.current, {
      height: '100%', width: '100%', videoId: track?.videoId || '',
      playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, iv_load_policy: 3 },
      events: {
        onReady: () => setPlayerReady(true),
        onStateChange: (e: any) => {
          if (!isHost) return;
          if (e.data === 1) handleHostPlay();
          if (e.data === 2) handleHostPause();
        },
      },
    });
  };

  useEffect(() => { if (playerReady && track?.videoId) { playerRef.current?.loadVideoById(track.videoId); setTimeout(() => seekToSync(), 800); } }, [track?.videoId]);
  useEffect(() => {
    if (!playerReady || !track) return;
    if (track.paused) { playerRef.current?.seekTo(track.pausedAt, true); playerRef.current?.pauseVideo(); setLocalPaused(true); }
    else { seekToSync(); setLocalPaused(false); }
  }, [playerReady, track?.paused, track?.startedAt]);

  const seekToSync = () => {
    if (!track || track.paused) return;
    playerRef.current?.seekTo((Date.now() - track.startedAt) / 1000, true);
    playerRef.current?.playVideo();
  };

  useEffect(() => {
    if (!playerReady || isHost) return;
    syncIntervalRef.current = setInterval(() => {
      if (!room.currentTrack || room.currentTrack.paused) return;
      const elapsed = (Date.now() - room.currentTrack.startedAt) / 1000;
      const current = playerRef.current?.getCurrentTime?.() || 0;
      if (Math.abs(current - elapsed) > 3) playerRef.current?.seekTo(elapsed, true);
    }, 5000);
    return () => clearInterval(syncIntervalRef.current);
  }, [playerReady, isHost, room.currentTrack]);

  const handleHostPlay = async () => {
    if (!isHost || !track) return;
    await updateDoc(doc(db, 'musicRooms', room.id), { 'currentTrack.paused': false, 'currentTrack.startedAt': Date.now() - (playerRef.current?.getCurrentTime?.() || 0) * 1000 });
  };
  const handleHostPause = async () => {
    if (!isHost || !track) return;
    await updateDoc(doc(db, 'musicRooms', room.id), { 'currentTrack.paused': true, 'currentTrack.pausedAt': playerRef.current?.getCurrentTime?.() || 0 });
  };
  const togglePlayPause = async () => {
    if (!track) return;
    if (localPaused) { playerRef.current?.playVideo(); await handleHostPlay(); }
    else { playerRef.current?.pauseVideo(); await handleHostPause(); }
    setLocalPaused(!localPaused);
  };
  const playNext = async () => {
    if (!isHost || !room.queue?.length) return;
    const [next, ...rest] = room.queue;
    await updateDoc(doc(db, 'musicRooms', room.id), { currentTrack: { videoId: next.videoId, title: next.title, thumbnail: next.thumbnail, startedAt: Date.now(), paused: false, pausedAt: 0 }, queue: rest });
  };
  useEffect(() => () => { playerRef.current?.destroy?.(); clearInterval(syncIntervalRef.current); }, []);

  if (!track) return null;
  return (
    <div>
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}><div ref={containerRef} /></div>
      <div style={{ ...S.card, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ position: 'relative', width: '100%', paddingTop: '45%', overflow: 'hidden', background: '#0d0d18' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={track.thumbnail} alt={track.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, rgba(10,10,15,0.9))' }} />
          <div style={{ position: 'absolute', bottom: 14, left: 16, right: 16 }}>
            <p style={{ color: '#a78bfa', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>🎵 Now Playing</p>
            <p style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 15, lineHeight: 1.3 }}>{track.title}</p>
          </div>
          {!localPaused && (
            <div style={{ position: 'absolute', top: 14, right: 16, display: 'flex', gap: 3, alignItems: 'flex-end', height: 20 }}>
              {[1,2,3,4].map((i) => <div key={i} style={{ width: 3, borderRadius: 2, background: '#a78bfa', animation: `mbar${i} 0.8s ease-in-out infinite alternate`, animationDelay: `${i*0.15}s` }} />)}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          {isHost ? (
            <>
              <button type="button" aria-label={localPaused ? 'Play' : 'Pause'} onClick={togglePlayPause} style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{localPaused ? '▶️' : '⏸'}</button>
              <button type="button" aria-label="Skip" onClick={playNext} disabled={!room.queue?.length} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(139,92,246,0.12)', border: '0.5px solid rgba(139,92,246,0.3)', fontSize: 18, cursor: room.queue?.length ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: room.queue?.length ? 1 : 0.4 }}>⏭</button>
              <p style={{ color: '#6b7280', fontSize: 12, flex: 1 }}>You are the DJ 🎧</p>
            </>
          ) : (
            <>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(139,92,246,0.1)', border: '0.5px solid rgba(139,92,246,0.2)', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{localPaused ? '⏸' : '🎵'}</div>
              <p style={{ color: '#6b7280', fontSize: 12, flex: 1 }}>Synced with {room.hostName} 🔗</p>
            </>
          )}
          <a href={`https://youtube.com/watch?v=${track.videoId}`} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 12px', borderRadius: 10, background: 'rgba(255,0,0,0.1)', border: '0.5px solid rgba(255,0,0,0.25)', color: '#f87171', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>YT ↗</a>
        </div>
      </div>
      <style>{`@keyframes mbar1{from{height:6px}to{height:18px}}@keyframes mbar2{from{height:10px}to{height:14px}}@keyframes mbar3{from{height:4px}to{height:20px}}@keyframes mbar4{from{height:8px}to{height:12px}}`}</style>
    </div>
  );
}

function AddToQueue({ room, user, userProfile }: { room: MusicRoom; user: any; userProfile: any }) {
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<{ videoId: string; title: string; thumbnail: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');

  const search = async () => {
    if (!searchQ.trim()) return;
    setSearching(true); setResults([]);
    setResults(await searchYouTube(searchQ));
    setSearching(false);
  };

  const addTrack = async (track: { videoId: string; title: string; thumbnail: string }) => {
    setAdding(track.videoId);
    const entry = { ...track, addedBy: userProfile?.fullName || 'Someone' };
    if (!room.currentTrack) {
      await updateDoc(doc(db, 'musicRooms', room.id), { currentTrack: { ...track, startedAt: Date.now(), paused: false, pausedAt: 0 } });
    } else {
      await updateDoc(doc(db, 'musicRooms', room.id), { queue: [...(room.queue || []), entry] });
    }
    setAdding(null); setResults([]); setSearchQ('');
  };

  const addByUrl = async () => {
    const vid = extractVideoId(urlInput.trim());
    if (!vid) return;
    setAdding(vid);
    const info = await getVideoInfo(vid);
    await addTrack({ videoId: vid, ...info });
    setUrlInput(''); setAdding(null);
  };

  return (
    <div style={{ ...S.card, padding: '16px', marginBottom: 16 }}>
      <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>➕ Add to Queue</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Search song or artist..." style={{ ...S.input, flex: 1 }} />
        <button type="button" onClick={search} disabled={searching} style={{ ...S.btn(true), flexShrink: 0, padding: '10px 16px' }}>{searching ? '...' : '🔍'}</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: results.length ? 12 : 0 }}>
        <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addByUrl()} placeholder="Or paste YouTube URL..." style={{ ...S.input, flex: 1, fontSize: 13 }} />
        <button type="button" onClick={addByUrl} disabled={!urlInput.trim()} style={{ ...S.btn(false), flexShrink: 0, padding: '10px 14px', opacity: urlInput.trim() ? 1 : 0.4 }}>Add</button>
      </div>
      {results.map((r) => (
        <div key={r.videoId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.thumbnail} alt="" style={{ width: 52, height: 36, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
          <p style={{ flex: 1, color: '#d1d5db', fontSize: 13, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.title}</p>
          <button type="button" onClick={() => addTrack(r)} disabled={adding === r.videoId} style={{ ...S.btn(true), padding: '6px 12px', fontSize: 12, flexShrink: 0 }}>{adding === r.videoId ? '...' : '+ Add'}</button>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — GAMES
// ══════════════════════════════════════════════════════════════════════════════

type GameType = 'word_duel' | 'emoji_decode' | 'hot_take';
type GameStatus = 'lobby' | 'playing' | 'finished';
interface GameRoom {
  id: string; type: GameType; hostId: string; hostName: string;
  players: { uid: string; name: string; score: number }[];
  status: GameStatus; state: any; createdAt: any;
}

const GAME_INFO = {
  word_duel: { name: 'Word Duel', icon: '📝', desc: 'Chain words — each must start with the last letter of the previous. Run out of time and you lose!', players: '2' },
  emoji_decode: { name: 'Emoji Decode', icon: '🎭', desc: 'Guess the movie or phrase from the emoji clues. Most correct guesses wins!', players: '2-8' },
  hot_take: { name: 'Hot Take', icon: '🔥', desc: 'Vote on spicy takes. See who agrees with you and who doesn\'t!', players: '2-8' },
};

const EMOJI_PROMPTS = [
  { emojis: '🦁👑', answer: 'lion king', hint: 'Movie' }, { emojis: '🧊❄️👸', answer: 'frozen', hint: 'Movie' },
  { emojis: '🕷️🧑', answer: 'spiderman', hint: 'Movie' }, { emojis: '🚀♾️', answer: 'infinity war', hint: 'Movie' },
  { emojis: '🧙💍🔥', answer: 'lord of the rings', hint: 'Movie' }, { emojis: '🐟🔍', answer: 'finding nemo', hint: 'Movie' },
  { emojis: '👻🎃', answer: 'halloween', hint: 'Movie' }, { emojis: '🌊🏄🦈', answer: 'jaws', hint: 'Movie' },
  { emojis: '🚂💨⏰', answer: 'back to the future', hint: 'Movie' }, { emojis: '🦇🌙🦸', answer: 'batman', hint: 'Movie' },
  { emojis: '🧸❤️🌈', answer: 'toy story', hint: 'Movie' }, { emojis: '🐍✈️', answer: 'snakes on a plane', hint: 'Movie' },
];

const HOT_TAKES = [
  'Pineapple belongs on pizza', 'Morning people are more productive', 'Remote work is better than office',
  'Social media does more harm than good', 'Coffee is overrated', 'Video games are a valid career',
  'Cats are better than dogs', 'Night owls are more creative', 'Fast food can be healthy',
  'Reading books > watching movies',
];

function WordDuelGame({ room, user }: { room: GameRoom; user: any }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);
  const timerRef = useRef<any>(null);
  const isMyTurn = room.state?.currentTurn === user.uid;
  const lastWord: string = room.state?.lastWord || '';
  const words: string[] = room.state?.words || [];
  const gameOver = room.state?.gameOver;
  const loser = room.state?.loser;

  useEffect(() => {
    if (!room.state?.turnStartedAt || gameOver) return;
    const start = room.state.turnStartedAt?.toDate?.() || new Date();
    const update = () => {
      const left = Math.max(0, 30 - Math.floor((Date.now() - start.getTime()) / 1000));
      setTimeLeft(left);
      if (left === 0 && isMyTurn && !gameOver) handleTimeout();
    };
    update();
    timerRef.current = setInterval(update, 500);
    return () => clearInterval(timerRef.current);
  }, [room.state?.turnStartedAt, room.state?.currentTurn, gameOver]);

  const handleTimeout = async () => {
    clearInterval(timerRef.current);
    const other = room.players.find((p) => p.uid !== user.uid);
    await updateDoc(doc(db, 'gameRooms', room.id), { 'state.gameOver': true, 'state.loser': user.uid, 'state.winner': other?.uid, status: 'finished' });
  };

  const submitWord = async () => {
    const word = input.trim().toLowerCase();
    setError('');
    if (!word) return;
    if (lastWord && word[0] !== lastWord[lastWord.length - 1]) { setError(`Must start with "${lastWord[lastWord.length-1].toUpperCase()}"`); return; }
    if (words.includes(word)) { setError('Already used!'); return; }
    if (word.length < 2) { setError('Too short!'); return; }
    const other = room.players.find((p) => p.uid !== user.uid);
    await updateDoc(doc(db, 'gameRooms', room.id), {
      'state.lastWord': word, 'state.words': [...words, word],
      'state.currentTurn': other?.uid, 'state.turnStartedAt': serverTimestamp(),
      players: room.players.map((p) => p.uid === user.uid ? { ...p, score: p.score + word.length } : p),
    });
    setInput('');
  };

  if (gameOver) {
    const winner = room.players.find((p) => p.uid !== loser);
    const isWinner = winner?.uid === user.uid;
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>{isWinner ? '🏆' : '💀'}</div>
        <h2 style={{ color: isWinner ? '#a78bfa' : '#f87171', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{isWinner ? 'You Win!' : 'You Lost!'}</h2>
        <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 24 }}>{loser === user.uid ? "Time's up!" : `${room.players.find(p => p.uid === loser)?.name} ran out of time.`}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
          {room.players.map((p) => (
            <div key={p.uid} style={{ ...S.card, padding: '12px 20px', textAlign: 'center' }}>
              <p style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 16 }}>{p.score}</p>
              <p style={{ color: '#6b7280', fontSize: 12 }}>{p.name}</p>
            </div>
          ))}
        </div>
        <p style={{ color: '#4b5563', fontSize: 13 }}>Words: {words.join(' → ')}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ color: '#6b7280', fontSize: 13 }}>{isMyTurn ? '⚡ Your turn!' : `⏳ ${room.players.find(p => p.uid === room.state?.currentTurn)?.name}'s turn`}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 80, height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}>
            <div style={{ width: `${(timeLeft/30)*100}%`, height: '100%', borderRadius: 4, background: timeLeft > 10 ? '#22c55e' : '#ef4444', transition: 'width 0.5s linear' }} />
          </div>
          <span style={{ color: timeLeft <= 10 ? '#ef4444' : '#9ca3af', fontWeight: 700, fontSize: 13, minWidth: 24 }}>{timeLeft}s</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {room.players.map((p) => (
          <div key={p.uid} style={{ ...S.card, flex: 1, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: p.uid === room.state?.currentTurn ? '0.5px solid rgba(167,139,250,0.5)' : undefined }}>
            <span style={{ color: p.uid === user.uid ? '#a78bfa' : '#9ca3af', fontSize: 13, fontWeight: 600 }}>{p.uid === user.uid ? 'You' : p.name}</span>
            <span style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 16 }}>{p.score}</span>
          </div>
        ))}
      </div>
      <div style={{ ...S.card, padding: '14px 16px', marginBottom: 16, minHeight: 60 }}>
        {words.length === 0 ? <p style={{ color: '#4b5563', fontSize: 13, textAlign: 'center' }}>{isMyTurn ? 'Start with any word!' : 'Waiting...'}</p> : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {words.map((w, i) => <span key={i} style={{ padding: '4px 10px', borderRadius: 20, background: i%2===0 ? 'rgba(139,92,246,0.15)' : 'rgba(59,130,246,0.15)', color: i%2===0 ? '#a78bfa' : '#60a5fa', fontSize: 13, fontWeight: 600 }}>{w}</span>)}
          </div>
        )}
      </div>
      {lastWord && <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 10 }}>Next word must start with <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 16 }}>"{lastWord[lastWord.length-1].toUpperCase()}"</span></p>}
      {isMyTurn && (
        <>
          {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitWord()} placeholder={lastWord ? `Word starting with "${lastWord[lastWord.length-1].toUpperCase()}"...` : 'Type any word...'} style={{ ...S.input, flex: 1 }} />
            <button type="button" onClick={submitWord} style={{ ...S.btn(true), padding: '12px 20px', flexShrink: 0 }}>Send</button>
          </div>
        </>
      )}
    </div>
  );
}

function EmojiDecodeGame({ room, user }: { room: GameRoom; user: any }) {
  const [guess, setGuess] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const isHost = room.hostId === user.uid;
  const currentPrompt = room.state?.currentPrompt;
  const guesses: { uid: string; name: string; guess: string; correct: boolean }[] = room.state?.guesses || [];
  const roundOver = room.state?.roundOver;
  const myGuess = guesses.find((g) => g.uid === user.uid);
  const scores: Record<string, number> = room.state?.scores || {};

  useEffect(() => { setGuess(''); setSubmitted(false); }, [currentPrompt]);

  const submitGuess = async () => {
    if (!guess.trim() || submitted) return;
    const correct = guess.trim().toLowerCase() === currentPrompt?.answer?.toLowerCase();
    const newGuesses = [...guesses, { uid: user.uid, name: room.players.find(p => p.uid === user.uid)?.name || 'You', guess: guess.trim(), correct }];
    const newScores = { ...scores, [user.uid]: (scores[user.uid] || 0) + (correct ? 1 : 0) };
    const allGuessed = newGuesses.length >= room.players.length;
    await updateDoc(doc(db, 'gameRooms', room.id), { 'state.guesses': newGuesses, 'state.scores': newScores, ...(allGuessed ? { 'state.roundOver': true } : {}) });
    setSubmitted(true);
  };

  const nextRound = async () => {
    const next = EMOJI_PROMPTS[Math.floor(Math.random() * EMOJI_PROMPTS.length)];
    await updateDoc(doc(db, 'gameRooms', room.id), { 'state.currentPrompt': next, 'state.guesses': [], 'state.roundOver': false });
  };

  return (
    <div style={{ padding: '16px 20px' }}>
      {currentPrompt ? (
        <>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 6 }}>{currentPrompt.hint}</p>
            <p style={{ fontSize: 52, letterSpacing: 8 }}>{currentPrompt.emojis}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={guess} onChange={(e) => setGuess(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitGuess()} disabled={!!myGuess} placeholder="Your guess..." style={{ ...S.input, flex: 1 }} />
            <button type="button" onClick={submitGuess} disabled={!!myGuess || !guess.trim()} style={{ ...S.btn(true), flexShrink: 0 }}>Guess</button>
          </div>
          {guesses.map((g) => (
            <div key={g.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12, background: g.correct ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)', marginBottom: 6 }}>
              <span style={{ fontSize: 16 }}>{g.correct ? '✅' : '❌'}</span>
              <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 600 }}>{g.name}</span>
              <span style={{ color: '#6b7280', fontSize: 13 }}>{g.guess}</span>
            </div>
          ))}
          {roundOver && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <p style={{ color: '#a78bfa', fontWeight: 700, marginBottom: 6 }}>Answer: <span style={{ color: '#f3f4f6' }}>{currentPrompt.answer}</span></p>
              {isHost && <button type="button" onClick={nextRound} style={{ ...S.btn(true) }}>Next Round ›</button>}
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '32px 20px' }}>
          <p style={{ fontSize: 48, marginBottom: 12 }}>🎭</p>
          <p style={{ color: '#9ca3af', fontSize: 15, marginBottom: 20 }}>Waiting for host to start...</p>
          {isHost && <button type="button" onClick={nextRound} style={{ ...S.btn(true) }}>Start Round</button>}
        </div>
      )}
      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        {room.players.map((p) => (
          <div key={p.uid} style={{ ...S.card, flex: 1, padding: '10px 14px', textAlign: 'center' }}>
            <p style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 18 }}>{scores[p.uid] || 0}</p>
            <p style={{ color: '#6b7280', fontSize: 12 }}>{p.uid === user.uid ? 'You' : p.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HotTakeGame({ room, user }: { room: GameRoom; user: any }) {
  const isHost = room.hostId === user.uid;
  const take = room.state?.currentTake;
  const votes: Record<string, boolean> = room.state?.votes || {};
  const myVote = user.uid in votes ? votes[user.uid] : null;
  const yesVotes = Object.values(votes).filter(Boolean).length;
  const noVotes = Object.values(votes).filter((v) => !v).length;
  const totalVotes = Object.keys(votes).length;

  const vote = async (val: boolean) => {
    await updateDoc(doc(db, 'gameRooms', room.id), { [`state.votes.${user.uid}`]: val });
  };
  const nextTake = async () => {
    const next = HOT_TAKES[Math.floor(Math.random() * HOT_TAKES.length)];
    await updateDoc(doc(db, 'gameRooms', room.id), { 'state.currentTake': next, 'state.votes': {} });
  };

  return (
    <div style={{ padding: '20px' }}>
      {take ? (
        <>
          <div style={{ ...S.card, padding: '24px 20px', textAlign: 'center', marginBottom: 20 }}>
            <p style={{ color: '#f3f4f6', fontSize: 18, fontWeight: 700, lineHeight: 1.5 }}>{take}</p>
          </div>
          {myVote === null ? (
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => vote(true)} style={{ flex: 1, padding: '18px', borderRadius: 16, background: 'rgba(34,197,94,0.12)', border: '0.5px solid rgba(34,197,94,0.3)', color: '#34d399', fontSize: 28, cursor: 'pointer', fontWeight: 700 }}>🔥 Yes</button>
              <button type="button" onClick={() => vote(false)} style={{ flex: 1, padding: '18px', borderRadius: 16, background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 28, cursor: 'pointer', fontWeight: 700 }}>❄️ No</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 3, height: 12, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ flex: yesVotes, background: 'linear-gradient(90deg,#22c55e,#34d399)', transition: 'flex 0.4s' }} />
                <div style={{ flex: noVotes, background: 'linear-gradient(90deg,#ef4444,#f87171)', transition: 'flex 0.4s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <span style={{ color: '#34d399', fontWeight: 700, fontSize: 14 }}>🔥 {yesVotes} yes ({totalVotes ? Math.round(yesVotes/totalVotes*100) : 0}%)</span>
                <span style={{ color: '#f87171', fontWeight: 700, fontSize: 14 }}>❄️ {noVotes} no</span>
              </div>
              {isHost && <button type="button" onClick={nextTake} style={{ ...S.btn(true), width: '100%' }}>Next Take ›</button>}
            </>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '32px 20px' }}>
          <p style={{ fontSize: 48, marginBottom: 12 }}>🔥</p>
          <p style={{ color: '#9ca3af', fontSize: 15, marginBottom: 20 }}>Waiting for host to start...</p>
          {isHost && <button type="button" onClick={nextTake} style={{ ...S.btn(true) }}>Start Game</button>}
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — WATCH TOGETHER
// ══════════════════════════════════════════════════════════════════════════════

interface WatchRoom {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  memberIds: string[];
  members: { uid: string; name: string; photoURL?: string }[];
  videoId: string | null;
  videoTitle: string | null;
  videoThumb: string | null;
  isPlaying: boolean;
  seekTo: number;
  startedAt: number;
  updatedAt: any;
  createdAt: any;
}

interface WatchChatMsg {
  id: string;
  uid: string;
  username: string;
  photoURL?: string;
  text: string;
  createdAt: any;
}

function WatchPlayer({ room, user, isHost }: { room: WatchRoom; user: any; isHost: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(!room.isPlaying);
  const syncRef = useRef<any>(null);

  useEffect(() => {
    if ((window as any).YT?.Player) { initPlayer(); return; }
    if (!document.getElementById('yt-api-watch')) {
      const tag = document.createElement('script');
      tag.id = 'yt-api-watch';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => { prev?.(); initPlayer(); };
    return () => { playerRef.current?.destroy?.(); clearInterval(syncRef.current); };
  }, []);

  const initPlayer = () => {
    if (!containerRef.current || !room.videoId) return;
    playerRef.current?.destroy?.();
    playerRef.current = new (window as any).YT.Player(containerRef.current, {
      height: '100%', width: '100%',
      videoId: room.videoId,
      playerVars: { autoplay: room.isPlaying ? 1 : 0, controls: isHost ? 1 : 0, rel: 0, modestbranding: 1, iv_load_policy: 3 },
      events: {
        onReady: (e: any) => {
          setReady(true);
          // Seek to current position
          if (room.isPlaying) {
            const elapsed = (Date.now() - room.startedAt) / 1000;
            e.target.seekTo(elapsed, true);
            e.target.playVideo();
          } else {
            e.target.seekTo(room.seekTo, true);
            e.target.pauseVideo();
          }
        },
        onStateChange: (e: any) => {
          if (!isHost) return;
          if (e.data === 1) hostSyncPlay();   // playing
          if (e.data === 2) hostSyncPause();  // paused
        },
      },
    });
  };

  // When room state changes, sync non-host viewers
  useEffect(() => {
    if (!ready || !playerRef.current || isHost) return;
    if (room.isPlaying) {
      const elapsed = (Date.now() - room.startedAt) / 1000;
      playerRef.current.seekTo(elapsed, true);
      playerRef.current.playVideo();
      setPaused(false);
    } else {
      playerRef.current.seekTo(room.seekTo, true);
      playerRef.current.pauseVideo();
      setPaused(true);
    }
  }, [room.isPlaying, room.startedAt, ready]);

  // Periodic drift correction for guests
  useEffect(() => {
    if (!ready || isHost) return;
    syncRef.current = setInterval(() => {
      if (!room.isPlaying || !playerRef.current) return;
      const elapsed = (Date.now() - room.startedAt) / 1000;
      const cur = playerRef.current.getCurrentTime?.() || 0;
      if (Math.abs(cur - elapsed) > 4) playerRef.current.seekTo(elapsed, true);
    }, 5000);
    return () => clearInterval(syncRef.current);
  }, [ready, isHost, room.isPlaying, room.startedAt]);

  // When videoId changes (host picks new video)
  useEffect(() => {
    if (!ready || !room.videoId) return;
    playerRef.current?.loadVideoById(room.videoId);
    setTimeout(() => {
      if (room.isPlaying) {
        const elapsed = (Date.now() - room.startedAt) / 1000;
        playerRef.current?.seekTo(elapsed, true);
        playerRef.current?.playVideo();
      }
    }, 800);
  }, [room.videoId, ready]);

  const hostSyncPlay = async () => {
    const cur = playerRef.current?.getCurrentTime?.() || 0;
    await updateDoc(doc(db, 'watchRooms', room.id), {
      isPlaying: true,
      startedAt: Date.now() - cur * 1000,
      seekTo: cur,
      updatedAt: serverTimestamp(),
    });
    setPaused(false);
  };

  const hostSyncPause = async () => {
    const cur = playerRef.current?.getCurrentTime?.() || 0;
    await updateDoc(doc(db, 'watchRooms', room.id), {
      isPlaying: false,
      seekTo: cur,
      updatedAt: serverTimestamp(),
    });
    setPaused(true);
  };

  if (!room.videoId) return null;

  return (
    <div style={{ ...S.card, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      </div>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 13, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.videoTitle}</p>
          <p style={{ color: isHost ? '#a78bfa' : '#6b7280', fontSize: 12, margin: 0 }}>{isHost ? '🎬 You control playback' : `🔗 Synced with ${room.hostName}`}</p>
        </div>
        {!isHost && (
          <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: room.isPlaying ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)', color: room.isPlaying ? '#34d399' : '#6b7280', fontWeight: 600 }}>
            {room.isPlaying ? '▶ Live' : '⏸ Paused'}
          </span>
        )}
      </div>
    </div>
  );
}

function WatchRoomView({ room, user, userProfile, onLeave }: { room: WatchRoom; user: any; userProfile: any; onLeave: () => void }) {
  const isHost = room.hostId === user.uid;
  const [urlInput, setUrlInput] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMsgs, setChatMsgs] = useState<WatchChatMsg[]>([]);
  const [showChat, setShowChat] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'watchRooms', room.id, 'chat'), orderBy('createdAt', 'asc')),
      (snap) => {
        setChatMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() } as WatchChatMsg)));
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      }
    );
    return () => unsub();
  }, [room.id]);

  const loadVideo = async () => {
    const vid = extractVideoId(urlInput.trim());
    if (!vid) { setUrlError('Invalid YouTube URL. Try: https://youtube.com/watch?v=...'); return; }
    setLoadingUrl(true); setUrlError('');
    try {
      const info = await getVideoInfo(vid);
      await updateDoc(doc(db, 'watchRooms', room.id), {
        videoId: vid,
        videoTitle: info.title,
        videoThumb: info.thumbnail,
        isPlaying: true,
        startedAt: Date.now(),
        seekTo: 0,
        updatedAt: serverTimestamp(),
      });
      setUrlInput('');
    } catch (err: any) { setUrlError('Failed to load video: ' + err.message); }
    setLoadingUrl(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !user || !userProfile) return;
    const text = chatInput.trim();
    setChatInput('');
    await addDoc(collection(db, 'watchRooms', room.id, 'chat'), {
      uid: user.uid,
      username: userProfile?.username || 'user',
      photoURL: userProfile?.photoURL || null,
      text,
      createdAt: serverTimestamp(),
    });
  };

  return (
    <>
      <Navbar />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
      <div style={S.page}>
        {/* Header */}
        <div style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(20px)', borderBottom: '0.5px solid rgba(139,92,246,0.15)', padding: '14px 20px', position: 'sticky', top: 56, zIndex: 10 }}>
          <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" aria-label="Back" onClick={onLeave} style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
              <div>
                <p style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 15, margin: 0 }}>🎬 {room.name}</p>
                <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>{room.members.length} watching · hosted by {room.hostName}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setShowChat(v => !v)} style={{ ...S.btn(showChat), padding: '6px 12px', fontSize: 12 }}>💬</button>
              {isHost && (
                <button type="button" onClick={async () => { await deleteDoc(doc(db, 'watchRooms', room.id)); onLeave(); }} style={{ ...S.btn(false, true), padding: '5px 12px', fontSize: 12 }}>End</button>
              )}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 20px' }}>
          {/* Video player */}
          {room.videoId
            ? <WatchPlayer room={room} user={user} isHost={isHost} />
            : (
              <div style={{ ...S.card, padding: '40px 20px', textAlign: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 48, marginBottom: 12 }}>🎬</p>
                <p style={{ color: '#9ca3af', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No video loaded yet</p>
                <p style={{ color: '#4b5563', fontSize: 13 }}>{isHost ? 'Paste a YouTube URL below to start watching!' : 'Waiting for the host to pick a video…'}</p>
              </div>
            )
          }

          {/* URL input — host only */}
          {isHost && (
            <div style={{ ...S.card, padding: '16px', marginBottom: 16 }}>
              <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>🔗 {room.videoId ? 'Change Video' : 'Load a Video'}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && loadVideo()}
                  placeholder="Paste any YouTube URL…"
                  style={{ ...S.input, flex: 1, fontSize: 13 }}
                />
                <button type="button" onClick={loadVideo} disabled={!urlInput.trim() || loadingUrl}
                  style={{ ...S.btn(true), padding: '10px 16px', flexShrink: 0, opacity: !urlInput.trim() || loadingUrl ? 0.5 : 1 }}>
                  {loadingUrl ? '…' : 'Load'}
                </button>
              </div>
              {urlError && <p style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>⚠️ {urlError}</p>}
              <p style={{ color: '#4b5563', fontSize: 11, marginTop: 8 }}>Works with any YouTube link — movies, shorts, clips, music videos</p>
            </div>
          )}

          {/* Live chat */}
          {showChat && (
            <div style={{ ...S.card, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>💬</span>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f3f4f6' }}>Watch Chat</p>
                <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', display: 'inline-block' }} />
              </div>
              <div style={{ height: 260, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {chatMsgs.length === 0 && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ color: '#374151', fontSize: 13 }}>Chat while you watch 🎬</p>
                  </div>
                )}
                {chatMsgs.map((msg) => {
                  const isMe = msg.uid === user?.uid;
                  return (
                    <div key={msg.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white' }}>
                        {msg.photoURL ? <img src={msg.photoURL} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : msg.username?.[0]?.toUpperCase()}
                      </div>
                      <div style={{ maxWidth: '72%' }}>
                        {!isMe && <p style={{ margin: '0 0 2px', fontSize: 9, color: '#a78bfa', fontWeight: 700 }}>@{msg.username}</p>}
                        <div style={{ padding: '7px 12px', borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isMe ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)', fontSize: 13, color: '#f3f4f6', lineHeight: 1.5 }}>
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              <div style={{ padding: '10px 12px', borderTop: '0.5px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8 }}>
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } }}
                  placeholder="React to the video…" style={{ ...S.input, flex: 1, padding: '9px 14px' }} />
                <button type="button" onClick={sendChat} disabled={!chatInput.trim()}
                  style={{ width: 36, height: 36, borderRadius: '50%', background: chatInput.trim() ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)', border: 'none', color: 'white', fontSize: 14, cursor: chatInput.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>↑</button>
              </div>
            </div>
          )}

          {/* Members list */}
          <div style={{ ...S.card, padding: '16px', marginTop: 16 }}>
            <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>👥 Watching ({room.members.length})</p>
            {room.members.map((m) => (
              <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {m.photoURL ? <img src={m.photoURL} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={m.name} /> : m.name[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 600, margin: 0 }}>{m.name}{m.uid === user.uid ? ' (You)' : ''}</p>
                  {m.uid === room.hostId && <p style={{ color: '#a78bfa', fontSize: 11, margin: 0 }}>🎬 Host</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ENTERTAINMENT PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function EntertainmentPage() {
  const { push } = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'music' | 'games' | 'watch'>('music');

  // ── Music state ───────────────────────────────────────────────────────────
  const [musicRooms, setMusicRooms] = useState<MusicRoom[]>([]);
  const [activeMusicRoom, setActiveMusicRoom] = useState<MusicRoom | null>(null);
  const [showCreateMusic, setShowCreateMusic] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [creatingMusic, setCreatingMusic] = useState(false);
  const [musicCreateError, setMusicCreateError] = useState('');

  // ── Game state ────────────────────────────────────────────────────────────
  const [gameRooms, setGameRooms] = useState<GameRoom[]>([]);
  const [activeGameRoom, setActiveGameRoom] = useState<GameRoom | null>(null);
  const [showCreateGame, setShowCreateGame] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameType>('word_duel');
  const [creatingGame, setCreatingGame] = useState(false);

  // ── Watch Together state ──────────────────────────────────────────────────
  const [watchRooms, setWatchRooms] = useState<WatchRoom[]>([]);
  const [activeWatchRoom, setActiveWatchRoom] = useState<WatchRoom | null>(null);
  const [showCreateWatch, setShowCreateWatch] = useState(false);
  const [watchRoomName, setWatchRoomName] = useState('');
  const [creatingWatch, setCreatingWatch] = useState(false);
  const [watchCreateError, setWatchCreateError] = useState('');

  // ── Shared invite state ───────────────────────────────────────────────────
  const [inviteSearch, setInviteSearch] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);

  // ── Auth + load ───────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fu) => {
      if (!fu) { push('/login'); return; }
      setUser(fu);
      const pd = await getDoc(doc(db, 'users', fu.uid));
      if (pd.exists()) setUserProfile(pd.data());
      const snap = await getDocs(collection(db, 'users'));
      setAllUsers(snap.docs.filter((d) => d.id !== fu.uid).map((d) => ({ id: d.id, ...d.data() })));
      setPageLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Live music rooms ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'musicRooms'), where('memberIds', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const rooms = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MusicRoom));
      setMusicRooms(rooms);
      if (activeMusicRoom) {
        const updated = rooms.find((r) => r.id === activeMusicRoom.id);
        if (updated) setActiveMusicRoom(updated);
      }
    });
    return () => unsub();
  }, [user, activeMusicRoom?.id]);

  // ── Live game rooms ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'gameRooms'), where('playerIds', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const rooms = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GameRoom));
      setGameRooms(rooms);
      if (activeGameRoom) {
        const updated = rooms.find((r) => r.id === activeGameRoom.id);
        if (updated) setActiveGameRoom(updated);
      }
    });
    return () => unsub();
  }, [user, activeGameRoom?.id]);

  // ── Live watch rooms ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'watchRooms'), where('memberIds', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const rooms = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WatchRoom));
      setWatchRooms(rooms);
      if (activeWatchRoom) {
        const updated = rooms.find((r) => r.id === activeWatchRoom.id);
        if (updated) setActiveWatchRoom(updated);
      }
    });
    return () => unsub();
  }, [user, activeWatchRoom?.id]);

  // ── Create watch room ─────────────────────────────────────────────────────
  const createWatchRoom = async () => {
    if (!watchRoomName.trim() || !user) return;
    setCreatingWatch(true); setWatchCreateError('');
    try {
      const memberIds = [user.uid, ...invitedUsers];
      const members = [
        { uid: user.uid, name: userProfile?.fullName || 'Host', photoURL: userProfile?.photoURL || '' },
        ...invitedUsers.map((uid) => { const u = allUsers.find((x) => x.id === uid); return { uid, name: u?.fullName || 'Friend', photoURL: u?.photoURL || '' }; }),
      ];
      const ref = await addDoc(collection(db, 'watchRooms'), {
        name: watchRoomName.trim(),
        hostId: user.uid,
        hostName: userProfile?.fullName || 'Host',
        memberIds, members,
        videoId: null, videoTitle: null, videoThumb: null,
        isPlaying: false, seekTo: 0, startedAt: 0,
        updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
      });
      for (const uid of invitedUsers) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: uid, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'watch_invite', groupId: ref.id,
          groupName: watchRoomName.trim(),
          read: false, createdAt: serverTimestamp(),
        });
      }
      const snap = await getDoc(ref);
      setActiveWatchRoom({ id: ref.id, ...snap.data() } as WatchRoom);
      setShowCreateWatch(false); setWatchRoomName(''); setInvitedUsers([]);
    } catch (err: any) { setWatchCreateError(err.message); }
    setCreatingWatch(false);
  };

  const filteredUsers = allUsers.filter(
    (u) => (u.fullName?.toLowerCase().includes(inviteSearch.toLowerCase()) || u.username?.toLowerCase().includes(inviteSearch.toLowerCase())) && !invitedUsers.includes(u.id)
  );

  // ── Create music room ─────────────────────────────────────────────────────
  const createMusicRoom = async () => {
    if (!roomName.trim() || !user) return;
    setCreatingMusic(true); setMusicCreateError('');
    try {
      const memberIds = [user.uid, ...invitedUsers];
      const members = [
        { uid: user.uid, name: userProfile?.fullName || 'Host', photoURL: userProfile?.avatarUrl || '' },
        ...invitedUsers.map((uid) => { const u = allUsers.find((x) => x.id === uid); return { uid, name: u?.fullName || 'Friend', photoURL: u?.avatarUrl || '' }; }),
      ];
      const ref = await addDoc(collection(db, 'musicRooms'), {
        name: roomName.trim(), hostId: user.uid, hostName: userProfile?.fullName || 'Host',
        memberIds, members, currentTrack: null, queue: [], createdAt: serverTimestamp(),
      });
      for (const uid of invitedUsers) {
        await addDoc(collection(db, 'notifications'), { toUserId: uid, fromUserId: user.uid, fromUsername: userProfile?.username || 'someone', type: 'group_invite', groupId: ref.id, groupName: roomName.trim(), read: false, createdAt: serverTimestamp() });
      }
      setShowCreateMusic(false); setRoomName(''); setInvitedUsers(''.split(''));
      setInvitedUsers([]);
    } catch (err: any) { setMusicCreateError(err.message); }
    setCreatingMusic(false);
  };

  // ── Create game room ──────────────────────────────────────────────────────
  const createGameRoom = async () => {
    if (invitedUsers.length === 0 || !user) return;
    setCreatingGame(true);
    try {
      const playerIds = [user.uid, ...invitedUsers];
      const players = [
        { uid: user.uid, name: userProfile?.fullName || 'Host', score: 0 },
        ...invitedUsers.map((uid) => { const u = allUsers.find((x) => x.id === uid); return { uid, name: u?.fullName || 'Friend', score: 0 }; }),
      ];
      const ref = await addDoc(collection(db, 'gameRooms'), {
        type: selectedGame, hostId: user.uid, hostName: userProfile?.fullName || 'Host',
        playerIds, players, status: 'playing',
        state: selectedGame === 'word_duel'
          ? { currentTurn: user.uid, lastWord: '', words: [], gameOver: false, turnStartedAt: serverTimestamp() }
          : selectedGame === 'emoji_decode' ? { currentPrompt: null, guesses: [], scores: {}, roundOver: false }
          : { currentTake: null, votes: {} },
        createdAt: serverTimestamp(),
      });
      for (const uid of invitedUsers) {
        await addDoc(collection(db, 'notifications'), { toUserId: uid, fromUserId: user.uid, fromUsername: userProfile?.username || 'someone', type: 'group_invite', groupId: ref.id, groupName: `${GAME_INFO[selectedGame].name} game`, read: false, createdAt: serverTimestamp() });
      }
      setShowCreateGame(false); setInvitedUsers([]);
    } catch (err: any) { console.error(err); }
    setCreatingGame(false);
  };

  const deleteGameRoom = async () => {
    if (!activeGameRoom) return;
    await deleteDoc(doc(db, 'gameRooms', activeGameRoom.id));
    setActiveGameRoom(null);
  };

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Active Music Room View ────────────────────────────────────────────────
  if (activeMusicRoom) {
    const isHost = activeMusicRoom.hostId === user.uid;
    return (
      <>
        <Navbar />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
        <div style={S.page}>
          <div style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(20px)', borderBottom: '0.5px solid rgba(139,92,246,0.15)', padding: '14px 20px', position: 'sticky', top: 56, zIndex: 10 }}>
            <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" aria-label="Back" onClick={() => setActiveMusicRoom(null)} style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
                <div>
                  <p style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 15, margin: 0 }}>🎵 {activeMusicRoom.name}</p>
                  <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>{activeMusicRoom.members.length} listener{activeMusicRoom.members.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {isHost && <button type="button" onClick={() => { deleteDoc(doc(db, 'musicRooms', activeMusicRoom.id)); setActiveMusicRoom(null); }} style={{ ...S.btn(false, true), padding: '5px 12px', fontSize: 12 }}>End</button>}
            </div>
          </div>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 20px' }}>
            {activeMusicRoom.currentTrack ? <YouTubePlayer room={activeMusicRoom} user={user} isHost={isHost} /> : (
              <div style={{ ...S.card, padding: '40px 20px', textAlign: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 48, marginBottom: 12 }}>🎵</p>
                <p style={{ color: '#9ca3af', fontSize: 15, fontWeight: 600 }}>No track playing yet</p>
                <p style={{ color: '#4b5563', fontSize: 13 }}>Search and add a song below!</p>
              </div>
            )}
            <AddToQueue room={activeMusicRoom} user={user} userProfile={userProfile} />
            {activeMusicRoom.queue?.length > 0 && (
              <div style={{ ...S.card, padding: '16px', marginBottom: 16 }}>
                <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>📋 Up Next ({activeMusicRoom.queue.length})</p>
                {activeMusicRoom.queue.map((track, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#4b5563', fontSize: 12, width: 16 }}>{i+1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={track.thumbnail} alt="" style={{ width: 48, height: 34, objectFit: 'cover', borderRadius: 6 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#d1d5db', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{track.title}</p>
                      <p style={{ color: '#4b5563', fontSize: 12, margin: 0 }}>Added by {track.addedBy}</p>
                    </div>
                    {isHost && <button type="button" aria-label="Remove" onClick={async () => { const q = activeMusicRoom.queue.filter((_, j) => j !== i); await updateDoc(doc(db, 'musicRooms', activeMusicRoom.id), { queue: q }); }} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 16, cursor: 'pointer', padding: '4px 6px' }}>✕</button>}
                  </div>
                ))}
              </div>
            )}
            <div style={{ ...S.card, padding: '16px' }}>
              <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>👥 Listeners</p>
              {activeMusicRoom.members.map((m) => (
                <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                    {m.name[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 600, margin: 0 }}>{m.name}{m.uid === user.uid ? ' (You)' : ''}</p>
                    {m.uid === activeMusicRoom.hostId && <p style={{ color: '#a78bfa', fontSize: 12, margin: 0 }}>🎧 DJ</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Active Watch Room View ───────────────────────────────────────────────
  if (activeWatchRoom) {
    const updated = watchRooms.find(r => r.id === activeWatchRoom.id) || activeWatchRoom;
    return (
      <WatchRoomView
        room={updated}
        user={user}
        userProfile={userProfile}
        onLeave={() => setActiveWatchRoom(null)}
      />
    );
  }

  // ── Active Game Room View ─────────────────────────────────────────────────
  if (activeGameRoom) {
    const isHost = activeGameRoom.hostId === user.uid;
    return (
      <>
        <Navbar />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
        <div style={S.page}>
          <div style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(20px)', borderBottom: '0.5px solid rgba(139,92,246,0.15)', padding: '14px 20px', position: 'sticky', top: 56, zIndex: 10 }}>
            <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" aria-label="Back" onClick={() => setActiveGameRoom(null)} style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
                <div>
                  <p style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 15, margin: 0 }}>{GAME_INFO[activeGameRoom.type].icon} {GAME_INFO[activeGameRoom.type].name}</p>
                  <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>{activeGameRoom.players.length} players</p>
                </div>
              </div>
              {isHost && <button type="button" onClick={deleteGameRoom} style={{ ...S.btn(false, true), padding: '5px 12px', fontSize: 12 }}>End</button>}
            </div>
          </div>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            {activeGameRoom.type === 'word_duel' && <WordDuelGame room={activeGameRoom} user={user} />}
            {activeGameRoom.type === 'emoji_decode' && <EmojiDecodeGame room={activeGameRoom} user={user} />}
            {activeGameRoom.type === 'hot_take' && <HotTakeGame room={activeGameRoom} user={user} />}
          </div>
        </div>
      </>
    );
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────
  const InviteModal = ({ onClose, onConfirm, title, confirmLabel, confirmDisabled, children }: any) => (
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#111118', borderRadius: '24px 24px 0 0', border: '0.5px solid rgba(139,92,246,0.25)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 17, margin: 0 }}>{title}</h2>
            <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
          {children}
          <input value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} placeholder="Search friends to invite..." style={{ ...S.input, marginBottom: 12 }} />
          {invitedUsers.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {invitedUsers.map((uid) => {
                const u = allUsers.find((x) => x.id === uid);
                return (
                  <button type="button" key={uid} onClick={() => setInvitedUsers((p) => p.filter((id) => id !== uid))} style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(139,92,246,0.2)', color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {u?.fullName} ✕
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px' }}>
          {filteredUsers.slice(0, 20).map((u) => (
            <div key={u.id} role="button" tabIndex={0} onClick={() => setInvitedUsers((p) => p.includes(u.id) ? p : [...p, u.id])} onKeyDown={(e) => e.key === 'Enter' && setInvitedUsers((p) => [...p, u.id])} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {u.fullName?.[0]?.toUpperCase()}
              </div>
              <div>
                <p style={{ color: '#f3f4f6', fontSize: 14, fontWeight: 600, margin: 0 }}>{u.fullName}</p>
                <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>@{u.username}</p>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 20px 28px', flexShrink: 0 }}>
          <button type="button" onClick={onConfirm} disabled={confirmDisabled} style={{ ...S.btn(true), width: '100%', padding: '14px', fontSize: 15, opacity: confirmDisabled ? 0.4 : 1 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Navbar />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
      <div style={S.page}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>

          {/* Page header */}
          <div style={{ padding: '24px 20px 0' }}>
            <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, margin: '0 0 4px', background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>🎉 Entertainment</h1>
            <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>Music, watch parties, and games with friends</p>
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', margin: '20px 20px 0', background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 4, border: '0.5px solid rgba(139,92,246,0.15)' }}>
            {(['music', 'watch', 'games'] as const).map((t) => (
              <button type="button" key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: tab === t ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'transparent', color: tab === t ? 'white' : '#6b7280', transition: 'background 0.2s, color 0.2s' }}>
                {t === 'music' ? '🎵 Music' : t === 'watch' ? '🎬 Watch' : '🎮 Games'}
              </button>
            ))}
          </div>

          <div style={{ padding: '20px 20px' }}>

            {/* ── MUSIC TAB ── */}
            {tab === 'music' && (
              <>
                <button type="button" onClick={() => { setShowCreateMusic(true); setInvitedUsers([]); setInviteSearch(''); }} style={{ ...S.btn(true), width: '100%', padding: '14px', fontSize: 15, marginBottom: 20 }}>
                  🎧 Create a Listening Room
                </button>

                <div style={{ ...S.card, padding: '18px 20px', marginBottom: 20 }}>
                  <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>How it works</p>
                  {[['🎧','Create a room and invite friends'],['🔍','Search any song on YouTube or paste a URL'],['🔗','Everyone hears it at the exact same time'],['📋','Anyone can add songs to the queue'],['🎚️','Host controls play/pause/skip']].map(([icon, text]) => (
                    <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{icon}</span>
                      <span style={{ color: '#9ca3af', fontSize: 13 }}>{text}</span>
                    </div>
                  ))}
                </div>

                {musicRooms.length > 0 && (
                  <>
                    <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Your Rooms</p>
                    {musicRooms.map((r) => (
                      <div key={r.id} role="button" tabIndex={0} onClick={() => setActiveMusicRoom(r)} onKeyDown={(e) => e.key === 'Enter' && setActiveMusicRoom(r)} style={{ ...S.card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: 10 }}>
                        <span style={{ fontSize: 28 }}>🎵</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, margin: 0 }}>{r.name}</p>
                          <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>{r.currentTrack ? `▶ ${r.currentTrack.title.slice(0,30)}...` : 'No track'} · {r.members.length} listeners</p>
                        </div>
                        <span style={{ padding: '3px 10px', borderRadius: 20, background: r.currentTrack ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.05)', color: r.currentTrack ? '#a78bfa' : '#4b5563', fontSize: 12, fontWeight: 600 }}>{r.currentTrack ? '🎵 Live' : 'Idle'}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            {/* ── WATCH TAB ── */}
            {tab === 'watch' && (
              <>
                <button type="button" onClick={() => { setShowCreateWatch(true); setInvitedUsers([]); setInviteSearch(''); }} style={{ ...S.btn(true), width: '100%', padding: '14px', fontSize: 15, marginBottom: 20 }}>
                  🎬 Create a Watch Party
                </button>

                <div style={{ ...S.card, padding: '18px 20px', marginBottom: 20 }}>
                  <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>How it works</p>
                  {[['🎬','Create a room and invite friends'],['🔗','Paste any YouTube URL — movies, shorts, clips'],['📺','Everyone watches at the exact same time'],['⏯️','Host controls play, pause and seeking'],['💬','Chat together while watching']].map(([icon, text]) => (
                    <div key={String(text)} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{icon}</span>
                      <span style={{ color: '#9ca3af', fontSize: 13 }}>{text}</span>
                    </div>
                  ))}
                </div>

                {watchRooms.length > 0 && (
                  <>
                    <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Your Rooms</p>
                    {watchRooms.map((r) => (
                      <div key={r.id} role="button" tabIndex={0} onClick={() => setActiveWatchRoom(r)} onKeyDown={(e) => e.key === 'Enter' && setActiveWatchRoom(r)}
                        style={{ ...S.card, padding: 0, overflow: 'hidden', cursor: 'pointer', marginBottom: 10 }}>
                        {r.videoThumb && (
                          <div style={{ position: 'relative', height: 80, overflow: 'hidden' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.videoThumb} alt="" style={{ width: '100%', objectFit: 'cover', filter: 'brightness(0.5)' }} />
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, rgba(10,10,15,0.9))' }} />
                            <span style={{ position: 'absolute', top: 8, left: 10, fontSize: 10, padding: '3px 8px', borderRadius: 20, background: r.isPlaying ? 'rgba(34,197,94,0.9)' : 'rgba(0,0,0,0.7)', color: r.isPlaying ? 'white' : '#9ca3af', fontWeight: 700 }}>{r.isPlaying ? '▶ Live' : '⏸ Paused'}</span>
                          </div>
                        )}
                        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                          {!r.videoThumb && <span style={{ fontSize: 28 }}>🎬</span>}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, margin: 0 }}>{r.name}</p>
                            <p style={{ color: '#6b7280', fontSize: 12, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.videoTitle ? `📺 ${r.videoTitle.slice(0, 35)}…` : 'No video loaded yet'} · {r.members.length} watching
                            </p>
                          </div>
                          <span style={{ color: '#a78bfa', fontSize: 20 }}>›</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            {/* ── GAMES TAB ── */}
            {tab === 'games' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                  {(Object.entries(GAME_INFO) as [GameType, typeof GAME_INFO.word_duel][]).map(([type, info]) => (
                    <div key={type} role="button" tabIndex={0} style={{ ...S.card, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', border: `0.5px solid rgba(139,92,246,${selectedGame === type ? '0.5' : '0.15'})`, background: selectedGame === type ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.03)' }}
                      onClick={() => { setSelectedGame(type); setShowCreateGame(true); setInvitedUsers([]); setInviteSearch(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && setShowCreateGame(true)}>
                      <span style={{ fontSize: 32, flexShrink: 0 }}>{info.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15 }}>{info.name}</span>
                          <span style={{ fontSize: 12, padding: '2px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: '#6b7280' }}>{info.players} players</span>
                        </div>
                        <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.4 }}>{info.desc}</p>
                      </div>
                      <span style={{ color: '#a78bfa', fontSize: 20 }}>›</span>
                    </div>
                  ))}
                </div>

                {gameRooms.length > 0 && (
                  <>
                    <p style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Your Active Rooms</p>
                    {gameRooms.map((r) => (
                      <div key={r.id} role="button" tabIndex={0} onClick={() => setActiveGameRoom(r)} onKeyDown={(e) => e.key === 'Enter' && setActiveGameRoom(r)} style={{ ...S.card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: 10 }}>
                        <span style={{ fontSize: 24 }}>{GAME_INFO[r.type].icon}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14, margin: 0 }}>{GAME_INFO[r.type].name}</p>
                          <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>{r.players.map(p => p.uid === user.uid ? 'You' : p.name).join(', ')}</p>
                        </div>
                        <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', color: '#34d399', fontSize: 12, fontWeight: 600 }}>Playing</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Music Create Modal ── */}
      {showCreateMusic && (
        <InviteModal
          title="🎧 New Listening Room"
          onClose={() => setShowCreateMusic(false)}
          onConfirm={createMusicRoom}
          confirmLabel={creatingMusic ? 'Creating...' : `🎵 Create Room${invitedUsers.length ? ` with ${invitedUsers.length} friend${invitedUsers.length > 1 ? 's' : ''}` : ''}`}
          confirmDisabled={!roomName.trim() || creatingMusic}
        >
          <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Room name (e.g. Late Night Vibes)" style={{ ...S.input, marginBottom: 12 }} />
          {musicCreateError && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠️ {musicCreateError}</p>}
        </InviteModal>
      )}

      {/* ── Watch Create Modal ── */}
      {showCreateWatch && (
        <InviteModal
          title="🎬 New Watch Party"
          onClose={() => setShowCreateWatch(false)}
          onConfirm={createWatchRoom}
          confirmLabel={creatingWatch ? 'Creating...' : `🎬 Create Room${invitedUsers.length ? ` with ${invitedUsers.length} friend${invitedUsers.length > 1 ? 's' : ''}` : ''}`}
          confirmDisabled={!watchRoomName.trim() || creatingWatch}
        >
          <input value={watchRoomName} onChange={(e) => setWatchRoomName(e.target.value)} placeholder="Room name (e.g. Movie Night 🎬)" style={{ ...S.input, marginBottom: 12 }} />
          {watchCreateError && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠️ {watchCreateError}</p>}
        </InviteModal>
      )}

      {/* ── Game Create Modal ── */}
      {showCreateGame && (
        <InviteModal
          title={`${GAME_INFO[selectedGame].icon} ${GAME_INFO[selectedGame].name}`}
          onClose={() => setShowCreateGame(false)}
          onConfirm={createGameRoom}
          confirmLabel={creatingGame ? 'Creating...' : `🚀 Start Game with ${invitedUsers.length} friend${invitedUsers.length !== 1 ? 's' : ''}`}
          confirmDisabled={invitedUsers.length === 0 || creatingGame}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {(Object.entries(GAME_INFO) as [GameType, typeof GAME_INFO.word_duel][]).map(([type, info]) => (
              <button type="button" key={type} onClick={() => setSelectedGame(type)} style={{ ...S.btn(selectedGame === type), padding: '6px 14px', fontSize: 13 }}>{info.icon} {info.name}</button>
            ))}
          </div>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 14 }}>{GAME_INFO[selectedGame].desc}</p>
        </InviteModal>
      )}
    </>
  );
}
