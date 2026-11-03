import type { MetadataRoute } from 'next';

/**
 * Instalace do telefonu (PWA). Start na /w, protože z plochy aplikaci spouští dělníci;
 * majitel pracuje v prohlížeči na počítači.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stavbyvedoucí',
    short_name: 'Stavbyvedoucí',
    description: 'Zakázky, měření času, materiál a fotky z terénu.',
    lang: 'cs',
    start_url: '/w',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#eef0f2',
    theme_color: '#16202a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
