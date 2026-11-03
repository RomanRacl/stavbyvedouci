'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { btnPrimary, btnSecondary, inputCls } from '@/components/shell/PageHeader';
import { fmt } from '@/features/analytics/lib/metrics';
import { MaterialSearch } from '@/features/materials/MaterialSearch';
import { TRADES } from '@/lib/trades';
import { DEFAULT_HOURLY_COST } from '@/lib/jobDefaults';
import type { JobTemplate, MaterialItem } from '@/types/firestore';

interface Props {
  open: boolean;
  template: JobTemplate | null; // null = nová
  catalog: MaterialItem[];
  onClose: () => void;
  onSave: (t: JobTemplate) => void;
}

const blank = (): JobTemplate => ({ id: '', name: '', trade: 'electro', title: '', revenue: 0, laborHours: 0, materialLines: [], checklist: [] });

/** Úprava šablony zakázky: cena, hodiny, materiál z katalogu a kontrolní seznam. */
export function TemplateDrawer({ open, template, catalog, onClose, onSave }: Props) {
  const [t, setT] = useState<JobTemplate>(blank);
  const [check, setCheck] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setT(template ? structuredClone(template) : blank());
      setCheck('');
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jen při otevření
  }, [open, template?.id]);

  const item = (id: string) => catalog.find((c) => c.id === id);
  const materialCost = t.materialLines.reduce((a, l) => a + l.qty * (item(l.materialId)?.unitCost ?? 0), 0);
  const margin = t.revenue - materialCost - t.laborHours * DEFAULT_HOURLY_COST;

  const save = () => {
    if (!t.name.trim()) return setError('Pojmenujte šablonu, např. „Koupelna kompletně“.');
    onSave({ ...t, name: t.name.trim(), title: t.title.trim() || t.name.trim(), id: t.id || `tpl_${Date.now().toString(36)}` });
  };

  const num = (v: string) => Math.max(0, Number(v.replace(/\s/g, '').replace(',', '.')) || 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={template ? 'Upravit šablonu' : 'Nová šablona'}
      subtitle="Předvyplní novou zakázku jedním klepnutím"
      width={600}
      footer={
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-ink-2">
            Odhad marže{' '}
            <strong className={`tabular-nums ${margin < 0 ? 'text-crit-ink' : 'text-ink'}`}>
              {t.revenue ? `${fmt.czk(margin)} (${fmt.pct(margin / t.revenue)})` : '—'}
            </strong>
          </p>
          <button type="button" onClick={onClose} className={btnSecondary}>
            Zrušit
          </button>
          <button type="button" onClick={save} className={btnPrimary}>
            Uložit šablonu
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-sm font-medium text-ink">
          Název šablony
          <input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} className={`${inputCls} mt-1`} />
        </label>
        <label className="col-span-2 text-sm font-medium text-ink">
          Název zakázky, který se předvyplní
          <input value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} placeholder="stejný jako šablona" className={`${inputCls} mt-1`} />
        </label>
        <div className="col-span-2">
          <span className="text-sm font-medium text-ink">Obor</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {TRADES.map((tr) => (
              <button
                key={tr.id}
                type="button"
                aria-pressed={t.trade === tr.id}
                onClick={() => setT({ ...t, trade: tr.id })}
                className={`h-9 rounded-lg border px-3 text-sm transition ${t.trade === tr.id ? 'border-ink bg-ink text-white' : 'border-line text-ink-2 hover:text-ink'}`}
              >
                {tr.label}
              </button>
            ))}
          </div>
        </div>
        <label className="text-sm font-medium text-ink">
          Cena pro zákazníka bez DPH
          <input inputMode="numeric" value={t.revenue || ''} onChange={(e) => setT({ ...t, revenue: Math.round(num(e.target.value)) })} className={`${inputCls} mt-1 text-right tabular-nums`} />
        </label>
        <label className="text-sm font-medium text-ink">
          Hodiny práce
          <input inputMode="decimal" value={t.laborHours || ''} onChange={(e) => setT({ ...t, laborHours: num(e.target.value) })} className={`${inputCls} mt-1 text-right tabular-nums`} />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-crit-ink">{error}</p>}

      <section className="mt-7">
        <h3 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-ink">
          Materiál <span className="font-normal text-ink-2 tabular-nums">{fmt.czk(materialCost)}</span>
        </h3>
        {t.materialLines.length > 0 && (
          <ul className="mb-3 divide-y divide-line rounded-lg border border-line">
            {t.materialLines.map((l) => {
              const it = item(l.materialId);
              return (
                <li key={l.materialId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink">{it?.name ?? 'Položka už není v katalogu'}</span>
                  <input
                    inputMode="decimal"
                    aria-label={`Množství ${it?.name}`}
                    value={l.qty}
                    onChange={(e) => setT({ ...t, materialLines: t.materialLines.map((x) => (x.materialId === l.materialId ? { ...x, qty: num(e.target.value) } : x)) })}
                    className="h-8 w-20 rounded-md border border-line px-2 text-right tabular-nums focus:border-series-1 focus:outline-none"
                  />
                  <span className="w-7 text-xs text-ink-3">{it?.unit}</span>
                  <button
                    type="button"
                    aria-label="Odebrat"
                    onClick={() => setT({ ...t, materialLines: t.materialLines.filter((x) => x.materialId !== l.materialId) })}
                    className="grid size-8 place-items-center rounded text-ink-3 hover:bg-crit/10 hover:text-crit-ink"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <MaterialSearch
          catalog={catalog}
          excludeIds={t.materialLines.map((l) => l.materialId)}
          onPick={(m) => setT({ ...t, materialLines: [...t.materialLines, { materialId: m.id, qty: 1 }] })}
        />
      </section>

      <section className="mt-7">
        <h3 className="mb-2 text-sm font-semibold text-ink">Kontrolní seznam</h3>
        {t.checklist.length > 0 && (
          <ul className="mb-2 divide-y divide-line rounded-lg border border-line">
            {t.checklist.map((c, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 text-ink">{c.text}</span>
                <button
                  type="button"
                  onClick={() => setT({ ...t, checklist: t.checklist.map((x, j) => (j === i ? { ...x, required: !x.required } : x)) })}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.required ? 'bg-crit/10 text-crit-ink' : 'bg-concrete text-ink-3'}`}
                >
                  {c.required ? 'povinné' : 'volitelné'}
                </button>
                <button
                  type="button"
                  aria-label="Odebrat bod"
                  onClick={() => setT({ ...t, checklist: t.checklist.filter((_, j) => j !== i) })}
                  className="grid size-8 place-items-center rounded text-ink-3 hover:bg-crit/10 hover:text-crit-ink"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={check}
            onChange={(e) => setCheck(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && check.trim()) {
                setT({ ...t, checklist: [...t.checklist, { text: check.trim(), required: true }] });
                setCheck('');
              }
            }}
            placeholder="Nový bod kontrolního seznamu"
            className={inputCls}
          />
          <button
            type="button"
            disabled={!check.trim()}
            onClick={() => {
              setT({ ...t, checklist: [...t.checklist, { text: check.trim(), required: true }] });
              setCheck('');
            }}
            className={btnSecondary}
          >
            <Plus className="size-4" /> Přidat
          </button>
        </div>
      </section>
    </Drawer>
  );
}
