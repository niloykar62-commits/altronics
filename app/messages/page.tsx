'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  addDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  doc,
  getDoc,
  where,
  onSnapshot,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export default function Messages() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [pageLoading, setPageLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push('/login');
        return;
      }
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
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [selectedUser, user]);

  const getChatId = (uid1: string, uid2: string) => {
    return [uid1, uid2].sort().join('_');
  };

  const loadUsers = async (uid: string) => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const users = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u: any) => u.id !== uid);
      setAllUsers(users);
    } catch (err) {
      console.error('Load users error:', err);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !selectedUser) return;
    const chatId = getChatId(user.uid, selectedUser.id);

    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: user.uid,
        senderUsername: userProfile?.username || 'anonymous',
        content: newMessage.trim(),
        createdAt: serverTimestamp(),
      });

      // Send notification
      await addDoc(collection(db, 'notifications'), {
        toUserId: selectedUser.id,
        fromUserId: user.uid,
        fromUsername: userProfile?.username || 'someone',
        type: 'message',
        read: false,
        createdAt: serverTimestamp(),
      });

      setNewMessage('');
    } catch (err: any) {
      console.error('Send message error:', err);
    }
  };

  const filteredUsers = allUsers.filter((u: any) =>
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.fullName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading messages...</p>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto p-4 pt-6">
        <h1 className="text-xl font-bold mb-4 dark:text-white">💬 Direct Messages</h1>

        <div className="flex gap-4 h-[70vh]">

          {/* Users List */}
          <div className="w-1/3 flex flex-col gap-2">
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-1"
            />
            <div className="overflow-y-auto space-y-2 flex-1">
              {filteredUsers.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No users found</p>
              ) : (
                filteredUsers.map((u: any) => (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedUser?.id === u.id
                        ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                        : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center font-bold text-sm shrink-0">
                      {u.fullName?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.fullName}</p>
                      <p className="text-xs text-gray-400 truncate">@{u.username}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat Window */}
          <div className="flex-1 flex flex-col">
            {!selectedUser ? (
              <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg">
                <p className="text-gray-400 text-sm">Select a user to start chatting</p>
              </div>
            ) : (
              <Card className="flex-1 flex flex-col overflow-hidden">
                {/* Chat Header */}
                <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center font-bold text-sm">
                    {selectedUser.fullName?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="font-semibold text-sm dark:text-white">{selectedUser.fullName}</p>
                    <p className="text-xs text-gray-400">@{selectedUser.username}</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-8">
                      No messages yet. Say hello! 👋
                    </p>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.senderId === user?.uid;
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-xs px-4 py-2 rounded-2xl text-sm ${
                              isMe
                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-br-sm'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                            }`}
                          >
                            <p>{msg.content}</p>
                            <p className={`text-xs mt-1 ${isMe ? 'text-gray-400' : 'text-gray-400'}`}>
                              {msg.createdAt?.toDate
                                ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Message Input */}
                <div className="p-3 border-t border-gray-100 dark:border-gray-700 flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} disabled={!newMessage.trim()}>
                    Send
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
