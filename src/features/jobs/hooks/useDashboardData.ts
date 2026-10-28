'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Job, Member, PeriodStat } from '@/types/firestore';
import { mockJobs, mockMembers, mockWeeklyStats } from '@/lib/mock/dashboard.mock';

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
}

/**
 * Jediný vstupní bod dat pro dashboard. UI neví, zda data tečou z Firestore, nebo z mocku.
 * Mock režim simuluje realtime: každé 4 s přibydou na běžící zakázce hodiny a materiál.
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
      const boot = setTimeout(
        () =>
          setState({
            jobs: structuredClone(mockJobs),
            members: mockMembers,
            weeklyStats: mockWeeklyStats,
            status: 'live',
            lastEventAt: new Date(),
          }),
        450, // krátké načtení, aby byly vidět skeletony
      );
      const tick = setInterval(() => {
        setState((s) => ({
          ...s,
          lastEventAt: new Date(),
          jobs: s.jobs.map((j) => {
            if (j.status !== 'in_progress') return j;
            const hours = 0.25 * j.assignedWorkerIds.length;
            const line = j.materialPlan[0];
            const qty = Math.random() < 0.5 ? 2 : 0;
            return {
              ...j,
              actuals: {
                laborHours: +(j.actuals.laborHours + hours).toFixed(2),
                laborCost: j.actuals.laborCost + Math.round(hours * 370),
                materialCost: j.actuals.materialCost + qty * line.unitCost,
                updatedAt: new Date(),
              },
              materialPlan: j.materialPlan.map((m, i) => (i === 0 ? { ...m, usedQty: m.usedQty + qty } : m)),
              updatedAt: new Date(),
            };
          }),
          weeklyStats: s.weeklyStats.map((w, i, arr) =>
            i === arr.length - 1 ? { ...w, revenue: w.revenue + 1200, laborCost: w.laborCost + 370, hours: w.hours + 1 } : w,
          ),
        }));
      }, 4000);
      return () => {
        clearTimeout(boot);
        clearInterval(tick);
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

  const mockWrite = useCallback((jobId: string, patch: Partial<Job>) => {
    setState((s) => ({
      ...s,
      lastEventAt: new Date(),
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, ...patch, updatedAt: new Date() } : j)),
    }));
  }, []);

  return { ...state, mockWrite };
}
