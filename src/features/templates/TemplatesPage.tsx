'use client';

import { motion } from 'framer-motion';
import { Copy, LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { btnPrimary, PageHeader } from '@/components/shell/PageHeader';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { fmt } from '@/features/analytics/lib/metrics';
import { DEFAULT_HOURLY_COST } from '@/lib/jobDefaults';
import { deleteTemplate, saveTemplate } from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { TRADE_LABEL } from '@/lib/trades';
import type { JobTemplate } from '@/types/firestore';
import { TemplateDrawer } from './TemplateDrawer';

/** Šablony zakázek – opakované typy prací s předpřipraveným materiálem a kontrolním seznamem. */
export default function TemplatesPage() {
  const snap = useSnapshot();
  const [editing, setEditing] = useState<JobTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  if (!snap) return <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" />;
  const costOf = (t: JobTemplate) => t.materialLines.reduce((a, l) => a + l.qty * (snap.catalog.find((c) => c.id === l.materialId)?.unitCost ?? 0), 0);
  const say = (text: string) => setToast({ text, tone: 'success', id: Date.now() });

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Šablony zakázek"
        description="Typové zakázky, které děláte opakovaně. Při zakládání nové zakázky předvyplní cenu, hodiny, materiál i kontrolní seznam."
        actions={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className={btnPrimary}
          >
            <Plus className="size-4" /> Nová šablona
          </button>
        }
      />

      {snap.templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <LayoutTemplate className="mx-auto size-8 text-ink-3" />
          <p className="mt-3 font-medium text-ink">Zatím žádné šablony</p>
          <p className="mt-1 text-sm text-ink-2">Vytvořte novou, nebo v detailu hotové zakázky klepněte na „Uložit jako šablonu“.</p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {snap.templates.map((t, i) => {
            const material = costOf(t);
            const margin = t.revenue - material - t.laborHours * DEFAULT_HOURLY_COST;
            return (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex flex-col rounded-xl border border-line bg-surface p-5"
              >
                <p className="text-sm text-ink-2">{TRADE_LABEL[t.trade]}</p>
                <h2 className="mt-0.5 font-display text-xl font-semibold text-ink">{t.name}</h2>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-ink-3">Cena</dt>
                    <dd className="font-semibold text-ink tabular-nums">{fmt.czkShort(t.revenue)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Práce</dt>
                    <dd className="font-semibold text-ink tabular-nums">{fmt.num(t.laborHours)} h</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Marže</dt>
                    <dd className={`font-semibold tabular-nums ${margin < 0 ? 'text-crit-ink' : 'text-ink'}`}>{t.revenue ? fmt.pct(margin / t.revenue) : '—'}</dd>
                  </div>
                </dl>
                <p className="mt-3 flex-1 text-sm text-ink-2">
                  {t.materialLines.length} položek materiálu za {fmt.czk(material)}, {t.checklist.length} bodů kontrolního seznamu.
                </p>
                <div className="mt-4 flex items-center gap-1 border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(t);
                      setOpen(true);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink hover:bg-concrete"
                  >
                    <Pencil className="size-4" /> Upravit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      saveTemplate({ ...structuredClone(t), id: `tpl_${Date.now().toString(36)}`, name: `${t.name} (kopie)` });
                      say('Šablona zkopírována.');
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink hover:bg-concrete"
                  >
                    <Copy className="size-4" /> Kopírovat
                  </button>
                  <span className="flex-1" />
                  {confirm === t.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        deleteTemplate(t.id);
                        setConfirm(null);
                        say('Šablona smazána.');
                      }}
                      className="h-9 rounded-md bg-crit px-3 text-sm font-semibold text-white"
                    >
                      Opravdu smazat
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Smazat ${t.name}`}
                      onClick={() => setConfirm(t.id)}
                      className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-crit/10 hover:text-crit-ink"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      <TemplateDrawer
        open={open}
        template={editing}
        catalog={snap.catalog}
        onClose={() => setOpen(false)}
        onSave={(t) => {
          saveTemplate(t);
          setOpen(false);
          say(editing ? 'Šablona uložena.' : 'Šablona vytvořena.');
        }}
      />
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}
