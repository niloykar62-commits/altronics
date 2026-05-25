'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  addDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/login'); return; }
      setUser(firebaseUser);
      try {
        const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (profileDoc.exists()) setUserProfile(profileDoc.data());
        await loadPosts();
      } catch (err) { console.error('Feed load error:', err); }
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadPosts = async () => {
    try {
      const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      setPosts(snapshot.docs.map((d) => ({ id: d.id, ...d.data(), likes: d.data().likes || [] })));
    } catch (err) { console.error('Load posts error:', err); }
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
        content: content.trim(),
        imageUrl,
        createdAt: serverTimestamp(),
        likes: [],
        reposts: [],
      });
      setContent(''); setImage(null); setImagePreview(null);
      await loadPosts();
    } catch (err: any) { alert('Failed to post: ' + err.message); }
    setLoading(false);
  };

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post?')) return;
    try { await deleteDoc(doc(db, 'posts', postId)); await loadPosts(); }
    catch (err) { console.error('Delete error:', err); }
  };

  const startEdit = (post: any) => { setEditingPost(post.id); setEditContent(post.content); };

  const saveEdit = async (postId: string) => {
    if (!editContent.trim()) return;
    try {
      await updateDoc(doc(db, 'posts', postId), { content: editContent.trim(), edited: true });
      setEditingPost(null); setEditContent(''); await loadPosts();
    } catch (err) { console.error('Edit error:', err); }
  };

  const sendNotification = async (toUserId: string, type: string, extra?: object) => {
    if (toUserId === user.uid) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        toUserId, fromUserId: user.uid,
        fromUsername: userProfile?.username || 'someone',
        type, read: false, createdAt: serverTimestamp(), ...extra,
      });
    } catch (err) { console.error('Notification error:', err); }
  };

  const toggleLike = async (post: any) => {
    if (!user) return;
    const alreadyLiked = post.likes?.includes(user.uid);
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likes: alreadyLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
      if (!alreadyLiked) await sendNotification(post.userId, 'like');
      await loadPosts();
    } catch (err) { console.error('Like error:', err); }
  };

  const toggleBookmark = async (postId: string) => {
    if (!user) return;
    const isBookmarked = userProfile?.bookmarks?.includes(postId);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        bookmarks: isBookmarked ? arrayRemove(postId) : arrayUnion(postId),
      });
      const profileDoc = await getDoc(doc(db, 'users', user.uid));
      if (profileDoc.exists()) setUserProfile(profileDoc.data());
    } catch (err) { console.error('Bookmark error:', err); }
  };

  const loadComments = async (postId: string) => {
    try {
      const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);
      setComments((prev) => ({ ...prev, [postId]: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) }));
    } catch (err) { console.error('Load comments error:', err); }
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
        fullName: userProfile?.fullName || user.displayName || 'User',
        content: text, createdAt: serverTimestamp(),
      });
      await sendNotification(post.userId, 'comment', { commentText: text.slice(0, 50) });
      setCommentInputs((prev) => ({ ...prev, [post.id]: '' }));
      await loadComments(post.id);
    } catch (err) { console.error('Comment error:', err); }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-gray-500 text-sm">Loading feed...</p>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-2xl mx-auto p-4 pt-6">
        <Card className="mb-8">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 mb-2">
              Posting as <span className="font-medium text-black dark:text-white">@{userProfile?.username || 'you'}</span>
            </p>
            <Textarea placeholder="What's happening on Altronics?" value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
            {imagePreview && (
              <div className="relative mt-3">
                <img src={imagePreview} alt="Preview" className="w-full rounded-lg max-h-64 object-cover" />
                <button onClick={() => { setImage(null); setImagePreview(null); }} className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">✕</button>
              </div>
            )}
            <div className="flex items-center gap-3 mt-3">
              <label className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                📷 Photo
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </label>
            </div>
            <Button onClick={createPost} disabled={loading || (!content.trim() && !image)} className="mt-3 w-full">
              {loading ? 'Posting...' : 'Post'}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {posts.length === 0 ? (
            <p className="text-center text-gray-500 py-12">No posts yet. Be the first to post!</p>
          ) : (
            posts.map((post) => {
              const liked = post.likes?.includes(user?.uid);
              const likeCount = post.likes?.length || 0;
              const isOwner = post.userId === user?.uid;
              const isBookmarked = userProfile?.bookmarks?.includes(post.id);

              return (
                <Card key={post.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 text-sm">
                          {post.fullName?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="font-semibold text-sm dark:text-white">{post.fullName}</p>
                          <p className="text-xs text-gray-400">@{post.username} {post.edited && '· edited'}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {isOwner && (
                          <>
                            <button onClick={() => startEdit(post)} className="text-xs text-gray-400 hover:text-blue-500 px-2 py-1 rounded transition-colors">✏️</button>
                            <button onClick={() => deletePost(post.id)} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded transition-colors">🗑️</button>
                          </>
                        )}
                        <button onClick={() => toggleBookmark(post.id)} className={`text-xs px-2 py-1 rounded transition-colors ${isBookmarked ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}>
                          {isBookmarked ? '🔖' : '🔖'}
                        </button>
                      </div>
                    </div>

                    {editingPost === post.id ? (
                      <div className="mb-3">
                        <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3} className="mb-2" />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(post.id)}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingPost(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {post.content && <p className="text-gray-800 dark:text-gray-200 leading-relaxed mb-3">{post.content}</p>}
                        {post.imageUrl && <img src={post.imageUrl} alt="Post" className="w-full rounded-lg max-h-96 object-cover mb-3" />}
                      </>
                    )}

                    <p className="text-xs text-gray-400">
                      {post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleString() : 'Just now'}
                    </p>

                    <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <button onClick={() => toggleLike(post)} className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${liked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}>
                        {liked ? '❤️' : '🤍'} {likeCount} {likeCount === 1 ? 'Like' : 'Likes'}
                      </button>
                      <button onClick={() => toggleComments(post.id)} className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-blue-400 transition-colors">
                        💬 {showComments[post.id] ? 'Hide' : 'Comments'}
                      </button>
                    </div>

                    {showComments[post.id] && (
                      <div className="mt-4 space-y-3">
                        {(comments[post.id] || []).length === 0 ? (
                          <p className="text-xs text-gray-400">No comments yet.</p>
                        ) : (
                          (comments[post.id] || []).map((comment) => (
                            <div key={comment.id} className="flex gap-2">
                              <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                                {comment.fullName?.[0]?.toUpperCase() || 'U'}
                              </div>
                              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 flex-1">
                                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">@{comment.username}</p>
                                <p className="text-sm text-gray-700 dark:text-gray-300">{comment.content}</p>
                              </div>
                            </div>
                          ))
                        )}
                        <div className="flex gap-2 mt-2">
                          <Input
                            placeholder="Write a comment..."
                            value={commentInputs[post.id] || ''}
                            onChange={(e) => setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') addComment(post); }}
                            className="text-sm"
                          />
                          <Button size="sm" onClick={() => addComment(post)} disabled={!commentInputs[post.id]?.trim()}>Send</Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
