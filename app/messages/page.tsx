'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDocs, orderBy,
  query, serverTimestamp, doc, getDoc, where,
  updateDoc, onSnapshot, setDoc,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';
import EmojiPicker, { ReactionBubbles } from '@/components/EmojiPicker';

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

  // Emoji & Menu states
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [msgPickerOpenId, setMsgPickerOpenId] = useState<string | null>(null);

  // Edit / Delete states
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [msgMenuOpenId, setMsgMenuOpenId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
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
  }, [router]);

  // Presence
  useEffect(() => {
    if (!user) return;
    const presenceRef = doc(db, 'presence', user.uid);
    setDoc(presenceRef, { online: true, lastSeen: serverTimestamp() });

    const handleVisibility = () => {
      setDoc(presenceRef, { 
        online: document.visibilityState !== 'hidden', 
        lastSeen: serverTimestamp() 
      });
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

  // Online users listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'presence'), (snap) => {
      const map: Record<string, boolean> = {};
      snap.docs.forEach((d) => { map[d.id] = d.data().online === true; });
      setOnlineUsers(map);
    });
    return () => unsub();
  }, []);

  // Load Jitsi
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

  const loadMessages = (collectionName: string, chatId: string) => {
    const q = query(collection(db, collectionName, chatId, 'messages'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
  };

  const openDM = async (otherUser: any) => {
    const convId = getConversationId(user.uid, otherUser.id);
    setSelectedChat({ type: 'dm', id: convId, name: otherUser.fullName, username: otherUser.username, otherUser });
    setInCall(false);
    setMessages([]);
    // Start real-time listener
    loadMessages('conversations', convId);
    await markMessagesAsSeen('conversations', convId);
  };

  const openGroup = async (group: any) => {
    const groupDoc = await getDoc(doc(db, 'groups', group.id));
    const fullGroup = groupDoc.exists() ? { id: group.id, ...groupDoc.data() } : group;
    setSelectedChat({ type: 'group', id: group.id, name: fullGroup.name, memberCount: fullGroup.members?.length || 0, groupData: fullGroup });
    setInCall(false);
    setShowGroupInfo(false);
    await loadGroupInfo(group.id);
    loadMessages('groups', group.id);
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
      const mentionedUsernames = [...new Set((newMessage.match(/#([a-zA-Z0-9_]+)/g) || []).map((m: string) => m.slice(1)))];

      await addDoc(collection(db, collectionName, selectedChat.id, 'messages'), {
        senderId: user.uid,
        senderUsername: userProfile?.username || 'me',
        senderFullName: userProfile?.fullName || 'User',
        content: newMessage.trim(),
        createdAt: serverTimestamp(),
        ...(replyingTo ? { replyTo: { id: replyingTo.id, content: replyingTo.content, senderUsername: replyingTo.senderUsername, senderFullName: replyingTo.senderFullName } } : {}),
        ...(mentionedUsernames.length > 0 ? { mentions: mentionedUsernames } : {}),
      });

      setNewMessage('');
      setReplyingTo(null);
      setMentionSuggestions([]);
    } catch (err) { console.error(err); }
  };

  const startEdit = (msg: any) => {
    setEditingMsgId(msg.id);
    setEditingContent(msg.content);
    setMsgMenuOpenId(null);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const saveEdit = async (msg: any) => {
    const trimmed = editingContent.trim();
    if (!trimmed || !selectedChat || !user) return;
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
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: trimmed, editedAt: true } : m));
    } catch (err) {
      console.error(err);
      alert('Failed to edit message');
    }
    setEditingMsgId(null);
    setEditingContent('');
  };

  const deleteMessage = async (msg: any) => {
    if (!selectedChat || !user) return;
    if (!confirm('Delete this message?')) return;

    const collectionName = selectedChat.type === 'group' ? 'groups' : 'conversations';

    try {
      await updateDoc(doc(db, collectionName, selectedChat.id, 'messages', msg.id), {
        content: '',
        deleted: true,
        deletedAt: serverTimestamp(),
      });
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: '', deleted: true } : m));
    } catch (err) {
      console.error(err);
      alert('Failed to delete message');
    }
    setMsgMenuOpenId(null);
  };

  const toggleReaction = async (msg: any, emoji: string) => {
    if (!user || !selectedChat) return;
    const collectionName = selectedChat.type === 'group' ? 'groups' : 'conversations';
    const msgRef = doc(db, collectionName, selectedChat.id, 'messages', msg.id);
    const reactions: Record<string, string[]> = msg.reactions || {};
    const current = reactions[emoji] || [];
    const updated = current.includes(user.uid) ? current.filter((uid: string) => uid !== user.uid) : [...current, user.uid];
    const newReactions = { ...reactions, [emoji]: updated };
    if (updated.length === 0) delete newReactions[emoji];

    try {
      await updateDoc(msgRef, { reactions: newReactions });
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: newReactions } : m));
    } catch (err) { console.error(err); }
    setMsgPickerOpenId(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewMessage(val);
    const cursor = e.target.selectionStart || val.length;
    const textUpToCursor = val.slice(0, cursor);
    const hashIdx = textUpToCursor.lastIndexOf('#');
    if (hashIdx !== -1 && (hashIdx === 0 || textUpToCursor[hashIdx - 1] === ' ')) {
      const query = textUpToCursor.slice(hashIdx + 1);
      if (!query.includes(' ')) {
        setMentionQuery(query);
        setMentionSuggestions(allUsers.filter((u: any) =>
          u.username?.toLowerCase().startsWith(query.toLowerCase()) || u.fullName?.toLowerCase().startsWith(query.toLowerCase())
        ).slice(0, 5));
        return;
      }
    }
    setMentionQuery('');
    setMentionSuggestions([]);
  };

  const insertMention = (username: string) => {
    const val = newMessage;
    const cursor = inputRef.current?.selectionStart || val.length;
    const textUpToCursor = val.slice(0, cursor);
    const hashIdx = textUpToCursor.lastIndexOf('#');
    const before = val.slice(0, hashIdx);
    const after = val.slice(cursor);
    setNewMessage(before + '#' + username + ' ' + after);
    setMentionSuggestions([]);
    setMentionQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const renderContent = (text: string) => {
    const parts = text.split(/(#[a-zA-Z0-9_]+)/g);
    return parts.map((part, i) =>
      part.startsWith('#') ? <span key={i} style={{ color: '#a78bfa', fontWeight: 700 }}>{part}</span> : <span key={i}>{part}</span>
    );
  };

  if (pageLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#a78bfa', fontWeight: 700 }}>ALTRONICS</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif' }}>
      <Navbar />

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* ... Your original create group modal code ... */}
          {/* Paste your full modal here if needed */}
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', height: 'calc(100vh - 50px)', position: 'relative', overflow: 'hidden' }}>

          {/* Left Sidebar - Add your original sidebar code here */}

          {/* Chat Area */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', background: '#0a0a0f',
            transform: selectedChat ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)', zIndex: 20
          }}>
            {selectedChat ? (
              <>
                {/* Header */}
                <div style={{ padding: '12px 16px', borderBottom: '0.5px solid rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setSelectedChat(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>←</button>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700 }}>{selectedChat.name}</p>
                  </div>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {messages.map((msg) => {
                    const isMe = msg.senderId === user.uid;
                    return (
                      <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', position: 'relative' }}
                        onMouseEnter={() => setHoveredMsgId(msg.id)}
                        onMouseLeave={() => setHoveredMsgId(null)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                          {/* Action Buttons */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {isMe && !msg.deleted && (
                              <div style={{ position: 'relative' }}>
                                <button onClick={() => setMsgMenuOpenId(msgMenuOpenId === msg.id ? null : msg.id)}
                                  style={{ opacity: hoveredMsgId === msg.id ? 1 : 0, width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }}>
                                  ⋯
                                </button>
                                {msgMenuOpenId === msg.id && (
                                  <div ref={menuRef} style={{ position: 'absolute', right: 0, bottom: '110%', background: '#111118', border: '0.5px solid rgba(139,92,246,0.25)', borderRadius: 14, minWidth: 140 }}>
                                    <button onClick={() => startEdit(msg)} style={{ padding: '10px 16px', width: '100%', textAlign: 'left' }}>✏️ Edit</button>
                                    <button onClick={() => deleteMessage(msg)} style={{ padding: '10px 16px', width: '100%', color: '#f87171', textAlign: 'left' }}>🗑️ Delete</button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Bubble */}
                          <div style={{ maxWidth: '72%' }}>
                            {editingMsgId === msg.id ? (
                              <div>
                                <input ref={editInputRef} value={editingContent} onChange={(e) => setEditingContent(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(msg); if (e.key === 'Escape') { setEditingMsgId(null); setEditingContent(''); } }}
                                  style={{ width: '100%', padding: '10px', borderRadius: 12 }} />
                                <button onClick={() => saveEdit(msg)}>Save</button>
                                <button onClick={() => { setEditingMsgId(null); setEditingContent(''); }}>Cancel</button>
                              </div>
                            ) : (
                              <div style={{ padding: '10px 14px', borderRadius: '18px', background: isMe ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)' }}>
                                {msg.deleted ? 'Message deleted' : renderContent(msg.content)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area - Add your full input area here */}
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p>Select a chat</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}