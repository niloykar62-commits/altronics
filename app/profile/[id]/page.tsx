'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  doc, getDoc, getDocs, collection, query,
  where, orderBy, updateDoc, addDoc,
  arrayUnion, arrayRemove, serverTimestamp,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

function timeAgo(ts: any): string {
  if (!ts?.toDate) return 'Just now';
  const diff = Date.now() - ts.toDate().getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return ts.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function PublicProfileContent() {
  const params = useParams();
  const profileId = params?.id as string;
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'liked'>('posts');
  const [likedPosts, setLikedPosts] = useState<any[]>([]);
  const [likedLoading, setLikedLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fu) => {
      if (!fu) { router.push('/login'); return; }
      setCurrentUser(fu);

      // If viewing own profile, redirect to /profile
      if (fu.uid === profileId) { router.replace('/profile'); return; }

      // Load current user's profile (to check following state)
      const myDoc = await getDoc(doc(db, 'users', fu.uid));
      if (myDoc.exists()) {
        const myData = myDoc.data();
        setCurrentUserProfile(myData);
        setIsFollowing((myData.following || []).includes(profileId));
      }

      // Load the target profile
      const profileDoc = await getDoc(doc(db, 'users', profileId));
      if (!profileDoc.exists()) { setNotFound(true); setPageLoading(false); return; }
      setProfile({ id: profileDoc.id, ...profileDoc.data() });

      // Load their posts
      const q = query(
        collection(db, 'posts'),
        where('userId', '==', profileId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));

      setPageLoading(false);
    });
    return () => unsub();
  }, [profileId]);

  const toggleFollow = async () => {
    if (!currentUser || followLoading) return;
    setFollowLoading(true);
    const nowFollowing = !isFollowing;
    setIsFollowing(nowFollowing);
    // Optimistic update follower count
    setProfile((p: any) => ({
      ...p,
      followers: nowFollowing
        ? [...(p.followers || []), currentUser.uid]
        : (p.followers || []).filter((id: string) => id !== currentUser.uid),
    }));
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        following: nowFollowing ? arrayUnion(profileId) : arrayRemove(profileId),
      });
      await updateDoc(doc(db, 'users', profileId), {
        followers: nowFollowing ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid),
      });
      if (nowFollowing) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: profileId,
          fromUserId: currentUser.uid,
          fromUsername: currentUserProfile?.username || 'someone',
          type: 'follow',
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      // Revert on error
      setIsFollowing(!nowFollowing);
      console.error(err);
    }
    setFollowLoading(false);
  };

  const loadLikedPosts = async () => {
    if (likedPosts.length > 0) return;
    setLikedLoading(true);
    try {
      const q = query(
        collection(db, 'posts'),
        where('likes', 'array-contains', profileId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setLikedPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLikedLoading(false);
  };

  const initials = profile?.fullName?.[0]?.toUpperCase() || 'U';
  const followerCount = profile?.followers?.length || 0;
  const followingCount = profile?.following?.length || 0;

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (notFound) return (
    <>
      <Navbar />
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: 'Inter,sans-serif' }}>
        <p style={{ fontSize: 48 }}>👤</p>
        <p style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 17 }}>User not found</p>
        <button onClick={() => router.back()} style={{ padding: '10px 24px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>← Go Back</button>
      </div>
    </>
  );

  const PostCard = ({ post }: { post: any }) => (
    <div
      onClick={() => router.push(`/post/${post.id}`)}
      style={{ padding: '16px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>
          {post.photoURL
            ? <img src={post.photoURL} alt={post.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : post.fullName?.[0]?.toUpperCase() || 'U'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f3f4f6' }}>{post.fullName}</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>@{post.username}</span>
            <span style={{ fontSize: 12, color: '#4b5563', marginLeft: 'auto' }}>{timeAgo(post.createdAt)}</span>
          </div>
          {post.content && <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6, marginBottom: 10 }}>{post.content}</p>}
          {post.imageUrl && (
            <img src={post.imageUrl} alt="" style={{ width: '100%', borderRadius: 12, maxHeight: 200, objectFit: 'cover', marginBottom: 10, border: '0.5px solid rgba(255,255,255,0.05)' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          <div style={{ display: 'flex', gap: 20 }}>
            <span style={{ fontSize: 12, color: '#f472b6' }}>❤️ {post.likes?.length || 0}</span>
            <span style={{ fontSize: 12, color: '#60a5fa' }}>💬 {post.comments?.length || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Navbar />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 100 }}>

        {/* Profile header */}
        <div style={{ background: 'linear-gradient(180deg,rgba(139,92,246,0.08) 0%,transparent 100%)', padding: '24px 20px 0' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>

            {/* Back */}
            <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 22, cursor: 'pointer', padding: '0 0 16px', lineHeight: 1 }}>‹</button>

            {/* Avatar + stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', border: '2.5px solid rgba(139,92,246,0.5)', flexShrink: 0, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: 'white' }}>
                {profile?.photoURL
                  ? <img src={profile.photoURL} alt={profile.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials}
              </div>
              <div style={{ display: 'flex', gap: 24, flex: 1, justifyContent: 'space-around' }}>
                {[
                  { num: posts.length, label: 'Posts' },
                  { num: followerCount, label: 'Followers' },
                  { num: followingCount, label: 'Following' },
                ].map(({ num, label }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 20, fontWeight: 700, color: '#f3f4f6', margin: 0 }}>{num}</p>
                    <p style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, margin: '2px 0 0' }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Name / bio */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', margin: 0 }}>{profile?.fullName}</p>
                {profile?.isVerified && <span style={{ fontSize: 14 }}>✅</span>}
              </div>
              <p style={{ fontSize: 12, color: '#a78bfa', marginBottom: 6 }}>@{profile?.username}</p>
              {profile?.bio && <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5, marginBottom: 12 }}>{profile.bio}</p>}

              {/* Follow / Message buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={toggleFollow}
                  disabled={followLoading}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 12, fontFamily: 'Inter,sans-serif',
                    fontWeight: 700, fontSize: 14, cursor: followLoading ? 'not-allowed' : 'pointer',
                    opacity: followLoading ? 0.7 : 1, border: 'none',
                    background: isFollowing ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
                    color: isFollowing ? '#9ca3af' : 'white',
                    outline: isFollowing ? '1px solid rgba(255,255,255,0.12)' : 'none',
                  }}
                >
                  {followLoading ? '...' : isFollowing ? 'Following' : 'Follow'}
                </button>
                <Link href={`/messages?dm=${profileId}`} style={{ textDecoration: 'none', flex: 1 }}>
                  <button type="button" style={{ width: '100%', padding: '10px 0', borderRadius: 12, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                    Message
                  </button>
                </Link>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
              {(['posts', 'liked'] as const).map(tab => (
                <button key={tab} type="button" onClick={() => { setActiveTab(tab); if (tab === 'liked') loadLikedPosts(); }}
                  style={{ flex: 1, padding: '12px 0', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid #8b5cf6' : '2px solid transparent', color: activeTab === tab ? '#a78bfa' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'all 0.2s' }}>
                  {tab === 'posts' ? '⚡ Posts' : '❤️ Liked'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Posts / Liked */}
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 20px' }}>
          {activeTab === 'posts' && (
            posts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                <p style={{ fontSize: 32, marginBottom: 12 }}>✨</p>
                <p style={{ fontSize: 14 }}>No posts yet.</p>
              </div>
            ) : posts.map(post => <PostCard key={post.id} post={post} />)
          )}

          {activeTab === 'liked' && (
            likedLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : likedPosts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                <p style={{ fontSize: 32, marginBottom: 12 }}>🤍</p>
                <p style={{ fontSize: 14 }}>No liked posts yet.</p>
              </div>
            ) : likedPosts.map(post => <PostCard key={post.id} post={post} />)
          )}
        </div>
      </div>
    </>
  );
}

export default function PublicProfilePage() {
  return <Suspense><PublicProfileContent /></Suspense>;
}
