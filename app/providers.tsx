'use client';

import { MotionConfig } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';

/** Klientské providery na jednom místě (MotionConfig, později AuthProvider, QueryClient…). */
export function Providers({ children }: { children: ReactNode }) {
  // Service worker jen v produkci – při vývoji by cache překážela.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  // reducedMotion="user": respektuje systémové „omezit pohyb“ pro všechny Framer Motion animace.
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
