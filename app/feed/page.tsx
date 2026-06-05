'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, getDocs, orderBy, query, limit, startAfter, serverTimestamp, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import Navbar from '@/components/Navbar';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

const PAGE_SIZE = 20;

const inputStyle = { width: '100%', padding: '12px 16px', background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 12, color: '#f3f4f6', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none' };

function postScore(p: any): number {
  const likes = p.likes?.length || 0;
  const reposts = p.reposts?.length || 0;
  const ageMs = p.createdAt?.toDate ? Date.now() - p.createdAt.toDate().getTime() : 0;
  const hoursOld = ageMs / 3600000;
  const recencyBoost = Math.max(0, 48 - hoursOld) * 2;
  return likes * 3 + reposts * 5 + recencyBoost;
}

function timeAgo(ts: any): string {
  if (!ts?.toDate) return 'Just now';
  const diff = Date.now() - ts.toDate().getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return ts.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Feed() {
  const [posts, setPosts] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const [showComments, setShowComments] = useState<{ [key: string]: boolean }>({});
  const [comments, setComments] = useState<{ [key: string]: any[] }>({});
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [repostingId, setRepostingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('following');
  const [followingIds, setFollowingIds] = useState<string[]>([]);   // UIDs this user follows
  const [followerIds, setFollowerIds] = useState<string[]>([]);     // UIDs who follow this user
  const [storyUsers, setStoryUsers] = useState<any[]>([]);          // following users with stories
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastDocRef = useRef<any>(null);
  const { push } = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { push('/login'); return; }
      setUser(firebaseUser);
      try {
        const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (profileDoc.exists()) {
          const profileData = profileDoc.data();
          setUserProfile(profileData);
          const following: string[] = profileData.following || [];
          const followers: string[] = profileData.followers || [];
          setFollowingIds(following);
          setFollowerIds(followers);
          await loadPosts(true);
          await loadStoryUsers(following, firebaseUser.uid);
        } else {
          await loadPosts(true);
        }
      } catch (err) { console.error(err); }
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadPosts = async (reset = true) => {
    try {
      const base = collection(db, 'posts');
      const q = reset || !lastDocRef.current
        ? query(base, orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
        : query(base, orderBy('createdAt', 'desc'), startAfter(lastDocRef.current), limit(PAGE_SIZE));
      const snapshot = await getDocs(q);
      const batch = snapshot.docs.map((d) => ({ id: d.id, ...d.data(), likes: d.data().likes || [], reposts: d.data().reposts || [] }));
      setPosts((prev) => reset ? batch : [...prev, ...batch]);
      lastDocRef.current = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : lastDocRef.current;
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (err) { console.error(err); }
  };

  const loadMorePosts = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await loadPosts(false);
    setLoadingMore(false);
  };

  // Load users you follow who have posted a story in last 24h
  const loadStoryUsers = async (following: string[], myUid: string) => {
    if (following.length === 0) { setStoryUsers([]); return; }
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const seenUids = new Set<string>();
      const users: any[] = [];
      // Add self first
      seenUids.add(myUid);
      users.push({ uid: myUid, isSelf: true });
      snap.docs.forEach((d) => {
        const data = d.data();
        const uid: string = data.userId;
        if (!seenUids.has(uid) && following.includes(uid)) {
          const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
          if (createdAt && createdAt > since) {
            seenUids.add(uid);
            users.push({ uid, fullName: data.fullName || 'User', username: data.username || uid });
          }
        }
      });
      setStoryUsers(users);
    } catch (err) { console.error(err); }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }
    setImage(file); setImagePreview(URL.createObjectURL(file));
  };

  // ✅ Fixed imageUrl: imageUrl ?? null
  const uploadToCloudinary = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET!);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.secure_url) {
      throw new Error('Cloudinary upload failed: ' + (data.error?.message || 'No URL returned'));
    }
    return data.secure_url;
  };

  // ✅ Fixed imageUrl: imageUrl ?? null
  const createPost = async () => {
    if (!content.trim() && !image) return;
    if (!user) return;
    setLoading(true);
    try {
      let imageUrl: string | null = null;
      if (image) imageUrl = await uploadToCloudinary(image);
      await addDoc(collection(db, 'posts'), {
        userId: user.uid,
        username: userProfile?.username || 'anonymous',
        fullName: userProfile?.fullName || 'User',
        photoURL: userProfile?.photoURL || null,
        content: content.trim(),
        imageUrl: imageUrl ?? null,
        createdAt: serverTimestamp(),
        likes: [],
        reposts: [],
      });
      setContent(''); setImage(null); setImagePreview(null);
      await loadPosts(true);
    } catch (err: any) {
      console.error('Post error:', err);
      alert('Failed to post: ' + err.message);
    }
    setLoading(false);
  };

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post?')) return;
    try { await deleteDoc(doc(db, 'posts', postId)); await loadPosts(true); }
    catch (err) { console.error(err); }
  };

  const saveEdit = async (postId: string) => {
    if (!editContent.trim()) return;
    try {
      await updateDoc(doc(db, 'posts', postId), { content: editContent.trim(), edited: true });
      setEditingPost(null); await loadPosts(true);
    } catch (err) { console.error(err); }
  };

  const sendNotification = async (toUserId: string, type: string, extra?: object) => {
    if (toUserId === user.uid) return;
    try {
      await addDoc(collection(db, 'notifications'), { toUserId, fromUserId: user.uid, fromUsername: userProfile?.username || 'someone', type, read: false, createdAt: serverTimestamp(), ...extra });
    } catch (err) { console.error(err); }
  };

  const toggleLike = async (post: any) => {
    if (!user) return;
    const alreadyLiked = post.likes?.includes(user.uid);
    // Optimistic update
    setPosts(prev => prev.map(p => p.id === post.id
      ? { ...p, likes: alreadyLiked ? p.likes.filter((id: string) => id !== user.uid) : [...p.likes, user.uid] }
      : p
    ));
    try {
      await updateDoc(doc(db, 'posts', post.id), { likes: alreadyLiked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
      if (!alreadyLiked) await sendNotification(post.userId, 'like', { postId: post.id });
    } catch (err) {
      // Revert on error
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: post.likes } : p));
      console.error(err);
    }
  };

  const toggleBookmark = async (postId: string) => {
    if (!user) return;
    const isBookmarked = userProfile?.bookmarks?.includes(postId);
    setUserProfile((prev: any) => ({ ...prev, bookmarks: isBookmarked ? (prev.bookmarks || []).filter((id: string) => id !== postId) : [...(prev.bookmarks || []), postId] }));
    try { await updateDoc(doc(db, 'users', user.uid), { bookmarks: isBookmarked ? arrayRemove(postId) : arrayUnion(postId) }); }
    catch (err) { const pd = await getDoc(doc(db, 'users', user.uid)); if (pd.exists()) setUserProfile(pd.data()); }
  };

  const repost = async (post: any) => {
    if (!user || post.reposts?.includes(user.uid)) { alert('Already reposted!'); return; }
    if (!confirm(`Repost @${post.username}'s post?`)) return;
    setRepostingId(post.id);
    try {
      await addDoc(collection(db, 'posts'), {
        userId: user.uid, username: userProfile?.username || 'anonymous',
        fullName: userProfile?.fullName || 'User', content: post.content,
        imageUrl: post.imageUrl ?? null, createdAt: serverTimestamp(),
        likes: [], reposts: [], isRepost: true,
        originalAuthor: post.fullName, originalUsername: post.username,
      });
      await updateDoc(doc(db, 'posts', post.id), { reposts: arrayUnion(user.uid) });
      await sendNotification(post.userId, 'repost', { postId: post.id });
      await loadPosts(true);
    } catch (err) { console.error(err); }
    setRepostingId(null);
  };

  const loadComments = async (postId: string) => {
    try {
      const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);
      setComments((prev) => ({ ...prev, [postId]: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) }));
    } catch (err) { console.error(err); }
  };

  const toggleComments = async (postId: string) => {
    const isShowing = showComments[postId];
    setShowComments((prev) => ({ ...prev, [postId]: !isShowing }));
    if (!isShowing) await loadComments(postId);
  };

  const addComment = async (post: any) => {
    const text = commentInputs[post.id]?.trim();
    if (!text || !user) return;
    try {
      await addDoc(collection(db, 'posts', post.id, 'comments'), { userId: user.uid, username: userProfile?.username || 'anonymous', fullName: userProfile?.fullName || 'User', content: text, createdAt: serverTimestamp() });
      await sendNotification(post.userId, 'comment', { commentText: text.slice(0, 50) });
      setCommentInputs((prev) => ({ ...prev, [post.id]: '' }));
      await loadComments(post.id);
    } catch (err) { console.error(err); }
  };

  // ── Filter posts based on active tab ─────────────────────────────────────
  const visiblePosts = (() => {
    if (activeTab === 'following') {
      // Only posts from people you follow + your own
      return posts.filter((p) => p.userId === user?.uid || followingIds.includes(p.userId));
    }
    if (activeTab === 'foryou') {
      const socialIds = [...new Set([...followingIds, ...followerIds])];
      return posts
        .filter((p) => p.userId === user?.uid || socialIds.includes(p.userId))
        .sort((a, b) => postScore(b) - postScore(a));
    }
    if (activeTab === 'trending') {
      // Trending = all posts sorted by likes
      return [...posts].sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
    }
    return posts;
  })();

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontSize: 40 }}>⚡</span>
      <p style={{ color: '#a78bfa', fontWeight: 700, fontSize: 18, letterSpacing: 2 }}>ALTRONICS</p>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Navbar />
      <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 100 }}>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.02)', borderBottom: '0.5px solid rgba(139,92,246,0.15)', padding: '0 20px' }}>
          {['foryou', 'following', 'trending'].map((tab) => (
            <button type="button" key={tab} role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)}
              style={{ flex: 1, padding: '14px 0', background: 'none', border: 'none', color: activeTab === tab ? '#a78bfa' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderBottom: activeTab === tab ? '2px solid #8b5cf6' : '2px solid transparent', textTransform: 'capitalize', fontFamily: 'Inter,sans-serif', transition: 'color 0.2s, border-color 0.2s' }}>
              {tab === 'foryou' ? 'For You' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Stories Row — real users you follow */}
        <div style={{ display: 'flex', gap: 14, padding: '14px 20px', overflowX: 'auto', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
          {/* Your story — always first */}
          <button type="button" aria-label="Add your story" onClick={() => push('/stories')}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(139,92,246,0.15)', border: '2px dashed rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>➕</div>
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Your Story</span>
          </button>

          {/* Following users with stories */}
          {storyUsers.filter(s => !s.isSelf).map((s) => (
            <button type="button" key={s.uid} aria-label={`View ${s.fullName}'s story`}
              onClick={() => push(`/stories?user=${s.uid}`)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', padding: 2, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#0d0d14', border: '2px solid #0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, color: '#a78bfa' }}>
                  {s.fullName?.[0]?.toUpperCase() || 'U'}
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500, maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.username}</span>
            </button>
          ))}

          {/* Empty state if no stories */}
          {storyUsers.filter(s => !s.isSelf).length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', color: '#4b5563', fontSize: 13, paddingLeft: 4 }}>
              Follow people to see their stories here
            </div>
          )}
        </div>

        {/* Create Post */}
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg,rgba(139,92,246,0.4),rgba(59,130,246,0.4))', border: '1px solid rgba(139,92,246,0.3)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: '#a78bfa' }}>
              {userProfile?.photoURL
                ? <img src={userProfile.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : userProfile?.fullName?.[0]?.toUpperCase() || 'U'}
            </div>
            <div style={{ flex: 1 }}>
              <textarea
                placeholder="What's happening?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#f3f4f6', fontSize: 16, fontFamily: 'Inter,sans-serif', resize: 'none', minHeight: 80, lineHeight: 1.5 }}
              />
              {imagePreview && (
                <div style={{ position: 'relative', marginBottom: 12, borderRadius: 16, overflow: 'hidden' }}>
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview!} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' as const, display: 'block' }} />
                  <button type="button" aria-label="Remove image" onClick={() => { setImage(null); setImagePreview(null); }}
                    style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '0.5px solid rgba(139,92,246,0.15)' }}>
                <label style={{ cursor: 'pointer', color: '#a78bfa', fontSize: 20 }}>
                  📷
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                </label>
                <button type="button" onClick={createPost} disabled={loading || (!content.trim() && !image)}
                  style={{ padding: '8px 24px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (loading || (!content.trim() && !image)) ? 0.5 : 1, fontFamily: 'Inter,sans-serif', boxShadow: '0 2px 12px rgba(139,92,246,0.3)' }}>
                  {loading ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Posts */}
        {visiblePosts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>
              {activeTab === 'following' ? '👥' : activeTab === 'foryou' ? '✨' : '🔥'}
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>
              {activeTab === 'following' ? 'No posts from people you follow' :
               activeTab === 'foryou' ? 'Nothing here yet' : 'No trending posts yet'}
            </p>
            <p style={{ fontSize: 13 }}>
              {activeTab === 'following' ? 'Follow people from Search to see their posts here.' : 'Be the first to post!'}
            </p>
            {activeTab === 'following' && (
              <button type="button" onClick={() => push('/search')}
                style={{ marginTop: 16, padding: '10px 24px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                Find People to Follow
              </button>
            )}
          </div>
        ) : (<>
        {visiblePosts.map((post) => {
          const liked = post.likes?.includes(user?.uid);
          const likeCount = post.likes?.length || 0;
          const isOwner = post.userId === user?.uid;
          const isBookmarked = userProfile?.bookmarks?.includes(post.id);
          const alreadyReposted = post.reposts?.includes(user?.uid);
          const repostCount = post.reposts?.length || 0;

          return (
            <article key={post.id} style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.03)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>

              {post.isRepost && (
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 52 }}>
                  🔄 Reposted from <span style={{ color: '#a78bfa', fontWeight: 600 }}>@{post.originalUsername}</span>
                </p>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#a78bfa', flexShrink: 0 }}>
                  {post.photoURL
                    ? <img src={post.photoURL} alt={post.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : post.fullName?.[0]?.toUpperCase() || 'U'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6' }}>{post.fullName}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>@{post.username}</span>
                      {post.edited && <span style={{ fontSize: 12, color: '#4b5563', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>edited</span>}
                      <span style={{ fontSize: 12, color: '#4b5563' }}>
                        {timeAgo(post.createdAt)}
                      </span>
                    </div>
                    {isOwner && editingPost !== post.id && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" aria-label="Edit post" onClick={() => { setEditingPost(post.id); setEditContent(post.content); }}
                          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 6 }}>✏️</button>
                        <button type="button" aria-label="Delete post" onClick={() => deletePost(post.id)}
                          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 6 }}>🗑️</button>
                      </div>
                    )}
                  </div>

                  {editingPost === post.id ? (
                    <div style={{ marginBottom: 12 }}>
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                        style={{ ...inputStyle, minHeight: 80, resize: 'none' as const, marginBottom: 8 }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => saveEdit(post.id)} style={{ padding: '6px 18px', borderRadius: 16, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Save</button>
                        <button type="button" onClick={() => setEditingPost(null)} style={{ padding: '6px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {post.content && <p style={{ fontSize: 14, color: '#d1d5db', lineHeight: 1.6, marginBottom: 12 }}>{post.content}</p>}
                      {post.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.imageUrl}
                          alt="Post"
                          style={{ width: '100%', borderRadius: 16, maxHeight: 400, objectFit: 'cover' as const, marginBottom: 12, border: '0.5px solid rgba(139,92,246,0.1)', display: 'block' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                    </>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                    <button type="button" aria-label="Toggle comments" onClick={() => toggleComments(post.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, fontFamily: 'Inter,sans-serif' }}>
                      💬 <span>{(comments[post.id] || []).length || ''}</span>
                    </button>
                    {!isOwner && (
                      <button type="button" onClick={() => repost(post)} disabled={repostingId === post.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: alreadyReposted ? '#34d399' : '#6b7280', cursor: 'pointer', fontSize: 13, fontFamily: 'Inter,sans-serif' }}>
                        🔄 <span>{repostCount || ''}</span>
                      </button>
                    )}
                    <button type="button" aria-label={liked ? 'Unlike post' : 'Like post'} onClick={() => toggleLike(post)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: liked ? '#f472b6' : '#6b7280', cursor: 'pointer', fontSize: 13, fontFamily: 'Inter,sans-serif' }}>
                      {liked ? '❤️' : '🤍'} <span>{likeCount || ''}</span>
                    </button>
                    <button type="button" aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark post'} onClick={() => toggleBookmark(post.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: isBookmarked ? '#60a5fa' : '#6b7280', cursor: 'pointer', fontSize: 16, marginLeft: 'auto' }}>
                      {isBookmarked ? '🔖' : '📄'}
                    </button>
                  </div>

                  {/* Comments */}
                  {showComments[post.id] && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
                      {(comments[post.id] || []).length === 0 ? (
                        <p style={{ fontSize: 12, color: '#6b7280' }}>No replies yet.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
                          {(comments[post.id] || []).map((comment) => (
                            <div key={comment.id} style={{ display: 'flex', gap: 10 }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>
                                {comment.fullName?.[0]?.toUpperCase() || 'U'}
                              </div>
                              <div style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '8px 12px', flex: 1 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa' }}>@{comment.username} </span>
                                <span style={{ fontSize: 13, color: '#d1d5db' }}>{comment.content}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          placeholder="Write a reply..."
                          value={commentInputs[post.id] || ''}
                          onChange={(e) => setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') addComment(post); }}
                          style={{ ...inputStyle, flex: 1, padding: '8px 14px', fontSize: 13, borderRadius: 20 }}
                        />
                        <button type="button" onClick={() => addComment(post)} disabled={!commentInputs[post.id]?.trim()}
                          style={{ padding: '8px 18px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif', opacity: !commentInputs[post.id]?.trim() ? 0.5 : 1 }}>
                          Reply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {hasMore && (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <button type="button" onClick={loadMorePosts} disabled={loadingMore}
              style={{ padding: '10px 28px', borderRadius: 20, background: 'rgba(139,92,246,0.12)', border: '0.5px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: 13, fontWeight: 700, cursor: loadingMore ? 'not-allowed' : 'pointer', fontFamily: 'Inter,sans-serif', opacity: loadingMore ? 0.6 : 1 }}>
              {loadingMore ? 'Loading…' : 'Load more posts'}
            </button>
          </div>
        )}
        </>)}
      </div>
    </div>
  );
}
