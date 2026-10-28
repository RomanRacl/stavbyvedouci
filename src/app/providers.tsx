'use client';

import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';

/** Klientské providery na jednom místě (MotionConfig, později AuthProvider, QueryClient…). */
export function Providers({ children }: { children: ReactNode }) {
  // reducedMotion="user": respektuje systémové „omezit pohyb“ pro všechny Framer Motion animace.
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
