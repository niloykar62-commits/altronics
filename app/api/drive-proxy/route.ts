// app/api/drive-proxy/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs'; // must be nodejs, not edge — needs full fetch + streaming

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('id');

  if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    return new NextResponse('Invalid file ID', { status: 400 });
  }

  const rangeHeader = request.headers.get('range') || undefined;

  // Try each URL strategy in order until one returns actual video bytes
  const strategies = [
    // Strategy 1 — standard download with confirm bypass cookie
    async () => {
      const res = await fetch(
        `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t&uuid=${Date.now()}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Cookie': `download_warning_${fileId}=t; NID=1`,
            ...(rangeHeader ? { Range: rangeHeader } : {}),
          },
          redirect: 'follow',
        }
      );
      return res;
    },

    // Strategy 2 — thumbnail/stream endpoint used by Drive's own player
    async () => {
      const res = await fetch(
        `https://drive.google.com/u/0/uc?id=${fileId}&export=download&confirm=yes`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...(rangeHeader ? { Range: rangeHeader } : {}),
          },
          redirect: 'follow',
        }
      );
      return res;
    },

    // Strategy 3 — googleapis content endpoint (works for files <25MB without auth)
    async () => {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
        {
          headers: {
            ...(rangeHeader ? { Range: rangeHeader } : {}),
          },
          redirect: 'follow',
        }
      );
      return res;
    },
  ];

  let lastError = '';

  for (const strategy of strategies) {
    try {
      const res = await strategy();
      const ct = res.headers.get('content-type') || '';

      // If Google returned an HTML page (virus warning / login page) — try next strategy
      if (ct.includes('text/html')) {
        lastError = `Strategy returned HTML (status ${res.status}) — likely a virus-scan warning or auth wall`;
        continue;
      }

      if (!res.ok && res.status !== 206) {
        lastError = `HTTP ${res.status}`;
        continue;
      }

      // ✅ Got real video bytes — stream them back
      const headers = new Headers();
      headers.set('Content-Type', ct.includes('video') ? ct : 'video/mp4');
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'private, max-age=3600');

      const contentLength = res.headers.get('content-length');
      const contentRange  = res.headers.get('content-range');
      if (contentLength) headers.set('Content-Length', contentLength);
      if (contentRange)  headers.set('Content-Range', contentRange);

      return new NextResponse(res.body, {
        status: res.status === 206 ? 206 : 200,
        headers,
      });

    } catch (e: any) {
      lastError = e.message;
    }
  }

  // All strategies failed
  return new NextResponse(
    JSON.stringify({
      error: 'Could not stream this Google Drive file.',
      reason: lastError,
      tips: [
        'Make sure the file is shared as "Anyone with the link" in Google Drive',
        'The file must be a video format (MP4, WebM, MOV)',
        'Very large files (>750MB) may not work due to Google\'s virus scan gate',
      ],
    }),
    { status: 502, headers: { 'Content-Type': 'application/json' } }
  );
}
