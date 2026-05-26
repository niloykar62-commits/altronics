'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, getDocs, orderBy, query, serverTimestamp, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import Navbar from '@/components/Navbar';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

const inputStyle = { width: '100%', padding: '12px 16px', background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 12, color: '#f3f4f6', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none' };

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
  const [activeTab, setActiveTab] = useState('foryou');
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/login'); return; }
      setUser(firebaseUser);
      try {
        const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (profileDoc.exists()) setUserProfile(profileDoc.data());
        await loadPosts();
      } catch (err) { console.error(err); }
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadPosts = async () => {
    try {
      const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      setPosts(snapshot.docs.map((d) => ({ id: d.id, ...d.data(), likes: d.data().likes || [], reposts: d.data().reposts || [] })));
    } catch (err) { console.error(err); }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }
    setImage(file); setImagePreview(URL.createObjectURL(file));
  };

  const uploadToCloudinary = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET!);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    return data.secure_url;
  };

  const createPost = async () => {
    if (!content.trim() && !image) return;
    if (!user) return;
    setLoading(true);
    try {
      let imageUrl = null;
      if (image) imageUrl = await uploadToCloudinary(image);
      await addDoc(collection(db, 'posts'), {
        userId: user.uid, username: userProfile?.username || 'anonymous',
        fullName: userProfile?.fullName || 'User', content: content.trim(),
        imageUrl: imageUrl ?? null, createdAt: serverTimestamp(), likes: [], reposts: [],
      });
      setContent(''); setImage(null); setImagePreview(null);
      await loadPosts();
    } catch (err: any) { alert('Failed to post: ' + err.message); }
    setLoading(false);
  };

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post?')) return;
    try { await deleteDoc(doc(db, 'posts', postId)); await loadPosts(); }
    catch (err) { console.error(err); }
  };

  const saveEdit = async (postId: string) => {
    if (!editContent.trim()) return;
    try {
      await updateDoc(doc(db, 'posts', postId), { content: editContent.trim(), edited: true });
      setEditingPost(null); await loadPosts();
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
    try {
      await updateDoc(doc(db, 'posts', post.id), { likes: alreadyLiked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
      if (!alreadyLiked) await sendNotification(post.userId, 'like');
      await loadPosts();
    } catch (err) { console.error(err); }
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
      await addDoc(collection(db, 'posts'), { userId: user.uid, username: userProfile?.username || 'anonymous', fullName: userProfile?.fullName || 'User', content: post.content, imageUrl: post.imageUrl || null, createdAt: serverTimestamp(), likes: [], reposts: [], isRepost: true, originalAuthor: post.fullName, originalUsername: post.username });
      await updateDoc(doc(db, 'posts', post.id), { reposts: arrayUnion(user.uid) });
      await sendNotification(post.userId, 'repost');
      await loadPosts();
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

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontSize: 40 }}>⚡</span>
      <p style={{ color: '#a78bfa', fontWeight: 700, fontSize: 18, letterSpacing: 2 }}>ALTRONICS</p>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif' }}>
      <Navbar />
      <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 100 }}>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.02)', borderBottom: '0.5px solid rgba(139,92,246,0.15)', padding: '0 20px' }}>
          {['foryou', 'following', 'trending'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ flex: 1, padding: '14px 0', background: 'none', border: 'none', color: activeTab === tab ? '#a78bfa' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderBottom: activeTab === tab ? '2px solid #8b5cf6' : '2px solid transparent', textTransform: 'capitalize', fontFamily: 'Inter,sans-serif', transition: 'all 0.2s' }}>
              {tab === 'foryou' ? 'For You' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Stories Row */}
        <div style={{ display: 'flex', gap: 16, padding: '16px 20px', overflowX: 'auto', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
          {[{ emoji: '➕', name: 'Your Story', add: true }, { emoji: '🎮', name: 'alex_x' }, { emoji: '🎨', name: 'nova' }, { emoji: '🚀', name: 'kai.dev' }, { emoji: '🌙', name: 'luna' }].map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, cursor: 'pointer' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', padding: 2, background: s.add ? 'rgba(139,92,246,0.2)' : 'linear-gradient(135deg,#8b5cf6,#3b82f6)' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#0d0d14', border: '2px solid #0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  {s.emoji}
                </div>
              </div>
              <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>{s.name}</span>
            </div>
          ))}
        </div>

        {/* Create Post */}
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(139,92,246,0.4),rgba(59,130,246,0.4))', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: '#a78bfa', flexShrink: 0 }}>
              {userProfile?.fullName?.[0]?.toUpperCase() || 'U'}
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
                  <img src={imagePreview} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
                  <button onClick={() => { setImage(null); setImagePreview(null); }}
                    style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '0.5px solid rgba(139,92,246,0.15)' }}>
                <label style={{ cursor: 'pointer', color: '#a78bfa', fontSize: 20 }}>
                  📷
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                </label>
                <button onClick={createPost} disabled={loading || (!content.trim() && !image)}
                  style={{ padding: '8px 24px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (loading || (!content.trim() && !image)) ? 0.5 : 1, fontFamily: 'Inter,sans-serif', boxShadow: '0 2px 12px rgba(139,92,246,0.3)' }}>
                  {loading ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Posts */}
        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
            <p>No posts yet. Be the first!</p>
          </div>
        ) : posts.map((post) => {
          const liked = post.likes?.includes(user?.uid);
          const likeCount = post.likes?.length || 0;
          const isOwner = post.userId === user?.uid;
          const isBookmarked = userProfile?.bookmarks?.includes(post.id);
          const alreadyReposted = post.reposts?.includes(user?.uid);
          const repostCount = post.reposts?.length || 0;

          return (
            <div key={post.id} style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.03)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>

              {post.isRepost && (
                <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 52 }}>
                  🔄 Reposted from <span style={{ color: '#a78bfa', fontWeight: 600 }}>@{post.originalUsername}</span>
                </p>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#a78bfa', flexShrink: 0 }}>
                  {post.fullName?.[0]?.toUpperCase() || 'U'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6' }}>{post.fullName}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>@{post.username}</span>
                      {post.edited && <span style={{ fontSize: 10, color: '#4b5563', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>edited</span>}
                      <span style={{ fontSize: 11, color: '#4b5563' }}>
                        {post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleDateString() : 'now'}
                      </span>
                    </div>
                    {isOwner && editingPost !== post.id && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => { setEditingPost(post.id); setEditContent(post.content); }}
                          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 6, transition: 'color 0.2s' }}>✏️</button>
                        <button onClick={() => deletePost(post.id)}
                          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 6 }}>🗑️</button>
                      </div>
                    )}
                  </div>

                  {editingPost === post.id ? (
                    <div style={{ marginBottom: 12 }}>
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                        style={{ ...inputStyle, minHeight: 80, resize: 'none' as const, marginBottom: 8 }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => saveEdit(post.id)} style={{ padding: '6px 18px', borderRadius: 16, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Save</button>
                        <button onClick={() => setEditingPost(null)} style={{ padding: '6px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {post.content && <p style={{ fontSize: 14, color: '#d1d5db', lineHeight: 1.6, marginBottom: 12 }}>{post.content}</p>}
                      {post.imageUrl && <img src={post.imageUrl} alt="Post" style={{ width: '100%', borderRadius: 16, maxHeight: 360, objectFit: 'cover', marginBottom: 12, border: '0.5px solid rgba(139,92,246,0.1)' }} />}
                    </>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                    <button onClick={() => toggleComments(post.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, fontFamily: 'Inter,sans-serif', transition: 'color 0.2s' }}>
                      💬 <span>{(comments[post.id] || []).length || ''}</span>
                    </button>

                    {!isOwner && (
                      <button onClick={() => repost(post)} disabled={repostingId === post.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: alreadyReposted ? '#34d399' : '#6b7280', cursor: 'pointer', fontSize: 13, fontFamily: 'Inter,sans-serif', transition: 'color 0.2s' }}>
                        🔄 <span>{repostCount || ''}</span>
                      </button>
                    )}

                    <button onClick={() => toggleLike(post)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: liked ? '#f472b6' : '#6b7280', cursor: 'pointer', fontSize: 13, fontFamily: 'Inter,sans-serif', transition: 'color 0.2s' }}>
                      {liked ? '❤️' : '🤍'} <span>{likeCount || ''}</span>
                    </button>

                    <button onClick={() => toggleBookmark(post.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: isBookmarked ? '#60a5fa' : '#6b7280', cursor: 'pointer', fontSize: 16, marginLeft: 'auto', transition: 'color 0.2s' }}>
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
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>
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
                        <button onClick={() => addComment(post)} disabled={!commentInputs[post.id]?.trim()}
                          style={{ padding: '8px 18px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif', opacity: !commentInputs[post.id]?.trim() ? 0.5 : 1 }}>
                          Reply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
