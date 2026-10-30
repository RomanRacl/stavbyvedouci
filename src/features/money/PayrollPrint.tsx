'use client';

import { DocumentShell } from '@/components/print/DocumentShell';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { monthLabel, payroll } from '@/lib/money';

const h = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });

/** Mzdové podklady za měsíc (A4) pro mzdovou účetní. */
export default function PayrollPrint({ month }: { month: string }) {
  const snap = useSnapshot();
  if (!snap) return null;
  const rows = payroll(month, snap.timeLogs, snap.members, snap.dayReports);
  const jobName = (id: string) => {
    const j = snap.jobs.find((x) => x.id === id);
    return j ? `${j.code} ${j.title}` : 'smazaná zakázka';
  };

  return (
    <DocumentShell settings={snap.settings} kind="Mzdové podklady" number={monthLabel(month)}>
      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-b border-ink text-left text-xs">
            <th className="py-2 pr-2 font-semibold">Pracovník</th>
            <th className="py-2 pr-2 text-right font-semibold">Dny</th>
            <th className="py-2 pr-2 text-right font-semibold">Hodiny</th>
            <th className="py-2 pr-2 text-right font-semibold">Přestávky</th>
            <th className="py-2 text-right font-semibold">Potvrzené dny</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.member.uid} className="border-b border-line align-top">
              <td className="py-1.5 pr-2">
                <span className="font-semibold">{r.member.displayName}</span>
                {r.byJob.length > 0 && (
                  <span className="block text-xs text-ink-2">{r.byJob.map((b) => `${jobName(b.jobId)}: ${h(b.hours)} h`).join('; ')}</span>
                )}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{r.days}</td>
              <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{h(r.hours)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{h(r.breakHours)}</td>
              <td className="py-1.5 text-right tabular-nums">
                {r.confirmedDays} z {r.days}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-2 font-semibold">Celkem</td>
            <td className="pt-2 text-right tabular-nums">{rows.reduce((a, r) => a + r.days, 0)}</td>
            <td className="pt-2 text-right font-bold tabular-nums">{h(rows.reduce((a, r) => a + r.hours, 0))}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      <p className="mt-6 text-xs text-ink-2">
        Hodiny jsou čistý odpracovaný čas změřený v mobilní aplikaci, bez přestávek. „Potvrzené dny“ = dny, kdy pracovník potvrdil denní výkaz.
      </p>
      <footer className="mt-16 flex justify-end">
        <div className="w-64 border-t border-ink pt-1 text-center text-xs">Schválil, {snap.settings.name}</div>
      </footer>
    </DocumentShell>
  );
}
