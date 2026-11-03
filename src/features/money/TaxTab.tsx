'use client';

import { InfoTip } from '@/components/ui/InfoTip';
import { fmt } from '@/features/analytics/lib/metrics';
import { taxEstimate } from '@/lib/finance';
import { saveSettings, type Snapshot } from '@/lib/mock/localBackend';
import { overheadMonthly } from '@/lib/money';

/** Orientační odhad daní a odvodů ze zisku zakázek, aby majitele nepřekvapilo daňové přiznání. */
export function TaxTab({ snap, say }: { snap: Snapshot; say: (t: string) => void }) {
  const s = snap.settings;
  const form = s.legalForm ?? 'sro';
  const est = taxEstimate(snap.jobs, s, overheadMonthly(s));
  const share = est.profitYear > 0 ? est.total / est.profitYear : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(320px,420px)]">
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-base font-semibold text-ink">Odhad za rok {est.year}</h2>
          <div className="flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Právní forma">
            {(
              [
                ['sro', 's.r.o.'],
                ['osvc', 'OSVČ'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={form === id}
                onClick={() => {
                  saveSettings({ legalForm: id });
                  say(`Odhad přepočten pro ${label}.`);
                }}
                className={`h-8 rounded-md px-3 text-sm ${form === id ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-ink-2">Tržby od 1. 1.</dt>
            <dd className="font-display text-xl font-semibold tabular-nums">{fmt.czk(est.revenueYtd)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-2">Náklady vč. režie</dt>
            <dd className="font-display text-xl font-semibold tabular-nums">{fmt.czk(est.costYtd)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-2">Zisk zatím</dt>
            <dd className={`font-display text-xl font-semibold tabular-nums ${est.profitYtd < 0 ? 'text-crit-ink' : ''}`}>{fmt.czk(est.profitYtd)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-sm text-ink-2">
              Zisk za celý rok
              <InfoTip>Dosavadní zisk přepočtený na 12 měsíců stejným tempem.</InfoTip>
            </dt>
            <dd className="font-display text-xl font-semibold tabular-nums">{fmt.czk(est.profitYear)}</dd>
          </div>
        </dl>

        <table className="mt-6 w-full text-sm">
          <tbody className="divide-y divide-line">
            {est.lines.map((l) => (
              <tr key={l.label}>
                <td className="py-2.5 pr-3">
                  <span className="block font-medium text-ink">{l.label}</span>
                  <span className="block text-xs text-ink-3">{l.hint}</span>
                </td>
                <td className="py-2.5 text-right font-semibold tabular-nums">{fmt.czk(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink">
              <td className="pt-2.5 font-semibold">Celkem daně a odvody</td>
              <td className="pt-2.5 text-right font-display text-lg font-bold tabular-nums">{fmt.czk(est.total)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <aside className="space-y-4">
        <section className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm text-ink-2">Odkládejte si měsíčně</p>
          <p className="font-display text-3xl font-bold text-ink tabular-nums">{fmt.czk(est.monthlyReserve)}</p>
          <p className="mt-1 text-sm text-ink-2">
            do konce roku, aby na daně a odvody bylo. To je {fmt.pct(share)} ze zisku.
          </p>
        </section>
        <p className="rounded-xl border border-warn/40 bg-warn/8 p-4 text-sm text-ink">
          Jde o orientační odhad z dat aplikace: tržby schválených a fakturovaných zakázek, náklady na práci, materiál, reklamace a režie. Nezahrnuje odpisy, ostatní příjmy, slevy na děti ani paušální výdaje. Skutečnou daň spočítá účetní.
        </p>
      </aside>
    </div>
  );
}
