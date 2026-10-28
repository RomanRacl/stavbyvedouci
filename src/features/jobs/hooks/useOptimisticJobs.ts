'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Job } from '@/types/firestore';

type Patch = Partial<Job> & { _pendingSince: number };

/**
 * Optimistické UI nad realtime streamem.
 * 1) patch se okamžitě promítne do UI,
 * 2) zavolá se mutace (Firestore),
 * 3) při chybě se patch vrátí a zavolá onError; při úspěchu ho přepíše příchozí snapshot.
 */
export function useOptimisticJobs(source: Job[], onError: (message: string) => void) {
  const [patches, setPatches] = useState<Record<string, Patch>>({});

  const jobs = useMemo(
    () =>
      source.map((j) => {
        const p = patches[j.id];
        if (!p) return j;
        const { _pendingSince: _ignored, ...rest } = p;
        return { ...j, ...rest };
      }),
    [source, patches],
  );

  const mutate = useCallback(
    async (jobId: string, patch: Partial<Job>, commit: () => Promise<void>, errorMessage: string) => {
      setPatches((p) => ({ ...p, [jobId]: { ...p[jobId], ...patch, _pendingSince: Date.now() } }));
      const drop = () => setPatches(({ [jobId]: _dropped, ...rest }) => rest);
      try {
        await commit();
        // Server potvrdil – stav už nese realtime snapshot, patch není potřeba.
        drop();
      } catch {
        drop();
        onError(errorMessage);
      }
    },
    [onError],
  );

  const isPending = useCallback((jobId: string) => Boolean(patches[jobId]), [patches]);

  return { jobs, mutate, isPending };
}
