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

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newBio, setNewBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'liked'>('posts');
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/login'); return; }
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
    } catch (err) { console.error(err); }
  };

  const loadUserPosts = async (uid: string) => {
    try {
      const q = query(collection(db, 'posts'), where('userId', '==', uid), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      setPosts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { fullName: newFullName, bio: newBio });
      await loadProfile(user.uid);
      setEditing(false);
    } catch (err: any) { alert('Failed to save: ' + err.message); }
    setSaving(false);
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px',
    background: 'rgba(139,92,246,0.08)',
    border: '0.5px solid rgba(139,92,246,0.3)',
    borderRadius: 10, color: '#f3f4f6', fontSize: 13,
    fontFamily: 'Inter,sans-serif', outline: 'none',
  };

  if (pageLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: '#6b7280', fontSize: 13 }}>Loading profile...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const initials = profile?.fullName?.[0]?.toUpperCase() || 'U';

  return (
    <>
      <Navbar />
      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 100 }}>

        {/* Profile Header with gradient bg */}
        <div style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.12) 0%, transparent 100%)', padding: '24px 20px 0' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>

            {/* Top row: avatar + stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              {/* Avatar */}
              <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: 'white', border: '2px solid rgba(139,92,246,0.4)', flexShrink: 0 }}>
                {initials}
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 24, flex: 1, justifyContent: 'space-around' }}>
                {[
                  { num: posts.length, label: 'Posts' },
                  { num: profile?.followers?.length || 0, label: 'Followers' },
                  { num: profile?.following?.length || 0, label: 'Following' },
                ].map(({ num, label }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 20, fontWeight: 700, color: '#f3f4f6', marginBottom: 2 }}>{num}</p>
                    <p style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Name / bio / edit */}
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <input value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="Full Name" style={inputStyle} />
                <input value={newBio} onChange={(e) => setNewBio(e.target.value)} placeholder="Write a bio..." style={inputStyle} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveProfile} disabled={saving} style={{ flex: 1, padding: '9px', borderRadius: 12, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setEditing(false)} style={{ flex: 1, padding: '9px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', marginBottom: 2 }}>{profile?.fullName}</p>
                <p style={{ fontSize: 12, color: '#a78bfa', marginBottom: 6 }}>@{profile?.username}</p>
                {profile?.bio && <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5, marginBottom: 12 }}>{profile.bio}</p>}
                <button onClick={() => setEditing(true)} style={{ width: '100%', padding: '10px', borderRadius: 12, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.08)', color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Edit Profile
                </button>
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '0.5px solid rgba(255,255,255,0.06)', marginTop: 4 }}>
              {(['posts', 'liked'] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '12px 0', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid #a78bfa' : '2px solid transparent', color: activeTab === tab ? '#a78bfa' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.2s' }}>
                  {tab === 'posts' ? '⚡ Posts' : '❤️ Liked'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Posts List */}
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>
          {posts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>✨</p>
              <p style={{ color: '#6b7280', fontSize: 14 }}>No posts yet. Share something!</p>
            </div>
          ) : (
            posts.map((post) => (
              <div key={post.id} style={{ padding: '16px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6' }}>{profile?.fullName}</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>@{profile?.username}</span>
                      <span style={{ fontSize: 11, color: '#4b5563', marginLeft: 'auto' }}>
                        {post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6, marginBottom: 10 }}>{post.content}</p>
                    <div style={{ display: 'flex', gap: 20 }}>
                      <span style={{ fontSize: 12, color: '#f472b6', display: 'flex', alignItems: 'center', gap: 4 }}>
                        ❤️ {post.likes?.length || 0}
                      </span>
                      <span style={{ fontSize: 12, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 4 }}>
                        💬 {post.comments?.length || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
