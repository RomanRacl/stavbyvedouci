'use client';

import { useEffect, useState } from 'react';
import { getSnapshot, type Snapshot } from './localBackend';
import { subscribeStore } from './localStore';

/** Živý snímek dat z prohlížeče – obnoví se po každé změně v této i jiné záložce. */
export function useSnapshot(): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    const pull = () => setSnap(getSnapshot());
    pull();
    return subscribeStore(pull);
  }, []);
  return snap;
}
