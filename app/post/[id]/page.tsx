'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  doc, getDoc, getDocs, collection, addDoc, updateDoc,
  query, orderBy, serverTimestamp, arrayUnion, arrayRemove,
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
  return ts.toDate().toLocaleDateString();
}

function PostDetailContent() {
  const params = useParams();
  const postId = params?.id as string;
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fu) => {
      if (!fu) { router.push('/login'); return; }
      setUser(fu);
      const pd = await getDoc(doc(db, 'users', fu.uid));
      if (pd.exists()) setUserProfile(pd.data());
      await loadPost(fu);
      setPageLoading(false);
    });
    return () => unsub();
  }, [postId]);

  const loadPost = async (fu: any) => {
    try {
      const snap = await getDoc(doc(db, 'posts', postId));
      if (!snap.exists()) { setNotFound(true); return; }
      setPost({ id: snap.id, ...snap.data() });
      await loadComments();
    } catch { setNotFound(true); }
  };

  const loadComments = async () => {
    try {
      const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
      const snap = await getDocs(q);
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  };

  const toggleLike = async () => {
    if (!user || !post) return;
    const alreadyLiked = post.likes?.includes(user.uid);
    const newLikes = alreadyLiked
      ? post.likes.filter((id: string) => id !== user.uid)
      : [...(post.likes || []), user.uid];
    setPost((p: any) => ({ ...p, likes: newLikes }));
    try {
      await updateDoc(doc(db, 'posts', postId), {
        likes: alreadyLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
      if (!alreadyLiked && post.userId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: post.userId, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'like', postId, read: false, createdAt: serverTimestamp(),
        });
      }
    } catch { setPost((p: any) => ({ ...p, likes: post.likes })); }
  };

  const addComment = async () => {
    const text = commentText.trim();
    if (!text || !user || submitting) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        userId: user.uid,
        username: userProfile?.username || 'anonymous',
        fullName: userProfile?.fullName || 'User',
        content: text,
        createdAt: serverTimestamp(),
      });
      if (post.userId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: post.userId, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'comment', postId, commentText: text.slice(0, 50),
          read: false, createdAt: serverTimestamp(),
        });
      }
      setCommentText('');
      await loadComments();
    } catch (err) { console.error(err); }
    setSubmitting(false);
  };

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '10px 14px',
    background: 'rgba(139,92,246,0.08)',
    border: '0.5px solid rgba(139,92,246,0.2)',
    borderRadius: 20, color: '#f3f4f6', fontSize: 13,
    fontFamily: 'Inter,sans-serif', outline: 'none',
  };

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
        <p style={{ fontSize: 48 }}>🔍</p>
        <p style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 17 }}>Post not found</p>
        <p style={{ color: '#6b7280', fontSize: 13 }}>This post may have been deleted.</p>
        <button onClick={() => router.push('/feed')} style={{ padding: '10px 24px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>← Back to Feed</button>
      </div>
    </>
  );

  const liked = post.likes?.includes(user?.uid);
  const likeCount = post.likes?.length || 0;

  return (
    <>
      <Navbar />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Lightbox */}
      {lightbox && post.imageUrl && (
        <div onClick={() => setLightbox(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={post.imageUrl} alt="Post" style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12 }} />
          <button onClick={() => setLightbox(false)} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: 22, width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      )}

      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 100 }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>

          {/* Back button */}
          <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0 }}>‹</button>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6' }}>Post</span>
          </div>

          {/* Post card */}
          <article style={{ padding: '20px 20px 0' }}>
            {/* Author row */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <Link href={`/profile/${post.userId}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: '#a78bfa' }}>
                  {post.photoURL
                    ? <img src={post.photoURL} alt={post.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : post.fullName?.[0]?.toUpperCase() || 'U'}
                </div>
              </Link>
              <div style={{ flex: 1 }}>
                <Link href={`/profile/${post.userId}`} style={{ textDecoration: 'none' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#f3f4f6', margin: 0 }}>{post.fullName}</p>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>@{post.username} · {timeAgo(post.createdAt)}</p>
                </Link>
              </div>
            </div>

            {/* Repost banner */}
            {post.isRepost && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                🔄 Reposted from <span style={{ color: '#a78bfa', fontWeight: 600 }}>@{post.originalUsername}</span>
              </div>
            )}

            {/* Content */}
            {post.content && (
              <p style={{ fontSize: 16, color: '#e5e7eb', lineHeight: 1.7, marginBottom: 14 }}>{post.content}</p>
            )}

            {/* Image */}
            {post.imageUrl && (
              <div onClick={() => setLightbox(true)} style={{ cursor: 'zoom-in', marginBottom: 14 }}>
                <img src={post.imageUrl} alt="Post" style={{ width: '100%', borderRadius: 16, maxHeight: 480, objectFit: 'cover', border: '0.5px solid rgba(139,92,246,0.1)', display: 'block' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            )}

            {post.edited && (
              <p style={{ fontSize: 11, color: '#4b5563', marginBottom: 10 }}>· edited</p>
            )}

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 20, padding: '12px 0', borderTop: '0.5px solid rgba(255,255,255,0.05)', borderBottom: '0.5px solid rgba(255,255,255,0.05)', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                <span style={{ fontWeight: 700, color: '#f3f4f6' }}>{likeCount}</span> {likeCount === 1 ? 'Like' : 'Likes'}
              </span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                <span style={{ fontWeight: 700, color: '#f3f4f6' }}>{comments.length}</span> {comments.length === 1 ? 'Reply' : 'Replies'}
              </span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                <span style={{ fontWeight: 700, color: '#f3f4f6' }}>{post.reposts?.length || 0}</span> Reposts
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 4, padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.05)', marginBottom: 16 }}>
              <button type="button" onClick={toggleLike}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', background: 'none', border: 'none', color: liked ? '#f472b6' : '#6b7280', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif', borderRadius: 10, transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(244,114,182,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                {liked ? '❤️' : '🤍'} Like
              </button>
              <button type="button" onClick={() => document.getElementById('comment-input')?.focus()}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif', borderRadius: 10, transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(96,165,250,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                💬 Reply
              </button>
            </div>
          </article>

          {/* Comments */}
          <div style={{ padding: '0 20px' }}>
            {comments.length === 0 ? (
              <p style={{ color: '#4b5563', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No replies yet. Be the first! 💬</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                {comments.map((c) => (
                  <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                    <Link href={`/profile/${c.userId}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#a78bfa' }}>
                        {c.fullName?.[0]?.toUpperCase() || 'U'}
                      </div>
                    </Link>
                    <div style={{ flex: 1 }}>
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: '4px 16px 16px 16px', padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#f3f4f6' }}>{c.fullName}</span>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>@{c.username}</span>
                          <span style={{ fontSize: 11, color: '#4b5563', marginLeft: 'auto' }}>{timeAgo(c.createdAt)}</span>
                        </div>
                        <p style={{ fontSize: 13, color: '#d1d5db', margin: 0, lineHeight: 1.5 }}>{c.content}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Comment input */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 20 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#a78bfa', flexShrink: 0 }}>
                {userProfile?.fullName?.[0]?.toUpperCase() || 'U'}
              </div>
              <input
                id="comment-input"
                placeholder="Write a reply..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addComment(); }}
                style={inputStyle}
              />
              <button type="button" onClick={addComment} disabled={!commentText.trim() || submitting}
                style={{ padding: '10px 18px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: commentText.trim() ? 'pointer' : 'not-allowed', opacity: commentText.trim() ? 1 : 0.5, fontFamily: 'Inter,sans-serif', flexShrink: 0 }}>
                {submitting ? '...' : 'Reply'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PostPage() {
  return <Suspense><PostDetailContent /></Suspense>;
}
