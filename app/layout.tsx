import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { PwaProvider } from '@/components/PwaProvider';

export const metadata: Metadata = {
  title: 'Altronics',
  description: 'Modern Social Media Platform',
  applicationName: 'Altronics',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Altronics',
  },
  formatDetection: {
    telephone: false,
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#8b5cf6',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          {children}
          <PwaProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
