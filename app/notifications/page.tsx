'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Notifications() {
  const [user, setUser] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/login'); return; }
      setUser(firebaseUser);
      await loadNotifications(firebaseUser.uid);
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadNotifications = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('toUserId', '==', uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNotifications(list);
    } catch (err) {
      console.error('Notifications error:', err);
    }
  };

  const markAllRead = async () => {
    try {
      const unread = notifications.filter((n) => !n.read);
      await Promise.all(
        unread.map((n) => updateDoc(doc(db, 'notifications', n.id), { read: true }))
      );
      await loadNotifications(user.uid);
    } catch (err) {
      console.error('Mark read error:', err);
    }
  };

  // ✅ Updated with repost icon
  const getIcon = (type: string) => {
    switch (type) {
      case 'like': return '❤️';
      case 'comment': return '💬';
      case 'follow': return '👤';
      case 'repost': return '🔄';
      case 'message': return '📩';
      default: return '🔔';
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading notifications...</p>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-2xl mx-auto p-4 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold dark:text-white">
            🔔 Notifications
            {unreadCount > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </h1>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {notifications.length === 0 ? (
            <p className="text-center text-gray-400 py-12">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <Card
                key={n.id}
                className={`transition-colors ${
                  !n.read
                    ? 'border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800'
                    : ''
                }`}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="text-2xl">{getIcon(n.type)}</span>
                  <div className="flex-1">
                    <p className="text-sm dark:text-gray-200">
                      <span className="font-semibold">@{n.fromUsername}</span>{' '}
                      {n.type === 'like' && 'liked your post'}
                      {n.type === 'comment' && `commented: "${n.commentText}"`}
                      {n.type === 'follow' && 'started following you'}
                      {n.type === 'repost' && 'reposted your post'}
                      {n.type === 'message' && 'sent you a message'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {n.createdAt?.toDate
                        ? new Date(n.createdAt.toDate()).toLocaleString()
                        : 'Just now'}
                    </p>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </>
  );
}
