import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://apis.google.com https://cdn.jsdelivr.net",
              "frame-src 'self' https://www.youtube.com https://player.vimeo.com https://www.dailymotion.com https://player.twitch.tv",
              "img-src 'self' data: blob: https: http:",
              "media-src 'self' blob: https: https://drive.google.com https://*.googleusercontent.com",
              // Added /api/drive-proxy so the <video> src is allowed
              "connect-src 'self' https://*.googleapis.com https://*.firebase.io wss://*.firebaseio.com https://api.cloudinary.com https://noembed.com https://vimeo.com https://api.dailymotion.com https://static-cdn.jtvnw.net https://drive.google.com",
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

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'static-cdn.jtvnw.net' },
      { protocol: 'https', hostname: 'drive.google.com' },
    ],
  },

  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
