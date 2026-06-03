'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy, arrayUnion, arrayRemove, where,
} from 'firebase/firestore';

const MEMBER_COLORS = ['#a78bfa', '#60a5fa', '#34d399', '#f97316', '#f472b6', '#facc15'];
const QUICK_REACTIONS = ['🔥', '❤️', '😂', '💀', '👀', '🫡', '💯', '🤯'];

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

function CircleDetailContent() {
  const router = useRouter();
  const params = useParams();
  const circleId = params?.id as string;

  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [circle, setCircle] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [notMember, setNotMember] = useState(false);

  // Post composer
  const [postText, setPostText] = useState('');
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);

  // Members modal
  const [showMembers, setShowMembers] = useState(false);

  // Comments
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<{ [postId: string]: any[] }>({});
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fu) => {
      if (!fu) { router.push('/login'); return; }
      setUser(fu);
      const pd = await getDoc(doc(db, 'users', fu.uid));
      if (pd.exists()) setUserProfile({ id: pd.id, ...pd.data() });
      const snap = await getDocs(collection(db, 'users'));
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((u: any) => u.id !== fu.uid));
      setPageLoading(false);
    });
    return () => unsub();
  }, []);

  // Live circle data
  useEffect(() => {
    if (!circleId) return;
    const unsub = onSnapshot(doc(db, 'circles', circleId), snap => {
      if (!snap.exists()) { router.push('/circles'); return; }
      setCircle({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [circleId]);

  // Check membership + load posts
  useEffect(() => {
    if (!user || !circle) return;
    if (!circle.memberIds?.includes(user.uid)) { setNotMember(true); return; }
    setNotMember(false);
  }, [user, circle]);

  // Live posts
  useEffect(() => {
    if (!circleId || !user) return;
    const q = query(collection(db, 'circles', circleId, 'posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [circleId, user]);

  // Upload image to Cloudinary
  const uploadImage = async (file: File): Promise<string | null> => {
    if (!CLOUD_NAME || !UPLOAD_PRESET) return null;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    return data.secure_url || null;
  };

  const submitPost = async () => {
    if ((!postText.trim() && !postImage) || !user || !circle) return;
    setPosting(true);
    try {
      let imageUrl: string | null = null;
      if (postImage) imageUrl = await uploadImage(postImage);
      const newPost = {
        content: postText.trim(),
        imageUrl,
        authorId: user.uid,
        authorName: userProfile?.fullName || 'Member',
        authorPhoto: userProfile?.photoURL || '',
        reactions: {},
        commentCount: 0,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'circles', circleId, 'posts'), newPost);
      // update circle meta
      await updateDoc(doc(db, 'circles', circleId), {
        postCount: (circle.postCount || 0) + 1,
        updatedAt: serverTimestamp(),
        lastPostPreview: `${userProfile?.fullName}: ${postText.trim().slice(0, 40) || '📷 Image'}`,
        newPostCount: (circle.newPostCount || 0) + 1,
      });
      setPostText(''); setPostImage(null); setPostImagePreview(null);
    } catch (err) { console.error(err); }
    setPosting(false);
  };

  const toggleReaction = async (postId: string, emoji: string) => {
    if (!user) return;
    const postRef = doc(db, 'circles', circleId, 'posts', postId);
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const key = `reactions.${emoji}`;
    const currentReactors: string[] = post.reactions?.[emoji] || [];
    if (currentReactors.includes(user.uid)) {
      await updateDoc(postRef, { [key]: arrayRemove(user.uid) });
    } else {
      await updateDoc(postRef, { [key]: arrayUnion(user.uid) });
    }
  };

  const deletePost = async (postId: string) => {
    await deleteDoc(doc(db, 'circles', circleId, 'posts', postId));
    await updateDoc(doc(db, 'circles', circleId), { postCount: Math.max((circle.postCount || 1) - 1, 0) });
  };

  const loadComments = async (postId: string) => {
    const q = query(collection(db, 'circles', circleId, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    setComments(prev => ({ ...prev, [postId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
  };

  const submitComment = async (postId: string) => {
    if (!commentText.trim() || !user) return;
    setSubmittingComment(true);
    await addDoc(collection(db, 'circles', circleId, 'posts', postId, 'comments'), {
      text: commentText.trim(),
      authorId: user.uid,
      authorName: userProfile?.fullName || 'Member',
      authorPhoto: userProfile?.photoURL || '',
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'circles', circleId, 'posts', postId), { commentCount: (posts.find(p => p.id === postId)?.commentCount || 0) + 1 });
    setCommentText('');
    await loadComments(postId);
    setSubmittingComment(false);
  };

  const toggleComments = async (postId: string) => {
    if (openComments === postId) { setOpenComments(null); return; }
    setOpenComments(postId);
    if (!comments[postId]) await loadComments(postId);
  };

  const inviteUser = async (uid: string) => {
    if (!circle || inviting) return;
    setInviting(uid);
    const u = allUsers.find((x: any) => x.id === uid);
    try {
      await updateDoc(doc(db, 'circles', circleId), {
        memberIds: arrayUnion(uid),
        members: arrayUnion({ uid, name: u?.fullName || 'Member', photoURL: u?.photoURL || '', role: 'member' }),
      });
    } catch (err) { console.error(err); }
    setInviting(null);
  };

  const formatTime = (ts: any) => {
    if (!ts?.toDate) return 'Just now';
    const d = ts.toDate();
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString();
  };

  const memberColor = (uid: string) => {
    const idx = (circle?.members || []).findIndex((m: any) => m.uid === uid);
    return MEMBER_COLORS[idx % MEMBER_COLORS.length] || '#a78bfa';
  };

  if (pageLoading || !circle) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (notMember) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: 'Inter,sans-serif' }}>
      <p style={{ fontSize: 48 }}>🔒</p>
      <p style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 17 }}>This circle is private</p>
      <p style={{ color: '#6b7280', fontSize: 13 }}>You need an invite to join.</p>
      <button onClick={() => router.push('/circles')} style={{ padding: '10px 24px', borderRadius: 20, background: 'rgba(139,92,246,0.15)', border: '0.5px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>← Back</button>
    </div>
  );

  const isHost = circle.hostId === user?.uid;
  const nonMembers = allUsers.filter((u: any) => !circle.memberIds?.includes(u.id));
  const filteredInvite = nonMembers.filter((u: any) =>
    u.fullName?.toLowerCase().includes(inviteSearch.toLowerCase()) ||
    u.username?.toLowerCase().includes(inviteSearch.toLowerCase())
  );

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box}`}</style>
      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 60 }}>

        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(20px)', borderBottom: '0.5px solid rgba(139,92,246,0.12)' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/circles')} style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0 }}>‹</button>

            {/* Circle info */}
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,rgba(139,92,246,0.25),rgba(59,130,246,0.2))', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              {circle.emoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 15, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{circle.name}</p>
                {circle.isLive && <span style={{ background: '#ef4444', color: 'white', fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 6, flexShrink: 0 }}>LIVE</span>}
              </div>
              <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>🔒 Private · {circle.memberIds?.length || 1} members</p>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowMembers(true)}
                style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex' }}>
                  {(circle.members || []).slice(0, 3).map((m: any, i: number) => (
                    <div key={m.uid} style={{ width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', border: '1.5px solid #0a0a0f', marginLeft: i > 0 ? -7 : 0, background: `${memberColor(m.uid)}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: memberColor(m.uid), cursor: 'pointer' }}>
                      {m.photoURL ? <img src={m.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.name?.[0]?.toUpperCase()}
                    </div>
                  ))}
                </div>
              </button>
              <button onClick={() => setShowInvite(true)}
                style={{ padding: '6px 14px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif', flexShrink: 0 }}>
                + Invite
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 600, margin: '0 auto' }}>

          {/* Post composer */}
          <div style={{ padding: '16px 16px 0' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 20, padding: '14px 16px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {/* My avatar */}
                <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: `1.5px solid ${memberColor(user?.uid)}`, flexShrink: 0, background: `${memberColor(user?.uid)}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: memberColor(user?.uid) }}>
                  {userProfile?.photoURL ? <img src={userProfile.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : userProfile?.fullName?.[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <textarea value={postText} onChange={e => setPostText(e.target.value)}
                    placeholder={`Drop something for the circle, ${userProfile?.fullName?.split(' ')[0] || 'friend'}...`}
                    rows={2}
                    style={{ width: '100%', background: 'none', border: 'none', color: '#f3f4f6', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none', resize: 'none', lineHeight: 1.5 }} />
                </div>
              </div>

              {/* Image preview */}
              {postImagePreview && (
                <div style={{ position: 'relative', marginTop: 10, borderRadius: 14, overflow: 'hidden' }}>
                  <img src={postImagePreview} alt="preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 14 }} />
                  <button onClick={() => { setPostImage(null); setPostImagePreview(null); }}
                    style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setPostImage(f);
                      setPostImagePreview(URL.createObjectURL(f));
                    }} />
                  <button onClick={() => fileRef.current?.click()}
                    style={{ padding: '6px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                    📷 Photo
                  </button>
                </div>
                <button onClick={submitPost} disabled={(!postText.trim() && !postImage) || posting}
                  style={{ padding: '7px 18px', borderRadius: 12, background: (postText.trim() || postImage) ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(139,92,246,0.15)', border: 'none', color: (postText.trim() || postImage) ? 'white' : '#6b7280', fontSize: 13, fontWeight: 700, cursor: (postText.trim() || postImage) ? 'pointer' : 'not-allowed', fontFamily: 'Inter,sans-serif', transition: 'all 0.2s' }}>
                  {posting ? '...' : 'Post 🔒'}
                </button>
              </div>
            </div>
          </div>

          {/* Posts feed */}
          <div style={{ padding: '12px 16px' }}>
            {posts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                <p style={{ fontSize: 40, marginBottom: 10 }}>✨</p>
                <p style={{ color: '#6b7280', fontSize: 14 }}>No posts yet. Be the first to drop something!</p>
              </div>
            ) : posts.map(post => {
              const col = memberColor(post.authorId);
              const myReactions = Object.entries(post.reactions || {}).filter(([, uids]: any) => uids.includes(user?.uid)).map(([e]) => e);
              const allReactions = Object.entries(post.reactions || {}).filter(([, uids]: any) => (uids as string[]).length > 0);
              return (
                <div key={post.id} style={{ marginBottom: 14, animation: 'fadeIn 0.3s ease' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 20, overflow: 'hidden' }}>

                    {/* Post header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px 10px' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: `1.5px solid ${col}`, flexShrink: 0, background: `${col}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: col }}>
                        {post.authorPhoto ? <img src={post.authorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : post.authorName?.[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: '#f3f4f6', fontWeight: 700, fontSize: 14, margin: 0 }}>{post.authorName}</p>
                        <p style={{ color: '#4b5563', fontSize: 11, margin: 0 }}>🔒 {formatTime(post.createdAt)}</p>
                      </div>
                      {post.authorId === user?.uid && (
                        <button onClick={() => deletePost(post.id)}
                          style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 16, cursor: 'pointer', padding: '2px 6px' }}>🗑</button>
                      )}
                    </div>

                    {/* Content */}
                    {post.content && (
                      <p style={{ color: '#e5e7eb', fontSize: 14, lineHeight: 1.6, padding: '0 14px 10px', margin: 0 }}>{post.content}</p>
                    )}
                    {post.imageUrl && (
                      <img src={post.imageUrl} alt="" style={{ width: '100%', maxHeight: 320, objectFit: 'cover' }} />
                    )}

                    {/* Reactions bar */}
                    {allReactions.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 14px 0' }}>
                        {allReactions.map(([emoji, uids]: any) => (
                          <button key={emoji} onClick={() => toggleReaction(post.id, emoji)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: myReactions.includes(emoji) ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${myReactions.includes(emoji) ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', fontSize: 13 }}>
                            <span>{emoji}</span>
                            <span style={{ color: myReactions.includes(emoji) ? '#a78bfa' : '#6b7280', fontSize: 12, fontWeight: 600 }}>{uids.length}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Quick reactions + comment */}
                    <div style={{ padding: '10px 14px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Quick reaction row */}
                      <div style={{ display: 'flex', gap: 3, flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
                        {QUICK_REACTIONS.map(emoji => (
                          <button key={emoji} onClick={() => toggleReaction(post.id, emoji)}
                            style={{ width: 30, height: 30, borderRadius: 10, background: myReactions.includes(emoji) ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)', border: myReactions.includes(emoji) ? '1px solid rgba(139,92,246,0.35)' : '1px solid transparent', fontSize: 15, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                      {/* Comment button */}
                      <button onClick={() => toggleComments(post.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 12, background: openComments === post.id ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif', flexShrink: 0 }}>
                        💬 {post.commentCount || 0}
                      </button>
                    </div>

                    {/* Comments section */}
                    {openComments === post.id && (
                      <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.05)', padding: '10px 14px 14px' }}>
                        {(comments[post.id] || []).map(c => (
                          <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: `${memberColor(c.authorId)}20`, border: `1px solid ${memberColor(c.authorId)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: memberColor(c.authorId) }}>
                              {c.authorPhoto ? <img src={c.authorPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : c.authorName?.[0]?.toUpperCase()}
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '7px 11px', flex: 1 }}>
                              <p style={{ color: memberColor(c.authorId), fontSize: 11, fontWeight: 700, margin: '0 0 2px' }}>{c.authorName}</p>
                              <p style={{ color: '#d1d5db', fontSize: 13, margin: 0, lineHeight: 1.4 }}>{c.text}</p>
                            </div>
                          </div>
                        ))}
                        {/* Comment input */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          <input value={commentText} onChange={e => setCommentText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && submitComment(post.id)}
                            placeholder="Reply in the circle..."
                            style={{ flex: 1, padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(139,92,246,0.2)', color: '#f3f4f6', fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none' }} />
                          <button onClick={() => submitComment(post.id)} disabled={!commentText.trim() || submittingComment}
                            style={{ padding: '8px 14px', borderRadius: 12, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif', opacity: commentText.trim() ? 1 : 0.4 }}>
                            {submittingComment ? '...' : '↑'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Members Modal */}
      {showMembers && (
        <div onClick={() => setShowMembers(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#0e0e18', borderRadius: '24px 24px 0 0', border: '0.5px solid rgba(139,92,246,0.25)', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 16, margin: 0 }}>👥 Members · {circle.memberIds?.length}</h3>
              <button onClick={() => setShowMembers(false)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 20px' }}>
              {(circle.members || []).map((m: any, i: number) => (
                <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}
                  onClick={() => { setShowMembers(false); if (m.uid !== user?.uid) router.push(`/profile/${m.uid}`); }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `1.5px solid ${MEMBER_COLORS[i % MEMBER_COLORS.length]}`, flexShrink: 0, background: `${MEMBER_COLORS[i % MEMBER_COLORS.length]}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: MEMBER_COLORS[i % MEMBER_COLORS.length], cursor: 'pointer' }}>
                    {m.photoURL ? <img src={m.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.name?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#f3f4f6', fontSize: 14, fontWeight: 600, margin: 0 }}>{m.name}{m.uid === user?.uid ? ' (You)' : ''}</p>
                    {m.role === 'host' && <p style={{ color: '#a78bfa', fontSize: 10, margin: 0 }}>👑 Circle Host</p>}
                  </div>
                  {m.uid !== user?.uid && <span style={{ color: '#4b5563', fontSize: 16 }}>›</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div onClick={() => setShowInvite(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#0e0e18', borderRadius: '24px 24px 0 0', border: '0.5px solid rgba(139,92,246,0.25)', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 20px 12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 16, margin: 0 }}>Invite to Circle</h3>
                <button onClick={() => setShowInvite(false)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>
              <input value={inviteSearch} onChange={e => setInviteSearch(e.target.value)}
                placeholder="Search people..."
                style={{ width: '100%', padding: '11px 15px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(139,92,246,0.25)', color: '#f3f4f6', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px 24px' }}>
              {filteredInvite.length === 0 ? (
                <p style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No one to invite</p>
              ) : filteredInvite.slice(0, 20).map((u: any) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(139,92,246,0.3)', flexShrink: 0, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>
                    {u.photoURL ? <img src={u.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : u.fullName?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#f3f4f6', fontSize: 14, fontWeight: 600, margin: 0 }}>{u.fullName}</p>
                    <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>@{u.username}</p>
                  </div>
                  <button onClick={() => inviteUser(u.id)} disabled={inviting === u.id || circle.memberIds?.includes(u.id)}
                    style={{ padding: '6px 16px', borderRadius: 20, background: circle.memberIds?.includes(u.id) ? 'rgba(34,197,94,0.1)' : 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: circle.memberIds?.includes(u.id) ? '#34d399' : 'white', fontSize: 12, fontWeight: 700, cursor: circle.memberIds?.includes(u.id) ? 'default' : 'pointer', fontFamily: 'Inter,sans-serif' }}>
                    {inviting === u.id ? '...' : circle.memberIds?.includes(u.id) ? '✓ In' : 'Invite'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function CircleDetailPage() {
  return <Suspense><CircleDetailContent /></Suspense>;
}
