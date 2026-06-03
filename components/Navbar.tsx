'use client';

import { useRouter, usePathname } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import OmegaChat from '@/components/OmegaChat';

export default function Navbar() {
  const { push } = useRouter();
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [profile, setProfile] = useState<any>(null);
  const [uid, setUid] = useState<string | null>(null);

  // ── Omega state ───────────────────────────────────────────────────────────
  const [omegaOpen, setOmegaOpen]   = useState(false);
  const [omegaMode, setOmegaMode]   = useState<'chat' | 'post' | 'reply' | 'caption' | 'game'>('chat');
  const [omegaPulse, setOmegaPulse] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  // Stop the pulse animation after 5 seconds on first load
  useEffect(() => {
    const t = setTimeout(() => setOmegaPulse(false), 5000);
    return () => clearTimeout(t);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!omegaOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOmegaOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [omegaOpen]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUid(firebaseUser.uid);
        await loadUnreadCount(firebaseUser.uid);
        await loadProfile(firebaseUser.uid);
        try { await updateDoc(doc(db, 'users', firebaseUser.uid), { lastSeen: serverTimestamp() }); } catch (_) {}
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
      const q = query(collection(db, 'notifications'), where('toUserId', '==', userId), where('read', '==', false));
      const snapshot = await getDocs(q);
      setUnreadCount(snapshot.size);
    } catch (err) { console.error(err); }
  };

  const handleLogout = async () => {
    if (uid) { try { await updateDoc(doc(db, 'users', uid), { lastSeen: serverTimestamp() }); } catch (_) {} }
    await signOut(auth);
    push('/login');
  };

  const initials = profile?.fullName?.[0]?.toUpperCase() || 'U';
  const isActiveVisible = profile?.activeStatus !== false;

  const navItems = [
    { href: '/feed',          icon: '🏠', label: 'Home'    },
    { href: '/search',        icon: '🔍', label: 'Search'  },
    { href: '/circles',       icon: '⭕', label: 'Circles' },
    { href: '/messages',      icon: '💬', label: 'DMs'     },
    { href: '/entertainment', icon: '🎉', label: 'Fun'     },
    { href: '/notifications', icon: '🔔', label: 'Alerts', badge: unreadCount },
    { href: '/profile',       icon: null, label: 'Profile', isAvatar: true },
  ];

  const isHidden = pathname === '/messages';

  // Mode tabs for the Omega panel header
  const modeTabs = [
    { id: 'chat',    icon: '🤖', label: 'Chat'    },
    { id: 'post',    icon: '✍️', label: 'Post'    },
    { id: 'reply',   icon: '💬', label: 'Reply'   },
    { id: 'caption', icon: '🎨', label: 'Caption' },
    { id: 'game',    icon: '🎮', label: 'Game'    },
  ] as const;

  return (
    <>
      <style>{`
        @keyframes omegaGlow { 0%,100%{box-shadow:0 0 16px rgba(139,92,246,0.5)} 50%{box-shadow:0 0 32px rgba(139,92,246,0.9),0 0 60px rgba(59,130,246,0.4)} }
        @keyframes omegaSlideUp { from{opacity:0;transform:translateY(20px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes omegaBadgePop { 0%{transform:scale(0)} 70%{transform:scale(1.2)} 100%{transform:scale(1)} }
        .omega-fab { transition: transform 0.2s, box-shadow 0.2s !important; }
        .omega-fab:hover { transform: scale(1.08) !important; }
        .omega-mode-tab:hover { background: rgba(139,92,246,0.15) !important; }
      `}</style>

      {/* ── Top Header ──────────────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(20px)', borderBottom: '0.5px solid rgba(139,92,246,0.15)' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, background: 'linear-gradient(135deg,#a78bfa,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ALTRONICS
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Omega quick-access in header */}
            <button type="button" onClick={() => { setOmegaMode('chat'); setOmegaOpen(v => !v); }}
              title="Ask Omega"
              style={{ width: 32, height: 32, borderRadius: '50%', background: omegaOpen ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', color: 'white', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, transition: 'all 0.2s', flexShrink: 0 }}>
              Ω
            </button>
            {/* Avatar */}
            <div style={{ position: 'relative', width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: '1.5px solid rgba(139,92,246,0.4)', flexShrink: 0 }}>
              {profile?.photoURL
                ? <img src={profile.photoURL} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>{initials}</div>
              }
              {isActiveVisible && <span style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: '#22c55e', border: '1.5px solid #0a0a0f' }} />}
            </div>
            <button type="button" onClick={handleLogout} style={{ padding: '6px 16px', borderRadius: 20, background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* ── Floating Omega Button (FAB) ──────────────────────────────────── */}
      {!omegaOpen && (
        <button type="button" className="omega-fab"
          onClick={() => { setOmegaMode('chat'); setOmegaOpen(true); setOmegaPulse(false); }}
          aria-label="Open Omega AI"
          style={{
            position: 'fixed', bottom: isHidden ? 24 : 96, right: 16, zIndex: 60,
            width: 52, height: 52, borderRadius: '50%',
            background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, color: 'white', fontWeight: 900,
            animation: omegaPulse ? 'omegaGlow 2s ease-in-out infinite' : 'none',
            boxShadow: '0 4px 20px rgba(139,92,246,0.5)',
          }}>
          Ω
          {/* "New" badge on first appearance */}
          {omegaPulse && (
            <span style={{ position: 'absolute', top: -2, right: -2, background: '#22c55e', color: 'white', fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 10, animation: 'omegaBadgePop 0.4s ease', border: '1.5px solid #0a0a0f' }}>NEW</span>
          )}
        </button>
      )}

      {/* ── Omega Panel ──────────────────────────────────────────────────── */}
      {omegaOpen && (
        <div ref={panelRef}
          style={{
            position: 'fixed',
            bottom: isHidden ? 16 : 88,
            right: 12,
            zIndex: 200,
            width: 'min(380px, calc(100vw - 24px))',
            height: 'min(560px, calc(100vh - 120px))',
            background: 'rgba(10,10,15,0.97)',
            backdropFilter: 'blur(24px)',
            border: '0.5px solid rgba(139,92,246,0.3)',
            borderRadius: 24,
            boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(139,92,246,0.2)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'omegaSlideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}>

          {/* Panel header */}
          <div style={{ padding: '14px 16px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'white', fontWeight: 900, boxShadow: '0 0 12px rgba(139,92,246,0.5)' }}>Ω</div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#f3f4f6', margin: 0 }}>Omega</p>
                  <p style={{ fontSize: 10, color: '#a78bfa', margin: 0, fontWeight: 600 }}>by Altronics · AI Assistant</p>
                </div>
              </div>
              <button type="button" onClick={() => setOmegaOpen(false)}
                style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', color: '#6b7280', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}>
              {modeTabs.map(tab => (
                <button key={tab.id} type="button" onClick={() => setOmegaMode(tab.id)} className="omega-mode-tab"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 20, background: omegaMode === tab.id ? 'linear-gradient(135deg,#8b5cf6,#3b82f6)' : 'rgba(255,255,255,0.04)', border: omegaMode === tab.id ? 'none' : '0.5px solid rgba(255,255,255,0.08)', color: omegaMode === tab.id ? 'white' : '#6b7280', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter,sans-serif', transition: 'background 0.15s', flexShrink: 0 }}>
                  <span>{tab.icon}</span><span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chat area — remounts when mode changes to reset messages */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <OmegaChat
              key={omegaMode}
              userProfile={profile}
              mode={omegaMode}
            />
          </div>
        </div>
      )}

      {/* ── Bottom Navigation ────────────────────────────────────────────── */}
      <nav aria-label="Main navigation" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(20px)', borderTop: '0.5px solid rgba(139,92,246,0.15)', padding: '8px 0 18px', display: isHidden ? 'none' : 'block' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          {navItems.map(({ href, icon, label, badge, isAvatar }: any) => {
            const isActive =
              pathname === href ||
              (href === '/entertainment' && (pathname.startsWith('/entertainment') || pathname.startsWith('/games') || pathname.startsWith('/music'))) ||
              (href === '/circles' && pathname.startsWith('/circles')) ||
              (href !== '/feed' && href !== '/entertainment' && pathname.startsWith(href));

            return (
              <Link key={href} href={href} style={{ textDecoration: 'none' }} aria-label={label} aria-current={isActive ? 'page' : undefined}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 10px', borderRadius: 14, background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent', transition: 'background 0.2s', position: 'relative', cursor: 'pointer', minWidth: 44 }}>
                  {isAvatar ? (
                    <div style={{ position: 'relative', width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', border: isActive ? '1.5px solid #a78bfa' : '1.5px solid rgba(139,92,246,0.3)' }}>
                      {profile?.photoURL
                        ? <img src={profile.photoURL} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white' }}>{initials}</div>
                      }
                      {isActiveVisible && <span style={{ position: 'absolute', bottom: 0, right: 0, width: 7, height: 7, borderRadius: '50%', background: '#22c55e', border: '1px solid #0a0a0f' }} />}
                    </div>
                  ) : (
                    <span style={{ fontSize: 20 }} aria-hidden="true">{icon}</span>
                  )}
                  <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? '#a78bfa' : '#6b7280' }}>{label}</span>
                  {badge && badge > 0 && (
                    <span aria-label={`${badge} unread notifications`} style={{ position: 'absolute', top: 2, right: 4, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', color: 'white', fontSize: 9, fontWeight: 700, width: 15, height: 15, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
