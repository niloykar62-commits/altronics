import { createPwaIcon } from '@/lib/pwa-icon';

const ALLOWED_SIZES = new Set([192, 512]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: sizeParam } = await params;
  const size = Number(sizeParam);

  if (!ALLOWED_SIZES.has(size)) {
    return new Response('Invalid icon size', { status: 404 });
  }

  return createPwaIcon(size);
}
