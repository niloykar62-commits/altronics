'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function PwaProvider() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const dismissedKey = 'altronics-pwa-install-dismissed';
    if (localStorage.getItem(dismissedKey) === '1' || isStandalone()) return;

    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => {
          // SW registration failure should not affect app functionality.
        });
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowInstall(true);
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setShowInstall(false);
      localStorage.setItem(dismissedKey, '1');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    setDeferredPrompt(null);
    setShowInstall(false);

    if (outcome === 'dismissed') {
      localStorage.setItem('altronics-pwa-install-dismissed', '1');
    }
  };

  const handleDismiss = () => {
    setShowInstall(false);
    setDismissed(true);
    localStorage.setItem('altronics-pwa-install-dismissed', '1');
  };

  if (!showInstall || dismissed || !deferredPrompt) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Altronics app"
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'min(420px, calc(100vw - 32px))',
        background: '#111118',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        borderRadius: 16,
        padding: '16px 18px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 900,
          fontSize: 22,
          flexShrink: 0,
        }}
      >
        A
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, color: '#f3f4f6', fontWeight: 700, fontSize: 14 }}>
          Install Altronics
        </p>
        <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 12, lineHeight: 1.4 }}>
          Add to your home screen for quick access.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            fontSize: 12,
            cursor: 'pointer',
            padding: '8px 10px',
          }}
        >
          Not now
        </button>
        <button
          type="button"
          onClick={handleInstall}
          style={{
            background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
            border: 'none',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            padding: '8px 14px',
            borderRadius: 10,
          }}
        >
          Install
        </button>
      </div>
    </div>
  );
}
