'use client';

import { DocumentShell } from '@/components/print/DocumentShell';
import { fmt } from '@/features/analytics/lib/metrics';
import { goalProgress, monthReport } from '@/lib/insights';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { monthLabel } from '@/lib/money';

/** Měsíční report pro společníky nebo banku (A4): výsledky, nejlepší a nejhorší zakázky, obchod, pohledávky. */
export default function MonthReportPrint({ month }: { month: string }) {
  const snap = useSnapshot();
  if (!snap) return null;
  if (!/^\d{4}-\d{2}$/.test(month)) return <p className="p-10 text-center text-ink-2">Neplatný měsíc.</p>;
  const r = monthReport(month, snap);
  const goals = snap.settings.goals;
  const g = goals ? goalProgress(snap.jobs, snap.quotes, snap.leads, goals) : null;

  const tiles: Array<[string, string, string]> = [
    ['Vyfakturováno', fmt.czk(r.invoicedNet), `${r.invoices} faktur bez DPH`],
    ['Přijaté platby', fmt.czk(r.cashIn), 's DPH'],
    ['Hrubá marže', fmt.czk(r.margin), `${fmt.pct(r.marginPct)} z dokončených`],
    ['Po režii', fmt.czk(r.profitAfterOverhead), `režie ${fmt.czk(r.overhead)}`],
    ['Odpracováno', `${fmt.num(Math.round(r.hours))} h`, `efektivita ${fmt.pct(r.efficiency)}`],
    ['Dokončeno', `${r.completed.length} zakázek`, `${fmt.pct(r.onTimeShare)} včas`],
  ];

  return (
    <DocumentShell settings={snap.settings} kind="Měsíční report" number={monthLabel(month)} date={new Date()}>
      <section className="mt-6 grid grid-cols-3 gap-3">
        {tiles.map(([label, value, foot]) => (
          <div key={label} className="rounded-md border border-line p-3">
            <p className="text-xs text-ink-3">{label}</p>
            <p className="font-display text-lg font-bold tabular-nums">{value}</p>
            <p className="text-[11px] text-ink-3">{foot}</p>
          </div>
        ))}
      </section>

      {r.completed.length > 0 && (
        <section className="mt-6 break-inside-avoid">
          <h2 className="border-b border-ink pb-1 text-sm font-semibold">Dokončené zakázky</h2>
          <table className="mt-1 w-full text-[12px]">
            <thead className="text-left text-ink-3">
              <tr>
                <th className="py-1 font-medium">Zakázka</th>
                <th className="py-1 text-right font-medium">Tržby</th>
                <th className="py-1 text-right font-medium">Marže</th>
                <th className="py-1 text-right font-medium">Hodiny plán / skut.</th>
                <th className="py-1 text-right font-medium">Termín</th>
              </tr>
            </thead>
            <tbody>
              {[...r.completed]
                .sort((a, b) => b.marginPct - a.marginPct)
                .map((o) => (
                  <tr key={o.job.id} className="border-t border-line">
                    <td className="py-1">
                      {o.job.code} {o.job.title}, {o.job.client.name}
                    </td>
                    <td className="py-1 text-right tabular-nums">{fmt.czk(o.revenue)}</td>
                    <td className={`py-1 text-right tabular-nums ${o.margin < 0 ? 'text-crit-ink' : ''}`}>{fmt.pct(o.marginPct)}</td>
                    <td className="py-1 text-right tabular-nums">
                      {o.job.budget.laborHours} / {Math.round(o.job.actuals.laborHours)}
                    </td>
                    <td className="py-1 text-right">{o.onTime ? 'včas' : `+${o.daysLate} dní`}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-6 grid grid-cols-2 gap-6 break-inside-avoid">
        <div>
          <h2 className="border-b border-ink pb-1 text-sm font-semibold">Obchod</h2>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-[12px]">
            <dt>Nové poptávky</dt>
            <dd className="text-right tabular-nums">{r.newLeads}</dd>
            <dt>Odeslané nabídky</dt>
            <dd className="text-right tabular-nums">{r.quotesSent}</dd>
            <dt>Vyhrané nabídky</dt>
            <dd className="text-right tabular-nums">
              {r.quotesWon} za {fmt.czk(r.quotesWonValue)}
            </dd>
            <dt>Rozpracované zakázky</dt>
            <dd className="text-right tabular-nums">{r.activeJobs}</dd>
          </dl>
        </div>
        <div>
          <h2 className="border-b border-ink pb-1 text-sm font-semibold">Peníze a cíle</h2>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-[12px]">
            <dt>Neuhrazené faktury</dt>
            <dd className="text-right tabular-nums">{fmt.czk(r.receivables)}</dd>
            {g && (
              <>
                <dt>Tržby od začátku roku</dt>
                <dd className="text-right tabular-nums">
                  {fmt.czk(g.revenue)} z {fmt.czk(g.revenueTarget)}
                </dd>
                <dt>Odhad za celý rok</dt>
                <dd className="text-right tabular-nums">{fmt.czk(g.forecastRevenue)}</dd>
                <dt>Marže za rok</dt>
                <dd className="text-right tabular-nums">
                  {fmt.pct(g.marginPct)} (cíl {fmt.pct(g.goals.marginPct)})
                </dd>
              </>
            )}
          </dl>
        </div>
      </section>

      {r.worst.some((o) => o.marginPct < 0.15) && (
        <section className="mt-6 break-inside-avoid">
          <h2 className="border-b border-ink pb-1 text-sm font-semibold">Na co se zaměřit</h2>
          <ul className="mt-2 list-disc pl-5 text-[12px]">
            {r.worst
              .filter((o) => o.marginPct < 0.15)
              .map((o) => (
                <li key={o.job.id}>
                  {o.job.code} {o.job.title}: marže {fmt.pct(o.marginPct)}
                  {o.hoursRatio > 1.1 && `, práce o ${Math.round((o.hoursRatio - 1) * 100)} % déle než plán`}
                  {o.materialOverrun > 0 && `, materiál nad plán ${fmt.czk(o.materialOverrun)}`}.
                </li>
              ))}
          </ul>
        </section>
      )}
      <p className="mt-8 text-[11px] text-ink-3">Vygenerováno z aplikace {new Date().toLocaleString('cs-CZ')}. Částky bez DPH, pokud není uvedeno jinak.</p>
    </DocumentShell>
  );
}
