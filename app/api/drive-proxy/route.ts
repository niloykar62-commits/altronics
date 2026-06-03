// app/api/drive-proxy/route.ts
// Proxies Google Drive video files server-side, bypassing:
//   - X-Frame-Options: SAMEORIGIN (blocks iframes)
//   - CORS restrictions on direct /uc?export=download URLs
//
// Usage: /api/drive-proxy?id=GOOGLE_DRIVE_FILE_ID

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('id');

  if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    return new NextResponse('Missing or invalid file ID', { status: 400 });
  }

  // Google Drive direct download URL
  const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;

  try {
    // Forward range headers so video seeking works
    const rangeHeader = request.headers.get('range');
    const fetchHeaders: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (compatible; Altronics/1.0)',
    };
    if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

    const driveRes = await fetch(driveUrl, {
      headers: fetchHeaders,
      redirect: 'follow', // follow Google's redirect chain
    });

    if (!driveRes.ok && driveRes.status !== 206) {
      // Google sometimes returns a virus-scan warning page for large files
      // Try the direct streaming URL as fallback
      const fallbackUrl = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
      return new NextResponse(
        JSON.stringify({
          error: 'Drive returned an error. Make sure the file is shared as "Anyone with the link".',
          status: driveRes.status,
          fallback: fallbackUrl,
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build response headers
    const responseHeaders = new Headers();

    // Pass through content headers
    const contentType = driveRes.headers.get('content-type') || 'video/mp4';
    const contentLength = driveRes.headers.get('content-length');
    const contentRange = driveRes.headers.get('content-range');
    const acceptRanges = driveRes.headers.get('accept-ranges');

    responseHeaders.set('Content-Type', contentType);
    if (contentLength) responseHeaders.set('Content-Length', contentLength);
    if (contentRange) responseHeaders.set('Content-Range', contentRange);
    if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);
    else responseHeaders.set('Accept-Ranges', 'bytes');

    // Allow embedding in our app
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    // Cache for 1 hour to avoid hammering Drive
    responseHeaders.set('Cache-Control', 'public, max-age=3600');

    const status = driveRes.status === 206 ? 206 : 200;
    return new NextResponse(driveRes.body, { status, headers: responseHeaders });

  } catch (err: any) {
    console.error('[drive-proxy] error:', err);
    return new NextResponse('Failed to fetch from Google Drive: ' + err.message, { status: 500 });
  }
}
