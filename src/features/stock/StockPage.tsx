'use client';

import { AlertTriangle, Plus, Search, Upload } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { btnPrimary, btnSecondary, PageHeader } from '@/components/shell/PageHeader';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { fmt } from '@/features/analytics/lib/metrics';
import { MOCK_COMPANY } from '@/lib/mock/dashboard.mock';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { stockRows } from '@/lib/stock';
import type { MaterialItem } from '@/types/firestore';
import { ImportDrawer } from './ImportDrawer';
import { ItemDrawer } from './ItemDrawer';

/** Sklad: stav materiálu v hlavním skladu a v autech, katalog, import ceníku. */
export default function StockPage() {
  const snap = useSnapshot();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [onlyLow, setOnlyLow] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const rows = useMemo(() => (snap ? stockRows(snap.catalog, snap.stockMoves, snap.vans) : []), [snap]);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.item.category))].sort(), [rows]);
  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('cs');
    return rows
      .filter((r) => category === 'all' || r.item.category === category)
      .filter((r) => !onlyLow || r.low)
      .filter((r) => !needle || [r.item.name, r.item.sku, r.item.barcode ?? '', r.item.supplier].some((v) => v.toLocaleLowerCase('cs').includes(needle)))
      .sort((a, b) => Number(b.low) - Number(a.low) || a.item.category.localeCompare(b.item.category, 'cs') || a.item.name.localeCompare(b.item.name, 'cs'));
  }, [rows, q, category, onlyLow]);
  const lowCount = rows.filter((r) => r.low).length;
  const value = rows.reduce((a, r) => a + Math.max(0, r.total) * r.item.unitCost, 0);

  if (!snap) return <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" />;

  const done = (text: string) => {
    setItemOpen(false);
    setImportOpen(false);
    setToast({ text, tone: 'success', id: Date.now() });
  };

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Sklad"
        description="Hlavní sklad a auta party. Stav mění výdeje a vratky z mobilu, převody, příjem objednávek a inventura."
        actions={
          <>
            <button type="button" onClick={() => setImportOpen(true)} className={btnSecondary}>
              <Upload className="size-4" /> Importovat ceník
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setItemOpen(true);
              }}
              className={btnPrimary}
            >
              <Plus className="size-4" /> Nová položka
            </button>
          </>
        }
      />

      {lowCount > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/8 px-4 py-3">
          <AlertTriangle className="size-5 text-warn-ink" />
          <p className="min-w-0 flex-1 text-sm text-ink">
            <strong>{lowCount}</strong> {lowCount === 1 ? 'položka je' : lowCount < 5 ? 'položky jsou' : 'položek je'} pod minimem.
          </p>
          <Link href="/objednavky" className={btnPrimary}>
            Připravit objednávky
          </Link>
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Hledat materiál</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hledat podle názvu, kódu, EAN nebo dodavatele"
              className="h-10 w-full rounded-lg border border-line bg-concrete/50 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-series-1 focus:bg-surface focus:outline-none"
            />
          </label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategorie" className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink">
            <option value="all">Všechny kategorie</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="flex h-10 items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="size-4 accent-ink" />
            Jen pod minimem
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 font-medium">Položka</th>
                <th className="px-3 py-2.5 text-right font-medium">Hlavní sklad</th>
                {snap.vans.map((v) => (
                  <th key={v.id} className="px-3 py-2.5 text-right font-medium">
                    {v.name}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-medium">Celkem</th>
                <th className="px-3 py-2.5 text-right font-medium">Minimum</th>
                <th className="px-4 py-2.5 text-right font-medium">Cena</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5 + snap.vans.length} className="px-4 py-10 text-center text-ink-2">
                    Nic nenalezeno. Zkuste jiné hledání nebo zrušte filtr.
                  </td>
                </tr>
              )}
              {visible.map((r) => {
                const qty = (n: number) => (
                  <span className={n < 0 ? 'font-semibold text-crit-ink' : n === 0 ? 'text-ink-3' : 'text-ink'}>{fmt.num(n)}</span>
                );
                return (
                  <tr
                    key={r.item.id}
                    tabIndex={0}
                    onClick={() => {
                      setEditing(r.item);
                      setItemOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setEditing(r.item);
                        setItemOpen(true);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-concrete/60 focus-visible:bg-concrete focus-visible:outline-none"
                  >
                    <td className="px-4 py-2.5">
                      <span className="block font-medium text-ink">{r.item.name}</span>
                      <span className="block text-xs text-ink-3">
                        {r.item.sku}, {r.item.category}, {r.item.supplier}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{qty(r.warehouse)}</td>
                    {snap.vans.map((v) => (
                      <td key={v.id} className="px-3 py-2.5 text-right tabular-nums">
                        {qty(r.vans[v.id] ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={`inline-flex items-center gap-1 font-semibold ${r.low ? 'text-warn-ink' : 'text-ink'}`}>
                        {r.low && <AlertTriangle className="size-3.5" aria-label="Pod minimem" />}
                        {fmt.num(r.total)} {r.item.unit}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink-2 tabular-nums">{r.item.reorderPoint || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">
                      {fmt.czk(r.item.unitCost)}/{r.item.unit}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-3 text-sm text-ink-2">
          {rows.length} položek v katalogu, hodnota zásob <strong className="text-ink tabular-nums">{fmt.czk(value)}</strong> v nákupních cenách.
        </p>
      </section>

      <ItemDrawer open={itemOpen} item={editing} snap={snap} userId={MOCK_COMPANY.uid} onClose={() => setItemOpen(false)} onDone={done} />
      <ImportDrawer open={importOpen} snap={snap} onClose={() => setImportOpen(false)} onDone={done} />
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}
