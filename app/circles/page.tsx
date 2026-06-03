'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  onSnapshot, serverTimestamp, query, where, arrayUnion,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

const CIRCLE_EMOJIS = ['⚡', '🌙', '🔥', '🎯', '💎', '🌊', '🎨', '🚀', '🌿', '👑'];
const MEMBER_COLORS = ['#a78bfa', '#60a5fa', '#34d399', '#f97316', '#f472b6', '#facc15'];

function CirclesContent() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [circles, setCircles] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  // create modal
  const [showCreate, setShowCreate] = useState(false);
  const [circleName, setCircleName] = useState('');
  const [circleDesc, setCircleDesc] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('⚡');
  const [inviteSearch, setInviteSearch] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fu) => {
      if (!fu) { router.push('/login'); return; }
      setUser(fu);
      const pd = await getDoc(doc(db, 'users', fu.uid));
      if (pd.exists()) setUserProfile({ id: pd.id, ...pd.data() });
      const snap = await getDocs(collection(db, 'users'));
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((u: any) => u.id !== fu.uid));
      setPageLoading(false);
    });
    return () => unsub();
  }, []);

  // Live circles
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'circles'), where('memberIds', 'array-contains', user.uid));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // sort by updatedAt desc
      data.sort((a: any, b: any) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setCircles(data);
    });
    return () => unsub();
  }, [user]);

  const createCircle = async () => {
    if (!user || !circleName.trim()) return;
    setCreating(true); setCreateError('');
    try {
      const memberIds = [user.uid, ...invitedUsers];
      const members = [
        { uid: user.uid, name: userProfile?.fullName || 'You', photoURL: userProfile?.photoURL || '', role: 'host' },
        ...invitedUsers.map(uid => {
          const u = allUsers.find((x: any) => x.id === uid);
          return { uid, name: u?.fullName || 'Member', photoURL: u?.photoURL || '', role: 'member' };
        }),
      ];
      await addDoc(collection(db, 'circles'), {
        name: circleName.trim(),
        description: circleDesc.trim(),
        emoji: selectedEmoji,
        hostId: user.uid,
        hostName: userProfile?.fullName || 'Host',
        memberIds,
        members,
        postCount: 0,
        newPostCount: 0,
        isLive: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowCreate(false);
      setCircleName(''); setCircleDesc(''); setInvitedUsers([]); setSelectedEmoji('⚡');
    } catch (err: any) {
      setCreateError('Failed to create circle. Check Firestore rules for circles collection.');
    } finally { setCreating(false); }
  };

  const filteredUsers = allUsers.filter((u: any) =>
    (u.fullName?.toLowerCase().includes(inviteSearch.toLowerCase()) ||
      u.username?.toLowerCase().includes(inviteSearch.toLowerCase())) &&
    !invitedUsers.includes(u.id)
  );

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <>
      <Navbar />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 100 }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(180deg,rgba(139,92,246,0.1) 0%,transparent 100%)', padding: '0 0 1px' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 20px 0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 900, color: '#f3f4f6', margin: 0, letterSpacing: -0.5 }}>Your Circles</h1>
                <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>🔒 Private · Only members can see</p>
              </div>
              <button onClick={() => setShowCreate(true)}
                style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 14px rgba(139,92,246,0.4)' }}>
                +
              </button>
            </div>

            {/* Privacy notice */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'rgba(139,92,246,0.06)', border: '0.5px solid rgba(139,92,246,0.15)', margin: '14px 0 0' }}>
              <span style={{ fontSize: 13 }}>🔐</span>
              <p style={{ color: '#6b7280', fontSize: 12, margin: 0, lineHeight: 1.4 }}>Circles are end-to-end encrypted. Your posts never leave your circle.</p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '0.5px solid rgba(255,255,255,0.06)', marginTop: 16 }}>
              <div style={{ flex: 1, padding: '10px 0', textAlign: 'center', borderBottom: '2px solid #a78bfa', color: '#a78bfa', fontSize: 13, fontWeight: 700 }}>
                My Circles ({circles.length})
              </div>
            </div>
          </div>
        </div>

        {/* Circles list */}
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '12px 0' }}>
          {circles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px' }}>
              <p style={{ fontSize: 52, marginBottom: 12 }}>⭕</p>
              <p style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No circles yet</p>
              <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>Create your inner circle and share things only your people can see.</p>
              <button onClick={() => setShowCreate(true)}
                style={{ padding: '12px 28px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                ✦ Create First Circle
              </button>
            </div>
          ) : circles.map((circle: any) => (
            <Link key={circle.id} href={`/circles/${circle.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                {/* Circle icon */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,rgba(139,92,246,0.25),rgba(59,130,246,0.25))', border: '1.5px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                    {circle.emoji || '⚡'}
                  </div>
                  {circle.isLive && (
                    <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: 'white', fontSize: 8, fontWeight: 800, padding: '2px 5px', borderRadius: 6, border: '1.5px solid #0a0a0f' }}>LIVE</span>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 15 }}>{circle.name}</span>
                    {circle.newPostCount > 0 && (
                      <span style={{ background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', color: 'white', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20 }}>{circle.newPostCount} new</span>
                    )}
                  </div>
                  <p style={{ color: '#6b7280', fontSize: 12, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {circle.description || `${circle.memberIds?.length || 1} members`}
                  </p>
                  {circle.lastPostPreview && (
                    <p style={{ color: '#4b5563', fontSize: 11, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {circle.lastPostPreview}
                    </p>
                  )}
                </div>

                {/* Member avatars */}
                <div style={{ display: 'flex', flexShrink: 0 }}>
                  {(circle.members || []).slice(0, 3).map((m: any, i: number) => (
                    <div key={m.uid} style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', border: '2px solid #0a0a0f', marginLeft: i > 0 ? -8 : 0, background: `${MEMBER_COLORS[i % MEMBER_COLORS.length]}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                      {m.photoURL ? <img src={m.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.name?.[0]?.toUpperCase()}
                    </div>
                  ))}
                  {(circle.memberIds?.length || 0) > 3 && (
                    <div style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid #0a0a0f', marginLeft: -8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#6b7280' }}>
                      +{circle.memberIds.length - 3}
                    </div>
                  )}
                </div>

                <span style={{ color: '#4b5563', fontSize: 18, flexShrink: 0 }}>›</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Create Circle Modal */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, background: '#0e0e18', borderRadius: '24px 24px 0 0', border: '0.5px solid rgba(139,92,246,0.3)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

            <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 18, margin: 0 }}>✦ New Circle</h2>
                <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Emoji picker */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Circle Icon</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {CIRCLE_EMOJIS.map(e => (
                    <button key={e} onClick={() => setSelectedEmoji(e)}
                      style={{ width: 40, height: 40, borderRadius: 12, border: selectedEmoji === e ? '2px solid #a78bfa' : '1px solid rgba(255,255,255,0.08)', background: selectedEmoji === e ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.03)', fontSize: 20, cursor: 'pointer', transition: 'all 0.15s' }}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <input value={circleName} onChange={e => setCircleName(e.target.value)}
                placeholder="Circle name (e.g. The Squad)"
                style={{ width: '100%', padding: '12px 15px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(139,92,246,0.25)', color: '#f3f4f6', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />

              {/* Desc */}
              <input value={circleDesc} onChange={e => setCircleDesc(e.target.value)}
                placeholder="What's this circle about? (optional)"
                style={{ width: '100%', padding: '12px 15px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(139,92,246,0.25)', color: '#f3f4f6', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />

              {/* Invite search */}
              <input value={inviteSearch} onChange={e => setInviteSearch(e.target.value)}
                placeholder="Add members..."
                style={{ width: '100%', padding: '12px 15px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(139,92,246,0.25)', color: '#f3f4f6', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />

              {/* Invited chips */}
              {invitedUsers.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {invitedUsers.map((uid, i) => {
                    const u = allUsers.find((x: any) => x.id === uid);
                    return (
                      <span key={uid} onClick={() => setInvitedUsers(p => p.filter(id => id !== uid))}
                        style={{ padding: '4px 10px', borderRadius: 20, background: `${MEMBER_COLORS[i % MEMBER_COLORS.length]}20`, color: MEMBER_COLORS[i % MEMBER_COLORS.length], fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${MEMBER_COLORS[i % MEMBER_COLORS.length]}30` }}>
                        {u?.fullName} ✕
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* User list */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px' }}>
              {filteredUsers.slice(0, 20).map((u: any) => (
                <div key={u.id} onClick={() => setInvitedUsers(p => [...p, u.id])}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(139,92,246,0.3)', flexShrink: 0, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white' }}>
                    {u.photoURL ? <img src={u.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : u.fullName?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#f3f4f6', fontSize: 14, fontWeight: 600, margin: 0 }}>{u.fullName}</p>
                    <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>@{u.username}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px 32px', flexShrink: 0 }}>
              {createError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
                  <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>⚠️ {createError}</p>
                </div>
              )}
              <button onClick={createCircle} disabled={!circleName.trim() || creating}
                style={{ width: '100%', padding: '14px', borderRadius: 16, background: circleName.trim() ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(139,92,246,0.2)', border: 'none', color: circleName.trim() ? 'white' : '#6b7280', fontSize: 15, fontWeight: 700, cursor: circleName.trim() ? 'pointer' : 'not-allowed', fontFamily: 'Inter,sans-serif' }}>
                {creating ? 'Creating...' : `✦ Create Circle${invitedUsers.length ? ` · ${invitedUsers.length + 1} members` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function CirclesPage() {
  return <Suspense><CirclesContent /></Suspense>;
}
