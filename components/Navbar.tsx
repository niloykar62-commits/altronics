'use client';

import { useRouter, usePathname } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) await loadUnreadCount(firebaseUser.uid);
    });
    return () => unsubscribe();
  }, []);

  const loadUnreadCount = async (uid: string) => {
    try {
      const q = query(collection(db, 'notifications'), where('toUserId', '==', uid), where('read', '==', false));
      const snapshot = await getDocs(q);
      setUnreadCount(snapshot.size);
    } catch (err) { console.error(err); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const navItems = [
    { href: '/feed', icon: '🏠', label: 'Home' },
    { href: '/stories', icon: '✨', label: 'Stories' },
    { href: '/search', icon: '🔍', label: 'Search' },
    { href: '/messages', icon: '💬', label: 'DMs' },
    { href: '/notifications', icon: '🔔', label: 'Alerts', badge: unreadCount },
    { href: '/profile', icon: '👤', label: 'Profile' },
  ];

  return (
    <>
      {/* Top Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,10,15,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '0.5px solid rgba(139,92,246,0.15)',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ALTRONICS
          </span>
          <button
            onClick={handleLogout}
            style={{ padding: '6px 16px', borderRadius: 20, background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}
          >
            Log out
          </button>
        </div>
      </header>

      {/* Bottom Navigation */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: 'rgba(10,10,15,0.95)',
        backdropFilter: 'blur(20px)',
        borderTop: '0.5px solid rgba(139,92,246,0.15)',
        padding: '8px 0 16px',
        display: pathname === '/messages' ? 'none' : 'block',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          {navItems.map(({ href, icon, label, badge }) => {
            const isActive = pathname === href;
            return (
              <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 12px', borderRadius: 14, background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent', transition: 'all 0.2s', position: 'relative', cursor: 'pointer' }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: isActive ? '#a78bfa' : '#6b7280' }}>{label}</span>
                  {badge && badge > 0 && (
                    <span style={{ position: 'absolute', top: 2, right: 8, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', color: 'white', fontSize: 9, fontWeight: 700, width: 15, height: 15, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                  {isActive && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#a78bfa' }} />}
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
