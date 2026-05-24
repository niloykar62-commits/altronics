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
  const [filtered, setFiltered] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
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
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadCurrentUserProfile = async (uid: string) => {
    const profileDoc = await getDoc(doc(db, 'users', uid));
    if (profileDoc.exists()) {
      setUserProfile(profileDoc.data());
    }
  };

  const loadAllUsers = async (uid: string) => {
    const snapshot = await getDocs(collection(db, 'users'));
    const users = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u: any) => u.id !== uid);
    setAllUsers(users);
    setFiltered(users);
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setFiltered(allUsers);
      return;
    }
    const lower = q.toLowerCase();
    setFiltered(
      allUsers.filter(
        (u: any) =>
          u.username?.toLowerCase().includes(lower) ||
          u.fullName?.toLowerCase().includes(lower)
      )
    );
  };

  const toggleFollow = async (targetUserId: string) => {
    if (!user) return;
    const isFollowing = userProfile?.following?.includes(targetUserId);
    const myRef = doc(db, 'users', user.uid);
    const targetRef = doc(db, 'users', targetUserId);

    try {
      // Update my following list
      await updateDoc(myRef, {
        following: isFollowing ? arrayRemove(targetUserId) : arrayUnion(targetUserId),
      });
      // Update their followers list
      await updateDoc(targetRef, {
        followers: isFollowing ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
      // Refresh current user profile
      await loadCurrentUserProfile(user.uid);
    } catch (err: any) {
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
        <h1 className="text-xl font-bold mb-4 dark:text-white">🔍 Search Users</h1>

        <Input
          placeholder="Search by name or username..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="mb-6"
        />

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No users found.</p>
          ) : (
            filtered.map((u: any) => {
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
                        <p className="text-xs text-gray-400 mt-0.5">
                          {u.followers?.length || 0} followers · {u.following?.length || 0} following
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
      </div>
    </>
  );
}
