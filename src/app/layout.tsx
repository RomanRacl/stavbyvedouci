import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

/** Archivo: grotesk s osou šířky – široký pro text, zúžený (font-display) pro čísla a kódy. */
const archivo = Archivo({
  subsets: ['latin', 'latin-ext'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Stavbyvedoucí',
  description: 'Zakázky, parta v terénu a ziskovost firmy v reálném čase.',
};

export const viewport: Viewport = { themeColor: '#16202a', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs" className={archivo.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
