'use client';

import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ClipboardList, Lightbulb, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { btnPrimary, PageHeader } from '@/components/shell/PageHeader';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { fmt } from '@/features/analytics/lib/metrics';
import { createOrder } from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { orderTotal, reorderSuggestions, stockRows } from '@/lib/stock';
import type { PurchaseOrder } from '@/types/firestore';
import { OrderDrawer } from './OrderDrawer';
import { ORDER_STATUS } from './orderText';

const FILTERS = [
  { id: 'open', label: 'Rozpracované' },
  { id: 'draft', label: 'Koncepty' },
  { id: 'sent', label: 'Odeslané' },
  { id: 'received', label: 'Přijaté' },
  { id: 'all', label: 'Vše' },
] as const;

/** Objednávky materiálu: návrhy z položek pod minimem, koncepty, odeslané, příjem na sklad. */
export default function OrdersPage() {
  const snap = useSnapshot();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('open');
  const [open, setOpen] = useState<PurchaseOrder | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  /** Návrhy bez položek, které už jsou v rozpracované objednávce. */
  const suggestions = useMemo(() => {
    if (!snap) return [];
    const pending = new Set(snap.orders.filter((o) => o.status !== 'received').flatMap((o) => o.lines.map((l) => l.materialId)));
    return Object.entries(reorderSuggestions(stockRows(snap.catalog, snap.stockMoves, snap.vans)))
      .map(([supplier, lines]) => ({ supplier, lines: lines.filter((l) => !pending.has(l.materialId)) }))
      .filter((s) => s.lines.length);
  }, [snap]);

  const orders = useMemo(() => {
    if (!snap) return [];
    return snap.orders
      .filter((o) => (filter === 'all' ? true : filter === 'open' ? o.status !== 'received' : o.status === filter))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [snap, filter]);

  if (!snap) return <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" />;

  const done = (text: string) => {
    setOpen(null);
    setToast({ text, tone: 'success', id: Date.now() });
  };

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Objednávky" description="Návrhy doobjednání podle minim, objednávky na zakázky a příjem zboží na sklad." />

      <AnimatePresence initial={false}>
        {suggestions.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6"
            aria-labelledby="sug-h"
          >
            <h2 id="sug-h" className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
              <Lightbulb className="size-4 text-warn-ink" /> Návrh doobjednání
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {suggestions.map((s) => (
                <motion.article layout key={s.supplier} className="flex flex-col rounded-xl border border-line bg-surface p-4">
                  <header className="flex items-baseline justify-between gap-2">
                    <h3 className="font-display text-lg font-semibold text-ink">{s.supplier}</h3>
                    <span className="text-sm text-ink-2 tabular-nums">{fmt.czk(orderTotal(s.lines))}</span>
                  </header>
                  <ul className="mt-2 flex-1 space-y-1 text-sm">
                    {s.lines.map((l) => (
                      <li key={l.materialId} className="flex gap-2">
                        <span className="min-w-0 flex-1 truncate text-ink">{l.name}</span>
                        <span className="text-ink-2 tabular-nums">
                          {fmt.num(l.qty)} {l.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => {
                      const o = createOrder(s.supplier, s.lines);
                      setOpen(o);
                      setToast({ text: `Koncept ${o.number} připraven, zkontrolujte množství.`, tone: 'success', id: Date.now() });
                    }}
                    className={`${btnPrimary} mt-4 justify-center`}
                  >
                    <Plus className="size-4" /> Vytvořit objednávku
                  </button>
                </motion.article>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">Položky pod minimem se doplní na dvojnásobek minima. Kabely a trubky se zaokrouhlují na 50 m.</p>
          </motion.section>
        )}
      </AnimatePresence>

      <section className="rounded-xl border border-line bg-surface">
        <LayoutGroup id="order-filters">
          <div className="flex gap-1 overflow-x-auto border-b border-line p-3" role="tablist" aria-label="Filtr objednávek">
            {FILTERS.map((f) => {
              const active = f.id === filter;
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.id)}
                  className={`relative shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${active ? 'text-white' : 'text-ink-2 hover:text-ink'}`}
                >
                  {active && <motion.span layoutId="order-filter" className="absolute inset-0 rounded-md bg-ink" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <span className="relative">{f.label}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>

        {orders.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <ClipboardList className="mx-auto size-8 text-ink-3" />
            <p className="mt-3 font-medium text-ink">Žádné objednávky</p>
            <p className="mt-1 text-sm text-ink-2">Vytvořte je z návrhu výše nebo v detailu zakázky tlačítkem „Objednat chybějící“.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((o) => {
              const job = o.jobId ? snap.jobs.find((j) => j.id === o.jobId) : null;
              return (
                <li key={o.id}>
                  <button type="button" onClick={() => setOpen(o)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-concrete/60">
                    <span className="w-32 font-display text-sm font-semibold text-ink-2 tabular-nums">{o.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{o.supplier}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {o.lines.length} položek{job && `, zakázka ${job.code}`}, {fmt.dateTime(o.createdAt)}
                      </span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS[o.status].cls}`}>{ORDER_STATUS[o.status].label}</span>
                    <span className="w-28 text-right font-semibold text-ink tabular-nums">{fmt.czk(orderTotal(o.lines))}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <OrderDrawer order={open} snap={snap} open={Boolean(open)} onClose={() => setOpen(null)} onDone={done} />
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}
