'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDocs, orderBy,
  query, serverTimestamp, doc, getDoc,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const STORIES_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_STORIES_PRESET || 'altronics_stories';

export default function Stories() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [groupedStories, setGroupedStories] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/login'); return; }
      setUser(firebaseUser);
      const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (profileDoc.exists()) setUserProfile(profileDoc.data());
      await loadStories();
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedGroup) return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (currentStoryIndex < selectedGroup.stories.length - 1) {
            setCurrentStoryIndex((i) => i + 1);
            return 0;
          } else {
            setSelectedGroup(null);
            return 0;
          }
        }
        return prev + 2;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [selectedGroup, currentStoryIndex]);

  const loadStories = async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const allStories = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s: any) => {
          if (!s.createdAt?.toDate) return true;
          return s.createdAt.toDate() > cutoff;
        });

      const groups: { [key: string]: any } = {};
      allStories.forEach((story: any) => {
        if (!groups[story.userId]) {
          groups[story.userId] = {
            userId: story.userId,
            username: story.username,
            fullName: story.fullName,
            stories: [],
          };
        }
        groups[story.userId].stories.push(story);
      });

      setGroupedStories(Object.values(groups));
    } catch (err) {
      console.error('Load stories error:', err);
    }
  };

  const uploadStory = async (file: File) => {
    if (!user) return;
    if (file.size > 10 * 1024 * 1024) { alert('File must be under 10MB'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', STORIES_PRESET);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();
      if (!data.secure_url) throw new Error('Upload failed: ' + (data.error?.message || 'No URL'));

      await addDoc(collection(db, 'stories'), {
        userId: user.uid,
        username: userProfile?.username || 'anonymous',
        fullName: userProfile?.fullName || 'User',
        mediaUrl: data.secure_url,
        createdAt: serverTimestamp(),
        views: [],
      });

      await loadStories();
      alert('Story posted! ✨');
    } catch (err: any) {
      alert('Failed: ' + err.message);
    }
    setUploading(false);
  };

  const openStory = (group: any) => {
    setSelectedGroup(group);
    setCurrentStoryIndex(0);
    setProgress(0);
  };

  const nextStory = () => {
    if (currentStoryIndex < selectedGroup.stories.length - 1) {
      setCurrentStoryIndex((i) => i + 1);
      setProgress(0);
    } else {
      setSelectedGroup(null);
    }
  };

  const prevStory = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((i) => i - 1);
      setProgress(0);
    }
  };

  const myStories = groupedStories.find((g) => g.userId === user?.uid);
  const othersStories = groupedStories.filter((g) => g.userId !== user?.uid);

  if (pageLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#a78bfa', fontWeight: 700, fontSize: 18 }}>ALTRONICS</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif' }}>
      <Navbar />

      {/* Story Viewer Modal */}
      {selectedGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 420, height: '100vh', position: 'relative', display: 'flex', flexDirection: 'column' }}>

            {/* Progress bars */}
            <div style={{ display: 'flex', gap: 4, padding: '16px 16px 8px', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
              {selectedGroup.stories.map((_: any, i: number) => (
                <div key={i} style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', background: 'white', borderRadius: 2,
                    width: i < currentStoryIndex ? '100%' : i === currentStoryIndex ? `${progress}%` : '0%',
                    transition: 'width 0.1s linear',
                  }} />
                </div>
              ))}
            </div>

            {/* Story header */}
            <div style={{ position: 'absolute', top: 28, left: 0, right: 0, zIndex: 10, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: 'white' }}>
                  {selectedGroup.fullName?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'white', margin: 0 }}>{selectedGroup.fullName}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0 }}>@{selectedGroup.username}</p>
                </div>
              </div>
              <button onClick={() => setSelectedGroup(null)}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', padding: 4 }}>
                ✕
              </button>
            </div>

            {/* Story image */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <img
                src={selectedGroup.stories[currentStoryIndex]?.mediaUrl}
                alt="Story"
                style={{ width: '100%', height: '100vh', objectFit: 'contain' }}
              />
              <div style={{ position: 'absolute', left: 0, top: 0, width: '40%', height: '100%', cursor: 'pointer' }} onClick={prevStory} />
              <div style={{ position: 'absolute', right: 0, top: 0, width: '40%', height: '100%', cursor: 'pointer' }} onClick={nextStory} />
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 100 }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 8px', borderBottom: '0.5px solid rgba(139,92,246,0.15)' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
            Stories
          </h1>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4, marginBottom: 0 }}>Stories disappear after 24 hours</p>
        </div>

        {/* Add Your Story */}
        <div style={{ padding: '20px', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Your Story
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', padding: 2, background: myStories ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(139,92,246,0.2)', border: myStories ? 'none' : '2px dashed rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                {myStories ? (
                  <img src={myStories.stories[0]?.mediaUrl} alt="Your story" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', border: '2px solid #0a0a0f' }} />
                ) : (
                  <span style={{ fontSize: 28 }}>{uploading ? '⏳' : '➕'}</span>
                )}
              </div>
              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading}
                onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadStory(file); }} />
            </label>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#f3f4f6', margin: '0 0 4px' }}>
                {uploading ? 'Uploading...' : myStories ? 'Add more to story' : 'Add to your story'}
              </p>
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                {myStories ? `${myStories.stories.length} story posted` : 'Share a photo with your followers'}
              </p>
            </div>
            {myStories && (
              <button onClick={() => openStory(myStories)}
                style={{ padding: '6px 16px', borderRadius: 20, background: 'rgba(139,92,246,0.15)', border: '0.5px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                View
              </button>
            )}
          </div>
        </div>

        {/* Others Stories */}
        {othersStories.length > 0 && (
          <div style={{ padding: '20px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Recent Stories ({othersStories.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {othersStories.map((group) => (
                <div key={group.userId} onClick={() => openStory(group)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'rgba(139,92,246,0.05)', border: '0.5px solid rgba(139,92,246,0.1)', borderRadius: 16, cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.05)')}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', padding: 2, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', flexShrink: 0 }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#0a0a0f', border: '2px solid #0a0a0f', overflow: 'hidden' }}>
                      <img src={group.stories[0]?.mediaUrl} alt={group.fullName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', margin: '0 0 2px' }}>{group.fullName}</p>
                    <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                      @{group.username} · {group.stories.length} {group.stories.length === 1 ? 'story' : 'stories'}
                    </p>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)' }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {othersStories.length === 0 && !myStories && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📸</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>No stories yet</p>
            <p style={{ fontSize: 13 }}>Be the first to share a story!</p>
          </div>
        )}

      </div>
    </div>
  );
}
