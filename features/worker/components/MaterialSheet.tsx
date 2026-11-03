'use client';

import { LayoutGroup, motion } from 'framer-motion';
import { Minus, Plus, ScanBarcode, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BarcodeScanner } from '@/components/ui/BarcodeScanner';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { fmt } from '@/features/analytics/lib/metrics';
import { MaterialSearch } from '@/features/materials/MaterialSearch';
import type { IssueItem } from '@/lib/mock/localBackend';
import type { Job, MaterialItem, MaterialPlanLine } from '@/types/firestore';
import { buzz } from '../hooks/useWorkerData';

type Mode = 'issue' | 'return';

interface Props {
  job: Job;
  catalog: MaterialItem[];
  /** Stav v autě dělníka podle položky; null = dělník nemá auto. */
  vanStock: Record<string, number> | null;
  vanName: string | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (items: IssueItem[]) => void;
  onReturn: (items: Array<{ materialId: string; qty: number }>) => void;
}

/** Krok počítadla podle jednotky: kabel po 5 m, kusy po jednom. */
const stepFor = (unit: string) => (unit === 'm' ? 5 : 1);

const plural = (n: number) => (n === 1 ? 'položka' : n < 5 ? 'položky' : 'položek');

/**
 * Výdej a vrácení materiálu. Výdej jde přednostně z auta dělníka, vratka se vrací do auta.
 * Položku lze najít v plánu, vyhledat v katalogu nebo naskenovat čárový kód.
 */
