'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, getDocs, doc, updateDoc, arrayUnion, arrayRemove, getDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';

const TRENDING_TAGS = [
  { label: '#design',  style: 'purple' },
  { label: '#coding',  style: 'blue' },
  { label: '#art',     style: 'pink' },
  { label: '#tech',    style: 'green' },
  { label: '#gaming',  style: 'purple' },
  { label: '#startup', style: 'blue' },
];

const TAG_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  purple: { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
  blue:   { bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  pink:   { bg: 'rgba(236,72,153,0.12)', color: '#f472b6', border: 'rgba(236,72,153,0.3)' },
  green:  { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.3)' },
};

const EXPLORE_CARDS = [
  { emoji: '🎨', label: '#DigitalArt',  grad: 'linear-gradient(135deg,#1a0a2e,#0d1a2e)' },
  { emoji: '💻', label: '#WebDev',      grad: 'linear-gradient(135deg,#0d1a2e,#0a2e1a)' },
  { emoji: '🎮', label: '#Gaming',      grad: 'linear-gradient(135deg,#2e0a1a,#1a0a2e)' },
  { emoji: '🚀', label: '#StartupLife', grad: 'linear-gradient(135deg,#1a2e0a,#0a1a2e)' },
];

export default function Search() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allPosts, setAllPosts] = useState<any[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'posts'>('users');
  const [pageLoading, setPageLoading] = useState(true);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const { push } = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { push('/login'); return; }
      setUser(firebaseUser);
      await loadCurrentUserProfile(firebaseUser.uid);
      await loadAllUsers(firebaseUser.uid);
      await loadAllPosts();
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadCurrentUserProfile = async (uid: string) => {
    const profileDoc = await getDoc(doc(db, 'users', uid));
    if (profileDoc.exists()) {
      const data = profileDoc.data();
      setUserProfile(data);
      const following: string[] = data.following || [];
      const followers: string[] = data.followers || [];
      const map: Record<string, boolean> = {};
      following.forEach((id: string) => { map[id] = true; });
      setFollowingMap(map);
      setFollowingIds(following);
      setFollowerIds(followers);
    }
  };

  const loadAllUsers = async (uid: string) => {
    const snapshot = await getDocs(collection(db, 'users'));
    const users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u: any) => u.id !== uid);
    setAllUsers(users);
    setFilteredUsers(users);
  };

  const loadAllPosts = async () => {
    const snapshot = await getDocs(collection(db, 'posts'));
    const posts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    setAllPosts(posts);
    setFilteredPosts(posts);
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    const lower = q.toLowerCase();
    if (!q.trim()) { setFilteredUsers(allUsers); setFilteredPosts(allPosts); return; }
    setFilteredUsers(allUsers.filter((u: any) =>
      u.username?.toLowerCase().includes(lower) || u.fullName?.toLowerCase().includes(lower) || u.bio?.toLowerCase().includes(lower)
    ));
    setFilteredPosts(allPosts.filter((p: any) =>
      p.content?.toLowerCase().includes(lower) || p.username?.toLowerCase().includes(lower) || p.fullName?.toLowerCase().includes(lower)
    ));
  };

  const toggleFollow = async (targetUserId: string) => {
    if (!user || loadingFollow) return;
    const isFollowing = followingMap[targetUserId];
    // Optimistic update
    setFollowingMap((prev) => ({ ...prev, [targetUserId]: !isFollowing }));
    setFollowingIds((prev) => isFollowing ? prev.filter(id => id !== targetUserId) : [...prev, targetUserId]);
    setLoadingFollow(targetUserId);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        following: isFollowing ? arrayRemove(targetUserId) : arrayUnion(targetUserId),
      });
      await updateDoc(doc(db, 'users', targetUserId), {
        followers: isFollowing ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
      // Send follow notification
      if (!isFollowing) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: targetUserId, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'follow', read: false, createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      // Revert on error
      setFollowingMap((prev) => ({ ...prev, [targetUserId]: isFollowing }));
      setFollowingIds((prev) => isFollowing ? [...prev, targetUserId] : prev.filter(id => id !== targetUserId));
      console.error(err);
    }
    setLoadingFollow(null);
  };

  const avatarColors = [
    { bg: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', color: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
    { bg: 'linear-gradient(135deg,rgba(59,130,246,0.3),rgba(52,211,153,0.3))', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
    { bg: 'linear-gradient(135deg,rgba(236,72,153,0.3),rgba(139,92,246,0.3))', color: '#f472b6', border: 'rgba(236,72,153,0.3)' },
  ];

  const inputStyle = {
    width: '100%', padding: '12px 16px 12px 40px',
    background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.2)',
    borderRadius: 14, color: '#f3f4f6', fontSize: 14,
    fontFamily: 'Inter,sans-serif', outline: 'none',
  };

  if (pageLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: '#6b7280', fontSize: 13, fontFamily: 'Inter,sans-serif' }}>Loading...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const showExplore = !searchQuery.trim();

  return (
    <>
      <Navbar />
      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 100 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 0' }}>

          {/* Title */}
          <h1 style={{ fontSize: 20, fontWeight: 700, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 16 }}>
            🔍 Explore
          </h1>

          {/* Search input */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#6b7280' }}>🔍</span>
            <input
              autoFocus
              placeholder="Search people, posts, keywords..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              style={inputStyle}
            />
            {searchQuery && (
              <button type="button" onClick={() => handleSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
            )}
          </div>

          {/* ── Explore (no query) ── */}
          {showExplore && (
            <>
              {/* Trending tags */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
                {TRENDING_TAGS.map((tag) => {
                  const c = TAG_COLORS[tag.style];
                  return (
                    <button type="button"
                      key={tag.label}
                      onClick={() => handleSearch(tag.label)}
                      style={{ padding: '5px 12px', borderRadius: 20, background: c.bg, border: `0.5px solid ${c.border}`, color: c.color, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>

              {/* Trending section label */}
              <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Trending</p>

              {/* Explore grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28 }}>
                {EXPLORE_CARDS.map((card) => (
                  <div key={card.label} style={{ borderRadius: 16, overflow: 'hidden', background: card.grad, border: '0.5px solid rgba(139,92,246,0.15)', cursor: 'pointer' }}>
                    <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>{card.emoji}</div>
                    <div style={{ padding: '8px 12px 12px', fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* ── People who follow you ── */}
              {followerIds.length > 0 && (
                <>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Follows You</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 24 }}>
                    {allUsers.filter((u: any) => followerIds.includes(u.id)).map((u: any, idx) => {
                      const av = avatarColors[idx % 3];
                      const isFollowing = followingMap[u.id];
                      return (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                          <button type="button" onClick={() => push(`/profile/${u.id}`)} aria-label={`View ${u.fullName}'s profile`}
                            style={{ width: 42, height: 42, borderRadius: '50%', background: av.bg, border: `1px solid ${av.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: av.color, flexShrink: 0, cursor: 'pointer', padding: 0 }}>
                            {u.fullName?.[0]?.toUpperCase() || 'U'}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{u.fullName}</p>
                              <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, background: 'rgba(34,197,94,0.1)', borderRadius: 6, padding: '1px 6px' }}>Follows you</span>
                            </div>
                            <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>@{u.username} · {u.followers?.length || 0} followers</p>
                          </div>
                          <button type="button"
                            onClick={() => toggleFollow(u.id)}
                            disabled={loadingFollow === u.id}
                            aria-label={isFollowing ? `Unfollow ${u.fullName}` : `Follow ${u.fullName}`}
                            style={{ padding: '7px 16px', borderRadius: 20, background: isFollowing ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: isFollowing ? '0.5px solid rgba(255,255,255,0.12)' : 'none', color: isFollowing ? '#9ca3af' : 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, opacity: loadingFollow === u.id ? 0.6 : 1, fontFamily: 'Inter,sans-serif' }}>
                            {loadingFollow === u.id ? '...' : isFollowing ? 'Following' : 'Follow Back'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── People you follow ── */}
              {followingIds.length > 0 && (
                <>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Following</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 24 }}>
                    {allUsers.filter((u: any) => followingIds.includes(u.id)).map((u: any, idx) => {
                      const av = avatarColors[idx % 3];
                      return (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                          <button type="button" onClick={() => push(`/profile/${u.id}`)} aria-label={`View ${u.fullName}'s profile`}
                            style={{ width: 42, height: 42, borderRadius: '50%', background: av.bg, border: `1px solid ${av.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: av.color, flexShrink: 0, cursor: 'pointer', padding: 0 }}>
                            {u.fullName?.[0]?.toUpperCase() || 'U'}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{u.fullName}</p>
                            <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>@{u.username} · {u.followers?.length || 0} followers</p>
                            {u.bio && <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.bio}</p>}
                          </div>
                          <button type="button"
                            onClick={() => toggleFollow(u.id)}
                            disabled={loadingFollow === u.id}
                            aria-label={`Unfollow ${u.fullName}`}
                            style={{ padding: '7px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.12)', color: '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, opacity: loadingFollow === u.id ? 0.6 : 1, fontFamily: 'Inter,sans-serif' }}>
                            {loadingFollow === u.id ? '...' : 'Following'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── Suggested — not yet connected ── */}
              {(() => {
                const connected = new Set([...followingIds, ...followerIds]);
                const suggested = allUsers.filter((u: any) => !connected.has(u.id)).slice(0, 5);
                if (suggested.length === 0) return null;
                return (
                  <>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Suggested People</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {suggested.map((u: any, idx) => {
                        const av = avatarColors[idx % 3];
                        const isFollowing = followingMap[u.id];
                        return (
                          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                            <button type="button" onClick={() => push(`/profile/${u.id}`)} aria-label={`View ${u.fullName}'s profile`}
                              style={{ width: 42, height: 42, borderRadius: '50%', background: av.bg, border: `1px solid ${av.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: av.color, flexShrink: 0, cursor: 'pointer', padding: 0 }}>
                              {u.fullName?.[0]?.toUpperCase() || 'U'}
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{u.fullName}</p>
                              <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>@{u.username} · {u.followers?.length || 0} followers</p>
                            </div>
                            <button type="button"
                              onClick={() => toggleFollow(u.id)}
                              disabled={loadingFollow === u.id}
                              aria-label={`Follow ${u.fullName}`}
                              style={{ padding: '7px 16px', borderRadius: 20, background: isFollowing ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: isFollowing ? '0.5px solid rgba(255,255,255,0.12)' : 'none', color: isFollowing ? '#9ca3af' : 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, opacity: loadingFollow === u.id ? 0.6 : 1, fontFamily: 'Inter,sans-serif' }}>
                              {loadingFollow === u.id ? '...' : isFollowing ? 'Following' : 'Follow'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {/* ── Search results ── */}
          {!showExplore && (
            <>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['users', 'posts'] as const).map((tab) => (
                  <button type="button"
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{ padding: '7px 16px', borderRadius: 20, background: activeTab === tab ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(139,92,246,0.08)', border: activeTab === tab ? 'none' : '0.5px solid rgba(139,92,246,0.2)', color: activeTab === tab ? 'white' : '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {tab === 'users' ? `👤 Users (${filteredUsers.length})` : `📝 Posts (${filteredPosts.length})`}
                  </button>
                ))}
              </div>

              {/* Users results */}
              {activeTab === 'users' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {filteredUsers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 0' }}>
                      <p style={{ fontSize: 36, marginBottom: 8 }}>🔍</p>
                      <p style={{ color: '#6b7280', fontSize: 14 }}>No users found for "{searchQuery}"</p>
                    </div>
                  ) : (
                    filteredUsers.map((u: any, idx) => {
                      const av = avatarColors[idx % 3];
                      const isFollowing = followingMap[u.id];
                      return (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ width: 44, height: 44, borderRadius: '50%', background: av.bg, border: `1px solid ${av.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: av.color, flexShrink: 0 }}>
                            {u.fullName?.[0]?.toUpperCase() || 'U'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', marginBottom: 1 }}>{u.fullName}</p>
                            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: u.bio ? 2 : 0 }}>@{u.username} · {u.followers?.length || 0} followers</p>
                            {u.bio && <p style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.bio}</p>}
                          </div>
                          <button type="button"
                            onClick={() => toggleFollow(u.id)}
                            disabled={loadingFollow === u.id}
                            aria-label={isFollowing ? `Unfollow ${u.fullName}` : `Follow ${u.fullName}`}
                            style={{ padding: '7px 14px', borderRadius: 20, background: isFollowing ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: isFollowing ? '0.5px solid rgba(255,255,255,0.12)' : 'none', color: isFollowing ? '#9ca3af' : 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, opacity: loadingFollow === u.id ? 0.6 : 1, fontFamily: 'Inter,sans-serif' }}>
                            {loadingFollow === u.id ? '...' : isFollowing ? 'Following' : followerIds.includes(u.id) ? 'Follow Back' : 'Follow'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Posts results */}
              {activeTab === 'posts' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {filteredPosts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 0' }}>
                      <p style={{ fontSize: 36, marginBottom: 8 }}>📝</p>
                      <p style={{ color: '#6b7280', fontSize: 14 }}>No posts found for "{searchQuery}"</p>
                    </div>
                  ) : (
                    filteredPosts.map((post: any, idx) => {
                      const av = avatarColors[idx % 3];
                      return (
                        <div key={post.id} style={{ padding: '16px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: av.bg, border: `1px solid ${av.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: av.color, flexShrink: 0 }}>
                              {post.fullName?.[0]?.toUpperCase() || 'U'}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6' }}>{post.fullName}</span>
                                <span style={{ fontSize: 12, color: '#6b7280' }}>@{post.username}</span>
                                <span style={{ fontSize: 12, color: '#4b5563', marginLeft: 'auto' }}>
                                  {post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleDateString() : ''}
                                </span>
                              </div>
                              <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6, marginBottom: 8 }}>{post.content}</p>
                              {post.imageUrl && (
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={post.imageUrl} alt="Post" style={{ width: '100%', borderRadius: 12, maxHeight: 200, objectFit: 'cover' as const, marginBottom: 8 }} />
                              )}
                              <div style={{ display: 'flex', gap: 16 }}>
                                <span style={{ fontSize: 12, color: '#f472b6' }}>❤️ {post.likes?.length || 0}</span>
                                <span style={{ fontSize: 12, color: '#60a5fa' }}>💬 {post.comments?.length || 0}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
