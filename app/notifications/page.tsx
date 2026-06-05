'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, query, where, orderBy,
  onSnapshot, updateDoc, doc, writeBatch,
} from 'firebase/firestore';
import Navbar from '@/components/Navbar';

function timeAgo(ts: any): string {
  if (!ts?.toDate) return 'Just now';
  const diff = Date.now() - ts.toDate().getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return ts.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Notifications() {
  const [user, setUser] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) { router.push('/login'); return; }
      setUser(firebaseUser);
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Live notifications listener — updates in real-time
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notifications'),
      where('toUserId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => { console.error(err); });
    return () => unsub();
  }, [user]);

  const markAllRead = async () => {
    try {
      const unread = notifications.filter((n) => !n.read);
      if (unread.length === 0) return;
      const batch = writeBatch(db);
      unread.forEach((n) => batch.update(doc(db, 'notifications', n.id), { read: true }));
      await batch.commit();
      // onSnapshot will automatically update the local state
    } catch (err) { console.error(err); }
  };

  const markOneRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) { console.error(err); }
  };

  // Route to the right page based on notification type
  const handleClick = async (n: any) => {
    if (!n.read) await markOneRead(n.id);
    // Update local state immediately so dot disappears
    setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));

    switch (n.type) {
      // Direct message → /messages?dm=<fromUserId>
      case 'message':
        router.push(`/messages?dm=${n.fromUserId}`);
        break;

      // Chat group invite → /messages?group=<groupId>
      case 'group_invite':
        if (n.groupId) router.push(`/messages?group=${n.groupId}`);
        else router.push('/messages');
        break;

      // Entertainment room invites → /entertainment?tab=...&room=...
      case 'music_invite':
        router.push(`/entertainment?tab=music&room=${n.roomId || n.groupId || ''}`);
        break;
      case 'game_invite':
        router.push(`/entertainment?tab=games&room=${n.roomId || n.groupId || ''}`);
        break;
      case 'watch_invite':
        router.push(`/entertainment?tab=watch&room=${n.roomId || n.groupId || ''}`);
        break;

      // Mention in a message → open that DM/group
      case 'mention':
        if (n.groupId) router.push(`/messages?group=${n.groupId}`);
        else if (n.fromUserId) router.push(`/messages?dm=${n.fromUserId}`);
        else router.push('/messages');
        break;

      // Like / comment / repost on a post → /post/<postId>
      case 'like':
      case 'comment':
      case 'repost':
        if (n.postId) router.push(`/post/${n.postId}`);
        else router.push('/feed');
        break;

      // Story like / reply → /stories (or specific user story)
      case 'story_like':
      case 'story_reply':
        if (n.storyUserId) router.push(`/stories?user=${n.storyUserId}`);
        else router.push('/stories');
        break;

      // Follow → that user's profile
      case 'follow':
        if (n.fromUserId) router.push(`/profile/${n.fromUserId}`);
        else router.push('/profile');
        break;

      default:
        router.push('/feed');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'like': return '❤️';
      case 'comment': return '💬';
      case 'follow': return '👤';
      case 'repost': return '🔄';
      case 'message': return '📩';
      case 'story_like': return '❤️';
      case 'story_reply': return '💬';
      case 'group_invite': return '👥';
      case 'music_invite': return '🎵';
      case 'game_invite': return '🎮';
      case 'watch_invite': return '🎬';
      case 'mention': return '💜';
      default: return '🔔';
    }
  };

  const getIconBg = (type: string) => {
    switch (type) {
      case 'like':
      case 'story_like': return 'rgba(244,114,182,0.15)';
      case 'comment':
      case 'story_reply': return 'rgba(96,165,250,0.15)';
      case 'follow': return 'rgba(139,92,246,0.15)';
      case 'repost': return 'rgba(52,211,153,0.15)';
      case 'message': return 'rgba(251,191,36,0.15)';
      case 'group_invite': return 'rgba(139,92,246,0.15)';
      case 'music_invite':
      case 'game_invite':
      case 'watch_invite': return 'rgba(139,92,246,0.15)';
      case 'mention': return 'rgba(167,139,250,0.15)';
      default: return 'rgba(139,92,246,0.15)';
    }
  };

  const getMessage = (n: any) => {
    switch (n.type) {
      case 'like': return 'liked your post';
      case 'comment': return `commented: "${n.commentText}"`;
      case 'follow': return 'started following you';
      case 'repost': return 'reposted your post';
      case 'message': return 'sent you a message';
      case 'story_like': return 'liked your story ✨';
      case 'story_reply': return `replied to your story: "${n.replyText}"`;
      case 'group_invite': return `added you to group "${n.groupName}" 👥`;
      case 'music_invite': return `invited you to music room "${n.groupName || n.roomName}" 🎵`;
      case 'game_invite': return `invited you to play "${n.groupName || n.roomName}" 🎮`;
      case 'watch_invite': return `invited you to watch "${n.groupName || n.roomName}" 🎬`;
      case 'mention': return `mentioned you in a message`;
      default: return 'interacted with you';
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

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
      <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 100 }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 12px', borderBottom: '0.5px solid rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
              Notifications
            </h1>
            {unreadCount > 0 && (
              <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              style={{ padding: '7px 16px', borderRadius: 20, background: 'rgba(139,92,246,0.1)', border: '0.5px solid rgba(139,92,246,0.3)', color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              Mark all read
            </button>
          )}
        </div>

        {/* Notifications list */}
        <div>
          {notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
              <p style={{ fontSize: 48, marginBottom: 12 }}>🔔</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>No notifications yet</p>
              <p style={{ fontSize: 13 }}>When someone interacts with you, it will show here.</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id}
                onClick={() => handleClick(n)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', background: !n.read ? 'rgba(139,92,246,0.05)' : 'transparent', transition: 'background 0.2s', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(139,92,246,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = !n.read ? 'rgba(139,92,246,0.05)' : 'transparent')}>

                {/* Icon */}
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: getIconBg(n.type), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  {getIcon(n.type)}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: '#d1d5db', margin: 0, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 700, color: '#f3f4f6' }}>#{n.fromUsername}</span>{' '}
                    {getMessage(n)}
                  </p>
                  <p style={{ fontSize: 11, color: '#4b5563', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {timeAgo(n.createdAt)}
                    <span style={{ fontSize: 10, color: '#6b7280', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '1px 6px' }}>
                      {n.type === 'message' || n.type === 'mention' || n.type === 'group_invite' ? '→ Open chat' :
                       n.type === 'music_invite' || n.type === 'game_invite' || n.type === 'watch_invite' ? '→ Join room' :
                       n.type === 'follow' ? '→ View profile' :
                       n.type === 'like' || n.type === 'comment' || n.type === 'repost' ? '→ View post' :
                       n.type === 'story_like' || n.type === 'story_reply' ? '→ View story' : '→ Open'}
                    </span>
                  </p>
                </div>

                {/* Unread dot */}
                {!n.read && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', flexShrink: 0 }} />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
