'use client';

import { Smartphone, Building2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';
import { Drawer } from '@/components/ui/Drawer';
import { fmt, forecastMaterial } from '@/features/analytics/lib/metrics';
import { USE_MOCK } from '@/features/jobs/hooks/useDashboardData';
import { getSnapshot } from '@/lib/mock/localBackend';
import { subscribeStore } from '@/lib/mock/localStore';
import type { Job, Member, MaterialUsage } from '@/types/firestore';
import { RiskBadge } from './JobDetail';

/** Log výdejů se načítá líně – až když je Drawer otevřený (šetří čtení Firestore). */
function useMaterialUsage(companyId: string, jobId: string | null) {
  const [rows, setRows] = useState<MaterialUsage[] | null>(null);
  useEffect(() => {
    if (!jobId) return;
    setRows(null);
    if (USE_MOCK) {
      const pull = () => setRows(getSnapshot().usage.filter((u) => u.jobId === jobId));
      const t = setTimeout(pull, 250);
      const unsub = subscribeStore(pull);
      return () => {
        clearTimeout(t);
        unsub();
      };
    }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    import('@/services/firebase/jobs.service').then((svc) => {
      if (!cancelled) unsub = svc.subscribeMaterialUsage(companyId, jobId, setRows);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [companyId, jobId]);
  return rows;
}

interface Props {
  companyId: string;
  job: Job | null;
  members: Member[];
  open: boolean;
  onClose: () => void;
}

export function MaterialDrawer({ companyId, job, members, open, onClose }: Props) {
  const usage = useMaterialUsage(companyId, open && job ? job.id : null);
  const nameOf = useMemo(() => new Map(members.map((m) => [m.uid, m.displayName])), [members]);

  if (!job) return null;
  const lines = job.materialPlan.map((l) => forecastMaterial(l, job.progressPct));
  const spent = lines.reduce((a, l) => a + l.usedQty * l.unitCost, 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Výdeje materiálu"
      subtitle={`${job.code}: ${job.title}`}
      footer={
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-2">Vydáno celkem</span>
          <span className="font-display text-lg font-semibold text-ink tabular-nums">{fmt.czk(spent)}</span>
        </div>
      }
    >
      <Accordion multiple defaultOpen={lines.filter((l) => l.risk !== 'ok').map((l) => l.materialId)}>
        {lines.map((l) => {
          const entries = usage?.filter((u) => u.materialId === l.materialId) ?? [];
          return (
            <AccordionItem
              key={l.materialId}
              id={l.materialId}
              header={
                <span className="block">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{l.name}</span>
                    <RiskBadge risk={l.risk} />
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-2 tabular-nums">
                    {fmt.num(l.usedQty)} z {fmt.num(l.plannedQty)} {l.unit}, predikce {fmt.num(l.projectedQty)} {l.unit}
                  </span>
                </span>
              }
            >
              {usage === null ? (
                <div className="space-y-2" aria-busy="true">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-md bg-concrete" />
                  ))}
                </div>
              ) : entries.length === 0 ? (
                <p className="text-sm text-ink-2">Zatím žádný výdej. Dělník ho zapíše v mobilu při odběru.</p>
              ) : (
                <ol className="space-y-1.5">
                  {entries.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 rounded-md bg-concrete/60 px-3 py-2 text-sm">
                      {u.source === 'mobile' ? (
                        <Smartphone className="size-4 text-ink-3" aria-label="Zapsáno v terénu" />
                      ) : (
                        <Building2 className="size-4 text-ink-3" aria-label="Zapsáno v kanceláři" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink">{nameOf.get(u.workerId) ?? 'Neznámý pracovník'}</span>
                        <span className="block text-xs text-ink-3">{fmt.dateTime(u.usedAt)}</span>
                      </span>
                      <span className="text-right tabular-nums">
                        <span className="block font-medium text-ink">
                          {fmt.num(u.qty)} {l.unit}
                        </span>
                        <span className="block text-xs text-ink-3">{fmt.czk(u.qty * u.unitCostSnapshot)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </AccordionItem>
          );
        })}
      </Accordion>
    </Drawer>
  );
}
