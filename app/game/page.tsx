'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  onSnapshot, serverTimestamp, deleteDoc, addDoc, query, where, orderBy
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';

// ─── Types ────────────────────────────────────────────────────────────────────
type GameType = 'word_duel' | 'emoji_decode' | 'hot_take';
type GameStatus = 'lobby' | 'playing' | 'finished';

interface GameRoom {
  id: string;
  type: GameType;
  hostId: string;
  hostName: string;
  players: { uid: string; name: string; score: number }[];
  status: GameStatus;
  state: any;
  createdAt: any;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 100 } as React.CSSProperties,
  card: { background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 20 } as React.CSSProperties,
  btn: (active?: boolean): React.CSSProperties => ({
    padding: '12px 24px', borderRadius: 14, fontFamily: 'Inter,sans-serif', fontWeight: 700,
    fontSize: 14, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
    background: active ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(139,92,246,0.12)',
    color: active ? 'white' : '#a78bfa',
  }),
  input: { width: '100%', padding: '12px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(139,92,246,0.25)', color: '#f3f4f6', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box' } as React.CSSProperties,
};

// ─── Word Duel Game ───────────────────────────────────────────────────────────
function WordDuelGame({ room, user, userProfile }: { room: GameRoom; user: any; userProfile: any }) {
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
      const elapsed = Math.floor((Date.now() - start.getTime()) / 1000);
      const left = Math.max(0, 30 - elapsed);
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
    await updateDoc(doc(db, 'gameRooms', room.id), {
      'state.gameOver': true,
      'state.loser': user.uid,
      'state.winner': other?.uid,
      status: 'finished',
    });
  };

  const submitWord = async () => {
    const word = input.trim().toLowerCase();
    setError('');
    if (!word) return;
    if (lastWord && word[0] !== lastWord[lastWord.length - 1]) {
      setError(`Must start with "${lastWord[lastWord.length - 1].toUpperCase()}"`);
      return;
    }
    if (words.includes(word)) { setError('Already used!'); return; }
    if (word.length < 2) { setError('Too short!'); return; }

    const other = room.players.find((p) => p.uid !== user.uid);
    const updatedPlayers = room.players.map((p) =>
      p.uid === user.uid ? { ...p, score: p.score + word.length } : p
    );
    await updateDoc(doc(db, 'gameRooms', room.id), {
      'state.lastWord': word,
      'state.words': [...words, word],
      'state.currentTurn': other?.uid,
      'state.turnStartedAt': serverTimestamp(),
      players: updatedPlayers,
    });
    setInput('');
  };

  if (gameOver) {
    const winner = room.players.find((p) => p.uid !== loser);
    const isWinner = winner?.uid === user.uid;
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>{isWinner ? '🏆' : '💀'}</div>
        <h2 style={{ color: isWinner ? '#a78bfa' : '#f87171', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          {isWinner ? 'You Win!' : 'You Lost!'}
        </h2>
        <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 24 }}>
          {loser === user.uid ? "Time's up! You ran out of time." : `${room.players.find(p => p.uid === loser)?.name} ran out of time.`}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
          {room.players.map((p) => (
            <div key={p.uid} style={{ ...S.card, padding: '12px 20px', textAlign: 'center' }}>
              <p style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 16 }}>{p.score}</p>
              <p style={{ color: '#6b7280', fontSize: 11 }}>{p.name}</p>
            </div>
          ))}
        </div>
        <p style={{ color: '#4b5563', fontSize: 12 }}>Words played: {words.join(' → ')}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Timer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ color: '#6b7280', fontSize: 13 }}>
          {isMyTurn ? "⚡ Your turn!" : `⏳ ${room.players.find(p => p.uid === room.state?.currentTurn)?.name}'s turn`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 80, height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}>
            <div style={{ width: `${(timeLeft / 30) * 100}%`, height: '100%', borderRadius: 4, background: timeLeft > 10 ? '#22c55e' : '#ef4444', transition: 'width 0.5s linear' }} />
          </div>
          <span style={{ color: timeLeft <= 10 ? '#ef4444' : '#9ca3af', fontWeight: 700, fontSize: 13, minWidth: 24 }}>{timeLeft}s</span>
        </div>
      </div>

      {/* Scores */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {room.players.map((p) => (
          <div key={p.uid} style={{ ...S.card, flex: 1, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: p.uid === room.state?.currentTurn ? '0.5px solid rgba(167,139,250,0.5)' : undefined }}>
            <span style={{ color: p.uid === user.uid ? '#a78bfa' : '#9ca3af', fontSize: 13, fontWeight: 600 }}>{p.uid === user.uid ? 'You' : p.name}</span>
            <span style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 16 }}>{p.score}</span>
          </div>
        ))}
      </div>

      {/* Chain */}
      <div style={{ ...S.card, padding: '14px 16px', marginBottom: 16, minHeight: 60 }}>
        {words.length === 0 ? (
          <p style={{ color: '#4b5563', fontSize: 13, textAlign: 'center' }}>No words yet. {isMyTurn ? 'Start with any word!' : 'Waiting for host...'}</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {words.map((w, i) => (
              <span key={i} style={{ padding: '4px 10px', borderRadius: 20, background: i % 2 === 0 ? 'rgba(139,92,246,0.15)' : 'rgba(59,130,246,0.15)', color: i % 2 === 0 ? '#a78bfa' : '#60a5fa', fontSize: 13, fontWeight: 600 }}>
                {w}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Last letter hint */}
      {lastWord && (
        <p style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>
          Next word must start with <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 16 }}>"{lastWord[lastWord.length - 1].toUpperCase()}"</span>
        </p>
      )}

      {/* Input */}
      {isMyTurn && (
        <>
          {error && <p style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitWord()}
              placeholder={lastWord ? `Word starting with "${lastWord[lastWord.length - 1].toUpperCase()}"...` : 'Type any word...'}
              style={{ ...S.input, flex: 1 }}
            />
            <button onClick={submitWord} style={{ ...S.btn(true), padding: '12px 20px', flexShrink: 0 }}>Send</button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Emoji Decode Game ────────────────────────────────────────────────────────
const EMOJI_PROMPTS = [
  { emojis: '🦁👑', answer: 'lion king', hint: 'Movie' },
  { emojis: '🧊❄️👸', answer: 'frozen', hint: 'Movie' },
  { emojis: '🕷️🧑', answer: 'spiderman', hint: 'Movie' },
  { emojis: '🚀♾️', answer: 'infinity war', hint: 'Movie' },
  { emojis: '🧙💍🔥', answer: 'lord of the rings', hint: 'Movie' },
  { emojis: '🐟🔍', answer: 'finding nemo', hint: 'Movie' },
  { emojis: '👻🎃', answer: 'halloween', hint: 'Movie' },
  { emojis: '🌊🏄🦈', answer: 'jaws', hint: 'Movie' },
  { emojis: '🕺🌃💃', answer: 'saturday night fever', hint: 'Movie' },
  { emojis: '🚂💨⏰', answer: 'back to the future', hint: 'Movie' },
  { emojis: '🌹🥀💔', answer: 'beauty and the beast', hint: 'Movie' },
  { emojis: '🦇🌙🦸', answer: 'batman', hint: 'Movie' },
  { emojis: '🧸❤️🌈', answer: 'toy story', hint: 'Movie' },
  { emojis: '🎵🌧️☂️', answer: 'singing in the rain', hint: 'Movie' },
  { emojis: '🐍✈️', answer: 'snakes on a plane', hint: 'Movie' },
];

function EmojiDecodeGame({ room, user }: { room: GameRoom; user: any }) {
  const [guess, setGuess] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const isHost = room.hostId === user.uid;
  const currentPrompt = room.state?.currentPrompt;
  const guesses: { uid: string; name: string; guess: string; correct: boolean }[] = room.state?.guesses || [];
  const roundOver = room.state?.roundOver;
  const myGuess = guesses.find((g) => g.uid === user.uid);
  const scores: Record<string, number> = room.state?.scores || {};

  useEffect(() => {
    setGuess('');
    setSubmitted(false);
  }, [room.state?.round]);

  const startRound = async () => {
    const idx = Math.floor(Math.random() * EMOJI_PROMPTS.length);
    await updateDoc(doc(db, 'gameRooms', room.id), {
      'state.currentPrompt': EMOJI_PROMPTS[idx],
      'state.guesses': [],
      'state.roundOver': false,
      'state.round': (room.state?.round || 0) + 1,
    });
  };

  const submitGuess = async () => {
    if (!guess.trim() || submitted) return;
    const correct = guess.trim().toLowerCase() === currentPrompt?.answer?.toLowerCase();
    const newGuess = { uid: user.uid, name: userDisplayName(), guess: guess.trim(), correct };
    const newGuesses = [...guesses, newGuess];
    const newScores = { ...scores };
    if (correct) newScores[user.uid] = (newScores[user.uid] || 0) + 10;

    const allGuessed = newGuesses.length >= room.players.filter(p => p.uid !== room.hostId).length;
    await updateDoc(doc(db, 'gameRooms', room.id), {
      'state.guesses': newGuesses,
      'state.scores': newScores,
      'state.roundOver': allGuessed,
    });
    setSubmitted(true);
  };

  const userDisplayName = () => room.players.find((p) => p.uid === user.uid)?.name || 'You';

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Scoreboard */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {room.players.map((p) => (
          <div key={p.uid} style={{ ...S.card, padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: p.uid === user.uid ? '#a78bfa' : '#9ca3af' }}>{p.uid === user.uid ? 'You' : p.name}</span>
            <span style={{ color: '#f3f4f6', fontWeight: 800 }}>{scores[p.uid] || 0}</span>
          </div>
        ))}
      </div>

      {!currentPrompt ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ fontSize: 48, marginBottom: 12 }}>🎮</p>
          <p style={{ color: '#9ca3af', marginBottom: 20 }}>
            {isHost ? 'You are the Emoji Master! Start a round.' : `Waiting for ${room.players.find(p => p.uid === room.hostId)?.name} to start...`}
          </p>
          {isHost && <button onClick={startRound} style={S.btn(true)}>🎲 Start Round</button>}
        </div>
      ) : (
        <>
          {/* Emoji display */}
          <div style={{ ...S.card, padding: '24px', textAlign: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{currentPrompt.hint}</p>
            <p style={{ fontSize: 56, letterSpacing: 8, marginBottom: 8 }}>{currentPrompt.emojis}</p>
            <p style={{ fontSize: 12, color: '#4b5563' }}>Round {room.state?.round}</p>
          </div>

          {/* Guesses */}
          <div style={{ marginBottom: 16 }}>
            {guesses.map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderRadius: 12, background: g.correct ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)', marginBottom: 6, border: `0.5px solid ${g.correct ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                <span style={{ color: '#9ca3af', fontSize: 13 }}>{g.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {roundOver || g.uid === user.uid ? (
                    <span style={{ color: g.correct ? '#34d399' : '#f87171', fontSize: 13, fontWeight: 600 }}>{g.guess}</span>
                  ) : (
                    <span style={{ color: '#4b5563', fontSize: 13 }}>...</span>
                  )}
                  {g.correct && <span>✅</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Answer revealed */}
          {roundOver && (
            <div style={{ ...S.card, padding: '12px 16px', marginBottom: 16, textAlign: 'center', border: '0.5px solid rgba(34,197,94,0.3)' }}>
              <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>Answer was</p>
              <p style={{ color: '#34d399', fontWeight: 800, fontSize: 18, textTransform: 'capitalize' }}>{currentPrompt.answer}</p>
            </div>
          )}

          {/* Input or waiting */}
          {!isHost && !myGuess && !roundOver && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                autoFocus value={guess}
                onChange={(e) => setGuess(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitGuess()}
                placeholder="Your guess..."
                style={{ ...S.input, flex: 1 }}
              />
              <button onClick={submitGuess} style={{ ...S.btn(true), flexShrink: 0 }}>Guess</button>
            </div>
          )}
          {!isHost && myGuess && !roundOver && (
            <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center' }}>Waiting for others to guess...</p>
          )}
          {isHost && roundOver && (
            <div style={{ textAlign: 'center' }}>
              <button onClick={startRound} style={S.btn(true)}>🎲 Next Round</button>
            </div>
          )}
          {isHost && !roundOver && (
            <p style={{ color: '#4b5563', fontSize: 12, textAlign: 'center' }}>Waiting for players to guess...</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Hot Take Vote ────────────────────────────────────────────────────────────
function HotTakeGame({ room, user }: { room: GameRoom; user: any }) {
  const [take, setTake] = useState('');
  const takes: { id: string; uid: string; name: string; text: string; agree: string[]; disagree: string[] }[] = room.state?.takes || [];
  const myUid = user.uid;

  const submitTake = async () => {
    if (!take.trim()) return;
    const newTake = { id: Date.now().toString(), uid: myUid, name: room.players.find(p => p.uid === myUid)?.name || 'You', text: take.trim(), agree: [], disagree: [] };
    await updateDoc(doc(db, 'gameRooms', room.id), { 'state.takes': [...takes, newTake] });
    setTake('');
  };

  const vote = async (takeId: string, voteType: 'agree' | 'disagree') => {
    const updated = takes.map((t) => {
      if (t.id !== takeId) return t;
      const alreadyAgreed = t.agree.includes(myUid);
      const alreadyDisagreed = t.disagree.includes(myUid);
      let agree = t.agree.filter((u) => u !== myUid);
      let disagree = t.disagree.filter((u) => u !== myUid);
      if (voteType === 'agree' && !alreadyAgreed) agree.push(myUid);
      if (voteType === 'disagree' && !alreadyDisagreed) disagree.push(myUid);
      return { ...t, agree, disagree };
    });
    await updateDoc(doc(db, 'gameRooms', room.id), { 'state.takes': updated });
  };

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Submit a take */}
      <div style={{ marginBottom: 20 }}>
        <textarea
          value={take}
          onChange={(e) => setTake(e.target.value)}
          placeholder="Drop a hot take... 🔥"
          rows={2}
          style={{ ...S.input, resize: 'none', marginBottom: 8 }}
        />
        <button onClick={submitTake} disabled={!take.trim()} style={{ ...S.btn(true), width: '100%', opacity: take.trim() ? 1 : 0.5 }}>
          🔥 Post Hot Take
        </button>
      </div>

      {/* Takes list */}
      {takes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#4b5563' }}>
          <p style={{ fontSize: 36, marginBottom: 8 }}>🌡️</p>
          <p style={{ fontSize: 13 }}>No hot takes yet. Be bold!</p>
        </div>
      ) : (
        [...takes].reverse().map((t) => {
          const total = t.agree.length + t.disagree.length;
          const agreePct = total > 0 ? Math.round((t.agree.length / total) * 100) : 50;
          const myVote = t.agree.includes(myUid) ? 'agree' : t.disagree.includes(myUid) ? 'disagree' : null;
          return (
            <div key={t.id} style={{ ...S.card, padding: '16px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <p style={{ color: '#9ca3af', fontSize: 11 }}>@{t.name}</p>
                <span style={{ fontSize: 10, color: '#4b5563' }}>{total} votes</span>
              </div>
              <p style={{ color: '#f3f4f6', fontSize: 15, fontWeight: 500, lineHeight: 1.5, marginBottom: 14 }}>{t.text}</p>

              {/* Vote bar */}
              {total > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 8, marginBottom: 4 }}>
                    <div style={{ width: `${agreePct}%`, background: 'linear-gradient(90deg,#22c55e,#34d399)', transition: 'width 0.4s' }} />
                    <div style={{ width: `${100 - agreePct}%`, background: 'linear-gradient(90deg,#ef4444,#f87171)', transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#22c55e', fontSize: 10, fontWeight: 600 }}>✅ {agreePct}%</span>
                    <span style={{ color: '#ef4444', fontSize: 10, fontWeight: 600 }}>{100 - agreePct}% ❌</span>
                  </div>
                </div>
              )}

              {/* Vote buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => vote(t.id, 'agree')}
                  style={{ flex: 1, padding: '9px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'all 0.2s', border: 'none', background: myVote === 'agree' ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.08)', color: myVote === 'agree' ? '#34d399' : '#6b7280' }}>
                  ✅ Agree {t.agree.length > 0 && `(${t.agree.length})`}
                </button>
                <button
                  onClick={() => vote(t.id, 'disagree')}
                  style={{ flex: 1, padding: '9px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'all 0.2s', border: 'none', background: myVote === 'disagree' ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.08)', color: myVote === 'disagree' ? '#f87171' : '#6b7280' }}>
                  ❌ Disagree {t.disagree.length > 0 && `(${t.disagree.length})`}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Main Games Page ──────────────────────────────────────────────────────────
export default function GamesPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  // Lobby
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<GameRoom | null>(null);

  // Create room
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameType>('word_duel');
  const [inviteSearch, setInviteSearch] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/login'); return; }
      setUser(firebaseUser);
      const pd = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (pd.exists()) setUserProfile({ id: pd.id, ...pd.data() });
      const snap = await getDocs(collection(db, 'users'));
      setAllUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u: any) => u.id !== firebaseUser.uid));
      setPageLoading(false);
    });
    return () => unsub();
  }, []);

  // Live rooms listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'gameRooms'), where('playerIds', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as GameRoom[];
      setRooms(data);
      if (activeRoom) {
        const updated = data.find((r) => r.id === activeRoom.id);
        if (updated) setActiveRoom(updated);
      }
    });
    return () => unsub();
  }, [user, activeRoom?.id]);

  const createRoom = async () => {
    if (!user || invitedUsers.length === 0) return;
    setCreating(true);
    const playerIds = [user.uid, ...invitedUsers];
    const players = [
      { uid: user.uid, name: userProfile?.fullName || 'You', score: 0 },
      ...invitedUsers.map((uid) => {
        const u = allUsers.find((x) => x.id === uid);
        return { uid, name: u?.fullName || 'Player', score: 0 };
      }),
    ];
    const initialState: any = {
      word_duel: { lastWord: '', words: [], currentTurn: user.uid, turnStartedAt: null, gameOver: false },
      emoji_decode: { takes: [], currentPrompt: null, guesses: [], round: 0, scores: {} },
      hot_take: { takes: [] },
    }[selectedGame];

    const ref = await addDoc(collection(db, 'gameRooms'), {
      type: selectedGame,
      hostId: user.uid,
      hostName: userProfile?.fullName || 'Host',
      players,
      playerIds,
      status: 'playing',
      state: initialState,
      createdAt: serverTimestamp(),
    });
    const newRoom = { id: ref.id, type: selectedGame, hostId: user.uid, hostName: userProfile?.fullName, players, playerIds, status: 'playing' as GameStatus, state: initialState, createdAt: null };
    setActiveRoom(newRoom);
    setShowCreate(false);
    setInvitedUsers([]);
    setCreating(false);
  };

  const leaveRoom = async () => {
    if (!activeRoom) return;
    setActiveRoom(null);
  };

  const deleteRoom = async () => {
    if (!activeRoom || activeRoom.hostId !== user.uid) return;
    await deleteDoc(doc(db, 'gameRooms', activeRoom.id));
    setActiveRoom(null);
  };

  const filteredUsers = allUsers.filter((u) =>
    (u.fullName?.toLowerCase().includes(inviteSearch.toLowerCase()) || u.username?.toLowerCase().includes(inviteSearch.toLowerCase())) &&
    !invitedUsers.includes(u.id)
  );

  const GAME_INFO = {
    word_duel: { icon: '🔤', name: 'Word Duel', desc: 'Chain words — each must start with the last letter. Timer counts down!', color: '#a78bfa', players: '2' },
    emoji_decode: { icon: '🎭', name: 'Emoji Decode', desc: 'Decode 3 emojis to guess the movie. Host reveals, players guess!', color: '#34d399', players: '2+' },
    hot_take: { icon: '🔥', name: 'Hot Take Vote', desc: 'Post bold takes, everyone votes agree or disagree. Results live!', color: '#f97316', players: '2+' },
  };

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Active Room View ──────────────────────────────────────────────────────
  if (activeRoom) {
    const info = GAME_INFO[activeRoom.type];
    return (
      <>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
        <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 32 }}>
          {/* Room header */}
          <div style={{ background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(20px)', borderBottom: '0.5px solid rgba(139,92,246,0.15)', padding: '14px 20px', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={leaveRoom} style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
                <span style={{ fontSize: 18 }}>{info.icon}</span>
                <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15 }}>{info.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {activeRoom.players.map((p) => (
                  <div key={p.uid} title={p.name} style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', border: p.uid === user.uid ? '1.5px solid #a78bfa' : '1.5px solid rgba(139,92,246,0.2)' }}>
                    {p.name[0]?.toUpperCase()}
                  </div>
                ))}
                {activeRoom.hostId === user.uid && (
                  <button onClick={deleteRoom} style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>End</button>
                )}
              </div>
            </div>
          </div>

          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            {activeRoom.type === 'word_duel' && <WordDuelGame room={activeRoom} user={user} userProfile={userProfile} />}
            {activeRoom.type === 'emoji_decode' && <EmojiDecodeGame room={activeRoom} user={user} />}
            {activeRoom.type === 'hot_take' && <HotTakeGame room={activeRoom} user={user} />}
          </div>
        </div>
      </>
    );
  }

  // ── Lobby View ────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
      <div style={S.page}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 20px' }}>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#f3f4f6', marginBottom: 4, letterSpacing: -0.5 }}>🎮 Mini Games</h1>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Play with your friends in real time</p>
          </div>

          {/* Game cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            {(Object.entries(GAME_INFO) as [GameType, typeof GAME_INFO.word_duel][]).map(([type, info]) => (
              <div key={type} style={{ ...S.card, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'border 0.2s', border: `0.5px solid rgba(139,92,246,${selectedGame === type ? '0.5' : '0.15'})`, background: selectedGame === type ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.03)' }}
                onClick={() => { setSelectedGame(type); setShowCreate(true); }}>
                <span style={{ fontSize: 32, flexShrink: 0 }}>{info.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15 }}>{info.name}</span>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: '#6b7280' }}>{info.players} players</span>
                  </div>
                  <p style={{ color: '#6b7280', fontSize: 12, lineHeight: 1.4 }}>{info.desc}</p>
                </div>
                <span style={{ color: '#a78bfa', fontSize: 20 }}>›</span>
              </div>
            ))}
          </div>

          {/* Active rooms */}
          {rooms.length > 0 && (
            <>
              <h2 style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Your Active Rooms</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rooms.map((r) => {
                  const info = GAME_INFO[r.type];
                  return (
                    <div key={r.id} onClick={() => setActiveRoom(r)} style={{ ...S.card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                      <span style={{ fontSize: 24 }}>{info.icon}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{info.name}</p>
                        <p style={{ color: '#6b7280', fontSize: 11 }}>{r.players.map(p => p.uid === user.uid ? 'You' : p.name).join(', ')}</p>
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', color: '#34d399', fontSize: 10, fontWeight: 600 }}>Playing</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#111118', borderRadius: '24px 24px 0 0', border: '0.5px solid rgba(139,92,246,0.25)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '18px 20px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <h2 style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 17, margin: 0 }}>{GAME_INFO[selectedGame].icon} {GAME_INFO[selectedGame].name}</h2>
                <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
              <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>{GAME_INFO[selectedGame].desc}</p>

              {/* Game selector pills */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {(Object.entries(GAME_INFO) as [GameType, typeof GAME_INFO.word_duel][]).map(([type, info]) => (
                  <button key={type} onClick={() => setSelectedGame(type)} style={{ ...S.btn(selectedGame === type), padding: '6px 14px', fontSize: 12 }}>{info.icon} {info.name}</button>
                ))}
              </div>

              {/* Search */}
              <input
                value={inviteSearch}
                onChange={(e) => setInviteSearch(e.target.value)}
                placeholder="Search friends to invite..."
                style={{ ...S.input, marginBottom: 12 }}
              />

              {/* Invited */}
              {invitedUsers.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {invitedUsers.map((uid) => {
                    const u = allUsers.find((x) => x.id === uid);
                    return (
                      <span key={uid} onClick={() => setInvitedUsers((prev) => prev.filter((id) => id !== uid))} style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(139,92,246,0.2)', color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {u?.fullName} ✕
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* User list */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px' }}>
              {filteredUsers.slice(0, 20).map((u) => (
                <div key={u.id} onClick={() => setInvitedUsers((prev) => [...prev, u.id])} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(139,92,246,0.3)', flexShrink: 0 }}>
                    {u.photoURL ? <img src={u.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
                      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white' }}>{u.fullName?.[0]?.toUpperCase()}</div>
                    )}
                  </div>
                  <div>
                    <p style={{ color: '#f3f4f6', fontSize: 14, fontWeight: 600, margin: 0 }}>{u.fullName}</p>
                    <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>@{u.username}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Start button */}
            <div style={{ padding: '14px 20px 28px', flexShrink: 0 }}>
              <button
                onClick={createRoom}
                disabled={invitedUsers.length === 0 || creating}
                style={{ ...S.btn(true), width: '100%', padding: '14px', fontSize: 15, opacity: invitedUsers.length > 0 ? 1 : 0.4 }}>
                {creating ? 'Creating...' : `🚀 Start Game with ${invitedUsers.length} friend${invitedUsers.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
