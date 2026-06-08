'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { auth, db } from '@/lib/firebase';
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDocs, orderBy,
  query, serverTimestamp, doc, getDoc, where,
  updateDoc, onSnapshot, setDoc, deleteDoc,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';
import EmojiPicker, { QuickReactionBar, ReactionBubbles } from '@/components/EmojiPicker';

function MessagesInner() {
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
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [followerIds, setFollowerIds] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<any>(null);       // message being replied to
  const [mentionQuery, setMentionQuery] = useState('');           // text after # in input
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]); // users shown in dropdown
  const inputRef = useRef<HTMLInputElement>(null);
  const deepLinkHandled = useRef(false);
  const { push } = useRouter();
  const searchParams = useSearchParams();

  // ── Emoji state ───────────────────────────────────────────────────────────
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [msgPickerOpenId, setMsgPickerOpenId] = useState<string | null>(null);

  // ── Edit / Delete state ───────────────────────────────────────────────────
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [msgMenuOpenId, setMsgMenuOpenId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── Image upload state ────────────────────────────────────────────────────
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [msgToast, setMsgToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showMsgToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setMsgToast({ msg, type });
    setTimeout(() => setMsgToast(null), 3000);
  };

  // ── Confirm modal ─────────────────────────────────────────────────────────
  const [msgConfirm, setMsgConfirm] = useState<{ msg: string; onConfirm: () => void } | null>(null);

  // ── Close msg context menu on outside click ───────────────────────────────
  const msgMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!msgMenuOpenId) return;
    const handler = (e: MouseEvent) => {
      if (msgMenuRef.current && msgMenuRef.current.contains(e.target as Node)) return;
      setMsgMenuOpenId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [msgMenuOpenId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { push('/login'); return; }
      setUser(firebaseUser);
      const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (profileDoc.exists()) {
        const pdata = profileDoc.data();
        setUserProfile(pdata);
        setFollowingIds(pdata.following || []);
        setFollowerIds(pdata.followers || []);
      }
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

  // Helper: is a user visibly online? Respects their activeStatus privacy setting
  const isUserOnline = (userId: string) => {
    if (!onlineUsers[userId]) return false;
    const u = allUsers.find((x: any) => x.id === userId);
    if (u && u.activeStatus === false) return false;
    return true;
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
    setActiveTab('dms');
    await loadMessages('conversations', convId);
    await markMessagesAsSeen('conversations', convId);
  };

  const openDMByUserId = useCallback(async (otherUserId: string) => {
    if (!user) return false;
    try {
      let otherUser = allUsers.find((u: any) => u.id === otherUserId);
      if (!otherUser) {
        const uDoc = await getDoc(doc(db, 'users', otherUserId));
        if (uDoc.exists()) otherUser = { id: otherUserId, ...uDoc.data() };
      }
      if (!otherUser) return false;
      await openDM(otherUser);
      return true;
    } catch {
      return false;
    }
  }, [user, allUsers]);

  const openGroup = async (group: any) => {
    // Load full group doc for admin/member info
    const groupDoc = await getDoc(doc(db, 'groups', group.id));
    const fullGroup = groupDoc.exists() ? { id: group.id, ...groupDoc.data() } : group;
    setSelectedChat({ type: 'group', id: group.id, name: fullGroup.name, memberCount: fullGroup.members?.length || 0, groupData: fullGroup });
    setInCall(false);
    setShowGroupInfo(false);
    setActiveTab('groups');
    await loadMessages('groups', group.id);
    await loadGroupInfo(group.id);
  };

  const openGroupById = useCallback(async (groupId: string) => {
    let group = groups.find((g: any) => g.id === groupId);
    if (!group) {
      const gDoc = await getDoc(doc(db, 'groups', groupId));
      if (gDoc.exists()) group = { id: groupId, ...gDoc.data() };
    }
    if (group) {
      await openGroup(group);
      return true;
    }
    // Legacy notifications may send entertainment room IDs as group_invite
    const [musicDoc, gameDoc, watchDoc] = await Promise.all([
      getDoc(doc(db, 'musicRooms', groupId)),
      getDoc(doc(db, 'gameRooms', groupId)),
      getDoc(doc(db, 'watchRooms', groupId)),
    ]);
    if (musicDoc.exists()) { push(`/entertainment?tab=music&room=${groupId}`); return true; }
    if (gameDoc.exists()) { push(`/entertainment?tab=games&room=${groupId}`); return true; }
    if (watchDoc.exists()) { push(`/entertainment?tab=watch&room=${groupId}`); return true; }
    return false;
  }, [groups, push]);

  // ── Deep link: /messages?dm=<userId> or ?group=<groupId> ─────────────────
  useEffect(() => {
    if (pageLoading || !user || deepLinkHandled.current) return;
    const dmId = searchParams.get('dm');
    const groupId = searchParams.get('group');
    if (!dmId && !groupId) return;

    const run = async () => {
      let ok = false;
      let notFound = false;
      try {
        if (dmId) {
          ok = await openDMByUserId(dmId);
          if (!ok) {
            const uDoc = await getDoc(doc(db, 'users', dmId));
            notFound = !uDoc.exists();
          }
        } else if (groupId) {
          ok = await openGroupById(groupId);
          if (!ok) {
            const gDoc = await getDoc(doc(db, 'groups', groupId));
            const [m, g, w] = await Promise.all([
              getDoc(doc(db, 'musicRooms', groupId)),
              getDoc(doc(db, 'gameRooms', groupId)),
              getDoc(doc(db, 'watchRooms', groupId)),
            ]);
            notFound = !gDoc.exists() && !m.exists() && !g.exists() && !w.exists();
          }
        }
      } catch {
        // deep link failed — allow retry on next effect run
      }
      if (ok || notFound) {
        deepLinkHandled.current = true;
        if (ok && (dmId || groupId)) window.history.replaceState({}, '', '/messages');
      }
    };
    run();
  }, [pageLoading, user, allUsers, groups, searchParams, openDMByUserId, openGroupById]);

  const loadGroupInfo = async (groupId: string) => {
    try {
      const groupDoc = await getDoc(doc(db, 'groups', groupId));
      if (!groupDoc.exists()) return;
      const data = { id: groupId, ...groupDoc.data() } as any;
      // Resolve member profiles
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

  const renameGroup = async () => {
    if (!newGroupName.trim() || !groupInfo) return;
    try {
      await updateDoc(doc(db, 'groups', groupInfo.id), { name: newGroupName.trim(), avatar: newGroupName.trim()[0].toUpperCase() });
      setGroupInfo((prev: any) => ({ ...prev, name: newGroupName.trim() }));
      setSelectedChat((prev: any) => ({ ...prev, name: newGroupName.trim() }));
      await loadGroups(user.uid);
      setEditingGroupName(false);
      setNewGroupName('');
    } catch (err: any) { showMsgToast('Failed to rename: ' + err.message, 'error'); }
  };

  const leaveGroup = async () => {
    if (!groupInfo || !user) return;
    setMsgConfirm({ msg: 'Leave this group?', onConfirm: async () => {
      try {
        const newMembers = (groupInfo.members || []).filter((id: string) => id !== user.uid);
        const newAdmins = (groupInfo.admins || []).filter((id: string) => id !== user.uid);
        if (newMembers.length === 0) {
          await deleteDoc(doc(db, 'groups', groupInfo.id));
        } else {
          const updatedAdmins = newAdmins.length === 0 && groupInfo.createdBy === user.uid
            ? [newMembers[0]]
            : newAdmins;
          await updateDoc(doc(db, 'groups', groupInfo.id), {
            members: newMembers,
            admins: updatedAdmins,
            ...(groupInfo.createdBy === user.uid ? { createdBy: newMembers[0] } : {}),
          });
        }
        setSelectedChat(null);
        setGroupInfo(null);
        setShowGroupInfo(false);
        await loadGroups(user.uid);
      } catch (err: any) { showMsgToast('Failed to leave group', 'error'); }
    }});
  };

  const removeMember = async (memberId: string) => {
    if (!isGroupAdmin() || !groupInfo) return;
    setMsgConfirm({ msg: 'Remove this member?', onConfirm: async () => {
      try {
        const newMembers = (groupInfo.members || []).filter((id: string) => id !== memberId);
        const newAdmins = (groupInfo.admins || []).filter((id: string) => id !== memberId);
        await updateDoc(doc(db, 'groups', groupInfo.id), { members: newMembers, admins: newAdmins });
        await loadGroupInfo(groupInfo.id);
        setSelectedChat((prev: any) => ({ ...prev, memberCount: newMembers.length }));
      } catch (err: any) { showMsgToast('Failed to remove member', 'error'); }
    }});
  };

  const toggleAdmin = async (memberId: string) => {
    if (!isGroupAdmin() || !groupInfo) return;
    const admins: string[] = groupInfo.admins || [];
    const newAdmins = admins.includes(memberId)
      ? admins.filter((id: string) => id !== memberId)
      : [...admins, memberId];
    try {
      await updateDoc(doc(db, 'groups', groupInfo.id), { admins: newAdmins });
      await loadGroupInfo(groupInfo.id);
    } catch (err: any) { showMsgToast('Failed to update admin', 'error'); }
  };

  const addMemberToGroup = async (memberId: string) => {
    if (!isGroupAdmin() || !groupInfo) return;
    if ((groupInfo.members || []).includes(memberId)) return;
    try {
      const newMembers = [...(groupInfo.members || []), memberId];
      await updateDoc(doc(db, 'groups', groupInfo.id), { members: newMembers });
      await addDoc(collection(db, 'notifications'), {
        toUserId: memberId, fromUserId: user.uid,
        fromUsername: userProfile?.username || 'someone',
        type: 'group_invite', read: false, createdAt: serverTimestamp(),
        groupName: groupInfo.name,
      });
      await loadGroupInfo(groupInfo.id);
      setSelectedChat((prev: any) => ({ ...prev, memberCount: newMembers.length }));
      showMsgToast('Member added', 'success');
    } catch (err: any) { showMsgToast('Failed to add member', 'error'); }
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
    // Respect our own messageSeen setting — if off, don't write seenBy
    if (userProfile?.messageSeen === false) return;
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
      // Extract mentioned usernames (#username)
      const mentionedUsernames = [...new Set((newMessage.match(/#([a-zA-Z0-9_]+)/g) || []).map((m: string) => m.slice(1)))];

      await addDoc(collection(db, collectionName, selectedChat.id, 'messages'), {
        senderId: user.uid,
        senderUsername: userProfile?.username || 'me',
        senderFullName: userProfile?.fullName || 'User',
        content: newMessage.trim(),
        createdAt: serverTimestamp(),
        ...(replyingTo ? {
          replyTo: {
            id: replyingTo.id,
            content: replyingTo.content,
            senderUsername: replyingTo.senderUsername,
            senderFullName: replyingTo.senderFullName,
          }
        } : {}),
        ...(mentionedUsernames.length > 0 ? { mentions: mentionedUsernames } : {}),
      });

      // Send mention notifications
      for (const uname of mentionedUsernames) {
        const mentionedUser = allUsers.find((u: any) => u.username === uname);
        if (mentionedUser) {
          await addDoc(collection(db, 'notifications'), {
            toUserId: mentionedUser.id, fromUserId: user.uid,
            fromUsername: userProfile?.username || 'someone',
            type: 'mention', read: false, createdAt: serverTimestamp(),
            preview: newMessage.trim().slice(0, 80),
          });
        }
      }
      if (selectedChat.type === 'dm') {
        await addDoc(collection(db, 'notifications'), {
          toUserId: selectedChat.otherUser.id, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'message', read: false, createdAt: serverTimestamp(),
        });
      }
      setNewMessage('');
      setReplyingTo(null);
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
    if (!groupName.trim()) { showMsgToast('Enter a group name', 'error'); return; }
    if (selectedMembers.length === 0) { showMsgToast('Select at least 1 member', 'error'); return; }
    setCreating(true);
    try {
      const members = [user.uid, ...selectedMembers];
      await addDoc(collection(db, 'groups'), {
        name: groupName.trim(), members,
        createdBy: user.uid, createdByUsername: userProfile?.username || 'someone',
        admins: [user.uid],
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
      showMsgToast(`Group "${groupName}" created! 🎉`, 'success');
    } catch (err: any) { showMsgToast('Failed: ' + err.message, 'error'); }
    setCreating(false);
  };

  const toggleMember = (uid: string) => {
    setSelectedMembers((prev) => prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]);
  };

  // Only show users you follow OR who follow you (social connections)
  const socialUsers = allUsers.filter((u: any) =>
    followingIds.includes(u.id) || followerIds.includes(u.id)
  );
  const filteredUsers = socialUsers.filter((u: any) =>
    !searchQuery.trim() ||
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.fullName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Render text — highlight #mentions in purple
  const renderContent = (text: string) => {
    const parts = text.split(/(#[a-zA-Z0-9_]+)/g);
    return parts.map((part, i) =>
      part.startsWith('#')
        ? <span key={i} style={{ color: '#a78bfa', fontWeight: 700 }}>{part}</span>
        : <span key={i}>{part}</span>
    );
  };

  // Handle input changes — detect # for mention autocomplete
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewMessage(val);
    // Find last # in string
    const cursor = e.target.selectionStart || val.length;
    const textUpToCursor = val.slice(0, cursor);
    const hashIdx = textUpToCursor.lastIndexOf('#');
    if (hashIdx !== -1 && (hashIdx === 0 || textUpToCursor[hashIdx - 1] === ' ')) {
      const query = textUpToCursor.slice(hashIdx + 1);
      if (!query.includes(' ')) {
        setMentionQuery(query);
        const chatMembers = selectedChat?.type === 'group'
          ? (groupInfo?.memberProfiles || allUsers)
          : (selectedChat?.otherUser ? [selectedChat.otherUser] : allUsers);
        const all = allUsers;  // always search all users for mentions
        setMentionSuggestions(
          all.filter((u: any) =>
            u.username?.toLowerCase().startsWith(query.toLowerCase()) ||
            u.fullName?.toLowerCase().startsWith(query.toLowerCase())
          ).slice(0, 5)
        );
        return;
      }
    }
    setMentionQuery('');
    setMentionSuggestions([]);
  };

  // Insert mention into input
  const insertMention = (username: string) => {
    const val = newMessage;
    const cursor = inputRef.current?.selectionStart || val.length;
    const textUpToCursor = val.slice(0, cursor);
    const hashIdx = textUpToCursor.lastIndexOf('#');
    const before = val.slice(0, hashIdx);
    const after = val.slice(cursor);
    const newVal = before + '#' + username + ' ' + after;
    setNewMessage(newVal);
    setMentionSuggestions([]);
    setMentionQuery('');
    setTimeout(() => { inputRef.current?.focus(); }, 0);
  };

  // ── Toggle emoji reaction on a message ───────────────────────────────────
  const toggleReaction = async (msg: any, emoji: string) => {
    if (!user || !selectedChat) return;
    const collectionName = selectedChat.type === 'group' ? 'groups' : 'conversations';
    const msgRef = doc(db, collectionName, selectedChat.id, 'messages', msg.id);
    const reactions: Record<string, string[]> = msg.reactions || {};
    const current: string[] = reactions[emoji] || [];
    const updated = current.includes(user.uid)
      ? current.filter((uid: string) => uid !== user.uid)
      : [...current, user.uid];
    const newReactions = { ...reactions, [emoji]: updated };
    // Clean up empty arrays
    if (updated.length === 0) delete newReactions[emoji];
    try {
      await updateDoc(msgRef, { reactions: newReactions });
      // Optimistically update local state
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, reactions: newReactions } : m));
    } catch (err) { console.error(err); }
    setMsgPickerOpenId(null);
  };

  // ── Edit a message ────────────────────────────────────────────────────────
  const startEdit = (msg: any) => {
    setEditingMsgId(msg.id);
    setEditingContent(msg.content);
    setMsgMenuOpenId(null);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const saveEdit = async (msg: any) => {
    const trimmed = editingContent.trim();
    if (!trimmed || !selectedChat) return;
    if (trimmed === msg.content) { setEditingMsgId(null); return; }
    const collectionName = selectedChat.type === 'group' ? 'groups' : 'conversations';
    try {
      await updateDoc(doc(db, collectionName, selectedChat.id, 'messages', msg.id), {
        content: trimmed,
        editedAt: serverTimestamp(),
      });
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, content: trimmed, editedAt: true } : m));
    } catch (err) { console.error(err); }
    setEditingMsgId(null);
    setEditingContent('');
  };

  const cancelEdit = () => { setEditingMsgId(null); setEditingContent(''); };

  // ── Image upload helpers ──────────────────────────────────────────────────
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showMsgToast('Please select an image file', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { showMsgToast('Image must be under 10 MB', 'error'); return; }
    setPendingImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    // reset input so same file can be re-selected
    e.target.value = '';
  };

  const cancelImagePreview = () => {
    setPendingImageFile(null);
    setImagePreview(null);
    setImageUploadProgress(null);
  };

  const sendImage = async () => {
    if (!pendingImageFile || !user || !selectedChat) return;
    if (!CLOUD_NAME || !UPLOAD_PRESET) { showMsgToast('Image upload not configured', 'error'); return; }
    const collectionName = selectedChat.type === 'group' ? 'groups' : 'conversations';
    try {
      setImageUploadProgress(10);
      const formData = new FormData();
      formData.append('file', pendingImageFile);
      formData.append('upload_preset', UPLOAD_PRESET!);
      formData.append('folder', 'chat_images');
      setImageUploadProgress(40);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      setImageUploadProgress(80);
      if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');
      const imageUrl: string = data.secure_url;
      await addDoc(collection(db, collectionName, selectedChat.id, 'messages'), {
        senderId: user.uid,
        senderUsername: userProfile?.username || 'me',
        senderFullName: userProfile?.fullName || 'User',
        content: newMessage.trim() || '',
        imageUrl,
        type: 'image',
        createdAt: serverTimestamp(),
        ...(replyingTo ? { replyTo: { id: replyingTo.id, content: replyingTo.content || '📷 Photo', senderUsername: replyingTo.senderUsername } } : {}),
      });
      if (selectedChat.type === 'dm') {
        await addDoc(collection(db, 'notifications'), {
          toUserId: selectedChat.otherUser.id, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'message', read: false, createdAt: serverTimestamp(),
        });
      }
      setImageUploadProgress(100);
      cancelImagePreview();
      setNewMessage('');
      setReplyingTo(null);
      await loadMessages(collectionName, selectedChat.id);
      if (selectedChat.type === 'dm') await markMessagesAsSeen(collectionName, selectedChat.id);
    } catch (err: any) {
      console.error('Image upload error:', err);
      showMsgToast('Upload failed: ' + err.message, 'error');
    }
    setImageUploadProgress(null);
  };

  // ── Delete a message ──────────────────────────────────────────────────────
  const deleteMessage = async (msg: any) => {
    if (!selectedChat || !user) return;
    setMsgMenuOpenId(null);
    const collectionName = selectedChat.type === 'group' ? 'groups' : 'conversations';
    try {
      // Soft-delete: replace content with tombstone so reply threads don't break
      await updateDoc(doc(db, collectionName, selectedChat.id, 'messages', msg.id), {
        content: '',
        deleted: true,
        deletedAt: serverTimestamp(),
      });
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, content: '', deleted: true } : m));
    } catch (err) { console.error(err); }
  };

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

      {/* Toast */}
      {msgToast && (
        <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, padding: '12px 20px', borderRadius: 16, background: msgToast.type === 'success' ? 'rgba(34,197,94,0.15)' : msgToast.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(139,92,246,0.15)', border: `0.5px solid ${msgToast.type === 'success' ? 'rgba(34,197,94,0.4)' : msgToast.type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(139,92,246,0.4)'}`, color: msgToast.type === 'success' ? '#4ade80' : msgToast.type === 'error' ? '#f87171' : '#a78bfa', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(12px)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', whiteSpace: 'nowrap', fontFamily: 'Inter,sans-serif' }}>
          {msgToast.type === 'success' ? '✅' : msgToast.type === 'error' ? '⚠️' : 'ℹ️'} {msgToast.msg}
        </div>
      )}

      {/* Confirm Modal */}
      {msgConfirm && (
        <div onClick={() => setMsgConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111118', border: '0.5px solid rgba(139,92,246,0.3)', borderRadius: 20, padding: '24px 20px', maxWidth: 320, width: '100%', fontFamily: 'Inter,sans-serif' }}>
            <p style={{ color: '#f3f4f6', fontSize: 15, fontWeight: 600, marginBottom: 20, textAlign: 'center', lineHeight: 1.5 }}>{msgConfirm.msg}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setMsgConfirm(null)} style={{ flex: 1, padding: '10px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: '#9ca3af', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Cancel</button>
              <button onClick={() => { msgConfirm.onConfirm(); setMsgConfirm(null); }} style={{ flex: 1, padding: '10px', borderRadius: 12, background: 'rgba(239,68,68,0.15)', border: '0.5px solid rgba(239,68,68,0.4)', color: '#f87171', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

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
                {allUsers.filter((u: any) => followingIds.includes(u.id) || followerIds.includes(u.id)).map((u: any) => {
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
                filteredUsers.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', color: '#6b7280', textAlign: 'center', gap: 12 }}>
                    <p style={{ fontSize: 36 }}>{searchQuery ? '🔍' : '👥'}</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#9ca3af' }}>
                      {searchQuery ? `No results for "${searchQuery}"` : 'No connections yet'}
                    </p>
                    <p style={{ fontSize: 13 }}>
                      {searchQuery ? 'Try a different name' : 'Follow people from Search to start messaging them'}
                    </p>
                    {!searchQuery && (
                      <Link href="/search" style={{ textDecoration: 'none' }}>
                        <button type="button" style={{ marginTop: 4, padding: '10px 22px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                          Find People
                        </button>
                      </Link>
                    )}
                  </div>
                ) : filteredUsers.map((u: any) => (
                  <div key={u.id} onClick={() => openDM(u)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', borderBottom: '0.5px solid rgba(255,255,255,0.03)', background: selectedChat?.otherUser?.id === u.id ? 'rgba(139,92,246,0.1)' : 'transparent', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => { if (selectedChat?.otherUser?.id !== u.id) e.currentTarget.style.background = 'rgba(139,92,246,0.05)'; }}
                    onMouseLeave={(e) => { if (selectedChat?.otherUser?.id !== u.id) e.currentTarget.style.background = 'transparent'; }}>
                    {/* Avatar with online dot */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(139,92,246,0.2)', flexShrink: 0 }}>
                        {u.photoURL ? (
                          <img src={u.photoURL} alt={u.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#a78bfa' }}>
                            {u.fullName?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>
                      {isUserOnline(u.id) && (
                        <div style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: '#22c55e', border: '2px solid #0a0a0f' }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{u.fullName}</p>
                      <p style={{ fontSize: 11, color: isUserOnline(u.id) ? '#22c55e' : '#6b7280', margin: 0, fontWeight: isUserOnline(u.id) ? 600 : 400 }}>
                        {isUserOnline(u.id) ? '● Active now' : `@${u.username}`}
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
                  <div style={{ width: 36, height: 36, borderRadius: selectedChat.type === 'group' ? 10 : '50%', overflow: 'hidden', flexShrink: 0, border: selectedChat.type === 'dm' ? '1px solid rgba(139,92,246,0.25)' : 'none' }}>
                    {selectedChat.type === 'dm' && selectedChat.otherUser?.photoURL ? (
                      <img src={selectedChat.otherUser.photoURL} alt={selectedChat.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: selectedChat.type === 'group' ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: selectedChat.type === 'group' ? 'white' : '#a78bfa' }}>
                        {selectedChat.name?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedChat.name}</p>
                    <p style={{ fontSize: 11, margin: 0, display: 'flex', alignItems: 'center', gap: 4,
                      color: selectedChat.type === 'dm' && isUserOnline(selectedChat.otherUser?.id) ? '#22c55e' : '#6b7280',
                      fontWeight: selectedChat.type === 'dm' && isUserOnline(selectedChat.otherUser?.id) ? 600 : 400,
                    }}>
                      {selectedChat.type === 'dm' && isUserOnline(selectedChat.otherUser?.id) && (
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                      )}
                      {selectedChat.type === 'group'
                        ? `${selectedChat.memberCount} members`
                        : isUserOnline(selectedChat.otherUser?.id) ? 'Active now' : `@${selectedChat.username}`}
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
                    {/* Group info button */}
                    {selectedChat.type === 'group' && (
                      <button onClick={() => setShowGroupInfo(true)}
                        style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(251,191,36,0.15)', border: '0.5px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                        title="Group info">
                        ⚙
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Group Info Panel ─────────────────────────────────────────── */}
                {showGroupInfo && selectedChat.type === 'group' && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: '#0a0a0f' }}>
                    {/* Panel header */}
                    <div style={{ padding: '14px 16px', borderBottom: '0.5px solid rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={() => setShowGroupInfo(false)}
                        style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(139,92,246,0.12)', border: '0.5px solid rgba(139,92,246,0.25)', color: '#a78bfa', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        ‹
                      </button>
                      <p style={{ fontSize: 15, fontWeight: 800, color: '#f3f4f6', margin: 0 }}>Group Info</p>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 80px' }}>
                      {groupInfo ? (
                        <>
                          {/* Group avatar + name */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 20px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 800, color: 'white', marginBottom: 14 }}>
                              {groupInfo.name?.[0]?.toUpperCase() || 'G'}
                            </div>
                            {editingGroupName ? (
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 280 }}>
                                <input
                                  value={newGroupName}
                                  onChange={(e) => setNewGroupName(e.target.value)}
                                  placeholder={groupInfo.name}
                                  onKeyDown={(e) => { if (e.key === 'Enter') renameGroup(); if (e.key === 'Escape') setEditingGroupName(false); }}
                                  style={{ flex: 1, padding: '8px 14px', borderRadius: 12, background: 'rgba(139,92,246,0.1)', border: '0.5px solid rgba(139,92,246,0.3)', color: '#f3f4f6', fontSize: 14, fontWeight: 700, fontFamily: 'Inter,sans-serif', outline: 'none' }}
                                  autoFocus
                                />
                                <button onClick={renameGroup} style={{ padding: '8px 14px', borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Save</button>
                                <button onClick={() => setEditingGroupName(false)} style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: 'none', color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <p style={{ fontSize: 18, fontWeight: 800, color: '#f3f4f6', margin: 0 }}>{groupInfo.name}</p>
                                {isGroupAdmin() && (
                                  <button onClick={() => { setNewGroupName(groupInfo.name); setEditingGroupName(true); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6b7280', padding: 4 }} title="Rename group">✏️</button>
                                )}
                              </div>
                            )}
                            <p style={{ fontSize: 12, color: '#6b7280', margin: '6px 0 0' }}>{groupInfo.memberProfiles?.length || 0} members</p>
                          </div>

                          {/* Add member (admin only) */}
                          {isGroupAdmin() && (
                            <div style={{ padding: '16px 16px 0' }}>
                              <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Add Members</p>
                              <input
                                placeholder="Search users to add..."
                                value={addMemberSearch}
                                onChange={(e) => setAddMemberSearch(e.target.value)}
                                style={{ width: '100%', padding: '9px 14px', borderRadius: 20, background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.2)', color: '#f3f4f6', fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box' }}
                              />
                              {addMemberSearch.trim() && (
                                <div style={{ marginTop: 8, borderRadius: 14, overflow: 'hidden', border: '0.5px solid rgba(139,92,246,0.15)' }}>
                                  {allUsers
                                    .filter((u: any) => !( groupInfo.members || []).includes(u.id) &&
                                      (u.fullName?.toLowerCase().includes(addMemberSearch.toLowerCase()) || u.username?.toLowerCase().includes(addMemberSearch.toLowerCase())))
                                    .slice(0, 4)
                                    .map((u: any) => (
                                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#a78bfa', flexShrink: 0 }}>
                                          {u.fullName?.[0]?.toUpperCase() || 'U'}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{u.fullName}</p>
                                          <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>@{u.username}</p>
                                        </div>
                                        <button onClick={() => { addMemberToGroup(u.id); setAddMemberSearch(''); }}
                                          style={{ padding: '6px 12px', borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: 'Inter,sans-serif' }}>
                                          + Add
                                        </button>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Member list */}
                          <div style={{ padding: '16px 16px 0' }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                              Members ({groupInfo.memberProfiles?.length || 0})
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {(groupInfo.memberProfiles || []).map((member: any) => {
                                const isOwner = groupInfo.createdBy === member.id;
                                const isMemberAdmin = (groupInfo.admins || []).includes(member.id) || isOwner;
                                const isMe = member.id === user?.uid;
                                return (
                                  <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.02)' }}>
                                    {/* Avatar with online dot */}
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                      <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(139,92,246,0.2)' }}>
                                        {member.photoURL ? (
                                          <img src={member.photoURL} alt={member.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#a78bfa' }}>
                                            {member.fullName?.[0]?.toUpperCase() || 'U'}
                                          </div>
                                        )}
                                      </div>
                                      {isUserOnline(member.id) && (
                                        <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: '#22c55e', border: '2px solid #0a0a0f' }} />
                                      )}
                                    </div>
                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>
                                          {member.fullName}{isMe ? ' (You)' : ''}
                                        </p>
                                        {isOwner && (
                                          <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.15)', border: '0.5px solid rgba(251,191,36,0.3)', borderRadius: 6, padding: '1px 6px' }}>Owner</span>
                                        )}
                                        {!isOwner && isMemberAdmin && (
                                          <span style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', background: 'rgba(139,92,246,0.15)', border: '0.5px solid rgba(139,92,246,0.3)', borderRadius: 6, padding: '1px 6px' }}>Admin</span>
                                        )}
                                      </div>
                                      <p style={{ fontSize: 11, color: isUserOnline(member.id) ? '#22c55e' : '#6b7280', margin: 0, fontWeight: isUserOnline(member.id) ? 600 : 400 }}>
                                        {isUserOnline(member.id) ? '● Active now' : `@${member.username}`}
                                      </p>
                                    </div>
                                    {/* Admin actions */}
                                    {isGroupAdmin() && !isMe && !isOwner && (
                                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                        <button onClick={() => toggleAdmin(member.id)}
                                          title={isMemberAdmin ? 'Remove admin' : 'Make admin'}
                                          style={{ padding: '5px 10px', borderRadius: 8, background: isMemberAdmin ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)', border: '0.5px solid ' + (isMemberAdmin ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'), color: isMemberAdmin ? '#a78bfa' : '#9ca3af', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                                          {isMemberAdmin ? '★ Admin' : '☆ Admin'}
                                        </button>
                                        <button onClick={() => removeMember(member.id)}
                                          title="Remove from group"
                                          style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                                          Remove
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Leave group */}
                          <div style={{ padding: '20px 16px' }}>
                            <button onClick={leaveGroup}
                              style={{ width: '100%', padding: '13px', borderRadius: 14, background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                              🚪 Leave Group
                            </button>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                          <p style={{ color: '#6b7280', fontSize: 13 }}>Loading...</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                      <div key={msg.id}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', position: 'relative' }}
                        onMouseEnter={() => { const btn = document.querySelector(`.reply-btn-${msg.id}`) as HTMLElement; if (btn) btn.style.opacity = '1'; setHoveredMsgId(msg.id); }}
                        onMouseLeave={() => { const btn = document.querySelector(`.reply-btn-${msg.id}`) as HTMLElement; if (btn) btn.style.opacity = '0'; setHoveredMsgId(null); }}
                      >
                        {/* Sender name in group */}
                        {!isMe && selectedChat.type === 'group' && (
                          <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 600, marginBottom: 3, marginLeft: 4 }}>
                            #{msg.senderUsername}
                          </span>
                        )}

                        {/* Action column + bubble row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: isMe ? 'row-reverse' : 'row' }}>

                          {/* Side action buttons (reply, react, ⋯ menu) */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                            {/* Reply */}
                            <button
                              className={`reply-btn-${msg.id}`}
                              onClick={() => setReplyingTo(msg)}
                              style={{ opacity: 0, transition: 'opacity 0.15s', background: 'rgba(139,92,246,0.15)', border: '0.5px solid rgba(139,92,246,0.3)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a78bfa', fontSize: 13, flexShrink: 0 }}
                              title="Reply">↩</button>

                            {/* Emoji react */}
                            {!msg.deleted && (
                              <div style={{ position: 'relative' }}>
                                <button
                                  onClick={() => setMsgPickerOpenId(msgPickerOpenId === msg.id ? null : msg.id)}
                                  style={{ opacity: hoveredMsgId === msg.id || msgPickerOpenId === msg.id ? 1 : 0, transition: 'opacity 0.15s', background: 'rgba(139,92,246,0.15)', border: '0.5px solid rgba(139,92,246,0.3)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
                                  title="React">😊</button>
                                {msgPickerOpenId === msg.id && (
                                  <EmojiPicker
                                    onSelect={(emoji) => toggleReaction(msg, emoji)}
                                    onClose={() => setMsgPickerOpenId(null)}
                                    position="top"
                                    align={isMe ? 'right' : 'left'}
                                    style={{ width: 280 }}
                                  />
                                )}
                              </div>
                            )}

                            {/* ⋯ context menu — only for own non-deleted messages */}
                            {isMe && !msg.deleted && (
                              <div style={{ position: 'relative' }}>
                                <button
                                  onClick={() => setMsgMenuOpenId(msgMenuOpenId === msg.id ? null : msg.id)}
                                  style={{ opacity: hoveredMsgId === msg.id || msgMenuOpenId === msg.id ? 1 : 0, transition: 'opacity 0.15s', background: msgMenuOpenId === msg.id ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9ca3af', fontSize: 16, flexShrink: 0, lineHeight: 1 }}
                                  title="More options">⋯</button>

                                {msgMenuOpenId === msg.id && (
                                  <div
                                    style={{ position: 'absolute', [isMe ? 'right' : 'left']: 0, bottom: '110%', zIndex: 200, background: '#111118', border: '0.5px solid rgba(139,92,246,0.25)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.55)', minWidth: 140, animation: 'menuPop 0.15s cubic-bezier(0.34,1.56,0.64,1)' }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    ref={msgMenuRef}
                                  >
                                    <style>{`@keyframes menuPop { from { opacity:0; transform:scale(0.85) translateY(6px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
                                    {/* Edit */}
                                    <button
                                      onClick={() => startEdit(msg)}
                                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e2e8f0', fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif', transition: 'background 0.12s', textAlign: 'left' }}
                                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.12)')}
                                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                                      <span style={{ fontSize: 15 }}>✏️</span> Edit
                                    </button>
                                    <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.06)', margin: '0 12px' }} />
                                    {/* Delete */}
                                    <button
                                      onClick={() => deleteMessage(msg)}
                                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif', transition: 'background 0.12s', textAlign: 'left' }}
                                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                                      <span style={{ fontSize: 15 }}>🗑️</span> Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div style={{ maxWidth: '72%' }}>
                            {/* Reply preview inside bubble */}
                            {msg.replyTo && (
                              <div style={{ marginBottom: 4, padding: '6px 10px', borderRadius: '10px 10px 0 0', background: isMe ? 'rgba(0,0,0,0.25)' : 'rgba(139,92,246,0.12)', borderLeft: '3px solid #a78bfa' }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', margin: '0 0 2px' }}>↩ #{msg.replyTo.senderUsername}</p>
                                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{msg.replyTo.content}</p>
                              </div>
                            )}

                            {/* Main bubble — or inline edit form */}
                            {editingMsgId === msg.id ? (
                              /* ── Inline edit input ── */
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <input
                                  ref={editInputRef}
                                  value={editingContent}
                                  onChange={(e) => setEditingContent(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(msg); }
                                    if (e.key === 'Escape') cancelEdit();
                                  }}
                                  style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(139,92,246,0.12)', border: '1.5px solid rgba(139,92,246,0.5)', color: '#f3f4f6', fontSize: 13, fontFamily: 'Inter,sans-serif', outline: 'none', minWidth: 200 }}
                                />
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                  <button onClick={cancelEdit}
                                    style={{ padding: '5px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.1)', color: '#9ca3af', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                                    Cancel
                                  </button>
                                  <button onClick={() => saveEdit(msg)} disabled={!editingContent.trim()}
                                    style={{ padding: '5px 12px', borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 11, fontWeight: 700, cursor: editingContent.trim() ? 'pointer' : 'not-allowed', opacity: editingContent.trim() ? 1 : 0.5, fontFamily: 'Inter,sans-serif' }}>
                                    Save
                                  </button>
                                </div>
                                <p style={{ fontSize: 10, color: '#6b7280', margin: 0, textAlign: 'right' }}>Enter to save · Esc to cancel</p>
                              </div>
                            ) : (
                              <div style={{ padding: msg.imageUrl ? '6px 6px 10px 6px' : '10px 14px', borderRadius: msg.replyTo ? (isMe ? '0 18px 4px 18px' : '18px 0 18px 4px') : (isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px'), background: msg.deleted ? 'rgba(255,255,255,0.03)' : (isMe ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)'), border: msg.deleted ? '0.5px solid rgba(255,255,255,0.06)' : (isMe ? 'none' : '0.5px solid rgba(255,255,255,0.08)'), overflow: 'hidden' }}>
                                {msg.deleted ? (
                                  <p style={{ fontSize: 12, color: '#4b5563', fontStyle: 'italic', margin: 0 }}>🗑 Message deleted</p>
                                ) : (
                                  <>
                                    {/* Image */}
                                    {msg.imageUrl && (
                                      <a href={msg.imageUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: msg.content ? 8 : 0 }}>
                                        <img
                                          src={msg.imageUrl}
                                          alt="shared image"
                                          style={{ display: 'block', maxWidth: '100%', width: 260, maxHeight: 320, objectFit: 'cover', borderRadius: 14, cursor: 'zoom-in' }}
                                        />
                                      </a>
                                    )}
                                    {/* Caption text */}
                                    {msg.content && (
                                      <p style={{ fontSize: 13, color: 'white', margin: msg.imageUrl ? '0 6px' : 0, lineHeight: 1.6 }}>{renderContent(msg.content)}</p>
                                    )}
                                    {msg.editedAt && (
                                      <span style={{ fontSize: 9, color: isMe ? 'rgba(255,255,255,0.45)' : '#4b5563', fontStyle: 'italic' }}> · edited</span>
                                    )}
                                  </>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4, padding: msg.imageUrl ? '0 6px' : 0 }}>
                                  <span style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.6)' : '#4b5563' }}>
                                    {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                  {isMe && selectedChat.type === 'dm' && (() => {
                                    const otherUser = allUsers.find((x: any) => x.id === selectedChat.otherUser?.id);
                                    const seenEnabled = otherUser?.messageSeen !== false;
                                    const isSeen = seenEnabled && (msg.seenBy || []).includes(selectedChat.otherUser?.id);
                                    return (
                                      <span style={{ fontSize: 10, fontWeight: 700, color: isSeen ? '#60a5fa' : 'rgba(255,255,255,0.35)' }}
                                        title={isSeen ? 'Seen' : 'Sent'}>
                                        {isSeen ? '✓✓' : '✓'}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}

                            {/* Reaction bubbles */}
                            {!msg.deleted && msg.reactions && Object.keys(msg.reactions).length > 0 && (
                              <ReactionBubbles
                                reactions={msg.reactions}
                                myUid={user.uid}
                                onToggle={(emoji) => toggleReaction(msg, emoji)}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message input area */}
                <div style={{ borderTop: '0.5px solid rgba(139,92,246,0.15)', background: '#0a0a0f' }}>

                  {/* Reply preview bar */}
                  {replyingTo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'rgba(139,92,246,0.08)', borderBottom: '0.5px solid rgba(139,92,246,0.15)' }}>
                      <div style={{ flex: 1, borderLeft: '3px solid #a78bfa', paddingLeft: 10 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', margin: '0 0 2px' }}>
                          ↩ Replying to #{replyingTo.senderUsername}
                        </p>
                        <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                          {replyingTo.content}
                        </p>
                      </div>
                      <button onClick={() => setReplyingTo(null)}
                        style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>✕</button>
                    </div>
                  )}

                  {/* Mention suggestions dropdown */}
                  {mentionSuggestions.length > 0 && (
                    <div style={{ background: '#111118', border: '0.5px solid rgba(139,92,246,0.25)', borderRadius: 14, margin: '0 12px 6px', overflow: 'hidden' }}>
                      {mentionSuggestions.map((u: any) => (
                        <div key={u.id}
                          onClick={() => insertMention(u.username)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', borderBottom: '0.5px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.1)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: '#a78bfa' }}>
                              {u.fullName?.[0]?.toUpperCase() || 'U'}
                            </div>
                            {isUserOnline(u.id) && (
                              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: '#22c55e', border: '2px solid #111118' }} />
                            )}
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{u.fullName}</p>
                            <p style={{ fontSize: 11, color: '#a78bfa', margin: 0 }}>#{u.username}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Image preview bar */}
                  {imagePreview && (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, padding: '10px 16px', background: 'rgba(139,92,246,0.06)', borderBottom: '0.5px solid rgba(139,92,246,0.15)' }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <img src={imagePreview} alt="preview" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 12, border: '1.5px solid rgba(139,92,246,0.4)' }} />
                        {imageUploadProgress !== null && imageUploadProgress < 100 && (
                          <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>{imageUploadProgress}%</span>
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, margin: '0 0 4px' }}>
                          {pendingImageFile?.name}
                        </p>
                        <p style={{ fontSize: 10, color: '#6b7280', margin: 0 }}>
                          {pendingImageFile ? (pendingImageFile.size / 1024 < 1000
                            ? `${(pendingImageFile.size / 1024).toFixed(1)} KB`
                            : `${(pendingImageFile.size / (1024 * 1024)).toFixed(1)} MB`) : ''}
                        </p>
                      </div>
                      <button onClick={cancelImagePreview} disabled={imageUploadProgress !== null && imageUploadProgress < 100}
                        style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0, opacity: imageUploadProgress !== null && imageUploadProgress < 100 ? 0.4 : 1 }}>✕</button>
                    </div>
                  )}

                  {/* Input row */}
                  <div style={{ padding: '10px 12px 20px', display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
                    {/* Hidden file input */}
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      style={{ display: 'none' }}
                    />
                    {/* Emoji picker for input */}
                    {showEmojiPicker && (
                      <EmojiPicker
                        onSelect={(emoji) => {
                          setNewMessage((prev) => prev + emoji);
                          setTimeout(() => inputRef.current?.focus(), 0);
                        }}
                        onClose={() => setShowEmojiPicker(false)}
                        position="top"
                        align="left"
                      />
                    )}
                    {/* Emoji button */}
                    <button
                      onClick={() => setShowEmojiPicker((v) => !v)}
                      style={{ width: 36, height: 36, borderRadius: '50%', background: showEmojiPicker ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.12)', border: '0.5px solid rgba(139,92,246,0.3)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}
                      title="Emoji">
                      😊
                    </button>
                    {/* Image upload button */}
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      disabled={imageUploadProgress !== null && imageUploadProgress < 100}
                      style={{ width: 36, height: 36, borderRadius: '50%', background: imagePreview ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.12)', border: '0.5px solid rgba(139,92,246,0.3)', fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s', opacity: imageUploadProgress !== null && imageUploadProgress < 100 ? 0.5 : 1 }}
                      title="Send image">
                      🖼️
                    </button>
                    {/* # mention trigger button */}
                    <button
                      onClick={() => {
                        const val = newMessage;
                        const needsSpace = val.length > 0 && !val.endsWith(' ');
                        const toInsert = (needsSpace ? ' #' : '#');
                        setNewMessage(val + toInsert);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(139,92,246,0.12)', border: '0.5px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      title="Mention someone">
                      #
                    </button>
                    <input
                      ref={inputRef}
                      placeholder={imagePreview ? 'Add a caption (optional)...' : (replyingTo ? `Reply to #${replyingTo.senderUsername}...` : `Message ${selectedChat.name}...`)}
                      value={newMessage}
                      onChange={handleInputChange}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { setReplyingTo(null); setMentionSuggestions([]); }
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (pendingImageFile) sendImage();
                          else sendMessage();
                        }
                      }}
                      style={{ ...inputStyle, flex: 1, borderRadius: 24, padding: '10px 16px' }}
                    />
                    {pendingImageFile ? (
                      <button
                        onClick={sendImage}
                        disabled={imageUploadProgress !== null && imageUploadProgress < 100}
                        style={{ padding: '10px 18px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif', flexShrink: 0, opacity: imageUploadProgress !== null && imageUploadProgress < 100 ? 0.6 : 1 }}>
                        {imageUploadProgress !== null && imageUploadProgress < 100 ? `${imageUploadProgress}%` : 'Send 🖼️'}
                      </button>
                    ) : (
                      <button onClick={sendMessage} disabled={!newMessage.trim()}
                        style={{ padding: '10px 18px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: newMessage.trim() ? 'pointer' : 'not-allowed', opacity: newMessage.trim() ? 1 : 0.5, fontFamily: 'Inter,sans-serif', flexShrink: 0 }}>
                        Send
                      </button>
                    )}
                  </div>
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
              { href: '/feed',          icon: '🏠', label: 'Home' },
              { href: '/search',        icon: '🔍', label: 'Search' },
              { href: '/stories',       icon: '✨', label: 'Stories' },
              { href: '/messages',      icon: '💬', label: 'DMs', active: true },
              { href: '/entertainment', icon: '🎉', label: 'Fun' },
              { href: '/notifications', icon: '🔔', label: 'Alerts' },
              { href: '/profile',       icon: '👤', label: 'Profile' },
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

export default function Messages() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#a78bfa', fontWeight: 700 }}>ALTRONICS</p>
      </div>
    }>
      <MessagesInner />
    </Suspense>
  );
}
