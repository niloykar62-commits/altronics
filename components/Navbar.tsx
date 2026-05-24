'use client';

import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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
        <div className="flex items-center gap-2">
          <Link href="/feed">
            <Button variant="ghost" size="sm">🏠 Feed</Button>
          </Link>
          <Link href="/profile">
            <Button variant="ghost" size="sm">👤 Profile</Button>
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
