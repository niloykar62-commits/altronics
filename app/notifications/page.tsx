'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, query, where, orderBy, getDocs, updateDoc, doc,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';

const TYPE_CONFIG: Record<string, { icon: string; bg: string; color: string; label: string }> = {
  like:    { icon: '❤️', bg: 'rgba(244,114,182,0.12)', color: '#f472b6', label: 'liked your post' },
  comment: { icon: '💬', bg: 'rgba(96,165,250,0.12)',  color: '#60a5fa', label: 'commented' },
  follow:  { icon: '👤', bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', label: 'started following you' },
  repost:  { icon: '🔄', bg: 'rgba(52,211,153,0.12)', color: '#34d399', label: 'reposted your post' },
  message: { icon: '📩', bg: 'rgba(96,165,250,0.12)', color: '#60a5fa', label: 'sent you a message' },
};

export default function Notifications() {
  const [user, setUser] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [markingRead, setMarkingRead] = useState(false);
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
      setNotifications(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  };

  const markAllRead = async () => {
    setMarkingRead(true);
    try {
      const unread = notifications.filter((n) => !n.read);
      await Promise.all(unread.map((n) => updateDoc(doc(db, 'notifications', n.id), { read: true })));
      await loadNotifications(user.uid);
    } catch (err) { console.error(err); }
    setMarkingRead(false);
  };

  const formatTime = (ts: any) => {
    if (!ts?.toDate) return 'Just now';
    const diff = (Date.now() - ts.toDate().getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (pageLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: '#6b7280', fontSize: 13, fontFamily: 'Inter,sans-serif' }}>Loading notifications...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: 'Inter,sans-serif', paddingBottom: 100 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 0' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
                🔔 Notifications
              </h1>
              {unreadCount > 0 && (
                <span style={{ background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingRead}
                style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(139,92,246,0.1)', border: '0.5px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: markingRead ? 0.6 : 1 }}
              >
                {markingRead ? 'Marking...' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <p style={{ fontSize: 48, marginBottom: 12 }}>🔔</p>
              <p style={{ color: '#6b7280', fontSize: 14 }}>No notifications yet.</p>
              <p style={{ color: '#4b5563', fontSize: 12, marginTop: 4 }}>When someone interacts with you, it'll show up here.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {notifications.map((n) => {
                const cfg = TYPE_CONFIG[n.type] || { icon: '🔔', bg: 'rgba(139,92,246,0.1)', color: '#a78bfa', label: 'interacted with you' };
                return (
                  <div
                    key={n.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                      background: n.read ? 'transparent' : 'rgba(139,92,246,0.05)',
                      borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                      borderRadius: 0, transition: 'background 0.2s',
                    }}
                  >
                    {/* Icon bubble */}
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {cfg.icon}
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.5, margin: 0 }}>
                        <span style={{ fontWeight: 600, color: '#f3f4f6' }}>@{n.fromUsername}</span>{' '}
                        {n.type === 'comment' && n.commentText
                          ? `commented: "${n.commentText}"`
                          : cfg.label}
                      </p>
                      <p style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>{formatTime(n.createdAt)}</p>
                    </div>

                    {/* Unread dot */}
                    {!n.read && (
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', flexShrink: 0 }} />
                    )}
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
