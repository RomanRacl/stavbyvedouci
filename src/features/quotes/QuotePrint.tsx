'use client';

import { DocumentShell, VatSummary } from '@/components/print/DocumentShell';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { lineTotal, quoteTotals, VAT_MODES } from '@/lib/money';

const czk = (n: number) => n.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 2 });
const SECTION = { labor: 'Práce', material: 'Materiál', other: 'Ostatní' } as const;

/** Cenová nabídka pro zákazníka (A4) s logem firmy. */
export default function QuotePrint({ id }: { id: string }) {
  const snap = useSnapshot();
  if (!snap) return null;
  const q = snap.quotes.find((x) => x.id === id);
  if (!q) return <p className="p-10 text-center text-ink-2">Nabídka nebyla nalezena. Je uložená jen v prohlížeči, ve kterém vznikla.</p>;
  const t = quoteTotals(q);
  const vat = VAT_MODES[q.vatMode];

  return (
    <DocumentShell settings={snap.settings} kind="Cenová nabídka" number={q.number} date={q.createdAt}>
      <section className="mt-5 grid grid-cols-2 gap-8">
        <div>
          <p className="text-xs text-ink-3">Pro</p>
          <p className="font-semibold">{q.client.name}</p>
          <p>{q.client.address}</p>
          {q.client.ico && <p>IČO {q.client.ico}</p>}
        </div>
        <div>
          <p className="text-xs text-ink-3">Předmět</p>
          <p className="font-semibold">{q.title}</p>
          <p>Platnost nabídky do {q.validUntil.toLocaleDateString('cs-CZ')}</p>
        </div>
      </section>

      {(['labor', 'material', 'other'] as const).map((kind) => {
        const items = q.items.filter((i) => i.kind === kind);
        if (!items.length) return null;
        return (
          <table key={kind} className="mt-6 w-full border-collapse">
            <thead>
              <tr className="border-b border-ink text-left text-xs">
                <th className="py-2 pr-2 font-semibold">{SECTION[kind]}</th>
                <th className="w-28 py-2 pr-2 text-right font-semibold">Množství</th>
                <th className="w-28 py-2 pr-2 text-right font-semibold">Cena/j.</th>
                <th className="w-32 py-2 text-right font-semibold">Celkem</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-line">
                  <td className="py-1.5 pr-2">{i.text}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {i.qty.toLocaleString('cs-CZ')} {i.unit}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{czk(i.unitPrice)}</td>
                  <td className="py-1.5 text-right tabular-nums">{czk(lineTotal(i))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}

      <VatSummary net={t.net} vat={t.vat} gross={t.gross} rateLabel={vat.short} />
      {vat.invoiceNote && <p className="mt-2 text-right text-xs">{vat.invoiceNote}</p>}

      {q.note && (
        <p className="mt-6">
          <span className="font-semibold">Poznámka:</span> {q.note}
        </p>
      )}
      <p className="mt-6">
        Ceny jsou uvedeny v Kč. Nabídka platí do {q.validUntil.toLocaleDateString('cs-CZ')}. Případné vícepráce vám předem oznámíme a provedeme až po vašem souhlasu.
      </p>

      <footer className="mt-16 flex justify-between gap-8 text-xs">
        <div className="w-60 border-t border-ink pt-1 text-center">Za zhotovitele, {snap.settings.name}</div>
        <div className="w-60 border-t border-ink pt-1 text-center">Nabídku přijímám, podpis objednatele</div>
      </footer>
    </DocumentShell>
  );
}
