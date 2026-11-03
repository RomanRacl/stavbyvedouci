'use client';

import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { AlertOctagon, AlertTriangle, Copy, Mail, Newspaper, Printer, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { btnPrimary, btnSecondary, PageHeader } from '@/components/shell/PageHeader';
import { Drawer } from '@/components/ui/Drawer';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { fmt } from '@/features/analytics/lib/metrics';
import { allAlerts, byCrew, byTrade, byWorker, capacity, cashflow, completed, weeklySummary, type JobAlert, type PeopleRow } from '@/lib/analytics';
import { saveSettings } from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { ChartCard } from './components/ChartCard';
import { CapacityChart, CashflowChart, TradeChart } from './components/Charts';

const PERIODS = [3, 6, 12] as const;

/** Analytika: kde firma vydělává, kdo pracuje efektivně, co hoří a kolik bude peněz a práce. */
export default function AnalyticsPage() {
  const snap = useSnapshot();
  const [months, setMonths] = useState<number>(6);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const a = useMemo(() => {
    if (!snap) return null;
    const done = completed(snap.jobs, months);
    return {
      done,
      trades: byTrade(done),
      crews: byCrew(done, snap.members),
      workers: byWorker(done, snap.members),
      alerts: allAlerts(snap.jobs),
      cap: capacity(snap.jobs, snap.settings),
      cash: cashflow(snap.jobs, snap.orders, snap.settings, snap.settings.cashBalance ?? 0),
    };
  }, [snap, months]);

  if (!snap || !a) return <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" />;

  const revenue = a.done.reduce((s, o) => s + o.revenue, 0);
  const margin = a.done.reduce((s, o) => s + o.margin, 0);
  const onTime = a.done.length ? a.done.filter((o) => o.onTime).length / a.done.length : 0;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Analytika"
        description="Dokončené zakázky ukazují, kde firma vydělává a kdo pracuje efektivně. Rozpracované zakázky ukazují, co hoří a kolik bude práce a peněz."
        actions={
          <>
            <LayoutGroup id="period">
              <div role="radiogroup" aria-label="Období" className="flex rounded-lg border border-line bg-surface p-1 print:hidden">
                {PERIODS.map((p) => (
                  <button key={p} role="radio" aria-checked={months === p} onClick={() => setMonths(p)} className={`relative rounded-md px-3 py-1.5 text-sm ${months === p ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}>
                    {months === p && <motion.span layoutId="an-period" className="absolute inset-0 rounded-md bg-concrete" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                    <span className="relative">{p} měs.</span>
                  </button>
                ))}
              </div>
            </LayoutGroup>
            <button type="button" onClick={() => setSummaryOpen(true)} className={`${btnSecondary} print:hidden`}>
              <Newspaper className="size-4" /> Týdenní souhrn
            </button>
            <button type="button" onClick={() => window.print()} className={`${btnSecondary} print:hidden`}>
              <Printer className="size-4" /> Tisk / PDF
            </button>
          </>
        }
      />

      {/* Shrnutí období */}
      <section className="mb-5 grid grid-cols-2 divide-line rounded-xl border border-line bg-surface lg:grid-cols-4 lg:divide-x max-lg:divide-y" aria-label="Shrnutí období">
        {[
          ['Dokončeno zakázek', String(a.done.length), `za ${months} měsíců`],
          ['Tržby', fmt.czk(revenue), 'bez DPH'],
          ['Hrubá marže', fmt.pct(revenue ? margin / revenue : 0), fmt.czk(margin)],
          ['Včas předáno', fmt.pct(onTime), 'do termínu z plánu'],
        ].map(([label, value, foot]) => (
          <div key={label} className="px-5 py-4">
            <p className="text-sm text-ink-2">{label}</p>
            <p className="font-display text-[1.75rem] leading-tight font-semibold text-ink tabular-nums">{value}</p>
            <p className="text-xs text-ink-3">{foot}</p>
          </div>
        ))}
      </section>

      <div className="space-y-5">
        <AlertsCard alerts={a.alerts} />

        <div className="grid gap-5 xl:grid-cols-2">
          <TradeChart rows={a.trades} months={months} />
          <EstimatesCard rows={a.trades} />
        </div>

        <PeopleCard crews={a.crews} workers={a.workers} months={months} />

        <div className="grid gap-5 xl:grid-cols-2">
          <CashflowChart
            weeks={a.cash}
            startBalance={snap.settings.cashBalance ?? 0}
            onBalance={(v) => v !== (snap.settings.cashBalance ?? 0) && saveSettings({ cashBalance: v })}
          />
          <CapacityChart weeks={a.cap} />
        </div>
      </div>

      <SummaryDrawer open={summaryOpen} onClose={() => setSummaryOpen(false)} text={weeklySummary(snap)} email={snap.settings.email} onCopied={() => setToast({ text: 'Souhrn zkopírován.', tone: 'success', id: Date.now() })} />
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}

/* ---------- Varování ---------- */

function AlertsCard({ alerts }: { alerts: JobAlert[] }) {
  const byJob = new Map<string, JobAlert[]>();
  for (const al of alerts) byJob.set(al.job.id, [...(byJob.get(al.job.id) ?? []), al]);
  return (
    <ChartCard
      title={alerts.length ? `Potřebuje pozornost (${byJob.size})` : 'Potřebuje pozornost'}
      help="Rozpracované zakázky, které míří do ztráty, čerpají rozpočet rychleji než postupují, nestíhají termín nebo mají dlužné platby."
      csv={{ name: 'varovani', rows: [['Zakázka', 'Závažnost', 'Problém'], ...alerts.map((x) => [`${x.job.code} ${x.job.title}`, x.level === 'critical' ? 'kritické' : 'pozor', x.text])] }}
    >
      {byJob.size === 0 ? (
        <p className="flex items-center gap-2 text-sm text-good-ink">
          <ThumbsUp className="size-4" /> Všechny rozpracované zakázky jdou podle plánu.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {[...byJob].map(([id, list]) => {
              const critical = list.some((x) => x.level === 'critical');
              const job = list[0].job;
              return (
                <motion.li key={id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`rounded-lg border p-3 ${critical ? 'border-crit/40 bg-crit/5' : 'border-warn/40 bg-warn/5'}`}>
                  <Link href={`/dashboard?job=${id}`} className="flex items-start gap-2 hover:underline">
                    {critical ? <AlertOctagon className="mt-0.5 size-4 shrink-0 text-crit-ink" aria-label="Kritické" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn-ink" aria-label="Pozor" />}
                    <span className="font-medium text-ink">
                      {job.code} {job.title}
                    </span>
                  </Link>
                  <ul className="mt-1.5 space-y-1 pl-6 text-sm text-ink-2">
                    {list.map((x) => (
                      <li key={x.code}>{x.text}</li>
                    ))}
                  </ul>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </ChartCard>
  );
}

/* ---------- Odhady z historie ---------- */

function EstimatesCard({ rows }: { rows: ReturnType<typeof byTrade> }) {
  return (
    <ChartCard
      title="Jak přesně odhadujete hodiny"
      help="Medián poměru skutečných a plánovaných hodin u dokončených zakázek. Podle toho aplikace při zakládání nové zakázky navrhne realistický počet hodin."
      csv={{ name: 'odhady-hodin', rows: [['Obor', 'Zakázek', 'Odchylka hodin %'], ...rows.map((r) => [r.label, r.jobs, Math.round(r.hoursOverrun * 100)])] }}
    >
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const pct = Math.round(r.hoursOverrun * 100);
          const off = Math.abs(pct) >= 10;
          const width = Math.min(50, Math.abs(pct) * 1.5);
          return (
            <li key={r.trade} className="flex items-center gap-4 py-2.5">
              <span className="w-44 shrink-0 text-sm text-ink">{r.label}</span>
              {/* Odchylka od plánu: vlevo rychleji, vpravo déle než plán */}
              <span className="relative h-2 flex-1 rounded-full bg-concrete" aria-hidden>
                <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink-3" />
                <span
                  className={`absolute inset-y-0 rounded-full ${off ? 'bg-ink' : 'bg-ink-3'}`}
                  style={pct >= 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }}
                />
              </span>
              <span className={`w-48 shrink-0 text-right text-sm tabular-nums ${off ? 'font-medium text-ink' : 'text-ink-2'}`}>
                {pct === 0 ? 'přesně podle plánu' : pct > 0 ? `o ${pct} % déle než plán` : `o ${-pct} % rychleji`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-3">Rozdíl pod 10 % je v normě. Větší odchylku zohledněte v cenách nabídek; nová zakázka vám ji připomene.</p>
    </ChartCard>
  );
}

/* ---------- Party a lidé ---------- */

function PeopleCard({ crews, workers, months }: { crews: PeopleRow[]; workers: PeopleRow[]; months: number }) {
  const [mode, setMode] = useState<'crews' | 'workers'>('crews');
  const rows = mode === 'crews' ? crews : workers;
  return (
    <ChartCard
      title="Srovnání part a pracovníků"
      help="Efektivita = plánované hodiny ÷ skutečně odpracované. 100 % = přesně podle plánu, víc = rychleji. Pracovník se počítá u všech zakázek, na kterých byl."
      csv={{
        name: `srovnani-${mode === 'crews' ? 'part' : 'pracovniku'}-${months}m`,
        rows: [['Kdo', 'Zakázek', 'Hodin', 'Efektivita %', 'Včas %', 'Marže %', 'Materiál nad plán %'], ...rows.map((r) => [r.label, r.jobs, Math.round(r.hours), Math.round(r.efficiency * 100), Math.round(r.onTimeShare * 100), Math.round(r.marginPct * 100), Math.round(r.materialOverrunShare * 100)])],
      }}
      legend={
        <LayoutGroup id="people-mode">
          <div role="radiogroup" aria-label="Zobrazit" className="flex rounded-lg bg-concrete p-0.5">
            {(
              [
                ['crews', 'Party'],
                ['workers', 'Jednotlivci'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={`relative rounded-md px-3 py-1 text-sm ${mode === id ? 'text-ink' : 'text-ink-2'}`}>
                {mode === id && <motion.span layoutId="people-pill" className="absolute inset-0 rounded-md bg-surface shadow-sm" />}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm tabular-nums">
          <thead className="text-left text-xs text-ink-2">
            <tr className="border-b border-line">
              <th className="py-2 font-medium">{mode === 'crews' ? 'Parta' : 'Pracovník'}</th>
              <th className="py-2 text-right font-medium">Zakázek</th>
              <th className="py-2 text-right font-medium">Hodin</th>
              <th className="py-2 pl-6 font-medium">Efektivita</th>
              <th className="py-2 text-right font-medium">Včas</th>
              <th className="py-2 text-right font-medium">Marže</th>
              <th className="py-2 text-right font-medium">Materiál nad plán</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const eff = Math.round(r.efficiency * 100);
              const delta = eff - 100;
              return (
                <tr key={r.key}>
                  <td className="py-2.5 font-medium text-ink">{r.label}</td>
                  <td className="py-2.5 text-right">{r.jobs}</td>
                  <td className="py-2.5 text-right">{fmt.num(Math.round(r.hours))}</td>
                  <td className="py-2.5 pl-6">
                    <span className="flex items-center gap-3">
                      <span className="relative h-2 w-32 rounded-full bg-concrete" aria-hidden>
                        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink-3" />
                        <span
                          className={`absolute inset-y-0 rounded-full ${delta >= 0 ? 'bg-good' : 'bg-crit'}`}
                          style={delta >= 0 ? { left: '50%', width: `${Math.min(50, delta * 2)}%` } : { right: '50%', width: `${Math.min(50, -delta * 2)}%` }}
                        />
                      </span>
                      <span className={`font-semibold ${delta < -5 ? 'text-crit-ink' : delta > 5 ? 'text-good-ink' : 'text-ink'}`}>{eff} %</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-right">{fmt.pct(r.onTimeShare)}</td>
                  <td className="py-2.5 text-right">{fmt.pct(r.marginPct)}</td>
                  <td className={`py-2.5 text-right ${r.materialOverrunShare > 0.05 ? 'text-warn-ink' : ''}`}>{fmt.pct(r.materialOverrunShare)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">Nízká efektivita nemusí znamenat pomalou partu: často jde o podhodnocený plán nebo obtížný typ zakázky. Porovnávejte party na stejném oboru.</p>
    </ChartCard>
  );
}

/* ---------- Týdenní souhrn ---------- */

function SummaryDrawer({ open, onClose, text, email, onCopied }: { open: boolean; onClose: () => void; text: string; email: string; onCopied: () => void }) {
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(text.split('\n')[0])}&body=${encodeURIComponent(text)}`;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Týdenní souhrn"
      subtitle="Posledních 7 dní v kostce"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-xs text-ink-3">Automatické odeslání každé pondělí zapojíme s Firebase (fáze 6).</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(text).then(onCopied);
            }}
            className={btnSecondary}
          >
            <Copy className="size-4" /> Kopírovat
          </button>
          <a href={mailto} className={btnPrimary}>
            <Mail className="size-4" /> Poslat e-mailem
          </a>
        </div>
      }
    >
      <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink">{text}</pre>
      {!email && <p className="mt-4 text-sm text-ink-2">Tip: doplňte e-mail firmy v Nastavení, souhrn se pak předvyplní jako adresát.</p>}
    </Drawer>
  );
}
