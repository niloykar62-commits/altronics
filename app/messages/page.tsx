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
import EmojiPicker, { QuickReactionBar, ReactionBubbles } from '@/components/EmojiPicker';

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
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // ── Emoji state ───────────────────────────────────────────────────────────
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [msgPickerOpenId, setMsgPickerOpenId] = useState<string | null>(null);

  // ── Edit / Delete state ───────────────────────────────────────────────────
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [msgMenuOpenId, setMsgMenuOpenId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);   // ← NEW: Fixed context menu

  // ── Close msg context menu on outside click ───────────────────────────────
  useEffect(() => {
    if (!msgMenuOpenId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMsgMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [msgMenuOpenId]);

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
    const groupDoc = await getDoc(doc(db, 'groups', group.id));
    const fullGroup = groupDoc.exists() ? { id: group.id, ...groupDoc.data() } : group;
    setSelectedChat({ type: 'group', id: group.id, name: fullGroup.name, memberCount: fullGroup.members?.length || 0, groupData: fullGroup });
    setInCall(false);
    setShowGroupInfo(false);
    await loadMessages('groups', group.id);
    await loadGroupInfo(group.id);
  };

  const loadGroupInfo = async (groupId: string) => {
    try {
      const groupDoc = await getDoc(doc(db, 'groups', groupId));
      if (!groupDoc.exists()) return;
      const data = { id: groupId, ...groupDoc.data() } as any;
      const memberProfiles = await Promise.all(
        (data.members || []).map(async (uid: string) => {
          const uDoc = await getDoc(doc(db, 'users', uid));
          return uDoc.exists() ? { id: uid, ...uDoc.data() } : { id: uid, fullName: 'Unknown', username: uid };
        })
      );
      setGroupInfo({ ...data, memberProfiles });
    } catch (err) { console.error(err); }
  };

  const isGroupAdmin = () => groupInfo && (groupInfo.createdBy === user?.uid || (groupInfo.admins || []).includes(user?.uid));

  // ... (All your group management functions remain unchanged)

  const renameGroup = async () => {
    if (!newGroupName.trim() || !groupInfo) return;
    try {
      await updateDoc(doc(db, 'groups', groupInfo.id), { name: newGroupName.trim(), avatar: newGroupName.trim()[0].toUpperCase() });
      setGroupInfo((prev: any) => ({ ...prev, name: newGroupName.trim() }));
      setSelectedChat((prev: any) => ({ ...prev, name: newGroupName.trim() }));
      await loadGroups(user.uid);
      setEditingGroupName(false);
      setNewGroupName('');
    } catch (err: any) { alert('Failed: ' + err.message); }
  };

  const leaveGroup = async () => { /* unchanged */ };
  const removeMember = async (memberId: string) => { /* unchanged */ };
  const toggleAdmin = async (memberId: string) => { /* unchanged */ };
  const addMemberToGroup = async (memberId: string) => { /* unchanged */ };

  const loadMessages = async (collectionName: string, chatId: string) => {
    try {
      const q = query(collection(db, collectionName, chatId, 'messages'), orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);
      setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    } catch (err) { console.error(err); }
  };

  const markMessagesAsSeen = async (collectionName: string, chatId: string) => { /* unchanged */ };

  const sendMessage = async () => { /* unchanged */ };

  const startCall = (type: 'video' | 'voice') => { /* unchanged */ };
  const endCall = () => { /* unchanged */ };
  // Jitsi useEffect remains unchanged

  const createGroup = async () => { /* unchanged */ };
  const toggleMember = (uid: string) => { /* unchanged */ };
  const filteredUsers = allUsers.filter((u: any) => /* unchanged */ );

  const renderContent = (text: string) => { /* unchanged */ };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { /* unchanged */ };
  const insertMention = (username: string) => { /* unchanged */ };
  const toggleReaction = async (msg: any, emoji: string) => { /* unchanged */ };

  // ── FIXED: Edit & Delete Functions ───────────────────────────────────────
  const startEdit = (msg: any) => {
    setEditingMsgId(msg.id);
    setEditingContent(msg.content);
    setMsgMenuOpenId(null);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const saveEdit = async (msg: any) => {
    const trimmed = editingContent.trim();
    if (!trimmed || !selectedChat) return;
    if (trimmed === msg.content) { 
      setEditingMsgId(null); 
      setEditingContent(''); 
      return; 
    }
    const collectionName = selectedChat.type === 'group' ? 'groups' : 'conversations';
    try {
      await updateDoc(doc(db, collectionName, selectedChat.id, 'messages', msg.id), {
        content: trimmed,
        editedAt: serverTimestamp(),
      });
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, content: trimmed, editedAt: true } : m));
    } catch (err) { 
      console.error(err); 
      alert('Failed to edit message'); 
    }
    setEditingMsgId(null);
    setEditingContent('');
  };

  const cancelEdit = () => { 
    setEditingMsgId(null); 
    setEditingContent(''); 
  };

  const deleteMessage = async (msg: any) => {
    if (!selectedChat || !user) return;
    if (!confirm('Delete this message?')) return;
    setMsgMenuOpenId(null);
    const collectionName = selectedChat.type === 'group' ? 'groups' : 'conversations';
    try {
      await updateDoc(doc(db, collectionName, selectedChat.id, 'messages', msg.id), {
        content: '',
        deleted: true,
        deletedAt: serverTimestamp(),
      });
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, content: '', deleted: true } : m));
    } catch (err) { 
      console.error(err); 
      alert('Failed to delete message'); 
    }
  };

  const inputStyle: React.CSSProperties = { /* unchanged */ };

  if (pageLoading) return ( /* unchanged */ );

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif' }}>
      <Navbar />

      {/* Create Group Modal - unchanged */}

      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', height: 'calc(100vh - 50px)', position: 'relative', overflow: 'hidden' }}>

          {/* Left panel - unchanged */}

          {/* Right panel */}
          <div style={{ /* unchanged */ }}>
            {selectedChat ? (
              <>
                {/* Header - unchanged */}

                {/* Group Info Panel - unchanged */}

                {/* Jitsi call window - unchanged */}

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {messages.length === 0 ? ( /* unchanged */ ) : messages.map((msg) => {
                    const isMe = msg.senderId === user.uid;
                    if (msg.isCallMessage) { /* unchanged */ }

                    return (
                      <div key={msg.id}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', position: 'relative' }}
                        onMouseEnter={() => setHoveredMsgId(msg.id)}
                        onMouseLeave={() => setHoveredMsgId(null)}
                      >
                        {/* Sender name, reply preview, etc. - unchanged */}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: isMe ? 'row-reverse' : 'row' }}>

                          {/* Action buttons */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                            {/* Reply and Emoji buttons - unchanged */}

                            {isMe && !msg.deleted && (
                              <div style={{ position: 'relative' }}>
                                <button
                                  onClick={() => setMsgMenuOpenId(msgMenuOpenId === msg.id ? null : msg.id)}
                                  style={{ /* unchanged */ }}
                                  title="More options">⋯</button>

                                {msgMenuOpenId === msg.id && (
                                  <div
                                    ref={menuRef}                    // ← FIXED
                                    style={{ position: 'absolute', [isMe ? 'right' : 'left']: 0, bottom: '110%', zIndex: 200, background: '#111118', border: '0.5px solid rgba(139,92,246,0.25)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.55)', minWidth: 140, animation: 'menuPop 0.15s cubic-bezier(0.34,1.56,0.64,1)' }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <style>{`@keyframes menuPop { from { opacity:0; transform:scale(0.85) translateY(6px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
                                    <button onClick={() => startEdit(msg)} style={{ /* unchanged */ }}>✏️ Edit</button>
                                    <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.06)', margin: '0 12px' }} />
                                    <button onClick={() => deleteMessage(msg)} style={{ /* unchanged */ }}>🗑️ Delete</button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Bubble + Edit Form - unchanged */}
                          <div style={{ maxWidth: '72%' }}>
                            {editingMsgId === msg.id ? ( /* unchanged */ ) : ( /* unchanged */ )}
                            {/* Reactions - unchanged */}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message input area - unchanged */}
              </>
            ) : ( /* unchanged */ )}
          </div>
        </div>
      </div>

      {/* Bottom nav - unchanged */}
    </div>
  );
}