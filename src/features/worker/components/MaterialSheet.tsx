'use client';

import { Minus, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { fmt } from '@/features/analytics/lib/metrics';
import { MaterialSearch } from '@/features/materials/MaterialSearch';
import type { IssueItem } from '@/lib/mock/localBackend';
import type { Job, MaterialItem, MaterialPlanLine } from '@/types/firestore';
import { buzz } from '../hooks/useWorkerData';

interface Props {
  job: Job;
  catalog: MaterialItem[];
  open: boolean;
  onClose: () => void;
  onSubmit: (items: IssueItem[]) => void;
}

/** Krok počítadla podle jednotky: kabel po 5 m, kusy po jednom. */
const stepFor = (unit: string) => (unit === 'm' ? 5 : 1);

export function MaterialSheet({ job, catalog, open, onClose, onSubmit }: Props) {
  const [qty, setQty] = useState<Record<string, number>>({});
  /** Materiál mimo plán, který dělník přidal z katalogu. */
  const [extras, setExtras] = useState<MaterialPlanLine[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (open) {
      setQty({});
      setExtras([]);
      setSearching(false);
    }
  }, [open]);

  const addExtra = (m: MaterialItem) => {
    buzz();
    setExtras((e) => [...e, { materialId: m.id, name: m.name, unit: m.unit, unitCost: m.unitCost, plannedQty: 0, usedQty: 0 }]);
    setQty((q) => ({ ...q, [m.id]: stepFor(m.unit) }));
    setSearching(false);
  };
  const lines = [...job.materialPlan, ...extras];
  const isExtra = (id: string) => extras.some((e) => e.materialId === id);

  const change = (id: string, delta: number) => {
    buzz();
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + delta) }));
  };

  const picked = lines.filter((l) => (qty[l.materialId] ?? 0) > 0);
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
          onClick={() =>
            onSubmit(
              picked.map((l) => ({
                materialId: l.materialId,
                qty: qty[l.materialId],
                ...(isExtra(l.materialId) && { line: { materialId: l.materialId, name: l.name, unit: l.unit, unitCost: l.unitCost } }),
              })),
            )
          }
          className="flex h-14 w-full items-center justify-center rounded-xl bg-ink text-base font-semibold text-white transition active:scale-[0.98] disabled:bg-line disabled:text-ink-3"
        >
          {picked.length
            ? `Zapsat výdej (${picked.length} ${picked.length === 1 ? 'položka' : picked.length < 5 ? 'položky' : 'položek'}, ${fmt.czk(total)})`
            : 'Vyberte množství'}
        </button>
      }
    >
      {lines.length === 0 && !searching && (
        <p className="pb-2 text-base text-ink-2">Na zakázce zatím není naplánovaný žádný materiál.</p>
      )}
      <ul className="divide-y divide-line">
        {lines.map((l) => {
          const q = qty[l.materialId] ?? 0;
          const step = stepFor(l.unit);
          const remaining = Math.max(0, l.plannedQty - l.usedQty);
          return (
            <li key={l.materialId} className="flex items-center gap-3 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium text-ink">{l.name}</p>
                <p className="text-sm text-ink-3 tabular-nums">
                  {isExtra(l.materialId) || l.plannedQty === 0 ? 'mimo plán' : `zbývá z plánu ${fmt.num(remaining)} ${l.unit}`}
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
                <span className={`w-16 text-center font-display text-xl font-semibold tabular-nums ${q ? 'text-ink' : 'text-ink-3'}`} aria-live="polite">
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

      <div className="pt-2 pb-4">
        {searching ? (
          <div className="rounded-2xl border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-base font-semibold text-ink">Materiál mimo plán</p>
              <button type="button" onClick={() => setSearching(false)} className="h-10 rounded-lg px-3 text-sm font-medium text-ink-2 active:bg-concrete">
                Zavřít
              </button>
            </div>
            <MaterialSearch catalog={catalog} excludeIds={lines.map((l) => l.materialId)} onPick={addExtra} variant="touch" autoFocus />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-base font-medium text-ink-2 active:bg-concrete"
          >
            <Search className="size-5" /> Přidat materiál mimo plán
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
