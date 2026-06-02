import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ── Security Headers ────────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // XSS protection
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Control referrer info
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Disable unused browser features
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // Force HTTPS
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://apis.google.com https://meet.jit.si https://cdn.jsdelivr.net",
              "frame-src 'self' https://www.youtube.com https://player.vimeo.com https://www.dailymotion.com https://player.twitch.tv https://meet.jit.si",
              "img-src 'self' data: blob: https: http:",
              "media-src 'self' blob: https:",
              "connect-src 'self' https://*.googleapis.com https://*.firebase.io wss://*.firebaseio.com https://api.cloudinary.com https://noembed.com https://vimeo.com https://api.dailymotion.com https://static-cdn.jtvnw.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },

  // ── Images — allow Cloudinary + Firebase Storage ─────────────────────────
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'static-cdn.jtvnw.net' },
    ],
  },

  // ── Disable X-Powered-By header (hides Next.js version) ─────────────────
  poweredByHeader: false,

  // ── Strict mode for catching issues ──────────────────────────────────────
  reactStrictMode: true,
};

export default nextConfig;
