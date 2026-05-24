'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push('/login');
        return;
      }
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
    if (profileDoc.exists()) setUserProfile(profileDoc.data());
  };

  const loadAllUsers = async (uid: string) => {
    const snapshot = await getDocs(collection(db, 'users'));
    const users = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u: any) => u.id !== uid);
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

    if (!q.trim()) {
      setFilteredUsers(allUsers);
      setFilteredPosts(allPosts);
      return;
    }

    // Filter users
    setFilteredUsers(
      allUsers.filter(
        (u: any) =>
          u.username?.toLowerCase().includes(lower) ||
          u.fullName?.toLowerCase().includes(lower) ||
          u.bio?.toLowerCase().includes(lower)
      )
    );

    // Filter posts
    setFilteredPosts(
      allPosts.filter((p: any) =>
        p.content?.toLowerCase().includes(lower) ||
        p.username?.toLowerCase().includes(lower) ||
        p.fullName?.toLowerCase().includes(lower)
      )
    );
  };

  const toggleFollow = async (targetUserId: string) => {
    if (!user) return;
    const isFollowing = userProfile?.following?.includes(targetUserId);
    const myRef = doc(db, 'users', user.uid);
    const targetRef = doc(db, 'users', targetUserId);

    try {
      await updateDoc(myRef, {
        following: isFollowing ? arrayRemove(targetUserId) : arrayUnion(targetUserId),
      });
      await updateDoc(targetRef, {
        followers: isFollowing ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
      await loadCurrentUserProfile(user.uid);
    } catch (err) {
      console.error('Follow error:', err);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-2xl mx-auto p-4 pt-6">
        <h1 className="text-xl font-bold mb-4 dark:text-white">🔍 Search</h1>

        {/* Search Input */}
        <Input
          placeholder="Search users, posts, keywords..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="mb-4"
          autoFocus
        />

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <Button
            size="sm"
            variant={activeTab === 'users' ? 'default' : 'outline'}
            onClick={() => setActiveTab('users')}
          >
            👤 Users ({filteredUsers.length})
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'posts' ? 'default' : 'outline'}
            onClick={() => setActiveTab('posts')}
          >
            📝 Posts ({filteredPosts.length})
          </Button>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-3">
            {filteredUsers.length === 0 ? (
              <p className="text-center text-gray-400 py-8">No users found.</p>
            ) : (
              filteredUsers.map((u: any) => {
                const isFollowing = userProfile?.following?.includes(u.id);
                return (
                  <Card key={u.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300">
                          {u.fullName?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="font-semibold text-sm dark:text-white">{u.fullName}</p>
                          <p className="text-xs text-gray-400">@{u.username}</p>
                          {u.bio && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {u.bio}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">
                            {u.followers?.length || 0} followers
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={isFollowing ? 'outline' : 'default'}
                        onClick={() => toggleFollow(u.id)}
                      >
                        {isFollowing ? 'Unfollow' : 'Follow'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* Posts Tab */}
        {activeTab === 'posts' && (
          <div className="space-y-3">
            {filteredPosts.length === 0 ? (
              <p className="text-center text-gray-400 py-8">No posts found.</p>
            ) : (
              filteredPosts.map((post: any) => (
                <Card key={post.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-xs text-gray-600 dark:text-gray-300">
                        {post.fullName?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <span className="text-sm font-semibold dark:text-white">
                          {post.fullName}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">@{post.username}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{post.content}</p>
                    {post.imageUrl && (
                      <img
                        src={post.imageUrl}
                        alt="Post"
                        className="w-full rounded-lg max-h-48 object-cover mt-2"
                      />
                    )}
                    <div className="flex items-center gap-3 mt-2">
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
        )}
      </div>
    </>
  );
}
