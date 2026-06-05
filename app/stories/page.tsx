'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDocs, orderBy,
  query, serverTimestamp, doc, getDoc,
  updateDoc, arrayUnion, arrayRemove, deleteDoc,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const STORIES_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_STORIES_PRESET || 'altronics_stories';

function StoriesInner() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [groupedStories, setGroupedStories] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [replies, setReplies] = useState<any[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkHandled = useRef(false);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

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
    if (!selectedGroup || paused) return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (currentStoryIndex < selectedGroup.stories.length - 1) {
            setCurrentStoryIndex((i) => i + 1);
            setReplies([]);
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
  }, [selectedGroup, currentStoryIndex, paused]);

  // ── Deep link: /stories?user=<userId> ───────────────────────────────────
  useEffect(() => {
    if (pageLoading || deepLinkHandled.current) return;
    const userId = searchParams.get('user');
    if (!userId) return;

    // #region agent log
    fetch('http://127.0.0.1:7765/ingest/88558553-9956-4b27-988e-873946619941',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ff7916'},body:JSON.stringify({sessionId:'ff7916',location:'stories/page.tsx:deepLink',message:'story user param detected',data:{userId,groupedCount:groupedStories.length,hasGroup:groupedStories.some((g:any)=>g.userId===userId)},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    const group = groupedStories.find((g: any) => g.userId === userId);
    if (group) {
      deepLinkHandled.current = true;
      openStory(group);
      window.history.replaceState({}, '', '/stories');
      // #region agent log
      fetch('http://127.0.0.1:7765/ingest/88558553-9956-4b27-988e-873946619941',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ff7916'},body:JSON.stringify({sessionId:'ff7916',runId:'post-fix',location:'stories/page.tsx:deepLink:open',message:'story opened via deep link',data:{userId,storyCount:group.stories?.length},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
    } else {
      // Stories finished loading but this user has no active story
      deepLinkHandled.current = true;
      // #region agent log
      fetch('http://127.0.0.1:7765/ingest/88558553-9956-4b27-988e-873946619941',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ff7916'},body:JSON.stringify({sessionId:'ff7916',runId:'post-fix',location:'stories/page.tsx:deepLink:notFound',message:'story user not found',data:{userId,groupedCount:groupedStories.length},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
    }
  }, [pageLoading, groupedStories, searchParams]);

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
          groups[story.userId] = { userId: story.userId, username: story.username, fullName: story.fullName, stories: [] };
        }
        groups[story.userId].stories.push(story);
      });
      setGroupedStories(Object.values(groups));
    } catch (err) { console.error(err); }
  };

  const loadReplies = async (storyId: string) => {
    try {
      const q = query(collection(db, 'stories', storyId, 'replies'), orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);
      setReplies(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  };

  const uploadStory = async (file: File) => {
    if (!user) return;
    if (file.size > 10 * 1024 * 1024) { alert('File must be under 10MB'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', STORIES_PRESET);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.secure_url) throw new Error('Upload failed: ' + (data.error?.message || 'No URL'));
      await addDoc(collection(db, 'stories'), {
        userId: user.uid, username: userProfile?.username || 'anonymous',
        fullName: userProfile?.fullName || 'User', mediaUrl: data.secure_url,
        createdAt: serverTimestamp(), views: [], likes: [],
      });
      await loadStories();
      showToast('Story posted! ✨');
    } catch (err: any) { showToast('Failed: ' + err.message, 'error'); }
    setUploading(false);
  };

  const openStory = async (group: any) => {
    setSelectedGroup(group);
    setCurrentStoryIndex(0);
    setProgress(0);
    setReplies([]);
    setShowReply(false);
    const firstStory = group.stories[0];
    if (firstStory) {
      await loadReplies(firstStory.id);
      // Record view for the first story if not already viewed
      if (user && !firstStory.views?.includes(user.uid) && firstStory.userId !== user.uid) {
        updateDoc(doc(db, 'stories', firstStory.id), {
          views: arrayUnion(user.uid),
        }).catch(() => {});
      }
    }
  };

  const nextStory = async () => {
    if (currentStoryIndex < selectedGroup.stories.length - 1) {
      const nextIdx = currentStoryIndex + 1;
      setCurrentStoryIndex(nextIdx);
      setProgress(0);
      setReplies([]);
      setShowReply(false);
      const nextStory = selectedGroup.stories[nextIdx];
      if (nextStory) {
        await loadReplies(nextStory.id);
        // Record view
        if (user && !nextStory.views?.includes(user.uid) && nextStory.userId !== user.uid) {
          updateDoc(doc(db, 'stories', nextStory.id), {
            views: arrayUnion(user.uid),
          }).catch(() => {});
        }
      }
    } else {
      setSelectedGroup(null);
    }
  };

  const prevStory = async () => {
    if (currentStoryIndex > 0) {
      const prevIdx = currentStoryIndex - 1;
      setCurrentStoryIndex(prevIdx);
      setProgress(0);
      setReplies([]);
      await loadReplies(selectedGroup.stories[prevIdx]?.id);
    }
  };

  const toggleLike = async () => {
    if (!user || !selectedGroup) return;
    const story = selectedGroup.stories[currentStoryIndex];
    if (!story) return;
    const alreadyLiked = story.likes?.includes(user.uid);
    try {
      await updateDoc(doc(db, 'stories', story.id), {
        likes: alreadyLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
      // Update local state
      const updatedStories = selectedGroup.stories.map((s: any, i: number) =>
        i === currentStoryIndex
          ? { ...s, likes: alreadyLiked ? (s.likes || []).filter((id: string) => id !== user.uid) : [...(s.likes || []), user.uid] }
          : s
      );
      setSelectedGroup({ ...selectedGroup, stories: updatedStories });

      // Notify story owner
      if (!alreadyLiked && story.userId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: story.userId, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'story_like', read: false, createdAt: serverTimestamp(),
        });
      }
    } catch (err) { console.error(err); }
  };

  const deleteStory = async (storyId: string) => {
    try {
      await deleteDoc(doc(db, 'stories', storyId));
      await loadStories();
      showToast('Story deleted');
    } catch (err: any) { showToast('Failed to delete story', 'error'); }
  };

  const sendReply = async () => {
    if (!replyText.trim() || !user || !selectedGroup) return;
    const story = selectedGroup.stories[currentStoryIndex];
    if (!story) return;
    try {
      await addDoc(collection(db, 'stories', story.id, 'replies'), {
        userId: user.uid, username: userProfile?.username || 'anonymous',
        fullName: userProfile?.fullName || 'User',
        content: replyText.trim(), createdAt: serverTimestamp(),
      });
      // Notify story owner
      if (story.userId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: story.userId, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'story_reply', read: false, createdAt: serverTimestamp(),
          replyText: replyText.trim().slice(0, 50),
        });
      }
      setReplyText('');
      await loadReplies(story.id);
    } catch (err) { console.error(err); }
  };

  const myStories = groupedStories.find((g) => g.userId === user?.uid);
  const othersStories = groupedStories.filter((g) => g.userId !== user?.uid);
  const currentStory = selectedGroup?.stories[currentStoryIndex];
  const isLiked = currentStory?.likes?.includes(user?.uid);
  const likeCount = currentStory?.likes?.length || 0;

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

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '12px 20px', borderRadius: 16,
          background: toast.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: `0.5px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.type === 'success' ? '#4ade80' : '#f87171',
          fontSize: 13, fontWeight: 600, backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          animation: 'fadeInDown 0.3s ease',
          whiteSpace: 'nowrap',
        }}>
          {toast.type === 'success' ? '✅' : '⚠️'} {toast.msg}
        </div>
      )}
      <style>{`@keyframes fadeInDown{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>

      {/* Story Viewer Modal */}
      {selectedGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.97)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 420, height: '100vh', position: 'relative', display: 'flex', flexDirection: 'column' }}>

            {/* Progress bars */}
            <div style={{ display: 'flex', gap: 4, padding: '16px 16px 8px', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
              {selectedGroup.stories.map((_: any, i: number) => (
                <div key={i} style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'white', borderRadius: 2, width: i < currentStoryIndex ? '100%' : i === currentStoryIndex ? `${progress}%` : '0%', transition: 'width 0.1s linear' }} />
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
                style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', padding: 4 }}>✕</button>
            </div>

            {/* Story image */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <img src={currentStory?.mediaUrl} alt="Story" style={{ width: '100%', height: '100vh', objectFit: 'contain' }} />
              {/* Tap areas */}
              <div style={{ position: 'absolute', left: 0, top: 0, width: '35%', height: '100%', cursor: 'pointer' }} onClick={prevStory} />
              <div style={{ position: 'absolute', right: 0, top: 0, width: '35%', height: '100%', cursor: 'pointer' }} onClick={nextStory} />
            </div>

            {/* Bottom actions */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, padding: '0 16px 24px', background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%)' }}>

              {/* Replies list */}
              {showReply && replies.length > 0 && (
                <div style={{ marginBottom: 12, maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {replies.map((reply) => (
                    <div key={reply.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>
                        {reply.fullName?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', borderRadius: 12, padding: '6px 10px', flex: 1 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>@{reply.username} </span>
                        <span style={{ fontSize: 12, color: 'white' }}>{reply.content}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Like count */}
              {likeCount > 0 && (
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 10px', textAlign: 'center' }}>
                  ❤️ {likeCount} {likeCount === 1 ? 'like' : 'likes'}
                  {currentStory?.userId === user?.uid && (currentStory?.views?.length > 0) && (
                    <span style={{ marginLeft: 12 }}>👁 {currentStory.views.length} {currentStory.views.length === 1 ? 'view' : 'views'}</span>
                  )}
                </p>
              )}
              {/* View count (no likes yet) — only visible to story owner */}
              {likeCount === 0 && currentStory?.userId === user?.uid && (currentStory?.views?.length > 0) && (
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 10px', textAlign: 'center' }}>
                  👁 {currentStory.views.length} {currentStory.views.length === 1 ? 'view' : 'views'}
                </p>
              )}

              {/* Action row */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  placeholder="Reply to story..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onFocus={() => { setPaused(true); setShowReply(true); }}
                  onBlur={() => setPaused(false)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendReply(); }}
                  style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 24, color: 'white', fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none' }}
                />
                {replyText.trim() && (
                  <button onClick={sendReply}
                    style={{ padding: '10px 16px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                    Send
                  </button>
                )}
                <button onClick={toggleLike}
                  style={{ width: 42, height: 42, borderRadius: '50%', background: isLiked ? 'rgba(244,114,182,0.2)' : 'rgba(255,255,255,0.1)', border: isLiked ? '1px solid rgba(244,114,182,0.4)' : '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                  {isLiked ? '❤️' : '🤍'}
                </button>
                <button onClick={() => setShowReply(!showReply)}
                  style={{ width: 42, height: 42, borderRadius: '50%', background: showReply ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.1)', border: showReply ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  💬
                </button>
              </div>
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
                  <img src={myStories.stories[0]?.mediaUrl} alt="Your story" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                      <img src={group.stories[0]?.mediaUrl} alt={group.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

export default function Stories() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#a78bfa', fontWeight: 700 }}>ALTRONICS</p>
      </div>
    }>
      <StoriesInner />
    </Suspense>
  );
}