export function MaterialSheet({ job, catalog, vanStock, vanName, open, onClose, onSubmit, onReturn }: Props) {
  const [mode, setMode] = useState<Mode>('issue');
  const [qty, setQty] = useState<Record<string, number>>({});
  /** Materiál mimo plán, který dělník přidal z katalogu nebo skenerem. */
  const [extras, setExtras] = useState<MaterialPlanLine[]>([]);
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode('issue');
      setQty({});
      setExtras([]);
      setSearching(false);
    }
  }, [open]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(t);
  }, [flash]);

  const switchMode = (m: Mode) => {
    buzz();
    setMode(m);
    setQty({});
    setSearching(false);
  };

  const planLines = [...job.materialPlan, ...extras];
  // Vrátit jde jen to, co se na zakázku vydalo.
  const lines = mode === 'issue' ? planLines : job.materialPlan.filter((l) => l.usedQty > 0);
  const isExtra = (id: string) => extras.some((e) => e.materialId === id);

  /** Přidá položku (z katalogu nebo skeneru) a rovnou nastaví jeden krok množství. */
  const addItem = (m: MaterialItem) => {
    buzz();
    if (!planLines.some((l) => l.materialId === m.id)) {
      setExtras((e) => [...e, { materialId: m.id, name: m.name, unit: m.unit, unitCost: m.unitCost, plannedQty: 0, usedQty: 0 }]);
    }
    setQty((q) => ({ ...q, [m.id]: (q[m.id] ?? 0) + stepFor(m.unit) }));
    setSearching(false);
    setFlash(m.id);
  };

  const onScan = (code: string) => {
    const item = catalog.find((c) => c.barcode === code);
    if (!item) return false;
    if (mode === 'return' && !job.materialPlan.some((l) => l.materialId === item.id && l.usedQty > 0)) return false;
    addItem(item);
    setScanning(false);
    return true;
  };

  const change = (id: string, delta: number, max = Infinity) => {
    buzz();
    setQty((q) => ({ ...q, [id]: Math.min(max, Math.max(0, (q[id] ?? 0) + delta)) }));
  };

  const picked = lines.filter((l) => (qty[l.materialId] ?? 0) > 0);
  const total = picked.reduce((a, l) => a + (qty[l.materialId] ?? 0) * l.unitCost, 0);

  const submit = () => {
    if (mode === 'return') {
      onReturn(picked.map((l) => ({ materialId: l.materialId, qty: qty[l.materialId] })));
      return;
    }
    onSubmit(
      picked.map((l) => ({
        materialId: l.materialId,
        qty: qty[l.materialId],
        ...(isExtra(l.materialId) && { line: { materialId: l.materialId, name: l.name, unit: l.unit, unitCost: l.unitCost } }),
      })),
    );
  };

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title="Materiál"
        footer={
          <button
            type="button"
            disabled={!picked.length}
            onClick={submit}
            className={`flex h-14 w-full items-center justify-center rounded-xl text-base font-semibold text-white transition active:scale-[0.98] disabled:bg-line disabled:text-ink-3 ${
              mode === 'issue' ? 'bg-ink' : 'bg-good'
            }`}
          >
            {!picked.length
              ? 'Vyberte množství'
              : mode === 'issue'
                ? `Zapsat výdej (${picked.length} ${plural(picked.length)}, ${fmt.czk(total)})`
                : `Vrátit ${vanName ? 'do auta' : 'do skladu'} (${picked.length} ${plural(picked.length)}, ${fmt.czk(total)})`}
          </button>
        }
      >
        <LayoutGroup id="mat-mode">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-concrete p-1" role="radiogroup" aria-label="Výdej nebo vratka">
            {(
              [
                ['issue', 'Vydat'],
                ['return', 'Vrátit nespotřebované'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => switchMode(m)}
                className={`relative h-12 rounded-lg text-base font-semibold transition-colors ${mode === m ? 'text-ink' : 'text-ink-2'}`}
              >
                {mode === m && <motion.span layoutId="mat-mode-pill" className="absolute inset-0 rounded-lg bg-surface shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>

        {vanName && mode === 'issue' && <p className="mb-1 text-sm text-ink-2">Vydává se nejdřív z auta {vanName}, zbytek z hlavního skladu.</p>}

        {lines.length === 0 && !searching && (
          <p className="py-2 text-base text-ink-2">
            {mode === 'issue' ? 'Na zakázce zatím není naplánovaný žádný materiál.' : 'Na tuto zakázku se zatím nic nevydalo, není co vracet.'}
          </p>
        )}
        <ul className="divide-y divide-line">
          {lines.map((l) => {
            const q = qty[l.materialId] ?? 0;
            const step = stepFor(l.unit);
            const remaining = Math.max(0, l.plannedQty - l.usedQty);
            const inVan = vanStock?.[l.materialId];
            const max = mode === 'return' ? l.usedQty : Infinity;
            return (
              <motion.li
                key={l.materialId}
                animate={{ backgroundColor: flash === l.materialId ? 'rgba(242,183,5,0.22)' : 'rgba(242,183,5,0)' }}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-ink">{l.name}</p>
                  <p className="text-sm text-ink-3 tabular-nums">
                    {mode === 'return'
                      ? `vydáno ${fmt.num(l.usedQty)} ${l.unit}`
                      : isExtra(l.materialId) || l.plannedQty === 0
                        ? 'mimo plán'
                        : `zbývá z plánu ${fmt.num(remaining)} ${l.unit}`}
                    {mode === 'issue' && inVan !== undefined && `, v autě ${fmt.num(Math.max(0, inVan))}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Ubrat ${step} ${l.unit}`}
                    disabled={q === 0}
                    onClick={() => change(l.materialId, -step, max)}
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
                    disabled={q >= max}
                    onClick={() => change(l.materialId, step, max)}
                    className={`grid size-12 place-items-center rounded-xl text-white transition active:scale-95 disabled:bg-line ${mode === 'issue' ? 'bg-ink' : 'bg-good'}`}
                  >
                    <Plus className="size-5" />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </ul>

        <div className="grid grid-cols-2 gap-2 pt-2 pb-4">
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-ink text-base font-semibold text-ink active:bg-concrete"
          >
            <ScanBarcode className="size-5" /> Skenovat kód
          </button>
          {mode === 'issue' && (
            <button
              type="button"
              onClick={() => setSearching((s) => !s)}
              aria-expanded={searching}
              className="flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-base font-medium text-ink-2 active:bg-concrete"
            >
              <Search className="size-5" /> Mimo plán
            </button>
          )}
          {searching && mode === 'issue' && (
            <div className="col-span-2 rounded-2xl border border-line p-3">
              <MaterialSearch catalog={catalog} excludeIds={planLines.map((l) => l.materialId)} onPick={addItem} variant="touch" autoFocus />
            </div>
          )}
        </div>
      </BottomSheet>

      <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onCode={onScan} />
    </>
  );
}
