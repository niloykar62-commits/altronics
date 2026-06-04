'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, getDocs, doc, getDoc, updateDoc, arrayRemove, query, where,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';

export default function Bookmarks() {
  const [user, setUser] = useState<any>(null);
  const [bookmarkedPosts, setBookmarkedPosts] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/login'); return; }
      setUser(firebaseUser);
      const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (profileDoc.exists()) {
        await loadBookmarks(profileDoc.data().bookmarks || []);
      }
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadBookmarks = async (bookmarkIds: string[]) => {
    if (bookmarkIds.length === 0) { setBookmarkedPosts([]); return; }
    try {
      // Fetch only the bookmarked posts by ID — no full collection scan
      const chunks: string[][] = [];
      for (let i = 0; i < bookmarkIds.length; i += 30) {
        chunks.push(bookmarkIds.slice(i, i + 30));
      }
      const results = await Promise.all(
        chunks.map(chunk =>
          getDocs(query(collection(db, 'posts'), where('__name__', 'in', chunk)))
        )
      );
      const posts = results.flatMap(snap =>
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      // Preserve the original bookmark order
      const ordered = bookmarkIds
        .map(id => posts.find((p: any) => p.id === id))
        .filter(Boolean);
      setBookmarkedPosts(ordered);
    } catch (err) { console.error(err); }
  };

  const removeBookmark = async (postId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { bookmarks: arrayRemove(postId) });
      setBookmarkedPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) { console.error(err); }
  };

  const avatarColors = [
    { bg: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', color: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
    { bg: 'linear-gradient(135deg,rgba(59,130,246,0.3),rgba(52,211,153,0.3))', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
    { bg: 'linear-gradient(135deg,rgba(236,72,153,0.3),rgba(139,92,246,0.3))', color: '#f472b6', border: 'rgba(236,72,153,0.3)' },
  ];

  if (pageLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: '#6b7280', fontSize: 13, fontFamily: 'Inter,sans-serif' }}>Loading bookmarks...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 100 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 0' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
              📌 Bookmarks
            </h1>
            {bookmarkedPosts.length > 0 && (
              <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 400 }}>
                {bookmarkedPosts.length} saved
              </span>
            )}
          </div>

          {/* Empty state */}
          {bookmarkedPosts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 32 }}>
                📌
              </div>
              <p style={{ color: '#9ca3af', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No bookmarks yet</p>
              <p style={{ color: '#4b5563', fontSize: 13 }}>Tap the bookmark icon on any post to save it here.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {bookmarkedPosts.map((post: any, idx) => {
                const av = avatarColors[idx % 3];
                return (
                  <div
                    key={post.id}
                    style={{ padding: '18px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}
                  >
                    {/* Post header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: av.bg, border: `1px solid ${av.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: av.color, flexShrink: 0 }}>
                        {post.fullName?.[0]?.toUpperCase() || 'U'}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Name row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6' }}>{post.fullName}</span>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>@{post.username}</span>
                          </div>
                          {/* Remove bookmark button */}
                          <button
                            onClick={() => removeBookmark(post.id)}
                            title="Remove bookmark"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#60a5fa', padding: '0 2px', lineHeight: 1, transition: 'opacity 0.2s' }}
                            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.6')}
                            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
                          >
                            🔖
                          </button>
                        </div>

                        {/* Content */}
                        {post.content && (
                          <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6, marginBottom: 10 }}>{post.content}</p>
                        )}

                        {/* Image */}
                        {post.imageUrl && (
                          <img
                            src={post.imageUrl}
                            alt="Post"
                            style={{ width: '100%', borderRadius: 14, maxHeight: 240, objectFit: 'cover', marginBottom: 10, border: '0.5px solid rgba(255,255,255,0.06)' }}
                          />
                        )}

                        {/* Footer stats */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <span style={{ fontSize: 12, color: '#f472b6' }}>❤️ {post.likes?.length || 0}</span>
                          <span style={{ fontSize: 12, color: '#60a5fa' }}>💬 {post.comments?.length || 0}</span>
                          <span style={{ fontSize: 11, color: '#4b5563', marginLeft: 'auto' }}>
                            {post.createdAt?.toDate
                              ? new Date(post.createdAt.toDate()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                              : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
