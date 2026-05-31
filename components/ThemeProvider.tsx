'use client';

import { useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// ─── All 8 themes (must match profile page exactly) ──────────────────────────
const THEMES = {
  cosmic:   { '--bg-primary':'#0a0a0f','--bg-secondary':'#0d0d14','--bg-card':'#111118','--bg-hover':'rgba(139,92,246,0.05)','--border':'rgba(139,92,246,0.15)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#f3f4f6','--text-secondary':'#9ca3af','--text-muted':'#6b7280','--accent-purple':'#8b5cf6','--accent-blue':'#3b82f6','--accent-purple-light':'#a78bfa','--accent-blue-light':'#60a5fa','--gradient':'linear-gradient(135deg,#8b5cf6,#3b82f6)' },
  midnight: { '--bg-primary':'#000000','--bg-secondary':'#0a0a0a','--bg-card':'#111111','--bg-hover':'rgba(255,255,255,0.03)','--border':'rgba(255,255,255,0.1)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#ffffff','--text-secondary':'#a1a1aa','--text-muted':'#71717a','--accent-purple':'#ffffff','--accent-blue':'#e4e4e7','--accent-purple-light':'#f4f4f5','--accent-blue-light':'#d4d4d8','--gradient':'linear-gradient(135deg,#ffffff,#a1a1aa)' },
  aurora:   { '--bg-primary':'#030d0a','--bg-secondary':'#051410','--bg-card':'#071a14','--bg-hover':'rgba(16,185,129,0.05)','--border':'rgba(16,185,129,0.2)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#ecfdf5','--text-secondary':'#6ee7b7','--text-muted':'#34d399','--accent-purple':'#10b981','--accent-blue':'#06b6d4','--accent-purple-light':'#34d399','--accent-blue-light':'#67e8f9','--gradient':'linear-gradient(135deg,#10b981,#06b6d4)' },
  ember:    { '--bg-primary':'#0f0500','--bg-secondary':'#160800','--bg-card':'#1c0a00','--bg-hover':'rgba(234,88,12,0.05)','--border':'rgba(234,88,12,0.2)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#fff7ed','--text-secondary':'#fdba74','--text-muted':'#fb923c','--accent-purple':'#f97316','--accent-blue':'#ef4444','--accent-purple-light':'#fb923c','--accent-blue-light':'#fca5a5','--gradient':'linear-gradient(135deg,#f97316,#ef4444)' },
  ocean:    { '--bg-primary':'#00080f','--bg-secondary':'#000d18','--bg-card':'#001122','--bg-hover':'rgba(14,165,233,0.05)','--border':'rgba(14,165,233,0.2)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#f0f9ff','--text-secondary':'#7dd3fc','--text-muted':'#38bdf8','--accent-purple':'#0ea5e9','--accent-blue':'#6366f1','--accent-purple-light':'#38bdf8','--accent-blue-light':'#818cf8','--gradient':'linear-gradient(135deg,#0ea5e9,#6366f1)' },
  rosegold: { '--bg-primary':'#0f0608','--bg-secondary':'#160a0d','--bg-card':'#1c0e12','--bg-hover':'rgba(244,63,94,0.05)','--border':'rgba(244,63,94,0.2)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#fff1f2','--text-secondary':'#fda4af','--text-muted':'#fb7185','--accent-purple':'#f43f5e','--accent-blue':'#d4a017','--accent-purple-light':'#fb7185','--accent-blue-light':'#fbbf24','--gradient':'linear-gradient(135deg,#f43f5e,#d4a017)' },
  neon:     { '--bg-primary':'#05000f','--bg-secondary':'#0a0018','--bg-card':'#0f0022','--bg-hover':'rgba(217,70,239,0.05)','--border':'rgba(217,70,239,0.2)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#fdf4ff','--text-secondary':'#e879f9','--text-muted':'#c026d3','--accent-purple':'#d946ef','--accent-blue':'#22d3ee','--accent-purple-light':'#e879f9','--accent-blue-light':'#67e8f9','--gradient':'linear-gradient(135deg,#d946ef,#22d3ee)' },
  forest:   { '--bg-primary':'#010a02','--bg-secondary':'#020f03','--bg-card':'#031505','--bg-hover':'rgba(34,197,94,0.05)','--border':'rgba(34,197,94,0.18)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#f0fdf4','--text-secondary':'#86efac','--text-muted':'#4ade80','--accent-purple':'#22c55e','--accent-blue':'#84cc16','--accent-purple-light':'#4ade80','--accent-blue-light':'#a3e635','--gradient':'linear-gradient(135deg,#22c55e,#84cc16)' },
} as const;

type ThemeId = keyof typeof THEMES;

// Exported so profile page + any other component can call it directly
export function applyTheme(id: string) {
  const vars = THEMES[id as ThemeId];
  if (!vars) return;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  // Also update body background immediately to avoid flash
  document.body.style.background = vars['--bg-primary'];
  document.body.style.color = vars['--text-primary'];
  localStorage.setItem('altronics-theme', id);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // ── Step 1: Apply from localStorage instantly (no flash) ──────────────
    const saved = localStorage.getItem('altronics-theme') as ThemeId | null;
    if (saved && THEMES[saved]) {
      applyTheme(saved);
    } else {
      applyTheme('cosmic'); // default
    }

    // ── Step 2: Once auth loads, sync from Firestore (keeps devices in sync) ─
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) return;
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          const theme = snap.data()?.theme as ThemeId | undefined;
          if (theme && THEMES[theme]) {
            applyTheme(theme);
          }
        }
      } catch (_) {
        // Firestore unavailable — localStorage version already applied, no action needed
      }
    });

    return () => unsub();
  }, []);

  // Renders children with no wrapper — zero DOM overhead
  return <>{children}</>;
}
