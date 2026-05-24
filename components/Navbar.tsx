'use client';

import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function Navbar() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setMounted(true);
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await loadUnreadCount(firebaseUser.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadUnreadCount = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('toUserId', '==', uid),
        where('read', '==', false)
      );
      const snapshot = await getDocs(q);
      setUnreadCount(snapshot.size);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/feed" className="text-xl font-bold tracking-tight dark:text-white">
          ALTRONICS
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/feed">
            <Button variant="ghost" size="sm">🏠</Button>
          </Link>
          <Link href="/search">
            <Button variant="ghost" size="sm">🔍</Button>
          </Link>
          <Link href="/notifications">
            <Button variant="ghost" size="sm" className="relative">
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Button>
          </Link>
          <Link href="/profile">
            <Button variant="ghost" size="sm">👤</Button>
          </Link>
          {mounted && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </div>
    </nav>
  );
}
