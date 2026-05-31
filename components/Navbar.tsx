'use client';

import { useRouter, usePathname } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const { push } = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [profile, setProfile] = useState<any>(null);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUid(firebaseUser.uid);
        await loadUnreadCount(firebaseUser.uid);
        await loadProfile(firebaseUser.uid);
        try {
          await updateDoc(doc(db, 'users', firebaseUser.uid), { lastSeen: serverTimestamp() });
        } catch (_) {}
      }
    });
    return () => unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      const snap = await getDoc(doc(db, 'users', userId));
      if (snap.exists()) setProfile(snap.data());
    } catch (err) { console.error(err); }
  };

  const loadUnreadCount = async (userId: string) => {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('toUserId', '==', userId),
        where('read', '==', false)
      );
      const snapshot = await getDocs(q);
      setUnreadCount(snapshot.size);
    } catch (err) { console.error(err); }
  };

  const handleLogout = async () => {
    if (uid) {
      try { await updateDoc(doc(db, 'users', uid), { lastSeen: serverTimestamp() }); } catch (_) {}
    }
    await signOut(auth);
    push('/login');
  };

  const initials = profile?.fullName?.[0]?.toUpperCase() || 'U';
  const isActiveVisible = profile?.activeStatus !== false;

  // ── Merged: /games and /music → /entertainment ────────────────────────────
  const navItems = [
    { href: '/feed',            icon: '🏠', label: 'Home'    },
    { href: '/search',          icon: '🔍', label: 'Search'  },
    { href: '/stories',         icon: '✨', label: 'Stories' },
    { href: '/messages',        icon: '💬', label: 'DMs'     },
    { href: '/entertainment',   icon: '🎉', label: 'Fun'     },
    { href: '/notifications',   icon: '🔔', label: 'Alerts', badge: unreadCount },
    { href: '/profile',         icon: null,  label: 'Profile', isAvatar: true },
  ];

  const isHidden = pathname === '/messages';

  return (
    <>
      {/* ── Top Header ───────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,10,15,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '0.5px solid rgba(139,92,246,0.15)',
      }}>
        <div style={{
          maxWidth: 600, margin: '0 auto', padding: '12px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: 22, fontWeight: 900, letterSpacing: -1,
            background: 'linear-gradient(135deg,#a78bfa,#60a5fa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            ALTRONICS
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Avatar in header */}
            <div style={{
              position: 'relative', width: 32, height: 32, borderRadius: '50%',
              overflow: 'hidden', border: '1.5px solid rgba(139,92,246,0.4)', flexShrink: 0,
            }}>
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt="Your avatar"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: 'white',
                }}>
                  {initials}
                </div>
              )}
              {isActiveVisible && (
                <span style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 9, height: 9, borderRadius: '50%',
                  background: '#22c55e', border: '1.5px solid #0a0a0f',
                }} />
              )}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: '6px 16px', borderRadius: 20,
                background: 'rgba(239,68,68,0.1)',
                border: '0.5px solid rgba(239,68,68,0.3)',
                color: '#f87171', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'Inter,sans-serif',
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* ── Bottom Navigation ─────────────────────────────────────────────── */}
      <nav
        aria-label="Main navigation"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background: 'rgba(10,10,15,0.95)',
          backdropFilter: 'blur(20px)',
          borderTop: '0.5px solid rgba(139,92,246,0.15)',
          padding: '8px 0 18px',
          display: isHidden ? 'none' : 'block',
        }}
      >
        <div style={{
          maxWidth: 600, margin: '0 auto',
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        }}>
          {navItems.map(({ href, icon, label, badge, isAvatar }: any) => {
            // /entertainment also matches /games and /music redirects
            const isActive =
              pathname === href ||
              (href === '/entertainment' && (pathname.startsWith('/entertainment') || pathname.startsWith('/games') || pathname.startsWith('/music'))) ||
              (href !== '/feed' && href !== '/entertainment' && pathname.startsWith(href));

            return (
              <Link key={href} href={href} style={{ textDecoration: 'none' }} aria-label={label} aria-current={isActive ? 'page' : undefined}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '6px 10px', borderRadius: 14,
                  background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent',
                  transition: 'background 0.2s',
                  position: 'relative', cursor: 'pointer',
                  minWidth: 44, // touch target
                }}>
                  {isAvatar ? (
                    <div style={{
                      position: 'relative', width: 24, height: 24, borderRadius: '50%',
                      overflow: 'hidden',
                      border: isActive ? '1.5px solid #a78bfa' : '1.5px solid rgba(139,92,246,0.3)',
                    }}>
                      {profile?.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profile.avatarUrl}
                          alt="Profile"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{
                          width: '100%', height: '100%',
                          background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: 'white',
                        }}>
                          {initials}
                        </div>
                      )}
                      {isActiveVisible && (
                        <span style={{
                          position: 'absolute', bottom: 0, right: 0,
                          width: 7, height: 7, borderRadius: '50%',
                          background: '#22c55e', border: '1px solid #0a0a0f',
                        }} />
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 20 }} aria-hidden="true">{icon}</span>
                  )}

                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: isActive ? '#a78bfa' : '#6b7280',
                  }}>
                    {label}
                  </span>

                  {/* Notification badge */}
                  {badge && badge > 0 && (
                    <span
                      aria-label={`${badge} unread notifications`}
                      style={{
                        position: 'absolute', top: 2, right: 4,
                        background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
                        color: 'white', fontSize: 9, fontWeight: 700,
                        width: 15, height: 15, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}

                  {/* Active dot */}
                  {isActive && (
                    <div style={{
                      width: 4, height: 4, borderRadius: '50%', background: '#a78bfa',
                    }} />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
