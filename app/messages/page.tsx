'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { auth, db, storage } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDocs, orderBy,
  query, serverTimestamp, doc, getDoc, where,
  updateDoc, onSnapshot, setDoc, deleteDoc,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import Navbar from '@/components/Navbar';

function MessagesContent() {
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
  const [replyingTo, setReplyingTo] = useState<any>(null);       // message being replied to
  const [mentionQuery, setMentionQuery] = useState('');           // text after # in input
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]); // users shown in dropdown
  const inputRef = useRef<HTMLInputElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);   // main emoji picker in input
  const [emojiPickerTab, setEmojiPickerTab] = useState(0);          // tab index in picker
  const [reactingToMsgId, setReactingToMsgId] = useState<string | null>(null); // msg getting reacted to
  const { push } = useRouter();
  const searchParams = useSearchParams();

  // ── Image upload state ────────────────────────────────────────────────────
  const [imageUploading, setImageUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Edit / Delete state ───────────────────────────────────────────────────
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [msgMenuOpenId, setMsgMenuOpenId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { push('/login'); return; }
      setUser(firebaseUser);
      const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (profileDoc.exists()) setUserProfile(profileDoc.data());
      await loadAllUsers(firebaseUser.uid);
      await loadGroups(firebaseUser.uid);
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // ── Auto-open chat from notification deep-link (?dm=uid or ?group=groupId) ──
  // eslint-disable-next-line react-compiler/react-compiler
  useEffect(() => {
    if (pageLoading) return;
    const dmUid = searchParams.get('dm');
    const groupId = searchParams.get('group');
    if (dmUid) {
      const target = allUsers.find((u: any) => u.id === dmUid);
      if (target) openDM(target);
    } else if (groupId) {
      const target = groups.find((g: any) => g.id === groupId);
      if (target) openGroup(target);
    }
  }, [pageLoading, searchParams]);

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
    const presenceCol = collection(db, 'presence');
    const unsub = onSnapshot(presenceCol, (snap) => {
      const map: Record<string, boolean> = {};
      snap.docs.forEach((d) => { map[d.id] = d.data().online === true; });
      setOnlineUsers(map);
    });
    return () => unsub();
  }, []);

  // ── Close msg context menu on outside click ───────────────────────────────
  useEffect(() => {
    if (!msgMenuOpenId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.msg-menu-anchor')) setMsgMenuOpenId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [msgMenuOpenId]);

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
    // Load full group doc for admin/member info
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
    } catch (err: any) { alert('Failed: ' + err.message); }
  };

  const leaveGroup = async () => {
    if (!groupInfo || !user) return;
    if (!confirm('Leave this group?')) return;
    try {
      const newMembers = (groupInfo.members || []).filter((id: string) => id !== user.uid);
      const newAdmins = (groupInfo.admins || []).filter((id: string) => id !== user.uid);
      if (newMembers.length === 0) {
        await deleteDoc(doc(db, 'groups', groupInfo.id));
      } else {
        // If leaving admin was the only admin, promote oldest member
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
    } catch (err: any) { alert('Failed: ' + err.message); }
  };

  const removeMember = async (memberId: string) => {
    if (!isGroupAdmin() || !groupInfo) return;
    if (!confirm('Remove this member?')) return;
    try {
      const newMembers = (groupInfo.members || []).filter((id: string) => id !== memberId);
      const newAdmins = (groupInfo.admins || []).filter((id: string) => id !== memberId);
      await updateDoc(doc(db, 'groups', groupInfo.id), { members: newMembers, admins: newAdmins });
      await loadGroupInfo(groupInfo.id);
      setSelectedChat((prev: any) => ({ ...prev, memberCount: newMembers.length }));
    } catch (err: any) { alert('Failed: ' + err.message); }
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
    } catch (err: any) { alert('Failed: ' + err.message); }
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
    } catch (err: any) { alert('Failed: ' + err.message); }
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

  // ── Upload & send an image message ───────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('Image must be under 10 MB.'); return; }
    // Validate the file is readable before setting preview
    const reader = new FileReader();
    reader.onload = () => {
      const url = URL.createObjectURL(file);
      setImagePreview({ file, url });
    };
    reader.onerror = () => alert('Could not read file. Please try another image.');
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const sendImage = async () => {
    if (!imagePreview || !user || !selectedChat) return;
    setImageUploading(true);
    try {
      const collectionName = selectedChat.type === 'group' ? 'groups' : 'conversations';

      // Sanitize filename — remove spaces and special chars that break Storage paths
      const ext = imagePreview.file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeName = `${user.uid}_${Date.now()}.${ext}`;
      const path = `chat_images/${selectedChat.id}/${safeName}`;
      const sRef = storageRef(storage, path);

      // Convert file to ArrayBuffer first — avoids CORS/blob issues on some browsers
      const arrayBuffer = await imagePreview.file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Upload with metadata so Content-Type is set correctly
      await uploadBytes(sRef, bytes, { contentType: imagePreview.file.type || 'image/jpeg' });
      const imageUrl = await getDownloadURL(sRef);

      if (!imageUrl) throw new Error('No download URL returned from storage');

      await addDoc(collection(db, collectionName, selectedChat.id, 'messages'), {
        senderId: user.uid,
        senderUsername: userProfile?.username || 'me',
        senderFullName: userProfile?.fullName || 'User',
        content: '',
        imageUrl,
        type: 'image',
        createdAt: serverTimestamp(),
        ...(replyingTo ? {
          replyTo: {
            id: replyingTo.id,
            content: replyingTo.content || '📷 Photo',
            senderUsername: replyingTo.senderUsername,
          }
        } : {}),
      });

      if (selectedChat.type === 'dm') {
        await addDoc(collection(db, 'notifications'), {
          toUserId: selectedChat.otherUser.id, fromUserId: user.uid,
          fromUsername: userProfile?.username || 'someone',
          type: 'message', read: false, createdAt: serverTimestamp(),
        });
      }

      URL.revokeObjectURL(imagePreview.url);
      setImagePreview(null);
      setReplyingTo(null);
      const collName = selectedChat.type === 'group' ? 'groups' : 'conversations';
      await loadMessages(collName, selectedChat.id);
    } catch (err: any) {
      console.error('Image upload error:', err);
      alert('Upload failed: ' + (err.message || 'Unknown error. Check Firebase Storage rules.'));
    }
    setImageUploading(false);
  };

  const cancelImagePreview = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview.url);
    setImagePreview(null);
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
    const collName = selectedChat.type === 'group' ? 'groups' : 'conversations';
    try {
      await updateDoc(doc(db, collName, selectedChat.id, 'messages', msg.id), {
        content: trimmed,
        editedAt: serverTimestamp(),
      });
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, content: trimmed, editedAt: true } : m));
    } catch (err) { console.error(err); }
    setEditingMsgId(null);
    setEditingContent('');
  };

  const cancelEdit = () => { setEditingMsgId(null); setEditingContent(''); };

  // ── Delete a message (soft-delete) ───────────────────────────────────────
  const deleteMessage = async (msg: any) => {
    if (!selectedChat || !user) return;
    setMsgMenuOpenId(null);
    const collName = selectedChat.type === 'group' ? 'groups' : 'conversations';
    try {
      await updateDoc(doc(db, collName, selectedChat.id, 'messages', msg.id), {
        deleted: true,
        content: '',
        deletedAt: serverTimestamp(),
      });
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, deleted: true, content: '' } : m));
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

  // ── Emoji data ───────────────────────────────────────────────────────────
  const EMOJI_TABS = [
    { label: '😀', name: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿'] },
    { label: '👍', name: 'Gestures', emojis: ['👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👋','🤚','🖐️','✋','🖖','👏','🙌','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄','🫦'] },
    { label: '❤️', name: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️'] },
    { label: '🔥', name: 'Symbols', emojis: ['🔥','💯','✨','⭐','🌟','💫','⚡','🌈','🎉','🎊','🎈','🎁','🏆','🥇','🎯','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🎸','🎺','🎻','🥁','🎮','🕹️','🎲','♟️','🃏','🀄','🎴','🔮','🧿','🪬','🧸','🪆','🖼️','🧩','🪅','🪃','🏹'] },
    { label: '🐶', name: 'Animals', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀'] },
    { label: '🍕', name: 'Food', emojis: ['🍕','🍔','🌮','🌯','🥗','🍜','🍝','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍘','🍚','🍧','🍦','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧁','🍷','🍸','🍹','🧉','🍺','🍻','🥂','☕','🍵','🧃','🥤','🧋','🍶','🥛','🍼'] },
  ];

  const QUICK_REACTIONS = ['❤️','😂','😮','😢','😡','👍','🔥','🥰'];

  // Toggle emoji reaction on a message
  const toggleReaction = async (msgId: string, emoji: string, collectionName: string) => {
    if (!user) return;
    try {
      const msgRef = doc(db, collectionName, selectedChat.id, 'messages', msgId);
      const msgDoc = await getDoc(msgRef);
      if (!msgDoc.exists()) return;
      const reactions: Record<string, string[]> = msgDoc.data().reactions || {};
      const current: string[] = reactions[emoji] || [];
      const hasReacted = current.includes(user.uid);
      const updated = hasReacted
        ? current.filter((id: string) => id !== user.uid)
        : [...current, user.uid];
      const newReactions = { ...reactions, [emoji]: updated };
      // remove emoji key if nobody reacted
      if (updated.length === 0) delete newReactions[emoji];
      await updateDoc(msgRef, { reactions: newReactions });
      // Optimistically update local state
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, reactions: newReactions } : m));
    } catch (err) { console.error(err); }
    setReactingToMsgId(null);
  };

  // Render text — highlight #mentions in purple
  const renderContent = (text: string) => {
    const parts = text.split(/(#[a-zA-Z0-9_]+)/g);
    return parts.map((part, i) =>
      part.startsWith('#')
        ? <span key={i} className="mention-highlight">{part}</span>
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
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .msg-btn { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: opacity 0.15s; opacity: 0; }
        .msg-btn-reply { background: rgba(139,92,246,0.15); border: 0.5px solid rgba(139,92,246,0.3); color: #a78bfa; font-size: 13px; }
        .msg-btn-react { background: rgba(251,191,36,0.12); border: 0.5px solid rgba(251,191,36,0.3); font-size: 13px; }
        .nav-link { text-decoration: none; }
        .nav-item { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 12px; border-radius: 14px; cursor: pointer; }
        .nav-item-active { background: rgba(139,92,246,0.15); }
        .nav-dot { width: 4px; height: 4px; border-radius: 50%; background: #a78bfa; }
        .user-avatar { display: flex; align-items: center; justify-content: center; font-weight: 700; color: #a78bfa; flex-shrink: 0; }
        .online-dot { position: absolute; bottom: 1px; right: 1px; width: 11px; height: 11px; border-radius: 50%; background: #22c55e; border: 2px solid #0a0a0f; }
        .msg-bubble-me { background: linear-gradient(135deg,#8b5cf6,#3b82f6); }
        .msg-bubble-them { background: rgba(255,255,255,0.06); border: 0.5px solid rgba(255,255,255,0.08); }
        .mention-highlight { color: #a78bfa; font-weight: 700; }
        .input-base { width: 100%; padding: 10px 14px; background: rgba(139,92,246,0.08); border: 0.5px solid rgba(139,92,246,0.2); border-radius: 12px; color: #f3f4f6; font-size: 13px; font-family: Inter,sans-serif; outline: none; }
        .page-loading { min-height: 100vh; background: #0a0a0f; display: flex; align-items: center; justify-content: center; }
        .reply-bar { display: flex; align-items: center; gap: 10px; padding: 8px 16px; background: rgba(139,92,246,0.08); border-bottom: 0.5px solid rgba(139,92,246,0.15); }
        .reply-border { flex: 1; border-left: 3px solid #a78bfa; padding-left: 10px; }
        .emoji-reaction-btn { display: flex; align-items: center; gap: 3px; padding: 3px 8px; border-radius: 20px; cursor: pointer; transition: background 0.15s, border 0.15s; }
      `}</style>
      <Navbar />

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#111118', border: '0.5px solid rgba(139,92,246,0.3)', borderRadius: 24, padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>Create Group</h2>
              <button type="button" onClick={() => setShowCreateGroup(false)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Group Name</label>
              <input placeholder="e.g. Dev Squad..." value={groupName} onChange={(e) => setGroupName(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Add Members ({selectedMembers.length} selected)
              </label>
              <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allUsers.map((u: any) => {
                  const isSelected = selectedMembers.includes(u.id);
                  return (
                    <div key={u.id} onClick={() => toggleMember(u.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: isSelected ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)', border: isSelected ? '0.5px solid rgba(139,92,246,0.4)' : '0.5px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.2s, border 0.2s' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#a78bfa', flexShrink: 0 }}>
                        {u.fullName?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{u.fullName}</p>
                        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>@{u.username}</p>
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: isSelected ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'white', flexShrink: 0 }}>
                        {isSelected ? '✓' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <button type="button" onClick={createGroup} disabled={creating}
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
                <button type="button" onClick={() => setShowCreateGroup(true)}
                  style={{ padding: '5px 12px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                  + Group
                </button>
              </div>
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3 }}>
                {(['dms', 'groups'] as const).map((tab) => (
                  <button type="button" key={tab} onClick={() => setActiveTab(tab)}
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
                      <p style={{ fontSize: 12, color: onlineUsers[u.id] ? '#22c55e' : '#6b7280', margin: 0, fontWeight: onlineUsers[u.id] ? 600 : 400 }}>
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
                      <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{group.members?.length || 0} members</p>
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
                  <button type="button" onClick={() => { setSelectedChat(null); setInCall(false); setMessages([]); }}
                    style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(139,92,246,0.12)', border: '0.5px solid rgba(139,92,246,0.25)', color: '#a78bfa', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>
                    ‹
                  </button>
                  <div style={{ width: 36, height: 36, borderRadius: selectedChat.type === 'group' ? 10 : '50%', background: selectedChat.type === 'group' ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: selectedChat.type === 'group' ? 'white' : '#a78bfa', flexShrink: 0 }}>
                    {selectedChat.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedChat.name}</p>
                    <p style={{ fontSize: 12, margin: 0, display: 'flex', alignItems: 'center', gap: 4,
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
                    <button type="button" onClick={() => startCall('voice')}
                      style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', border: '0.5px solid rgba(52,211,153,0.3)', color: '#34d399', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s, border 0.2s' }}
                      title="Voice call"
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(52,211,153,0.25)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(52,211,153,0.15)')}>
                      📞
                    </button>
                    <button type="button" onClick={() => startCall('video')}
                      style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(139,92,246,0.15)', border: '0.5px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s, border 0.2s' }}
                      title="Video call"
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.25)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.15)')}>
                      🎥
                    </button>
                    {/* Group info button */}
                    {selectedChat.type === 'group' && (
                      <button type="button" onClick={() => setShowGroupInfo(true)}
                        style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(251,191,36,0.15)', border: '0.5px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s, border 0.2s' }}
                        aria-label="Group info">
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
                      <button type="button" onClick={() => setShowGroupInfo(false)}
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
                                <button type="button" onClick={renameGroup} style={{ padding: '8px 14px', borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Save</button>
                                <button type="button" onClick={() => setEditingGroupName(false)} style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: 'none', color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <p style={{ fontSize: 18, fontWeight: 800, color: '#f3f4f6', margin: 0 }}>{groupInfo.name}</p>
                                {isGroupAdmin() && (
                                  <button type="button" onClick={() => { setNewGroupName(groupInfo.name); setEditingGroupName(true); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6b7280', padding: 4 }} title="Rename group">✏️</button>
                                )}
                              </div>
                            )}
                            <p style={{ fontSize: 12, color: '#6b7280', margin: '6px 0 0' }}>{groupInfo.memberProfiles?.length || 0} members</p>
                          </div>

                          {/* Add member (admin only) */}
                          {isGroupAdmin() && (
                            <div style={{ padding: '16px 16px 0' }}>
                              <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Add Members</p>
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
                                          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>@{u.username}</p>
                                        </div>
                                        <button type="button" onClick={() => { addMemberToGroup(u.id); setAddMemberSearch(''); }}
                                          style={{ padding: '6px 12px', borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: 'Inter,sans-serif' }}>
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
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
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
                                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(59,130,246,0.3))', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#a78bfa' }}>
                                        {member.fullName?.[0]?.toUpperCase() || 'U'}
                                      </div>
                                      {onlineUsers[member.id] && (
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
                                          <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.15)', border: '0.5px solid rgba(251,191,36,0.3)', borderRadius: 6, padding: '1px 6px' }}>Owner</span>
                                        )}
                                        {!isOwner && isMemberAdmin && (
                                          <span style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', background: 'rgba(139,92,246,0.15)', border: '0.5px solid rgba(139,92,246,0.3)', borderRadius: 6, padding: '1px 6px' }}>Admin</span>
                                        )}
                                      </div>
                                      <p style={{ fontSize: 12, color: onlineUsers[member.id] ? '#22c55e' : '#6b7280', margin: 0, fontWeight: onlineUsers[member.id] ? 600 : 400 }}>
                                        {onlineUsers[member.id] ? '● Active now' : `@${member.username}`}
                                      </p>
                                    </div>
                                    {/* Admin actions */}
                                    {isGroupAdmin() && !isMe && !isOwner && (
                                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                        <button type="button" onClick={() => toggleAdmin(member.id)}
                                          title={isMemberAdmin ? 'Remove admin' : 'Make admin'}
                                          style={{ padding: '5px 10px', borderRadius: 8, background: isMemberAdmin ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)', border: isMemberAdmin ? '0.5px solid rgba(139,92,246,0.4)' : '0.5px solid rgba(255,255,255,0.1)', color: isMemberAdmin ? '#a78bfa' : '#9ca3af', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                                          {isMemberAdmin ? '★ Admin' : '☆ Admin'}
                                        </button>
                                        <button type="button" onClick={() => removeMember(member.id)}
                                          title="Remove from group"
                                          style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
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
                            <button type="button" onClick={leaveGroup}
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
                      <button type="button" onClick={endCall}
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
                              style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'underline', cursor: 'pointer' }}>
                              Join
                            </a>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={msg.id}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', position: 'relative' }}
                        onMouseEnter={(e) => {
                          const btn = e.currentTarget.querySelector('.reply-btn') as HTMLElement; if (btn) btn.style.opacity = '1';
                          const rbtn = e.currentTarget.querySelector('.react-btn') as HTMLElement; if (rbtn) rbtn.style.opacity = '1';
                          const mbtn = e.currentTarget.querySelector('.menu-btn') as HTMLElement; if (mbtn) mbtn.style.opacity = '1';
                        }}
                        onMouseLeave={(e) => {
                          const btn = e.currentTarget.querySelector('.reply-btn') as HTMLElement; if (btn) btn.style.opacity = '0';
                          const rbtn = e.currentTarget.querySelector('.react-btn') as HTMLElement; if (rbtn) rbtn.style.opacity = '0';
                          const mbtn = e.currentTarget.querySelector('.menu-btn') as HTMLElement; if (mbtn && msgMenuOpenId !== msg.id) mbtn.style.opacity = '0';
                        }}
                      >
                        {/* Sender name in group */}
                        {!isMe && selectedChat.type === 'group' && (
                          <span style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600, marginBottom: 3, marginLeft: 4 }}>
                            #{msg.senderUsername}
                          </span>
                        )}

                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexDirection: isMe ? 'row-reverse' : 'row' }}>

                          {/* Side action buttons */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
                            {/* Reply */}
                            {!msg.deleted && (
                              <button type="button" className="reply-btn"
                                onClick={() => setReplyingTo(msg)}
                                style={{ opacity: 0, transition: 'opacity 0.15s', background: 'rgba(139,92,246,0.15)', border: '0.5px solid rgba(139,92,246,0.3)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#a78bfa', fontSize: 13, flexShrink: 0 }}
                                title="Reply">↩</button>
                            )}
                            {/* React */}
                            {!msg.deleted && (
                              <button type="button" className="react-btn"
                                onClick={() => setReactingToMsgId(reactingToMsgId === msg.id ? null : msg.id)}
                                style={{ opacity: 0, transition: 'opacity 0.15s', background: 'rgba(251,191,36,0.12)', border: '0.5px solid rgba(251,191,36,0.3)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}
                                title="React">😊</button>
                            )}
                            {/* ⋯ Menu — only my non-deleted text messages */}
                            {isMe && !msg.deleted && (
                              <div className="msg-menu-anchor" style={{ position: 'relative' }}>
                                <button type="button" className="menu-btn"
                                  onClick={() => setMsgMenuOpenId(msgMenuOpenId === msg.id ? null : msg.id)}
                                  style={{ opacity: msgMenuOpenId === msg.id ? 1 : 0, transition: 'opacity 0.15s', background: msgMenuOpenId === msg.id ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9ca3af', fontSize: 15, flexShrink: 0 }}
                                  title="More">⋯</button>

                                {msgMenuOpenId === msg.id && (
                                  <div style={{ position: 'absolute', [isMe ? 'right' : 'left']: 0, bottom: '110%', zIndex: 200, background: '#111118', border: '0.5px solid rgba(139,92,246,0.25)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.6)', minWidth: 140, animation: 'menuPop 0.15s cubic-bezier(0.34,1.56,0.64,1)' }}>
                                    <style>{`@keyframes menuPop{from{opacity:0;transform:scale(0.85) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
                                    {/* Edit — only for text messages */}
                                    {msg.type !== 'image' && (
                                      <>
                                        <button type="button" onClick={() => startEdit(msg)}
                                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#e2e8f0', fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif', textAlign: 'left', transition: 'background 0.12s' }}
                                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.12)')}
                                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                                          <span style={{ fontSize: 15 }}>✏️</span> Edit
                                        </button>
                                        <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.06)', margin: '0 12px' }} />
                                      </>
                                    )}
                                    {/* Delete */}
                                    <button type="button" onClick={() => deleteMessage(msg)}
                                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif', textAlign: 'left', transition: 'background 0.12s' }}
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
                            {/* Reply preview */}
                            {msg.replyTo && (
                              <div style={{ marginBottom: 4, padding: '6px 10px', borderRadius: '10px 10px 0 0', background: isMe ? 'rgba(0,0,0,0.25)' : 'rgba(139,92,246,0.12)', borderLeft: '3px solid #a78bfa' }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', margin: '0 0 2px' }}>↩ #{msg.replyTo.senderUsername}</p>
                                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                                  {msg.replyTo.content || '📷 Photo'}
                                </p>
                              </div>
                            )}

                            {/* Deleted tombstone */}
                            {msg.deleted ? (
                              <div style={{ padding: '10px 14px', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.06)' }}>
                                <p style={{ fontSize: 12, color: '#4b5563', fontStyle: 'italic', margin: 0 }}>🗑 Message deleted</p>
                              </div>
                            ) : editingMsgId === msg.id ? (
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
                                  <button type="button" onClick={cancelEdit}
                                    style={{ padding: '5px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.1)', color: '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                                    Cancel
                                  </button>
                                  <button type="button" onClick={() => saveEdit(msg)} disabled={!editingContent.trim()}
                                    style={{ padding: '5px 12px', borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: editingContent.trim() ? 'pointer' : 'not-allowed', opacity: editingContent.trim() ? 1 : 0.5, fontFamily: 'Inter,sans-serif' }}>
                                    Save
                                  </button>
                                </div>
                                <p style={{ fontSize: 12, color: '#4b5563', margin: 0, textAlign: 'right' }}>Enter to save · Esc to cancel</p>
                              </div>
                            ) : (
                              /* ── Normal bubble ── */
                              <div style={{ padding: msg.type === 'image' ? '4px' : '10px 14px', borderRadius: msg.replyTo ? (isMe ? '0 18px 4px 18px' : '18px 0 18px 4px') : (isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px'), background: isMe ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.06)', border: isMe ? 'none' : '0.5px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                {msg.type === 'image' && msg.imageUrl ? (
                                  <div>
                                    <img src={msg.imageUrl} alt="Image"
                                      onClick={() => window.open(msg.imageUrl, '_blank')}
                                      style={{ display: 'block', maxWidth: 260, maxHeight: 320, width: '100%', borderRadius: 14, cursor: 'zoom-in', objectFit: 'cover' }} />
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, padding: '4px 8px 2px' }}>
                                      <span style={{ fontSize: 12, color: isMe ? 'rgba(255,255,255,0.6)' : '#4b5563' }}>
                                        {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                      </span>
                                      {isMe && selectedChat.type === 'dm' && (
                                        <span style={{ fontSize: 12, fontWeight: 700, color: (msg.seenBy || []).includes(selectedChat.otherUser?.id) ? '#60a5fa' : 'rgba(255,255,255,0.35)' }}>
                                          {(msg.seenBy || []).includes(selectedChat.otherUser?.id) ? '✓✓' : '✓'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <p style={{ fontSize: 13, color: 'white', margin: 0, lineHeight: 1.6 }}>{renderContent(msg.content)}</p>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                                      {msg.editedAt && <span style={{ fontSize: 12, color: isMe ? 'rgba(255,255,255,0.4)' : '#4b5563', fontStyle: 'italic' }}>edited</span>}
                                      <span style={{ fontSize: 12, color: isMe ? 'rgba(255,255,255,0.6)' : '#4b5563' }}>
                                        {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                      </span>
                                      {isMe && selectedChat.type === 'dm' && (
                                        <span style={{ fontSize: 12, fontWeight: 700, color: (msg.seenBy || []).includes(selectedChat.otherUser?.id) ? '#60a5fa' : 'rgba(255,255,255,0.35)' }}
                                          title={(msg.seenBy || []).includes(selectedChat.otherUser?.id) ? 'Seen' : 'Sent'}>
                                          {(msg.seenBy || []).includes(selectedChat.otherUser?.id) ? '✓✓' : '✓'}
                                        </span>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Reaction bubbles */}
                            {!msg.deleted && msg.reactions && Object.keys(msg.reactions).length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                                {Object.entries(msg.reactions as Record<string, string[]>)
                                  .filter(([, uids]) => uids.length > 0)
                                  .map(([emoji, uids]) => {
                                    const iReacted = uids.includes(user.uid);
                                    const collName = selectedChat.type === 'group' ? 'groups' : 'conversations';
                                    return (
                                      <button type="button" key={emoji}
                                        onClick={() => toggleReaction(msg.id, emoji, collName)}
                                        aria-label={`${emoji} reaction, ${uids.length} ${uids.length === 1 ? 'person' : 'people'}`}
                                        style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 20, background: iReacted ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.06)', border: iReacted ? '0.5px solid rgba(139,92,246,0.5)' : '0.5px solid rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'background 0.15s, border 0.15s' }}>
                                        <span style={{ fontSize: 14 }}>{emoji}</span>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: iReacted ? '#a78bfa' : '#9ca3af' }}>{uids.length}</span>
                                      </button>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Quick reaction picker */}
                        {reactingToMsgId === msg.id && (
                          <div style={{ position: 'absolute', [isMe ? 'right' : 'left']: 40, bottom: '100%', marginBottom: 6, zIndex: 50, background: '#1a1a2e', border: '0.5px solid rgba(139,92,246,0.3)', borderRadius: 20, padding: '6px 10px', display: 'flex', gap: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                            {QUICK_REACTIONS.map((emoji) => (
                              <button type="button" key={emoji}
                                onClick={() => toggleReaction(msg.id, emoji, selectedChat.type === 'group' ? 'groups' : 'conversations')}
                                aria-label={`React with ${emoji}`}
                                style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px', borderRadius: 8, transition: 'transform 0.1s' }}
                                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.35)')}
                                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
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
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', margin: '0 0 2px' }}>
                          ↩ Replying to #{replyingTo.senderUsername}
                        </p>
                        <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                          {replyingTo.content}
                        </p>
                      </div>
                      <button type="button" onClick={() => setReplyingTo(null)}
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
                            {onlineUsers[u.id] && (
                              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: '#22c55e', border: '2px solid #111118' }} />
                            )}
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{u.fullName}</p>
                            <p style={{ fontSize: 12, color: '#a78bfa', margin: 0 }}>#{u.username}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Image preview bar — shown when user picks a photo */}
                  {imagePreview && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(139,92,246,0.08)', borderBottom: '0.5px solid rgba(139,92,246,0.15)' }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <img src={imagePreview.url} alt="preview" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '0.5px solid rgba(139,92,246,0.3)' }} />
                        {imageUploading && (
                          <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(167,139,250,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.7s linear infinite' }} />
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#f3f4f6', margin: '0 0 2px' }}>📷 Photo ready to send</p>
                        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                          {(imagePreview.file.size / 1024).toFixed(0)} KB · {imagePreview.file.name.slice(0, 28)}
                        </p>
                      </div>
                      <button type="button" onClick={sendImage} disabled={imageUploading}
                        style={{ padding: '8px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: imageUploading ? 'not-allowed' : 'pointer', opacity: imageUploading ? 0.6 : 1, fontFamily: 'Inter,sans-serif', flexShrink: 0 }}>
                        {imageUploading ? 'Sending...' : 'Send'}
                      </button>
                      <button type="button" onClick={cancelImagePreview} disabled={imageUploading}
                        style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', border: '0.5px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Input row */}
                  <div style={{ padding: '10px 12px 20px', display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                    {/* 📷 Image button */}
                    <button type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={imageUploading}
                      style={{ width: 36, height: 36, borderRadius: '50%', background: imagePreview ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.1)', border: imagePreview ? '0.5px solid rgba(139,92,246,0.5)' : '0.5px solid rgba(139,92,246,0.25)', fontSize: 17, cursor: imageUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s, border 0.15s' }}
                      aria-label="Send image">
                      📷
                    </button>
                    {/* # mention trigger button */}
                    <button type="button"
                      onClick={() => {
                        const val = newMessage;
                        const needsSpace = val.length > 0 && !val.endsWith(' ');
                        const toInsert = (needsSpace ? ' #' : '#');
                        setNewMessage(val + toInsert);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(139,92,246,0.12)', border: '0.5px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      aria-label="Mention someone">
                      #
                    </button>
                    <input
                      ref={inputRef}
                      placeholder={replyingTo ? `Reply to #${replyingTo.senderUsername}...` : `Message ${selectedChat.name}...`}
                      value={newMessage}
                      onChange={handleInputChange}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { setReplyingTo(null); setMentionSuggestions([]); }
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                      }}
                      style={{ ...inputStyle, flex: 1, borderRadius: 24, padding: '10px 16px' }}
                    />
                    <button type="button" onClick={sendMessage} disabled={!newMessage.trim()}
                      style={{ padding: '10px 18px', borderRadius: 20, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: newMessage.trim() ? 'pointer' : 'not-allowed', opacity: newMessage.trim() ? 1 : 0.5, fontFamily: 'Inter,sans-serif', flexShrink: 0 }}>
                      Send
                    </button>
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
                    <p style={{ fontSize: 12, color: '#34d399', fontWeight: 600, margin: 0 }}>Voice Calls</p>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px 20px', borderRadius: 16, background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.2)' }}>
                    <p style={{ fontSize: 24, margin: '0 0 4px' }}>🎥</p>
                    <p style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600, margin: 0 }}>Video Calls</p>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px 20px', borderRadius: 16, background: 'rgba(59,130,246,0.08)', border: '0.5px solid rgba(59,130,246,0.2)' }}>
                    <p style={{ fontSize: 24, margin: '0 0 4px' }}>👥</p>
                    <p style={{ fontSize: 12, color: '#60a5fa', fontWeight: 600, margin: 0 }}>Group Chat</p>
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
        transition: 'background 0.3s, border-top 0.3s, padding 0.3s',
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
                  <span style={{ fontSize: 12, fontWeight: 600, color: active ? '#a78bfa' : '#6b7280' }}>{label}</span>
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
      <MessagesContent />
    </Suspense>
  );
}
