'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newBio, setNewBio] = useState('');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push('/login');
        return;
      }
      setUser(firebaseUser);
      await loadProfile(firebaseUser.uid);
      await loadUserPosts(firebaseUser.uid);
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadProfile = async (uid: string) => {
    try {
      const profileDoc = await getDoc(doc(db, 'users', uid));
      if (profileDoc.exists()) {
        const data = profileDoc.data();
        setProfile(data);
        setNewFullName(data.fullName || '');
        setNewBio(data.bio || '');
      }
    } catch (err) {
      console.error('Profile load error:', err);
    }
  };

  const loadUserPosts = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'posts'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const postList = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setPosts(postList);
    } catch (err) {
      console.error('Posts load error:', err);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        fullName: newFullName,
        bio: newBio,
      });
      await loadProfile(user.uid);
      setEditing(false);
    } catch (err: any) {
      alert('Failed to save: ' + err.message);
    }
    setSaving(false);
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Loading profile...</p>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-2xl mx-auto p-4 pt-6">

        {/* Profile Card */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold text-gray-600">
                {profile?.fullName?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1">
                {editing ? (
                  <div className="space-y-2">
                    <Input
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      placeholder="Full Name"
                    />
                    <Input
                      value={newBio}
                      onChange={(e) => setNewBio(e.target.value)}
                      placeholder="Bio (e.g. Love tech & coding)"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveProfile} disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="text-xl font-bold">{profile?.fullName}</h2>
                    <p className="text-sm text-gray-400">@{profile?.username}</p>
                    {profile?.bio && (
                      <p className="text-sm text-gray-600 mt-1">{profile.bio}</p>
                    )}
                  </>
                )}
              </div>
              {!editing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                >
                  Edit Profile
                </Button>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-6 pt-3 border-t border-gray-100">
              <div className="text-center">
                <p className="text-xl font-bold">{posts.length}</p>
                <p className="text-xs text-gray-400">Posts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Posts */}
        <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">
          Your Posts
        </h3>
        <div className="space-y-4">
          {posts.length === 0 ? (
            <p className="text-center text-gray-400 py-8">
              You haven't posted anything yet.
            </p>
          ) : (
            posts.map((post) => (
              <Card key={post.id}>
                <CardContent className="p-4">
                  <p className="text-gray-800">{post.content}</p>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-gray-400">
                      {post.createdAt?.toDate
                        ? new Date(post.createdAt.toDate()).toLocaleString()
                        : 'Just now'}
                    </p>
                    <p className="text-xs text-gray-400">
                      ❤️ {post.likes?.length || 0} likes
                    </p>
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
