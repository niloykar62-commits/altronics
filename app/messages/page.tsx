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

  const avatarColors = ['rgba(139,92,246,0.3)', 'rgba(59,130,246,0.3)', 'rgba(236,72,153,0.3)', 'rgba(52,211,153,0.3)'];
  const avatarText = ['#a78bfa', '#60a5fa', '#f472b6', '#34d399'];
  const getAvatarStyle = (idx: number) => ({
    background: `linear-gradient(135deg, ${avatarColors[idx % 4]}, ${avatarColors[(idx + 1) % 4]})`,
    color: avatarText[idx % 4],
    border: `1px solid ${avatarText[idx % 4]}44`,
  });

  if (pageLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: '#6b7280', fontSize: 13 }}>Loading messages...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', display: 'flex', flexDirection: 'column' }}>

        {/* Page title */}
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: '20px 20px 0' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 16 }}>
            💬 Messages
          </h1>
        </div>

        {/* Main layout */}
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: '0 20px 100px', display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>

          {/* ── Users sidebar ── */}
          <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#6b7280' }}>🔍</span>
              <input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '10px 14px 10px 36px', background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 12, color: '#f3f4f6', fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none' }}
              />
            </div>

            {/* User list */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredUsers.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 12, padding: '20px 0' }}>No users found</p>
              ) : (
                filteredUsers.map((u: any, idx) => {
                  const isSelected = selectedUser?.id === u.id;
                  return (
                    <div
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, cursor: 'pointer', background: isSelected ? 'rgba(139,92,246,0.15)' : 'transparent', border: isSelected ? '0.5px solid rgba(139,92,246,0.3)' : '0.5px solid transparent', transition: 'all 0.2s' }}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0, ...getAvatarStyle(idx) }}>
                        {u.fullName?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.fullName}</p>
                        <p style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{u.username}</p>
                      </div>
                      {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', flexShrink: 0 }} />}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Chat window ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(17,17,24,0.8)', backdropFilter: 'blur(20px)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 20, overflow: 'hidden', minHeight: 500 }}>

            {!selectedUser ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <span style={{ fontSize: 48 }}>💬</span>
                <p style={{ color: '#6b7280', fontSize: 14 }}>Select someone to start chatting</p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div style={{ padding: '14px 18px', borderBottom: '0.5px solid rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(139,92,246,0.05)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, ...getAvatarStyle(allUsers.findIndex(u => u.id === selectedUser.id)) }}>
                    {selectedUser.fullName?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#f3f4f6', marginBottom: 1 }}>{selectedUser.fullName}</p>
                    <p style={{ fontSize: 11, color: '#a78bfa' }}>@{selectedUser.username}</p>
                  </div>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {messages.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <span style={{ fontSize: 36 }}>👋</span>
                      <p style={{ color: '#6b7280', fontSize: 13 }}>No messages yet. Say hello!</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.senderId === user?.uid;
                      return (
                        <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                          <div style={{
                            maxWidth: '70%', padding: '10px 14px', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                            background: isMe ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)',
                            border: isMe ? 'none' : '0.5px solid rgba(255,255,255,0.08)',
                          }}>
                            <p style={{ fontSize: 13, color: '#f3f4f6', lineHeight: 1.5, marginBottom: 4 }}>{msg.content}</p>
                            <p style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.6)' : '#4b5563', textAlign: isMe ? 'right' : 'left' }}>
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

                {/* Input */}
                <div style={{ padding: '12px 16px', borderTop: '0.5px solid rgba(139,92,246,0.15)', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    style={{ flex: 1, padding: '11px 16px', background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.2)', borderRadius: 14, color: '#f3f4f6', fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none' }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    style={{ width: 42, height: 42, borderRadius: '50%', background: newMessage.trim() ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(139,92,246,0.1)', border: 'none', cursor: newMessage.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, transition: 'all 0.2s', boxShadow: newMessage.trim() ? '0 4px 16px rgba(139,92,246,0.35)' : 'none' }}
                  >
                    ➤
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
