'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { fmt } from '@/features/analytics/lib/metrics';
import { MaterialSearch } from '@/features/materials/MaterialSearch';
import type { Job, MaterialItem, MaterialPlanLine, Unit } from '@/types/firestore';

const UNITS: Unit[] = ['ks', 'm', 'kg', 'bal', 'l'];

interface Props {
  job: Job | null;
  catalog: MaterialItem[];
  open: boolean;
  onClose: () => void;
  onSave: (plan: MaterialPlanLine[]) => void;
}

const numCls =
  'h-9 w-full rounded-md border border-line bg-surface px-2 text-right text-sm text-ink tabular-nums focus:border-series-1 focus:outline-none';

/** Plánování materiálu k zakázce: výběr z katalogu nebo vlastní položka, plánované množství a cena. */
export function MaterialPlanDrawer({ job, catalog, open, onClose, onSave }: Props) {
  const [lines, setLines] = useState<MaterialPlanLine[]>([]);
  const [custom, setCustom] = useState({ name: '', unit: 'ks' as Unit, unitCost: '' });
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useEffect(() => {
    if (open && job) {
      setLines(job.materialPlan.map((l) => ({ ...l })));
      setCustom({ name: '', unit: 'ks', unitCost: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- koncept se nenačítá znovu při každé živé změně zakázky
  }, [open, job?.id]);

  if (!job) return null;

  const update = (id: string, patch: Partial<MaterialPlanLine>) =>
    setLines((ls) => ls.map((l) => (l.materialId === id ? { ...l, ...patch } : l)));

  const addLine = (line: MaterialPlanLine) => {
    setLines((ls) => [...ls, line]);
    setJustAdded(line.materialId);
  };

  const addFromCatalog = (m: MaterialItem) =>
    addLine({ materialId: m.id, name: m.name, unit: m.unit, unitCost: m.unitCost, plannedQty: 1, usedQty: 0 });

  const customValid = custom.name.trim() && Number(custom.unitCost) >= 0 && custom.unitCost !== '';
  const addCustom = () => {
    if (!customValid) return;
    addLine({
      materialId: `mat_custom_${Date.now().toString(36)}`,
      name: custom.name.trim(),
      unit: custom.unit,
      unitCost: Math.round(Number(custom.unitCost)),
      plannedQty: 1,
      usedQty: 0,
    });
    setCustom({ name: '', unit: custom.unit, unitCost: '' });
  };

  const total = lines.reduce((a, l) => a + l.plannedQty * l.unitCost, 0);
  const changed = JSON.stringify(lines) !== JSON.stringify(job.materialPlan);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Plán materiálu"
      subtitle={`${job.code}: ${job.title}`}
      width={560}
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <span className="text-ink-2">Plán celkem </span>
            <span className="font-display text-lg font-semibold text-ink tabular-nums">{fmt.czk(total)}</span>
            <p className="text-xs text-ink-3">Stane se rozpočtem materiálu zakázky.</p>
          </div>
          <button type="button" onClick={onClose} className="h-11 rounded-lg px-4 text-sm font-medium text-ink-2 hover:bg-concrete hover:text-ink">
            Zrušit
          </button>
          <button
            type="button"
            disabled={!changed}
            onClick={() => onSave(lines.filter((l) => l.plannedQty > 0 || l.usedQty > 0))}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-white transition hover:bg-ink/90 active:scale-[0.98] disabled:bg-line disabled:text-ink-3"
          >
            <Check className="size-4" /> Uložit plán
          </button>
        </div>
      }
    >
      {/* Naplánované položky */}
      <section aria-labelledby="plan-lines">
        <h3 id="plan-lines" className="mb-2 text-sm font-semibold text-ink">
          Naplánováno ({lines.length})
        </h3>
        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-4 text-sm text-ink-2">
            Zatím nic. Přidejte materiál z katalogu nebo vlastní položku níže.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-[1fr_84px_92px_32px] gap-2 bg-concrete/60 px-3 py-2 text-xs text-ink-3">
              <span>Položka</span>
              <span className="text-right">Množství</span>
              <span className="text-right">Cena/jedn.</span>
              <span />
            </div>
            <ul className="divide-y divide-line">
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <motion.li
                    key={l.materialId}
                    layout
                    initial={{ opacity: 0, backgroundColor: 'rgba(242,183,5,0.25)' }}
                    animate={{ opacity: 1, backgroundColor: 'rgba(242,183,5,0)' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.6 }}
                    className="grid grid-cols-[1fr_84px_92px_32px] items-center gap-2 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{l.name}</span>
                      <span className="block text-xs text-ink-3 tabular-nums">
                        {l.usedQty > 0 ? `vydáno ${fmt.num(l.usedQty)} ${l.unit}` : `${fmt.czk(l.plannedQty * l.unitCost)}`}
                      </span>
                    </span>
                    <label className="flex items-center gap-1">
                      <span className="sr-only">Množství {l.name}</span>
                      <input
                        inputMode="decimal"
                        autoFocus={justAdded === l.materialId}
                        onFocus={(e) => e.target.select()}
                        value={l.plannedQty}
                        onChange={(e) => update(l.materialId, { plannedQty: Math.max(0, Number(e.target.value.replace(',', '.')) || 0) })}
                        className={numCls}
                      />
                      <span className="w-6 text-xs text-ink-3">{l.unit}</span>
                    </label>
                    <label>
                      <span className="sr-only">Cena za jednotku {l.name}</span>
                      <input
                        inputMode="numeric"
                        value={l.unitCost}
                        onChange={(e) => update(l.materialId, { unitCost: Math.max(0, Math.round(Number(e.target.value.replace(/\s/g, '')) || 0)) })}
                        className={numCls}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={l.usedQty > 0}
                      title={l.usedQty > 0 ? 'Už se z ní vydávalo, nelze odebrat. Nastavte množství.' : 'Odebrat položku'}
                      aria-label={`Odebrat ${l.name}`}
                      onClick={() => setLines((ls) => ls.filter((x) => x.materialId !== l.materialId))}
                      className="grid size-8 place-items-center rounded-md text-ink-3 transition hover:bg-crit/10 hover:text-crit-ink disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        )}
      </section>

      {/* Přidání z katalogu */}
      <section className="mt-6" aria-labelledby="plan-catalog">
        <h3 id="plan-catalog" className="mb-2 text-sm font-semibold text-ink">
          Přidat z katalogu
        </h3>
        <MaterialSearch catalog={catalog} excludeIds={lines.map((l) => l.materialId)} onPick={addFromCatalog} />
      </section>

      {/* Vlastní položka */}
      <section className="mt-6 rounded-lg bg-concrete/60 p-4" aria-labelledby="plan-custom">
        <h3 id="plan-custom" className="text-sm font-semibold text-ink">
          Vlastní položka mimo katalog
        </h3>
        <div className="mt-3 grid grid-cols-[1fr_80px_100px] gap-2">
          <input
            value={custom.name}
            onChange={(e) => setCustom({ ...custom, name: e.target.value })}
            placeholder="Název"
            className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink focus:border-series-1 focus:outline-none"
          />
          <select
            value={custom.unit}
            onChange={(e) => setCustom({ ...custom, unit: e.target.value as Unit })}
            aria-label="Jednotka"
            className="h-10 rounded-md border border-line bg-surface px-2 text-sm text-ink focus:border-series-1 focus:outline-none"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <input
            inputMode="numeric"
            value={custom.unitCost}
            onChange={(e) => setCustom({ ...custom, unitCost: e.target.value.replace(/\s/g, '') })}
            placeholder="Kč/jedn."
            className="h-10 rounded-md border border-line bg-surface px-3 text-right text-sm text-ink tabular-nums focus:border-series-1 focus:outline-none"
          />
        </div>
        <button
          type="button"
          disabled={!customValid}
          onClick={addCustom}
          className="mt-2 h-9 rounded-md border border-ink px-3 text-sm font-medium text-ink transition hover:bg-ink hover:text-white disabled:border-line disabled:text-ink-3 disabled:hover:bg-transparent"
        >
          Přidat do plánu
        </button>
      </section>
    </Drawer>
  );
}
