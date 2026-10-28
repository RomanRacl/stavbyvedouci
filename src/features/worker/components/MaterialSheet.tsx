'use client';

import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { fmt } from '@/features/analytics/lib/metrics';
import type { Job } from '@/types/firestore';
import { buzz } from '../hooks/useWorkerData';

interface Props {
  job: Job;
  open: boolean;
  onClose: () => void;
  onSubmit: (items: Array<{ materialId: string; qty: number }>) => void;
}

/** Krok počítadla podle jednotky: kabel po 5 m, kusy po jednom. */
const stepFor = (unit: string) => (unit === 'm' ? 5 : 1);

export function MaterialSheet({ job, open, onClose, onSubmit }: Props) {
  const [qty, setQty] = useState<Record<string, number>>({});
  useEffect(() => {
    if (open) setQty({});
  }, [open]);

  const change = (id: string, delta: number) => {
    buzz();
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + delta) }));
  };

  const picked = job.materialPlan.filter((l) => (qty[l.materialId] ?? 0) > 0);
  const total = picked.reduce((a, l) => a + (qty[l.materialId] ?? 0) * l.unitCost, 0);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Vydat materiál"
      footer={
        <button
          type="button"
          disabled={!picked.length}
          onClick={() => onSubmit(picked.map((l) => ({ materialId: l.materialId, qty: qty[l.materialId] })))}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-ink text-base font-semibold text-white transition active:scale-[0.98] disabled:bg-line disabled:text-ink-3"
        >
          {picked.length
            ? `Zapsat výdej (${picked.length} ${picked.length === 1 ? 'položka' : picked.length < 5 ? 'položky' : 'položek'}, ${fmt.czk(total)})`
            : 'Vyberte množství'}
        </button>
      }
    >
      {job.materialPlan.length === 0 ? (
        <p className="pb-6 text-base text-ink-2">
          Na této zakázce není naplánovaný žádný materiál. Požádejte kancelář o doplnění.
        </p>
      ) : (
        <ul className="divide-y divide-line pb-2">
          {job.materialPlan.map((l) => {
            const q = qty[l.materialId] ?? 0;
            const step = stepFor(l.unit);
            const remaining = Math.max(0, l.plannedQty - l.usedQty);
            return (
              <li key={l.materialId} className="flex items-center gap-3 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-ink">{l.name}</p>
                  <p className="text-sm text-ink-3 tabular-nums">
                    zbývá z plánu {fmt.num(remaining)} {l.unit}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Ubrat ${step} ${l.unit}`}
                    disabled={q === 0}
                    onClick={() => change(l.materialId, -step)}
                    className="grid size-12 place-items-center rounded-xl border border-line text-ink transition active:scale-95 active:bg-concrete disabled:text-ink-3/50"
                  >
                    <Minus className="size-5" />
                  </button>
                  <span
                    className={`w-16 text-center font-display text-xl font-semibold tabular-nums ${q ? 'text-ink' : 'text-ink-3'}`}
                    aria-live="polite"
                  >
                    {q}
                    <span className="ml-0.5 text-sm font-normal">{l.unit}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Přidat ${step} ${l.unit}`}
                    onClick={() => change(l.materialId, step)}
                    className="grid size-12 place-items-center rounded-xl bg-ink text-white transition active:scale-95"
                  >
                    <Plus className="size-5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}
