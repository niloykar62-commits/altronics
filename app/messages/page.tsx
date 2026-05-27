'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDocs, orderBy,
  query, serverTimestamp, doc, getDoc, where,
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
    await loadMessages('conversations', convId);
  };

  const openGroup = async (group: any) => {
    setSelectedChat({ type: 'group', id: group.id, name: group.name, memberCount: group.members?.length || 0 });
    await loadMessages('groups', group.id);
  };

  const loadMessages = async (collectionName: string, chatId: string) => {
    try {
      const q = query(collection(db, collectionName, chatId, 'messages'), orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);
      setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
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

      // Notify for DMs
      if (selectedChat.type === 'dm') {
        await addDoc(collection(db, 'notifications'), {
          toUserId: selectedChat.otherUser.id, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'message', read: false, createdAt: serverTimestamp(),
        });
      }

      setNewMessage('');
      await loadMessages(collectionName, selectedChat.id);
    } catch (err) { console.error(err); }
  };

  const createGroup = async () => {
    if (!groupName.trim()) { alert('Enter a group name'); return; }
    if (selectedMembers.length === 0) { alert('Select at least 1 member'); return; }
    setCreating(true);
    try {
      const members = [user.uid, ...selectedMembers];
      const groupRef = await addDoc(collection(db, 'groups'), {
        name: groupName.trim(),
        members,
        createdBy: user.uid,
        createdByUsername: userProfile?.username || 'someone',
        createdAt: serverTimestamp(),
        avatar: groupName.trim()[0].toUpperCase(),
      });

      // Notify all members
      for (const memberId of selectedMembers) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: memberId, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'group_invite', read: false, createdAt: serverTimestamp(),
          groupName: groupName.trim(),
        });
      }

      setGroupName('');
      setSelectedMembers([]);
      setShowCreateGroup(false);
      await loadGroups(user.uid);
      alert(`Group "${groupName}" created! 🎉`);
    } catch (err: any) { alert('Failed: ' + err.message); }
    setCreating(false);
  };

  const toggleMember = (uid: string) => {
    setSelectedMembers((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
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
              <h2 style={{ fontSize: 18, fontWeight: 800, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
                Create Group
              </h2>
              <button onClick={() => setShowCreateGroup(false)}
                style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Group name */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Group Name</label>
              <input
                placeholder="e.g. Dev Squad, Friends..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Select members */}
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
              style={{ width: '100%', padding: 14, borderRadius: 14, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1, fontFamily: 'Inter,sans-serif', boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}>
              {creating ? 'Creating...' : `Create Group${selectedMembers.length > 0 ? ` (${selectedMembers.length + 1} members)` : ''}`}
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 100 }}>
        <div style={{ display: 'flex', height: 'calc(100vh - 140px)' }}>

          {/* Left panel */}
          <div style={{ width: 320, borderRight: '0.5px solid rgba(139,92,246,0.15)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

            {/* Header */}
            <div style={{ padding: '16px 16px 12px', borderBottom: '0.5px solid rgba(139,92,246,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h1 style={{ fontSize: 18, fontWeight: 800, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
                  Messages
                </h1>
                <button onClick={() => setShowCreateGroup(true)}
                  style={{ padding: '6px 14px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                  + Group
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3 }}>
                {(['dms', 'groups'] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: activeTab === tab ? 'rgba(139,92,246,0.2)' : 'transparent', border: 'none', color: activeTab === tab ? '#a78bfa' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'all 0.2s' }}>
                    {tab === 'dms' ? '💬 DMs' : '👥 Groups'}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            {activeTab === 'dms' && (
              <div style={{ padding: '10px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                <input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ ...inputStyle, padding: '8px 14px', borderRadius: 20 }}
                />
              </div>
            )}

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {activeTab === 'dms' ? (
                filteredUsers.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, padding: '24px 16px' }}>No users found</p>
                ) : filteredUsers.map((u: any) => (
                  <div key={u.id} onClick={() => openDM(u)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', borderBottom: '0.5px solid rgba(255,255,255,0.03)', background: selectedChat?.id === getConversationId(user.uid, u.id) ? 'rgba(139,92,246,0.1)' : 'transparent', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => { if (selectedChat?.id !== getConversationId(user.uid, u.id)) e.currentTarget.style.background = 'rgba(139,92,246,0.05)'; }}
                    onMouseLeave={(e) => { if (selectedChat?.id !== getConversationId(user.uid, u.id)) e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: '#a78bfa', flexShrink: 0 }}>
                      {u.fullName?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{u.fullName}</p>
                      <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>@{u.username}</p>
                    </div>
                  </div>
                ))
              ) : (
                groups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: '#6b7280' }}>
                    <p style={{ fontSize: 32, marginBottom: 8 }}>👥</p>
                    <p style={{ fontSize: 13 }}>No groups yet</p>
                    <p style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>Tap "+ Group" to create one</p>
                  </div>
                ) : groups.map((group) => (
                  <div key={group.id} onClick={() => openGroup(group)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', borderBottom: '0.5px solid rgba(255,255,255,0.03)', background: selectedChat?.id === group.id ? 'rgba(139,92,246,0.1)' : 'transparent', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => { if (selectedChat?.id !== group.id) e.currentTarget.style.background = 'rgba(139,92,246,0.05)'; }}
                    onMouseLeave={(e) => { if (selectedChat?.id !== group.id) e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: 'white', flexShrink: 0 }}>
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

          {/* Right panel — Chat window */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {selectedChat ? (
              <>
                {/* Chat header */}
                <div style={{ padding: '14px 20px', borderBottom: '0.5px solid rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: selectedChat.type === 'group' ? 10 : '50%', background: selectedChat.type === 'group' ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: selectedChat.type === 'group' ? 'white' : '#a78bfa' }}>
                    {selectedChat.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', margin: 0 }}>{selectedChat.name}</p>
                    <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>
                      {selectedChat.type === 'group' ? `${selectedChat.memberCount} members · Group chat` : `@${selectedChat.username}`}
                    </p>
                  </div>
                  {selectedChat.type === 'group' && (
                    <div style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 16, background: 'rgba(139,92,246,0.1)', border: '0.5px solid rgba(139,92,246,0.2)' }}>
                      <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600 }}>👥 Group</span>
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {messages.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#6b7280' }}>
                      <p style={{ fontSize: 32 }}>{selectedChat.type === 'group' ? '👥' : '💬'}</p>
                      <p style={{ fontSize: 13 }}>No messages yet. Say hello! 👋</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.senderId === user.uid;
                      return (
                        <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                          {!isMe && selectedChat.type === 'group' && (
                            <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 600, marginBottom: 3, marginLeft: 4 }}>
                              @{msg.senderUsername}
                            </span>
                          )}
                          <div style={{ maxWidth: '70%', padding: '10px 14px', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: isMe ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)', border: isMe ? 'none' : '0.5px solid rgba(255,255,255,0.08)' }}>
                            <p style={{ fontSize: 13, color: 'white', margin: 0, lineHeight: 1.5 }}>{msg.content}</p>
                            <p style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.6)' : '#4b5563', margin: '4px 0 0', textAlign: 'right' }}>
                              {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Input */}
                <div style={{ padding: '12px 20px', borderTop: '0.5px solid rgba(139,92,246,0.15)', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    placeholder={`Message ${selectedChat.type === 'group' ? selectedChat.name : selectedChat.name}...`}
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
                <button onClick={() => setShowCreateGroup(true)}
                  style={{ marginTop: 8, padding: '10px 24px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                  + Create Group Chat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
