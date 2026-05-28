'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDocs, orderBy,
  query, serverTimestamp, doc, getDoc, where,
  updateDoc, onSnapshot, setDoc, deleteDoc,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';

export default function Messages() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [pageLoading, setPageLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'dms' | 'groups'>('dms');
  const [groups, setGroups] = useState<any[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState<'video' | 'voice'>('video');
  const [callRoomId, setCallRoomId] = useState('');
  const jitsiRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/login'); return; }
      setUser(firebaseUser);
      const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (profileDoc.exists()) setUserProfile(profileDoc.data());
      await loadAllUsers(firebaseUser.uid);
      await loadGroups(firebaseUser.uid);
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // ── Presence: write online status, clean up on leave ──────────────────────
  useEffect(() => {
    if (!user) return;
    const presenceRef = doc(db, 'presence', user.uid);
    setDoc(presenceRef, { online: true, lastSeen: serverTimestamp() });
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setDoc(presenceRef, { online: false, lastSeen: serverTimestamp() });
      } else {
        setDoc(presenceRef, { online: true, lastSeen: serverTimestamp() });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', () =>
      setDoc(presenceRef, { online: false, lastSeen: serverTimestamp() })
    );
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      setDoc(presenceRef, { online: false, lastSeen: serverTimestamp() });
    };
  }, [user]);

  // ── Listen to online status of all users in real-time ────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'presence'), (snap) => {
      const map: Record<string, boolean> = {};
      snap.docs.forEach((d) => { map[d.id] = d.data().online === true; });
      setOnlineUsers(map);
    });
    return () => unsub();
  }, []);

  // Load Jitsi script
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).JitsiMeetExternalAPI) {
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const loadAllUsers = async (uid: string) => {
    const snapshot = await getDocs(collection(db, 'users'));
    setAllUsers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u: any) => u.id !== uid));
  };

  const loadGroups = async (uid: string) => {
    try {
      const q = query(collection(db, 'groups'), where('members', 'array-contains', uid));
      const snapshot = await getDocs(q);
      setGroups(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  };

  const getConversationId = (uid1: string, uid2: string) => [uid1, uid2].sort().join('_');

  const openDM = async (otherUser: any) => {
    const convId = getConversationId(user.uid, otherUser.id);
    setSelectedChat({ type: 'dm', id: convId, name: otherUser.fullName, username: otherUser.username, otherUser });
    setInCall(false);
    await loadMessages('conversations', convId);
    await markMessagesAsSeen('conversations', convId);
  };

  const openGroup = async (group: any) => {
    setSelectedChat({ type: 'group', id: group.id, name: group.name, memberCount: group.members?.length || 0 });
    setInCall(false);
    await loadMessages('groups', group.id);
  };

  const loadMessages = async (collectionName: string, chatId: string) => {
    try {
      const q = query(collection(db, collectionName, chatId, 'messages'), orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);
      setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    } catch (err) { console.error(err); }
  };

  const markMessagesAsSeen = async (collectionName: string, chatId: string) => {
    if (!user) return;
    try {
      const q = query(collection(db, collectionName, chatId, 'messages'), orderBy('createdAt', 'asc'));
      const snap = await getDocs(q);
      const batch: Promise<void>[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        const seenBy: string[] = data.seenBy || [];
        if (data.senderId !== user.uid && !seenBy.includes(user.uid)) {
          batch.push(updateDoc(doc(db, collectionName, chatId, 'messages', d.id), {
            seenBy: [...seenBy, user.uid],
          }));
        }
      });
      await Promise.all(batch);
    } catch (err) { console.error(err); }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !selectedChat) return;
    const collectionName = selectedChat.type === 'group' ? 'groups' : 'conversations';
    try {
      await addDoc(collection(db, collectionName, selectedChat.id, 'messages'), {
        senderId: user.uid,
        senderUsername: userProfile?.username || 'me',
        senderFullName: userProfile?.fullName || 'User',
        content: newMessage.trim(),
        createdAt: serverTimestamp(),
      });
      if (selectedChat.type === 'dm') {
        await addDoc(collection(db, 'notifications'), {
          toUserId: selectedChat.otherUser.id, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'message', read: false, createdAt: serverTimestamp(),
        });
      }
      setNewMessage('');
      await loadMessages(collectionName, selectedChat.id);
      if (selectedChat.type === 'dm') await markMessagesAsSeen(collectionName, selectedChat.id);
    } catch (err) { console.error(err); }
  };

  const startCall = (type: 'video' | 'voice') => {
    if (!selectedChat) return;
    setCallType(type);
    // Create unique room ID based on chat
    const roomId = `altronics-${selectedChat.id}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, '-');
    setCallRoomId(roomId);
    setInCall(true);

    // Send call notification message in chat
    const collectionName = selectedChat.type === 'group' ? 'groups' : 'conversations';
    addDoc(collection(db, collectionName, selectedChat.id, 'messages'), {
      senderId: user.uid,
      senderUsername: userProfile?.username || 'me',
      senderFullName: userProfile?.fullName || 'User',
      content: `📞 Started a ${type} call — Join: https://meet.jit.si/${roomId}`,
      isCallMessage: true,
      callRoomId: roomId,
      callType: type,
      createdAt: serverTimestamp(),
    });
  };

  const endCall = () => {
    if (jitsiRef.current) {
      jitsiRef.current.dispose();
      jitsiRef.current = null;
    }
    setInCall(false);
    setCallRoomId('');
  };

  // Initialize Jitsi when call starts
  useEffect(() => {
    if (!inCall || !callRoomId) return;
    const initJitsi = () => {
      if (!(window as any).JitsiMeetExternalAPI) {
        setTimeout(initJitsi, 500);
        return;
      }
      if (jitsiRef.current) { jitsiRef.current.dispose(); }
      const api = new (window as any).JitsiMeetExternalAPI('meet.jit.si', {
        roomName: callRoomId,
        parentNode: document.getElementById('jitsi-container'),
        width: '100%',
        height: '100%',
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: callType === 'voice',
          disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: callType === 'voice'
            ? ['microphone', 'hangup', 'chat']
            : ['microphone', 'camera', 'hangup', 'chat', 'fullscreen'],
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          SHOW_BRAND_WATERMARK: false,
          DEFAULT_REMOTE_DISPLAY_NAME: 'Altronics User',
          APP_NAME: 'Altronics',
        },
        userInfo: {
          displayName: userProfile?.fullName || 'User',
        },
      });
      api.addEventListener('videoConferenceLeft', endCall);
      jitsiRef.current = api;
    };
    initJitsi();
    return () => {
      if (jitsiRef.current) { jitsiRef.current.dispose(); jitsiRef.current = null; }
    };
  }, [inCall, callRoomId]);

  const createGroup = async () => {
    if (!groupName.trim()) { alert('Enter a group name'); return; }
    if (selectedMembers.length === 0) { alert('Select at least 1 member'); return; }
    setCreating(true);
    try {
      const members = [user.uid, ...selectedMembers];
      await addDoc(collection(db, 'groups'), {
        name: groupName.trim(), members,
        createdBy: user.uid, createdByUsername: userProfile?.username || 'someone',
        createdAt: serverTimestamp(), avatar: groupName.trim()[0].toUpperCase(),
      });
      for (const memberId of selectedMembers) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: memberId, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'group_invite', read: false, createdAt: serverTimestamp(),
          groupName: groupName.trim(),
        });
      }
      setGroupName(''); setSelectedMembers([]); setShowCreateGroup(false);
      await loadGroups(user.uid);
      alert(`Group "${groupName}" created! 🎉`);
    } catch (err: any) { alert('Failed: ' + err.message); }
    setCreating(false);
  };

  const toggleMember = (uid: string) => {
    setSelectedMembers((prev) => prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]);
  };

  const filteredUsers = allUsers.filter((u: any) =>
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.fullName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: 'rgba(139,92,246,0.08)',
    border: '0.5px solid rgba(139,92,246,0.2)',
    borderRadius: 12, color: '#f3f4f6', fontSize: 13,
    fontFamily: 'Inter,sans-serif', outline: 'none',
  };

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#a78bfa', fontWeight: 700 }}>ALTRONICS</p>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif' }}>
      <Navbar />

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#111118', border: '0.5px solid rgba(139,92,246,0.3)', borderRadius: 24, padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>Create Group</h2>
              <button onClick={() => setShowCreateGroup(false)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Group Name</label>
              <input placeholder="e.g. Dev Squad..." value={groupName} onChange={(e) => setGroupName(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Add Members ({selectedMembers.length} selected)
              </label>
              <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allUsers.map((u: any) => {
                  const isSelected = selectedMembers.includes(u.id);
                  return (
                    <div key={u.id} onClick={() => toggleMember(u.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: isSelected ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)', border: isSelected ? '0.5px solid rgba(139,92,246,0.4)' : '0.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'all 0.2s' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#a78bfa', flexShrink: 0 }}>
                        {u.fullName?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{u.fullName}</p>
                        <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>@{u.username}</p>
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: isSelected ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'white', flexShrink: 0 }}>
                        {isSelected ? '✓' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <button onClick={createGroup} disabled={creating}
              style={{ width: '100%', padding: 14, borderRadius: 14, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1, fontFamily: 'Inter,sans-serif' }}>
              {creating ? 'Creating...' : `Create Group${selectedMembers.length > 0 ? ` (${selectedMembers.length + 1} members)` : ''}`}
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', height: 'calc(100vh - 50px)', position: 'relative', overflow: 'hidden' }}>

          {/* Left panel — slides out on mobile when chat is open */}
          <div style={{
            flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            borderRight: '0.5px solid rgba(139,92,246,0.15)',
            background: '#0a0a0f',
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: '100%',
            maxWidth: 320,
            zIndex: 10,
            transform: selectedChat ? 'translateX(-100%)' : 'translateX(0)',
            transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
          }}>
            <div style={{ padding: '16px 16px 12px', borderBottom: '0.5px solid rgba(139,92,246,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h1 style={{ fontSize: 18, fontWeight: 800, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>Messages</h1>
                <button onClick={() => setShowCreateGroup(true)}
                  style={{ padding: '5px 12px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                  + Group
                </button>
              </div>
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3 }}>
                {(['dms', 'groups'] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: activeTab === tab ? 'rgba(139,92,246,0.2)' : 'transparent', border: 'none', color: activeTab === tab ? '#a78bfa' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                    {tab === 'dms' ? '💬 DMs' : '👥 Groups'}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'dms' && (
              <div style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                <input placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ ...inputStyle, padding: '8px 14px', borderRadius: 20 }} />
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
              {activeTab === 'dms' ? (
                filteredUsers.map((u: any) => (
                  <div key={u.id} onClick={() => openDM(u)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', borderBottom: '0.5px solid rgba(255,255,255,0.03)', background: selectedChat?.otherUser?.id === u.id ? 'rgba(139,92,246,0.1)' : 'transparent', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => { if (selectedChat?.otherUser?.id !== u.id) e.currentTarget.style.background = 'rgba(139,92,246,0.05)'; }}
                    onMouseLeave={(e) => { if (selectedChat?.otherUser?.id !== u.id) e.currentTarget.style.background = 'transparent'; }}>
                    {/* Avatar with online dot */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#a78bfa' }}>
                        {u.fullName?.[0]?.toUpperCase() || 'U'}
                      </div>
                      {onlineUsers[u.id] && (
                        <div style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: '#22c55e', border: '2px solid #0a0a0f' }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{u.fullName}</p>
                      <p style={{ fontSize: 11, color: onlineUsers[u.id] ? '#22c55e' : '#6b7280', margin: 0, fontWeight: onlineUsers[u.id] ? 600 : 400 }}>
                        {onlineUsers[u.id] ? '● Active now' : `@${u.username}`}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                groups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: '#6b7280' }}>
                    <p style={{ fontSize: 32, marginBottom: 8 }}>👥</p>
                    <p style={{ fontSize: 13 }}>No groups yet</p>
                    <p style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>Tap "+ Group" to create</p>
                  </div>
                ) : groups.map((group) => (
                  <div key={group.id} onClick={() => openGroup(group)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', borderBottom: '0.5px solid rgba(255,255,255,0.03)', background: selectedChat?.id === group.id ? 'rgba(139,92,246,0.1)' : 'transparent', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => { if (selectedChat?.id !== group.id) e.currentTarget.style.background = 'rgba(139,92,246,0.05)'; }}
                    onMouseLeave={(e) => { if (selectedChat?.id !== group.id) e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: 'white', flexShrink: 0 }}>
                      {group.avatar || group.name?.[0]?.toUpperCase() || 'G'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{group.name}</p>
                      <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>{group.members?.length || 0} members</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right panel — full screen on mobile */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', flexDirection: 'column',
            background: '#0a0a0f',
            transform: selectedChat ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
            zIndex: 20,
          }}>
            {selectedChat ? (
              <>
                {/* Chat header with back button + call buttons */}
                <div style={{ padding: '12px 16px', borderBottom: '0.5px solid rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Back button */}
                  <button onClick={() => { setSelectedChat(null); setInCall(false); setMessages([]); }}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(139,92,246,0.12)', border: '0.5px solid rgba(139,92,246,0.25)', color: '#a78bfa', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>
                    ‹
                  </button>
                  <div style={{ width: 36, height: 36, borderRadius: selectedChat.type === 'group' ? 10 : '50%', background: selectedChat.type === 'group' ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: selectedChat.type === 'group' ? 'white' : '#a78bfa', flexShrink: 0 }}>
                    {selectedChat.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedChat.name}</p>
                    <p style={{ fontSize: 11, margin: 0, display: 'flex', alignItems: 'center', gap: 4,
                      color: selectedChat.type === 'dm' && onlineUsers[selectedChat.otherUser?.id] ? '#22c55e' : '#6b7280',
                      fontWeight: selectedChat.type === 'dm' && onlineUsers[selectedChat.otherUser?.id] ? 600 : 400,
                    }}>
                      {selectedChat.type === 'dm' && onlineUsers[selectedChat.otherUser?.id] && (
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                      )}
                      {selectedChat.type === 'group'
                        ? `${selectedChat.memberCount} members`
                        : onlineUsers[selectedChat.otherUser?.id] ? 'Active now' : `@${selectedChat.username}`}
                    </p>
                  </div>

                  {/* Call buttons */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startCall('voice')}
                      style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', border: '0.5px solid rgba(52,211,153,0.3)', color: '#34d399', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                      title="Voice call"
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(52,211,153,0.25)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(52,211,153,0.15)')}>
                      📞
                    </button>
                    <button onClick={() => startCall('video')}
                      style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(139,92,246,0.15)', border: '0.5px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                      title="Video call"
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.25)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.15)')}>
                      🎥
                    </button>
                  </div>
                </div>

                {/* Jitsi call window */}
                {inCall && (
                  <div style={{ position: 'relative', background: '#000', borderBottom: '0.5px solid rgba(139,92,246,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: 'rgba(139,92,246,0.1)' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#a78bfa' }}>
                        {callType === 'video' ? '🎥 Video Call' : '📞 Voice Call'} · {selectedChat.name}
                      </span>
                      <button onClick={endCall}
                        style={{ padding: '5px 14px', borderRadius: 16, background: 'rgba(239,68,68,0.2)', border: '0.5px solid rgba(239,68,68,0.4)', color: '#f87171', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                        End Call
                      </button>
                    </div>
                    <div id="jitsi-container" style={{ width: '100%', height: 360 }} />
                  </div>
                )}

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {messages.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#6b7280' }}>
                      <p style={{ fontSize: 32 }}>{selectedChat.type === 'group' ? '👥' : '💬'}</p>
                      <p style={{ fontSize: 13 }}>No messages yet. Say hello! 👋</p>
                      <p style={{ fontSize: 12, color: '#4b5563' }}>Use 📞 or 🎥 buttons above to start a call</p>
                    </div>
                  ) : messages.map((msg) => {
                    const isMe = msg.senderId === user.uid;
                    if (msg.isCallMessage) {
                      return (
                        <div key={msg.id} style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 20, background: 'rgba(139,92,246,0.1)', border: '0.5px solid rgba(139,92,246,0.2)' }}>
                            <span style={{ fontSize: 14 }}>{msg.callType === 'video' ? '🎥' : '📞'}</span>
                            <span style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600 }}>
                              {isMe ? 'You' : `@${msg.senderUsername}`} started a {msg.callType} call
                            </span>
                            <a href={`https://meet.jit.si/${msg.callRoomId}`} target="_blank" rel="noreferrer"
                              style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'underline', cursor: 'pointer' }}>
                              Join
                            </a>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        {!isMe && selectedChat.type === 'group' && (
                          <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 600, marginBottom: 3, marginLeft: 4 }}>
                            @{msg.senderUsername}
                          </span>
                        )}
                        <div style={{ maxWidth: '70%', padding: '10px 14px', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: isMe ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)', border: isMe ? 'none' : '0.5px solid rgba(255,255,255,0.08)' }}>
                          <p style={{ fontSize: 13, color: 'white', margin: 0, lineHeight: 1.5 }}>{msg.content}</p>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                            <span style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.6)' : '#4b5563' }}>
                              {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                            {isMe && selectedChat.type === 'dm' && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: (msg.seenBy || []).includes(selectedChat.otherUser?.id) ? '#60a5fa' : 'rgba(255,255,255,0.35)' }}
                                title={(msg.seenBy || []).includes(selectedChat.otherUser?.id) ? 'Seen' : 'Sent'}>
                                {(msg.seenBy || []).includes(selectedChat.otherUser?.id) ? '✓✓' : '✓'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message input */}
                <div style={{ padding: '12px 20px 20px', borderTop: '0.5px solid rgba(139,92,246,0.15)', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    placeholder={`Message ${selectedChat.name}...`}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
                    style={{ ...inputStyle, flex: 1, borderRadius: 24, padding: '10px 16px' }}
                  />
                  <button onClick={sendMessage} disabled={!newMessage.trim()}
                    style={{ padding: '10px 20px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: newMessage.trim() ? 'pointer' : 'not-allowed', opacity: newMessage.trim() ? 1 : 0.5, fontFamily: 'Inter,sans-serif' }}>
                    Send
                  </button>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#6b7280' }}>
                <p style={{ fontSize: 48 }}>💬</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#9ca3af' }}>Your Messages</p>
                <p style={{ fontSize: 13 }}>Select a DM or group to start chatting</p>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <div style={{ textAlign: 'center', padding: '12px 20px', borderRadius: 16, background: 'rgba(52,211,153,0.08)', border: '0.5px solid rgba(52,211,153,0.2)' }}>
                    <p style={{ fontSize: 24, margin: '0 0 4px' }}>📞</p>
                    <p style={{ fontSize: 11, color: '#34d399', fontWeight: 600, margin: 0 }}>Voice Calls</p>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px 20px', borderRadius: 16, background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.2)' }}>
                    <p style={{ fontSize: 24, margin: '0 0 4px' }}>🎥</p>
                    <p style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, margin: 0 }}>Video Calls</p>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px 20px', borderRadius: 16, background: 'rgba(59,130,246,0.08)', border: '0.5px solid rgba(59,130,246,0.2)' }}>
                    <p style={{ fontSize: 24, margin: '0 0 4px' }}>👥</p>
                    <p style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600, margin: 0 }}>Group Chat</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Inline bottom nav for messages page */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
        background: selectedChat ? 'transparent' : 'rgba(10,10,15,0.95)',
        backdropFilter: selectedChat ? 'none' : 'blur(20px)',
        borderTop: selectedChat ? 'none' : '0.5px solid rgba(139,92,246,0.15)',
        padding: selectedChat ? '0' : '8px 0 16px',
        pointerEvents: selectedChat ? 'none' : 'auto',
        transition: 'all 0.3s',
      }}>
        {!selectedChat && (
          <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            {[
              { href: '/feed', icon: '🏠', label: 'Home' },
              { href: '/stories', icon: '✨', label: 'Stories' },
              { href: '/search', icon: '🔍', label: 'Search' },
              { href: '/messages', icon: '💬', label: 'DMs', active: true },
              { href: '/notifications', icon: '🔔', label: 'Alerts' },
              { href: '/profile', icon: '👤', label: 'Profile' },
            ].map(({ href, icon, label, active }) => (
              <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 12px', borderRadius: 14, background: active ? 'rgba(139,92,246,0.15)' : 'transparent', cursor: 'pointer' }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: active ? '#a78bfa' : '#6b7280' }}>{label}</span>
                  {active && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#a78bfa' }} />}
                </div>
              </Link>
            ))}
          </div>
        )}
      </nav>
    </div>
  );
}
