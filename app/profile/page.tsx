'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
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
import Image from 'next/image';
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

  // ── Profile pic state ───────────────────────────────────────────────────
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);

  // ── Privacy toggles ─────────────────────────────────────────────────────
  const [messageSeen, setMessageSeen] = useState(true);
  const [activeStatus, setActiveStatus] = useState(true);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);

  // ── Followers / Following modal ──────────────────────────────────────────
  const [showModal, setShowModal] = useState<'followers' | 'following' | null>(null);
  const [modalUsers, setModalUsers] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  const { push } = useRouter();

  // eslint-disable-next-line react-compiler/react-compiler
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { push('/login'); return; }
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
        setMessageSeen(data.messageSeen !== false);
        setActiveStatus(data.activeStatus !== false);
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

  // ── Profile picture upload ───────────────────────────────────────────────
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5 MB.'); return; }
    uploadAvatar(file);
    e.target.value = '';
  };

  const uploadAvatar = (file: File) => {
    if (!user) return;
    setAvatarUploading(true);
    setAvatarProgress(0);
    const path = `avatars/${user.uid}/profile.${file.name.split('.').pop()}`;
    const fileRef = storageRef(storage, path);
    const task = uploadBytesResumable(fileRef, file);
    task.on(
      'state_changed',
      (snap) => setAvatarProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => { alert('Upload failed: ' + err.message); setAvatarUploading(false); setAvatarProgress(null); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
        await loadProfile(user.uid);
        setAvatarUploading(false);
        setAvatarProgress(null);
      }
    );
  };

  // ── Privacy toggle ───────────────────────────────────────────────────────
  const togglePrivacy = async (field: 'messageSeen' | 'activeStatus', value: boolean) => {
    if (!user) return;
    setTogglingPrivacy(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { [field]: value });
      if (field === 'messageSeen') setMessageSeen(value);
      else setActiveStatus(value);
    } catch (err: any) { alert('Failed to update setting: ' + err.message); }
    setTogglingPrivacy(false);
  };

  // ── Open followers/following modal ──────────────────────────────────────
  const openModal = async (type: 'followers' | 'following') => {
    setShowModal(type);
    setModalLoading(true);
    setModalUsers([]);
    try {
      const ids: string[] = profile?.[type] || [];
      if (ids.length === 0) { setModalLoading(false); return; }
      const profiles = await Promise.all(
        ids.map(async (uid: string) => {
          const d = await getDoc(doc(db, 'users', uid));
          return d.exists() ? { id: d.id, ...d.data() } : null;
        })
      );
      setModalUsers(profiles.filter(Boolean));
    } catch (err) { console.error(err); }
    setModalLoading(false);
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px',
    background: 'rgba(139,92,246,0.08)',
    border: '0.5px solid rgba(139,92,246,0.3)',
    borderRadius: 10, color: '#f3f4f6', fontSize: 13,
    fontFamily: 'Inter,sans-serif', outline: 'none',
    boxSizing: 'border-box' as const,
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
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .toggle-track { transition: background 0.25s, border 0.25s; }
        .toggle-thumb { transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1); }
        .avatar-overlay { opacity: 0; transition: opacity 0.2s; }
        .avatar-wrap:hover .avatar-overlay { opacity: 1; }
      `}</style>
      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 100 }}>

        {/* Profile Header */}
        <div style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.12) 0%, transparent 100%)', padding: '24px 20px 0' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>

            {/* Top row: avatar + stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>

              {/* Avatar with upload overlay */}
              <div style={{ position: 'relative', flexShrink: 0 }} className="avatar-wrap">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarSelect}
                  style={{ display: 'none' }}
                />
                {/* Avatar circle */}
                <button type="button" aria-label="Change profile picture" style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', border: '2.5px solid rgba(139,92,246,0.5)', position: 'relative', cursor: 'pointer', flexShrink: 0, padding: 0, background: 'none' }}
                  onClick={() => !avatarUploading && avatarInputRef.current?.click()}>
                  {profile?.photoURL ? (
                    <Image src={profile.photoURL} alt="Profile picture" fill sizes="80px" style={{ objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: 'white' }}>
                      {initials}
                    </div>
                  )}
                  {/* Upload progress overlay */}
                  {avatarUploading && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(167,139,250,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
                      {avatarProgress !== null && <span style={{ fontSize: 12, color: '#a78bfa', fontWeight: 700 }}>{avatarProgress}%</span>}
                    </div>
                  )}
                  {/* Hover overlay */}
                  {!avatarUploading && (
                    <div className="avatar-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                      <span style={{ fontSize: 16 }}>📷</span>
                      <span style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>Change</span>
                    </div>
                  )}
                </div>
                {/* Camera badge */}
                <div onClick={() => !avatarUploading && avatarInputRef.current?.click()}
                  style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, cursor: 'pointer', border: '2px solid #0a0a0f', zIndex: 2 }}>
                  📷
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 24, flex: 1, justifyContent: 'space-around' }}>
                {/* Posts — not clickable */}
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: '#f3f4f6', marginBottom: 2 }}>{posts.length}</p>
                  <p style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Posts</p>
                </div>
                {/* Followers — clickable */}
                <button type="button" aria-label="View followers" onClick={() => openModal('followers')} style={{ textAlign: 'center', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: '#f3f4f6', marginBottom: 2 }}>{profile?.followers?.length || 0}</p>
                  <p style={{ fontSize: 12, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Followers</p>
                </button>
                {/* Following — clickable */}
                <button type="button" aria-label="View following" onClick={() => openModal('following')} style={{ textAlign: 'center', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: '#f3f4f6', marginBottom: 2 }}>{profile?.following?.length || 0}</p>
                  <p style={{ fontSize: 12, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Following</p>
                </button>
              </div>
            </div>

            {/* Name / bio / edit */}
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <input value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="Full Name" style={inputStyle} />
                <input value={newBio} onChange={(e) => setNewBio(e.target.value)} placeholder="Write a bio..." style={inputStyle} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={saveProfile} disabled={saving} style={{ flex: 1, padding: '9px', borderRadius: 12, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setEditing(false)} style={{ flex: 1, padding: '9px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', marginBottom: 2 }}>{profile?.fullName}</p>
                <p style={{ fontSize: 12, color: '#a78bfa', marginBottom: 6 }}>@{profile?.username}</p>
                {profile?.bio && <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5, marginBottom: 12 }}>{profile.bio}</p>}
                <button type="button" onClick={() => setEditing(true)} style={{ width: '100%', padding: '10px', borderRadius: 12, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.08)', color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Edit Profile
                </button>
              </div>
            )}

            {/* ── Privacy Settings ───────────────────────────────────────── */}
            <div style={{ marginBottom: 16, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(139,92,246,0.15)', borderRadius: 16, overflow: 'hidden' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase', padding: '12px 16px 8px' }}>Privacy Settings</p>

              {/* Message Seen */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: messageSeen ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${messageSeen ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'background 0.25s, border 0.25s' }}>
                    ✓✓
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', marginBottom: 2 }}>Message Seen</p>
                    <p style={{ fontSize: 12, color: '#6b7280' }}>{messageSeen ? "Others can see when you've read their messages" : 'Read receipts are hidden'}</p>
                  </div>
                </div>
                <Toggle
                  value={messageSeen}
                  disabled={togglingPrivacy}
                  onChange={(v) => togglePrivacy('messageSeen', v)}
                  color="#3b82f6"
                  label="Toggle message seen receipts"
                />
              </div>

              {/* Active Status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: activeStatus ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${activeStatus ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'background 0.25s, border 0.25s' }}>
                    🟢
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', marginBottom: 2 }}>Active Status</p>
                    <p style={{ fontSize: 12, color: '#6b7280' }}>{activeStatus ? "Others can see when you're online" : 'You appear offline to everyone'}</p>
                  </div>
                </div>
                <Toggle
                  value={activeStatus}
                  disabled={togglingPrivacy}
                  onChange={(v) => togglePrivacy('activeStatus', v)}
                  color="#22c55e"
                  label="Toggle active status visibility"
                />
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '0.5px solid rgba(255,255,255,0.06)', marginTop: 4 }}>
              {(['posts', 'liked'] as const).map((tab) => (
                <button type="button" key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '12px 0', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid #a78bfa' : '2px solid transparent', color: activeTab === tab ? '#a78bfa' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', transition: 'background 0.2s, border 0.2s' }}>
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
                  {/* Mini avatar */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(139,92,246,0.3)', flexShrink: 0 }}>
                    {profile?.photoURL ? (
                      <Image src={profile.photoURL} alt="Profile picture" fill sizes="80px" style={{ objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>
                        {initials}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6' }}>{profile?.fullName}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>@{profile?.username}</span>
                      <span style={{ fontSize: 12, color: '#4b5563', marginLeft: 'auto' }}>
                        {post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6, marginBottom: 10 }}>{post.content}</p>
                    <div style={{ display: 'flex', gap: 20 }}>
                      <span style={{ fontSize: 12, color: '#f472b6', display: 'flex', alignItems: 'center', gap: 4 }}>❤️ {post.likes?.length || 0}</span>
                      <span style={{ fontSize: 12, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 4 }}>💬 {post.comments?.length || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Followers / Following Modal ─────────────────────────────────── */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={showModal === 'followers' ? 'Followers list' : 'Following list'}
          onClick={() => setShowModal(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowModal(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, background: '#111118', borderRadius: '24px 24px 0 0', border: '0.5px solid rgba(139,92,246,0.25)', maxHeight: '75vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: '#f3f4f6', margin: 0, textTransform: 'capitalize' }}>
                {showModal === 'followers' ? '👥 Followers' : '➡️ Following'}
              </h2>
              <button type="button" onClick={() => setShowModal(null)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            {/* Modal body */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {modalLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
                </div>
              ) : modalUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: '#6b7280' }}>
                  <p style={{ fontSize: 32, marginBottom: 8 }}>👤</p>
                  <p style={{ fontSize: 14 }}>No {showModal} yet</p>
                </div>
              ) : (
                modalUsers.map((u: any) => (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => { setShowModal(null); push(`/profile/${u.id}`); }}
                    aria-label={`View ${u.fullName}'s profile`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', cursor: 'pointer', borderBottom: '0.5px solid rgba(255,255,255,0.04)', transition: 'background 0.15s', background: 'transparent', border: 'none', width: '100%', textAlign: 'left' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.07)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    {/* Avatar */}
                    <div style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', border: '1.5px solid rgba(139,92,246,0.35)', flexShrink: 0 }}>
                      {u.photoURL ? (
                        <Image src={u.photoURL} alt={`${u.fullName} profile picture`} fill sizes="46px" style={{ objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: 'white' }}>
                          {u.fullName?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.fullName}</p>
                      <p style={{ fontSize: 12, color: '#a78bfa', margin: 0 }}>@{u.username}</p>
                    </div>
                    <span style={{ color: '#4b5563', fontSize: 18 }}>›</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Reusable Toggle component ────────────────────────────────────────────────
function Toggle({ value, onChange, disabled, color = '#8b5cf6', label = 'Toggle' }: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  color?: string;
  label?: string;
}) {
  return (
    <button type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      role="switch"
      aria-checked={value}
      aria-label={label}
      style={{ position: 'relative', width: 46, height: 26, borderRadius: 13, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', padding: 0, flexShrink: 0, background: value ? color : 'rgba(255,255,255,0.1)', transition: 'background 0.25s', opacity: disabled ? 0.6 : 1 }}
      className="toggle-track"
    >
      <span
        className="toggle-thumb"
        style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', display: 'block', transform: 'none' }}
      />
    </button>
  );
}
