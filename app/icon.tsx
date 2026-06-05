import { createPwaIcon } from '@/lib/pwa-icon';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return createPwaIcon(512);
}
