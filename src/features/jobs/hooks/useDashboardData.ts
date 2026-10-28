'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Job, Member, PeriodStat } from '@/types/firestore';
import { mockWeeklyStats } from '@/lib/mock/dashboard.mock';
import { createJob, getSnapshot, patchJob } from '@/lib/mock/localBackend';
import { subscribeStore } from '@/lib/mock/localStore';

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== '0';

export interface DashboardData {
  jobs: Job[];
  members: Member[];
  weeklyStats: PeriodStat[];
  status: 'loading' | 'live' | 'offline' | 'error';
  lastEventAt: Date | null;
}

export interface DashboardDataApi extends DashboardData {
  /** Jen pro mock režim: simuluje zápis „na server“, který se vrátí jako snapshot. */
  mockWrite: (jobId: string, patch: Partial<Job>) => void;
  /** Jen pro mock režim: založení zakázky, uloží se do prohlížeče. */
  mockCreate: (job: Job) => void;
}

/**
 * Jediný vstupní bod dat pro dashboard. UI neví, zda data tečou z Firestore, nebo z mocku.
 * Mock režim čte data z prohlížeče a reaguje na zápisy z pohledu dělníka v reálném čase.
 */
export function useDashboardData(companyId: string): DashboardDataApi {
  const [state, setState] = useState<DashboardData>({
    jobs: [],
    members: [],
    weeklyStats: [],
    status: 'loading',
    lastEventAt: null,
  });

  useEffect(() => {
    if (USE_MOCK) {
      // Data z prohlížeče; změny z pohledu dělníka (i v jiné záložce) přijdou přes subscribeStore.
      const pull = () => {
        const snap = getSnapshot();
        setState((s) => ({
          ...s,
          jobs: snap.jobs,
          members: snap.members,
          weeklyStats: mockWeeklyStats,
          status: 'live',
          lastEventAt: new Date(),
        }));
      };
      const boot = setTimeout(pull, 450); // krátké načtení, aby byly vidět skeletony
      const unsub = subscribeStore(pull);
      return () => {
        clearTimeout(boot);
        unsub();
      };
    }

    // Firestore režim – dynamický import, aby se Firebase SDK nenačítal v mock buildu.
    let unsubs: Array<() => void> = [];
    let cancelled = false;
    (async () => {
      const svc = await import('@/services/firebase/jobs.service');
      const membersSvc = await import('@/services/firebase/members.service');
      if (cancelled) return;
      unsubs = [
        svc.subscribeJobs(
          companyId,
          ['scheduled', 'in_progress', 'awaiting_approval', 'approved'],
          (jobs, meta) =>
            setState((s) => ({ ...s, jobs, status: meta.fromCache ? 'offline' : 'live', lastEventAt: new Date() })),
          () => setState((s) => ({ ...s, status: 'error' })),
        ),
        svc.subscribeWeeklyStats(companyId, 12, (weeklyStats) => setState((s) => ({ ...s, weeklyStats }))),
        membersSvc.subscribeMembers(companyId, (members) => setState((s) => ({ ...s, members }))),
      ];
    })();
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [companyId]);

  // Zápis vyvolá událost úložiště -> pull() výše načte nový stav.
  const mockWrite = useCallback((jobId: string, patch: Partial<Job>) => patchJob(jobId, patch), []);
  const mockCreate = useCallback((job: Job) => createJob(job), []);

  return { ...state, mockWrite, mockCreate };
}
