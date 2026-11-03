'use client';

import { DocumentShell, VatSummary } from '@/components/print/DocumentShell';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { fmtMoney, toEur } from '@/lib/finance';
import { itemsForTier, lineTotal, quoteTotals, TIERS, VAT_MODES } from '@/lib/money';

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
  const eur = q.currency === 'EUR' && q.eurRate ? q.eurRate : null;
  const money = (n: number) => (eur ? fmtMoney(toEur(n, eur), 'EUR') : czk(n));

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

      {q.tiers ? (
        <>
          <table className="mt-6 w-full border-collapse">
            <thead>
              <tr className="border-b border-ink text-left text-xs">
                <th className="py-2 pr-2 font-semibold">Položka</th>
                <th className="w-24 py-2 pr-2 text-right font-semibold">Množství</th>
                <th className="w-28 py-2 pr-2 text-right font-semibold">Cena</th>
                {TIERS.map((tier) => (
                  <th key={tier.id} className="w-20 py-2 text-center font-semibold">
                    {tier.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.items.map((i) => (
                <tr key={i.id} className="border-b border-line">
                  <td className="py-1.5 pr-2">{i.text}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {i.qty.toLocaleString('cs-CZ')} {i.unit}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{money(lineTotal(i))}</td>
                  {TIERS.map((tier) => (
                    <td key={tier.id} className="py-1.5 text-center">
                      {itemsForTier([i], tier.id).length ? '●' : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {TIERS.map((tier) => {
              const tt = quoteTotals(q, tier.id);
              const chosen = q.chosenTier === tier.id;
              return (
                <div key={tier.id} className={`rounded-md border p-3 ${chosen ? 'border-2 border-ink' : 'border-line'}`}>
                  <p className="font-semibold">
                    {tier.label}
                    {chosen && ' (zvoleno)'}
                  </p>
                  <p className="text-xs text-ink-3">{tier.hint}</p>
                  <p className="mt-2 text-xs">Bez DPH {money(tt.net)}</p>
                  {vat.rate > 0 && <p className="text-xs">DPH {vat.short} {money(tt.vat)}</p>}
                  <p className="mt-1 text-base font-bold tabular-nums">{money(tt.gross)}</p>
                </div>
              );
            })}
          </div>
          {(q.discountPct ?? 0) > 0 && <p className="mt-2 text-right text-xs">Ceny jsou po slevě {q.discountPct} %.</p>}
          {vat.invoiceNote && <p className="mt-2 text-right text-xs">{vat.invoiceNote}</p>}
          <p className="mt-4">
            Vyberte prosím variantu, která vám vyhovuje, a označte ji při podpisu. Položky s tečkou jsou ve variantě zahrnuté.
          </p>
        </>
      ) : (
        <>
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
                      <td className="py-1.5 pr-2 text-right tabular-nums">{money(i.unitPrice)}</td>
                      <td className="py-1.5 text-right tabular-nums">{money(lineTotal(i))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })}

          {t.discount > 0 && (
            <div className="mt-4 flex justify-end">
              <table className="w-80 text-right">
                <tbody>
                  <tr>
                    <td className="py-0.5 pr-4 text-ink-2">Cena podle ceníku</td>
                    <td className="tabular-nums">{money(t.list)}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 pr-4 text-ink-2">Sleva {t.discountPct} %</td>
                    <td className="tabular-nums">−{money(t.discount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {eur ? (
            <div className="mt-6 flex justify-end">
              <table className="w-80 text-right">
                <tbody>
                  <tr>
                    <td className="py-0.5 pr-4 text-ink-2">Základ</td>
                    <td className="tabular-nums">{money(t.net)}</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 pr-4 text-ink-2">DPH {vat.short}</td>
                    <td className="tabular-nums">{money(t.vat)}</td>
                  </tr>
                  <tr className="border-t border-ink">
                    <td className="pt-1 pr-4 font-semibold">Celkem</td>
                    <td className="pt-1 font-bold tabular-nums">{money(t.gross)}</td>
                  </tr>
                  <tr>
                    <td className="pt-1 pr-4 text-xs text-ink-3">v Kč při kurzu {eur.toLocaleString('cs-CZ')}</td>
                    <td className="pt-1 text-xs text-ink-3 tabular-nums">{czk(t.gross)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <VatSummary net={t.net} vat={t.vat} gross={t.gross} rateLabel={vat.short} />
          )}
          {vat.invoiceNote && <p className="mt-2 text-right text-xs">{vat.invoiceNote}</p>}
        </>
      )}

      {q.note && (
        <p className="mt-6">
          <span className="font-semibold">Poznámka:</span> {q.note}
        </p>
      )}
      <p className="mt-6">
        Ceny jsou uvedeny {eur ? 'v EUR' : 'v Kč'}. Nabídka platí do {q.validUntil.toLocaleDateString('cs-CZ')}. Případné vícepráce vám předem oznámíme a provedeme až po vašem souhlasu.
      </p>

      <footer className="mt-16 flex justify-between gap-8 text-xs">
        <div className="w-60 border-t border-ink pt-1 text-center">Za zhotovitele, {snap.settings.name}</div>
        <div className="w-60 border-t border-ink pt-1 text-center">Nabídku přijímám, podpis objednatele</div>
      </footer>
    </DocumentShell>
  );
}
