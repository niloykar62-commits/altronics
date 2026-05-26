'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDocs, orderBy, query,
  serverTimestamp, doc, getDoc, onSnapshot,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';

export default function Messages() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [pageLoading, setPageLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/login'); return; }
      setUser(firebaseUser);
      const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (profileDoc.exists()) setUserProfile(profileDoc.data());
      await loadUsers(firebaseUser.uid);
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !selectedUser) return;
    const chatId = getChatId(user.uid, selectedUser.id);
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    return () => unsubscribe();
  }, [selectedUser, user]);

  const getChatId = (uid1: string, uid2: string) => [uid1, uid2].sort().join('_');

  const loadUsers = async (uid: string) => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      setAllUsers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u: any) => u.id !== uid));
    } catch (err) { console.error(err); }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !selectedUser) return;
    const chatId = getChatId(user.uid, selectedUser.id);
    const text = newMessage.trim();
    setNewMessage('');
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: user.uid,
        senderUsername: userProfile?.username || 'anonymous',
        content: text,
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'notifications'), {
        toUserId: selectedUser.id, fromUserId: user.uid,
        fromUsername: userProfile?.username || 'someone',
        type: 'message', read: false, createdAt: serverTimestamp(),
      });
    } catch (err) { console.error(err); }
  };

  const filteredUsers = allUsers.filter((u: any) =>
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.fullName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const avatarColors = [
    { bg: 'linear-gradient(135deg,rgba(139,92,246,0.5),rgba(59,130,246,0.5))',  color: '#a78bfa', border: 'rgba(139,92,246,0.4)' },
    { bg: 'linear-gradient(135deg,rgba(59,130,246,0.5),rgba(52,211,153,0.5))',  color: '#60a5fa', border: 'rgba(59,130,246,0.4)' },
    { bg: 'linear-gradient(135deg,rgba(236,72,153,0.5),rgba(139,92,246,0.5))', color: '#f472b6', border: 'rgba(236,72,153,0.4)' },
    { bg: 'linear-gradient(135deg,rgba(52,211,153,0.5),rgba(59,130,246,0.5))', color: '#34d399', border: 'rgba(52,211,153,0.4)' },
  ];
  const getAv = (idx: number) => avatarColors[idx % avatarColors.length];

  if (pageLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: '#6b7280', fontSize: 13, fontFamily: 'Inter,sans-serif' }}>Loading messages...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── CHAT VIEW (tap a user → full screen chat) ──────────────────────────────
  if (selectedUser) {
    const selIdx = allUsers.findIndex((u) => u.id === selectedUser.id);
    const av = getAv(selIdx);
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', display: 'flex', flexDirection: 'column' }}>
        {/* Sticky chat header with back button */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(20px)',
          borderBottom: '0.5px solid rgba(139,92,246,0.15)',
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button
            onClick={() => setSelectedUser(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa', fontSize: 24, lineHeight: 1, padding: '0 6px 0 0', flexShrink: 0 }}
          >
            ←
          </button>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: av.bg, border: `1px solid ${av.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: av.color, flexShrink: 0 }}>
            {selectedUser.fullName?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#f3f4f6', margin: 0 }}>{selectedUser.fullName}</p>
            <p style={{ fontSize: 11, color: '#a78bfa', margin: 0 }}>@{selectedUser.username}</p>
          </div>
        </div>

        {/* Messages scroll area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 80 }}>
              <span style={{ fontSize: 40 }}>👋</span>
              <p style={{ color: '#6b7280', fontSize: 13 }}>No messages yet. Say hello!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === user?.uid;
              return (
                <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '78%', padding: '10px 14px',
                    borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: isMe ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.07)',
                    border: isMe ? 'none' : '0.5px solid rgba(255,255,255,0.08)',
                  }}>
                    <p style={{ fontSize: 14, color: '#f3f4f6', lineHeight: 1.5, margin: 0, marginBottom: 4 }}>{msg.content}</p>
                    <p style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.55)' : '#4b5563', margin: 0, textAlign: isMe ? 'right' : 'left' }}>
                      {msg.createdAt?.toDate
                        ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Fixed input bar at bottom */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'rgba(10,10,15,0.98)', backdropFilter: 'blur(20px)',
          borderTop: '0.5px solid rgba(139,92,246,0.15)',
          padding: '10px 14px 28px', display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <input
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            style={{ flex: 1, padding: '12px 16px', background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.25)', borderRadius: 24, color: '#f3f4f6', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none' }}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            style={{ width: 46, height: 46, borderRadius: '50%', background: newMessage.trim() ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(139,92,246,0.1)', border: 'none', cursor: newMessage.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, transition: 'all 0.2s', boxShadow: newMessage.trim() ? '0 4px 16px rgba(139,92,246,0.4)' : 'none' }}
          >
            ➤
          </button>
        </div>
      </div>
    );
  }

  // ── USERS LIST VIEW ────────────────────────────────────────────────────────
  return (
    <>
      <Navbar />
      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 100 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 0' }}>

          <h1 style={{ fontSize: 20, fontWeight: 700, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 16 }}>
            💬 Messages
          </h1>

          {/* Search bar */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#6b7280' }}>🔍</span>
            <input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '12px 16px 12px 40px', background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 14, color: '#f3f4f6', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none' }}
            />
          </div>

          {/* User list */}
          {filteredUsers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <p style={{ fontSize: 40, marginBottom: 10 }}>💬</p>
              <p style={{ color: '#6b7280', fontSize: 14 }}>No users found</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredUsers.map((u: any, idx) => {
                const av = getAv(idx);
                return (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                  >
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: av.bg, border: `1px solid ${av.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700, color: av.color, flexShrink: 0 }}>
                      {u.fullName?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: '#f3f4f6', margin: 0, marginBottom: 3 }}>{u.fullName}</p>
                      <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>@{u.username}</p>
                    </div>
                    <span style={{ color: '#4b5563', fontSize: 20, paddingRight: 4 }}>›</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
