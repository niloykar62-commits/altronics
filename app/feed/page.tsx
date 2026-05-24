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
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

export default function Feed() {
  const [posts, setPosts] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const [showComments, setShowComments] = useState<{ [key: string]: boolean }>({});
  const [comments, setComments] = useState<{ [key: string]: any[] }>({});
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push('/login');
        return;
      }
      setUser(firebaseUser);

      try {
        const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (profileDoc.exists()) {
          setUserProfile(profileDoc.data());
        }
        await loadPosts();
      } catch (err: any) {
        console.error('Feed load error:', err);
      }

      setPageLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadPosts = async () => {
    try {
      const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const postList = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        likes: d.data().likes || [],
      }));
      setPosts(postList);
    } catch (err: any) {
      console.error('Load posts error:', err);
    }
  };

  const createPost = async () => {
    if (!content.trim() || !user) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'posts'), {
        userId: user.uid,
        username: userProfile?.username || 'anonymous',
        fullName: userProfile?.fullName || user.displayName || 'User',
        content: content.trim(),
        createdAt: serverTimestamp(),
        likes: [],
      });
      setContent('');
      await loadPosts();
    } catch (err: any) {
      alert('Failed to post: ' + err.message);
    }
    setLoading(false);
  };

  const toggleLike = async (post: any) => {
    if (!user) return;
    const postRef = doc(db, 'posts', post.id);
    const alreadyLiked = post.likes?.includes(user.uid);

    try {
      await updateDoc(postRef, {
        likes: alreadyLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
      await loadPosts();
    } catch (err: any) {
      console.error('Like error:', err);
    }
  };

  const loadComments = async (postId: string) => {
    try {
      const q = query(
        collection(db, 'posts', postId, 'comments'),
        orderBy('createdAt', 'asc')
      );
      const snapshot = await getDocs(q);
      const commentList = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setComments((prev) => ({ ...prev, [postId]: commentList }));
    } catch (err: any) {
      console.error('Load comments error:', err);
    }
  };

  const toggleComments = async (postId: string) => {
    const isShowing = showComments[postId];
    setShowComments((prev) => ({ ...prev, [postId]: !isShowing }));
    if (!isShowing) {
      await loadComments(postId);
    }
  };

  const addComment = async (postId: string) => {
    const text = commentInputs[postId]?.trim();
    if (!text || !user) return;

    try {
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        userId: user.uid,
        username: userProfile?.username || 'anonymous',
        fullName: userProfile?.fullName || user.displayName || 'User',
        content: text,
        createdAt: serverTimestamp(),
      });
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
      await loadComments(postId);
    } catch (err: any) {
      console.error('Comment error:', err);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Loading feed...</p>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-2xl mx-auto p-4 pt-6">

        {/* Create Post Box */}
        <Card className="mb-8">
          <CardContent className="p-4">
            <p className="text-sm text-gray-500 mb-2">
              Posting as{' '}
              <span className="font-medium text-black">
                @{userProfile?.username || 'you'}
              </span>
            </p>
            <Textarea
              placeholder="What's happening on Altronics?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
            />
            <Button
              onClick={createPost}
              disabled={loading || !content.trim()}
              className="mt-3 w-full"
            >
              {loading ? 'Posting...' : 'Post'}
            </Button>
          </CardContent>
        </Card>

        {/* Posts List */}
        <div className="space-y-4">
          {posts.length === 0 ? (
            <p className="text-center text-gray-500 py-12">
              No posts yet. Be the first to post!
            </p>
          ) : (
            posts.map((post) => {
              const liked = post.likes?.includes(user?.uid);
              const likeCount = post.likes?.length || 0;

              return (
                <Card key={post.id}>
                  <CardContent className="p-5">

                    {/* Post Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 text-sm">
                        {post.fullName?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{post.fullName}</p>
                        <p className="text-xs text-gray-400">@{post.username}</p>
                      </div>
                    </div>

                    {/* Post Content */}
                    <p className="text-gray-800 leading-relaxed">{post.content}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {post.createdAt?.toDate
                        ? new Date(post.createdAt.toDate()).toLocaleString()
                        : 'Just now'}
                    </p>

                    {/* Like & Comment Buttons */}
                    <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => toggleLike(post)}
                        className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                          liked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'
                        }`}
                      >
                        {liked ? '❤️' : '🤍'} {likeCount} {likeCount === 1 ? 'Like' : 'Likes'}
                      </button>

                      <button
                        onClick={() => toggleComments(post.id)}
                        className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-blue-400 transition-colors"
                      >
                        💬 {showComments[post.id] ? 'Hide' : 'Comments'}
                      </button>
                    </div>

                    {/* Comments Section */}
                    {showComments[post.id] && (
                      <div className="mt-4 space-y-3">
                        {/* Existing Comments */}
                        {(comments[post.id] || []).length === 0 ? (
                          <p className="text-xs text-gray-400">No comments yet.</p>
                        ) : (
                          (comments[post.id] || []).map((comment) => (
                            <div key={comment.id} className="flex gap-2">
                              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                                {comment.fullName?.[0]?.toUpperCase() || 'U'}
                              </div>
                              <div className="bg-gray-50 rounded-lg px-3 py-2 flex-1">
                                <p className="text-xs font-semibold text-gray-700">
                                  @{comment.username}
                                </p>
                                <p className="text-sm text-gray-700">{comment.content}</p>
                              </div>
                            </div>
                          ))
                        )}

                        {/* Add Comment Input */}
                        <div className="flex gap-2 mt-2">
                          <Input
                            placeholder="Write a comment..."
                            value={commentInputs[post.id] || ''}
                            onChange={(e) =>
                              setCommentInputs((prev) => ({
                                ...prev,
                                [post.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addComment(post.id);
                            }}
                            className="text-sm"
                          />
                          <Button
                            size="sm"
                            onClick={() => addComment(post.id)}
                            disabled={!commentInputs[post.id]?.trim()}
                          >
                            Send
                          </Button>
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
