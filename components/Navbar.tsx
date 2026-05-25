'use client';

import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setMounted(true);
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
    } catch (err) { console.error('Unread count error:', err); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const navItems = [
    { href: '/feed', icon: '🏠', label: 'Home' },
    { href: '/search', icon: '🔍', label: 'Search' },
    { href: '/messages', icon: '💬', label: 'Messages' },
    { href: '/bookmarks', icon: '🔖', label: 'Bookmarks' },
    { href: '/notifications', icon: '🔔', label: 'Notifications', badge: unreadCount },
    { href: '/profile', icon: '👤', label: 'Profile' },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <nav className="hidden md:flex fixed left-0 top-0 h-full w-64 flex-col px-4 py-6 border-r border-[var(--border)] bg-[var(--background)] z-50">
        <Link href="/feed" className="text-2xl font-black mb-8 px-3 text-[var(--accent)]">
          ALTRONICS
        </Link>

        <div className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 px-3 py-3 rounded-full hover:bg-[var(--card-hover)] transition-colors group"
            >
              <span className="text-xl relative">
                {item.icon}
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[var(--accent)] text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </span>
              <span className="text-[var(--foreground)] font-medium text-lg group-hover:text-[var(--accent)] transition-colors">
                {item.label}
              </span>
            </Link>
          ))}

          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex items-center gap-4 px-3 py-3 rounded-full hover:bg-[var(--card-hover)] transition-colors group"
            >
              <span className="text-xl">{theme === 'dark' ? '☀️' : '🌙'}</span>
              <span className="text-[var(--foreground)] font-medium text-lg">
                {theme === 'dark' ? 'Light' : 'Dark'}
              </span>
            </button>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-4 px-3 py-3 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors group mt-4"
        >
          <span className="text-xl">🚪</span>
          <span className="text-red-500 font-medium text-lg">Log out</span>
        </button>
      </nav>

      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[var(--background)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between">
        <span className="text-lg font-black text-[var(--accent)]">ALTRONICS</span>
        <div className="flex items-center gap-2">
          {mounted && (
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-full hover:bg-[var(--card-hover)]">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--background)] border-t border-[var(--border)] flex items-center justify-around px-2 py-2">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="flex flex-col items-center gap-0.5 p-2 rounded-full hover:bg-[var(--card-hover)] relative">
            <span className="text-xl">
              {item.icon}
              {item.badge && item.badge > 0 && (
                <span className="absolute top-1 right-1 bg-[var(--accent)] text-white text-xs w-3.5 h-3.5 rounded-full flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
