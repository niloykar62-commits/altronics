'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDocs, orderBy, query,
  serverTimestamp, doc, getDoc, updateDoc,
  arrayUnion, arrayRemove, deleteDoc,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';
import { Heart, MessageCircle, Repeat2, Bookmark, Trash2, Pencil, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

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
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
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
        userId: user.uid,
        username: userProfile?.username || 'anonymous',
        fullName: userProfile?.fullName || user.displayName || 'User',
        content: content.trim(), imageUrl,
        createdAt: serverTimestamp(),
        likes: [], reposts: [],
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
      await addDoc(collection(db, 'notifications'), {
        toUserId, fromUserId: user.uid,
        fromUsername: userProfile?.username || 'someone',
        type, read: false, createdAt: serverTimestamp(), ...extra,
      });
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
    setUserProfile((prev: any) => ({
      ...prev,
      bookmarks: isBookmarked
        ? (prev.bookmarks || []).filter((id: string) => id !== postId)
        : [...(prev.bookmarks || []), postId],
    }));
    try {
      await updateDoc(doc(db, 'users', user.uid), { bookmarks: isBookmarked ? arrayRemove(postId) : arrayUnion(postId) });
    } catch (err) {
      const profileDoc = await getDoc(doc(db, 'users', user.uid));
      if (profileDoc.exists()) setUserProfile(profileDoc.data());
    }
  };

  const repost = async (post: any) => {
    if (!user) return;
    if (post.reposts?.includes(user.uid)) { alert('Already reposted!'); return; }
    if (!confirm(`Repost @${post.username}'s post?`)) return;
    setRepostingId(post.id);
    try {
      await addDoc(collection(db, 'posts'), {
        userId: user.uid, username: userProfile?.username || 'anonymous',
        fullName: userProfile?.fullName || 'User',
        content: post.content, imageUrl: post.imageUrl || null,
        createdAt: serverTimestamp(), likes: [], reposts: [],
        isRepost: true, originalAuthor: post.fullName, originalUsername: post.username,
      });
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
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        userId: user.uid, username: userProfile?.username || 'anonymous',
        fullName: userProfile?.fullName || 'User',
        content: text, createdAt: serverTimestamp(),
      });
      await sendNotification(post.userId, 'comment', { commentText: text.slice(0, 50) });
      setCommentInputs((prev) => ({ ...prev, [post.id]: '' }));
      await loadComments(post.id);
    } catch (err) { console.error(err); }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="text-[var(--accent)] font-bold text-xl animate-pulse">ALTRONICS</div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--background)', minHeight: '100vh' }}>
      <Navbar />
      <div className="max-w-xl mx-auto">

        {/* Create Post */}
        <div className="border-b border-[var(--border)] p-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center font-bold text-white text-sm shrink-0">
              {userProfile?.fullName?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1">
              <Textarea
                placeholder="What's happening?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="border-none bg-transparent text-lg placeholder:text-[var(--muted)] resize-none focus-visible:ring-0 p-0 min-h-[80px]"
                style={{ color: 'var(--foreground)' }}
              />
              {imagePreview && (
                <div className="relative mt-2 rounded-2xl overflow-hidden">
                  <img src={imagePreview} alt="Preview" className="w-full max-h-64 object-cover" />
                  <button
                    onClick={() => { setImage(null); setImagePreview(null); }}
                    className="absolute top-2 right-2 bg-black bg-opacity-60 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold"
                  >✕</button>
                </div>
              )}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                <label className="cursor-pointer text-[var(--accent)] hover:bg-blue-50 dark:hover:bg-blue-950 p-2 rounded-full transition-colors">
                  <Image size={20} />
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </label>
                <button
                  onClick={createPost}
                  disabled={loading || (!content.trim() && !image)}
                  className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-5 py-2 rounded-full transition-colors disabled:opacity-50 text-sm"
                >
                  {loading ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Posts */}
        {posts.length === 0 ? (
          <p className="text-center text-[var(--muted)] py-16">No posts yet. Be the first!</p>
        ) : (
          posts.map((post) => {
            const liked = post.likes?.includes(user?.uid);
            const likeCount = post.likes?.length || 0;
            const isOwner = post.userId === user?.uid;
            const isBookmarked = userProfile?.bookmarks?.includes(post.id);
            const alreadyReposted = post.reposts?.includes(user?.uid);
            const repostCount = post.reposts?.length || 0;

            return (
              <div key={post.id} className="border-b border-[var(--border)] p-4 post-hover transition-colors cursor-pointer">

                {post.isRepost && (
                  <p className="text-xs text-[var(--muted)] mb-2 flex items-center gap-1 ml-13">
                    <Repeat2 size={14} /> Reposted from @{post.originalUsername}
                  </p>
                )}

                <div className="flex gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ color: 'var(--foreground)' }}>
                    {post.fullName?.[0]?.toUpperCase() || 'U'}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Post Header */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm" style={{ color: 'var(--foreground)' }}>{post.fullName}</span>
                        <span className="text-[var(--muted)] text-sm">@{post.username}</span>
                        {post.edited && <span className="text-[var(--muted)] text-xs">· edited</span>}
                        <span className="text-[var(--muted)] text-xs">·</span>
                        <span className="text-[var(--muted)] text-xs">
                          {post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleDateString() : 'now'}
                        </span>
                      </div>
                      {isOwner && (
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingPost(post.id); setEditContent(post.content); }}
                            className="p-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-950 text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => deletePost(post.id)}
                            className="p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-950 text-[var(--muted)] hover:text-red-500 transition-colors">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Edit Mode */}
                    {editingPost === post.id ? (
                      <div className="mb-2">
                        <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3} className="mb-2 text-sm" />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(post.id)} className="bg-[var(--accent)] text-white text-xs font-bold px-4 py-1.5 rounded-full">Save</button>
                          <button onClick={() => setEditingPost(null)} className="border border-[var(--border)] text-xs font-bold px-4 py-1.5 rounded-full" style={{ color: 'var(--foreground)' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {post.content && <p className="text-sm mb-3 leading-relaxed" style={{ color: 'var(--foreground)' }}>{post.content}</p>}
                        {post.imageUrl && <img src={post.imageUrl} alt="Post" className="w-full rounded-2xl max-h-96 object-cover mb-3" />}
                      </>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center justify-between max-w-xs">
                      <button onClick={() => toggleComments(post.id)}
                        className="flex items-center gap-1.5 text-[var(--muted)] hover:text-[var(--accent)] group transition-colors">
                        <span className="p-1.5 rounded-full group-hover:bg-blue-50 dark:group-hover:bg-blue-950 transition-colors">
                          <MessageCircle size={18} />
                        </span>
                        <span className="text-xs">{(comments[post.id] || []).length || ''}</span>
                      </button>

                      {!isOwner && (
                        <button onClick={() => repost(post)} disabled={repostingId === post.id}
                          className={`flex items-center gap-1.5 group transition-colors ${alreadyReposted ? 'text-green-500' : 'text-[var(--muted)] hover:text-green-500'}`}>
                          <span className="p-1.5 rounded-full group-hover:bg-green-50 dark:group-hover:bg-green-950 transition-colors">
                            <Repeat2 size={18} />
                          </span>
                          <span className="text-xs">{repostCount || ''}</span>
                        </button>
                      )}

                      <button onClick={() => toggleLike(post)}
                        className={`flex items-center gap-1.5 group transition-colors ${liked ? 'text-red-500' : 'text-[var(--muted)] hover:text-red-500'}`}>
                        <span className="p-1.5 rounded-full group-hover:bg-red-50 dark:group-hover:bg-red-950 transition-colors">
                          <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
                        </span>
                        <span className="text-xs">{likeCount || ''}</span>
                      </button>

                      <button onClick={() => toggleBookmark(post.id)}
                        className={`flex items-center gap-1.5 group transition-colors ${isBookmarked ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--accent)]'}`}>
                        <span className="p-1.5 rounded-full group-hover:bg-blue-50 dark:group-hover:bg-blue-950 transition-colors">
                          <Bookmark size={18} fill={isBookmarked ? 'currentColor' : 'none'} />
                        </span>
                      </button>
                    </div>

                    {/* Comments */}
                    {showComments[post.id] && (
                      <div className="mt-3 space-y-3">
                        {(comments[post.id] || []).length === 0 ? (
                          <p className="text-xs text-[var(--muted)]">No replies yet.</p>
                        ) : (
                          (comments[post.id] || []).map((comment) => (
                            <div key={comment.id} className="flex gap-2">
                              <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold shrink-0"
                                style={{ color: 'var(--foreground)' }}>
                                {comment.fullName?.[0]?.toUpperCase() || 'U'}
                              </div>
                              <div className="flex-1">
                                <span className="text-xs font-bold" style={{ color: 'var(--foreground)' }}>@{comment.username} </span>
                                <span className="text-xs" style={{ color: 'var(--foreground)' }}>{comment.content}</span>
                              </div>
                            </div>
                          ))
                        )}
                        <div className="flex gap-2 mt-2">
                          <Input
                            placeholder="Post your reply..."
                            value={commentInputs[post.id] || ''}
                            onChange={(e) => setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') addComment(post); }}
                            className="text-sm rounded-full border-[var(--border)] bg-transparent"
                            style={{ color: 'var(--foreground)' }}
                          />
                          <button
                            onClick={() => addComment(post)}
                            disabled={!commentInputs[post.id]?.trim()}
                            className="bg-[var(--accent)] text-white text-xs font-bold px-4 rounded-full disabled:opacity-50"
                          >Reply</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
