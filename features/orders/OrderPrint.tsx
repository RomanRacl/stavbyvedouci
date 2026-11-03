'use client';

import { Printer } from 'lucide-react';
import { fmt } from '@/features/analytics/lib/metrics';
import { MOCK_COMPANY } from '@/lib/mock/dashboard.mock';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { orderTotal } from '@/lib/stock';

/**
 * Tisková podoba objednávky (A4). „Uložit jako PDF“ je v dialogu tisku každého prohlížeče,
 * takže není potřeba žádná knihovna na PDF.
 */
export default function OrderPrint({ id }: { id: string }) {
  const snap = useSnapshot();
  if (!snap) return null;
  const order = snap.orders.find((o) => o.id === id);
  if (!order) {
    return <p className="p-10 text-center text-ink-2">Objednávka nebyla nalezena. Je uložená jen v prohlížeči, ve kterém vznikla.</p>;
  }
  const job = order.jobId ? snap.jobs.find((j) => j.id === order.jobId) : null;
  const skuOf = (mid: string) => snap.catalog.find((c) => c.id === mid)?.sku ?? '';

  return (
    <div className="theme-light min-h-dvh bg-concrete py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-4 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90"
        >
          <Printer className="size-4" /> Tisk / Uložit jako PDF
        </button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-[16mm] py-[14mm] text-[13px] leading-relaxed text-ink shadow-xl print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-ink pb-5">
          <div>
            <p className="font-display text-lg font-bold">{MOCK_COMPANY.name}</p>
            <p>{MOCK_COMPANY.address}</p>
            <p>tel. {MOCK_COMPANY.phone}</p>
          </div>
          <div className="text-right">
            <h1 className="font-display text-2xl font-bold">Objednávka</h1>
            <p className="font-display text-base font-semibold tabular-nums">{order.number}</p>
            <p>ze dne {order.createdAt.toLocaleDateString('cs-CZ')}</p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs text-ink-3">Dodavatel</p>
            <p className="font-semibold">{order.supplier}</p>
            {snap.suppliers.find((s) => s.name === order.supplier)?.email && <p>{snap.suppliers.find((s) => s.name === order.supplier)?.email}</p>}
          </div>
          {job && (
            <div>
              <p className="text-xs text-ink-3">Pro zakázku</p>
              <p className="font-semibold">
                {job.code}, {job.title}
              </p>
              <p>{job.client.address}</p>
            </div>
          )}
        </section>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-b border-ink text-left text-xs">
              <th className="py-2 pr-2 font-semibold">#</th>
              <th className="py-2 pr-2 font-semibold">Kód</th>
              <th className="py-2 pr-2 font-semibold">Název</th>
              <th className="py-2 pr-2 text-right font-semibold">Množství</th>
              <th className="py-2 pr-2 text-right font-semibold">Cena/j.</th>
              <th className="py-2 text-right font-semibold">Celkem</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l, i) => (
              <tr key={l.materialId} className="border-b border-line">
                <td className="py-1.5 pr-2 tabular-nums">{i + 1}</td>
                <td className="py-1.5 pr-2 tabular-nums">{skuOf(l.materialId)}</td>
                <td className="py-1.5 pr-2">{l.name}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {fmt.num(l.qty)} {l.unit}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{fmt.czk(l.unitCost)}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt.czk(l.qty * l.unitCost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="pt-3 text-right font-semibold">
                Celkem bez DPH (orientačně podle ceníku)
              </td>
              <td className="pt-3 text-right font-bold tabular-nums">{fmt.czk(orderTotal(order.lines))}</td>
            </tr>
          </tfoot>
        </table>

        {order.note && (
          <p className="mt-6">
            <span className="font-semibold">Poznámka:</span> {order.note}
          </p>
        )}
        <p className="mt-6">Prosíme o potvrzení objednávky a termínu dodání.</p>

        <footer className="mt-16 flex justify-end">
          <div className="w-64 border-t border-ink pt-1 text-center text-xs">
            {MOCK_COMPANY.owner}, {MOCK_COMPANY.name}
          </div>
        </footer>
      </article>
    </div>
  );
}
