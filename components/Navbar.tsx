'use client';

import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Navbar() {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/feed" className="text-xl font-bold tracking-tight">
          ALTRONICS
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/feed">
            <Button variant="ghost" size="sm">🏠 Feed</Button>
          </Link>
          <Link href="/profile">
            <Button variant="ghost" size="sm">👤 Profile</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </div>
    </nav>
  );
}
