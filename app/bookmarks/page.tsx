'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  query,
  where,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Bookmarks() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [bookmarkedPosts, setBookmarkedPosts] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/login'); return; }
      setUser(firebaseUser);
      const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (profileDoc.exists()) {
        const data = profileDoc.data();
        setUserProfile(data);
        await loadBookmarks(data.bookmarks || []);
      }
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadBookmarks = async (bookmarkIds: string[]) => {
    if (bookmarkIds.length === 0) { setBookmarkedPosts([]); return; }
    try {
      const snapshot = await getDocs(collection(db, 'posts'));
      const posts = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p: any) => bookmarkIds.includes(p.id));
      setBookmarkedPosts(posts);
    } catch (err) {
      console.error('Bookmarks error:', err);
    }
  };

  const removeBookmark = async (postId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        bookmarks: arrayRemove(postId),
      });
      setBookmarkedPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      console.error('Remove bookmark error:', err);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading bookmarks...</p>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-2xl mx-auto p-4 pt-6">
        <h1 className="text-xl font-bold mb-4 dark:text-white">
          📌 Bookmarks
          <span className="ml-2 text-sm font-normal text-gray-400">
            {bookmarkedPosts.length} saved
          </span>
        </h1>

        <div className="space-y-4">
          {bookmarkedPosts.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">📌</p>
              <p className="text-gray-500">No bookmarks yet.</p>
              <p className="text-gray-400 text-sm mt-1">
                Tap the bookmark icon on any post to save it here.
              </p>
            </div>
          ) : (
            bookmarkedPosts.map((post: any) => (
              <Card key={post.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 text-sm">
                        {post.fullName?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <p className="font-semibold text-sm dark:text-white">{post.fullName}</p>
                        <p className="text-xs text-gray-400">@{post.username}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeBookmark(post.id)}
                      className="text-yellow-500 hover:text-gray-400 transition-colors text-lg"
                      title="Remove bookmark"
                    >
                      🔖
                    </button>
                  </div>

                  {post.content && (
                    <p className="text-gray-800 dark:text-gray-200 leading-relaxed mb-3">
                      {post.content}
                    </p>
                  )}
                  {post.imageUrl && (
                    <img
                      src={post.imageUrl}
                      alt="Post"
                      className="w-full rounded-lg max-h-64 object-cover mb-3"
                    />
                  )}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      ❤️ {post.likes?.length || 0} likes
                    </span>
                    <span className="text-xs text-gray-400">
                      {post.createdAt?.toDate
                        ? new Date(post.createdAt.toDate()).toLocaleDateString()
                        : ''}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </>
  );
}
