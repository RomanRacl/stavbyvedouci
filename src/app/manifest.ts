import { APP_NAME } from '@/lib/brand';
import type { MetadataRoute } from 'next';

/**
 * Instalace do telefonu (PWA). Start na /w, protože z plochy aplikaci spouští dělníci;
 * majitel pracuje v prohlížeči na počítači.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: 'Zakázky, měření času, materiál a fotky z terénu.',
    lang: 'cs',
    start_url: '/w',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#eef0f2',
    theme_color: '#16202a',
    shortcuts: [
      { name: 'Moje zakázky', short_name: 'Zakázky', url: '/w', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Kancelář', short_name: 'Kancelář', url: '/dashboard', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
