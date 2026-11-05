'use client';

import { Pencil, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { btnPrimary, btnSecondary, inputCls } from '@/components/shell/PageHeader';
import { fmt } from '@/features/analytics/lib/metrics';
import { completed, type JobOutcome } from '@/lib/analytics';
import { goalProgress, profitByClient, whatIf, workerTrend, type WhatIfInput } from '@/lib/insights';
import { saveSettings, type Snapshot } from '@/lib/mock/localBackend';
import { monthKey } from '@/lib/money';
import { ChartCard } from './components/ChartCard';

/* ---------- cíle ---------- */

function Bar({ value, target, marker, label, right }: { value: number; target: number; marker?: number; label: string; right: string }) {
  const pct = target ? Math.min(1, value / target) : 0;
  const markPct = target && marker !== undefined ? Math.min(1, marker / target) : null;
  const behind = markPct !== null && pct < markPct - 0.03;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-2">{label}</span>
        <span className="font-medium text-ink tabular-nums">{right}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-line">
        <div className={`h-full rounded-full ${behind ? 'bg-warn' : 'bg-good'}`} style={{ width: `${pct * 100}%` }} />
        {markPct !== null && <span className="absolute -top-1 h-4.5 w-0.5 rounded bg-ink" style={{ left: `calc(${markPct * 100}% - 1px)` }} title="Kde byste měli být k dnešku" />}
      </div>
    </div>
  );
}

export function GoalsCard({ snap }: { snap: Snapshot }) {
  const goals = snap.settings.goals ?? { year: new Date().getFullYear(), revenue: 5_000_000, marginPct: 0.25, winRate: 0.5 };
  const g = useMemo(() => goalProgress(snap.jobs, snap.quotes, snap.leads, goals), [snap.jobs, snap.quotes, snap.leads, goals]);
  const [edit, setEdit] = useState<{ revenue: string; margin: string; win: string } | null>(null);
  const onTrack = g.revenue >= g.revenueExpected;

  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="goals-h">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h2 id="goals-h" className="mr-auto flex items-center gap-2 text-base font-semibold text-ink">
          <Target className="size-4" /> Cíle {goals.year}
        </h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${onTrack ? 'bg-good/12 text-good-ink' : 'bg-warn/12 text-warn-ink'}`}>
          {onTrack ? 'v plánu' : `za plánem o ${fmt.czk(g.revenueExpected - g.revenue)}`}
        </span>
        <button
          type="button"
          onClick={() => setEdit({ revenue: String(goals.revenue), margin: String(Math.round(goals.marginPct * 100)), win: String(Math.round((goals.winRate ?? 0.5) * 100)) })}
          className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-concrete hover:text-ink print:hidden"
          aria-label="Upravit cíle"
        >
          <Pencil className="size-4" />
        </button>
      </header>
      {edit ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-xs text-ink-2">
            Tržby za rok (Kč)
            <input inputMode="numeric" value={edit.revenue} onChange={(e) => setEdit({ ...edit, revenue: e.target.value.replace(/\D/g, '') })} className={`${inputCls} mt-1 text-right tabular-nums`} />
          </label>
          <label className="text-xs text-ink-2">
            Marže %
            <input inputMode="numeric" value={edit.margin} onChange={(e) => setEdit({ ...edit, margin: e.target.value.replace(/\D/g, '') })} className={`${inputCls} mt-1 text-right tabular-nums`} />
          </label>
          <label className="text-xs text-ink-2">
            Úspěšnost nabídek %
            <input inputMode="numeric" value={edit.win} onChange={(e) => setEdit({ ...edit, win: e.target.value.replace(/\D/g, '') })} className={`${inputCls} mt-1 text-right tabular-nums`} />
          </label>
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => setEdit(null)} className={btnSecondary}>
              Zrušit
            </button>
            <button
              type="button"
              onClick={() => {
                saveSettings({ goals: { year: goals.year, revenue: Number(edit.revenue) || 0, marginPct: (Number(edit.margin) || 0) / 100, winRate: (Number(edit.win) || 0) / 100 } });
                setEdit(null);
              }}
              className={btnPrimary}
            >
              Uložit
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          <div className="md:col-span-1">
            <Bar value={g.revenue} target={g.revenueTarget} marker={g.revenueExpected} label="Tržby z dokončených zakázek" right={`${fmt.czkShort(g.revenue)} z ${fmt.czkShort(g.revenueTarget)}`} />
            <p className="mt-1.5 text-xs text-ink-3">Tímto tempem za rok {fmt.czk(g.forecastRevenue)}. Svislá čárka ukazuje, kde byste měli být k dnešku.</p>
          </div>
          <div>
            <Bar value={g.marginPct} target={goals.marginPct} label="Hrubá marže" right={`${fmt.pct(g.marginPct)} z ${fmt.pct(goals.marginPct)}`} />
          </div>
          <div>
            <Bar value={g.winRate ?? 0} target={goals.winRate ?? 0.5} label="Úspěšnost nabídek" right={`${g.winRate === null ? '—' : fmt.pct(g.winRate)} z ${fmt.pct(goals.winRate ?? 0.5)}`} />
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- ziskovost zákazníků ---------- */

export function ClientProfitCard({ done, snap, months }: { done: JobOutcome[]; snap: Snapshot; months: number }) {
  const rows = useMemo(() => profitByClient(done, snap.jobs), [done, snap.jobs]);
  const [all, setAll] = useState(false);
  const shown = all ? rows : [...rows.slice(0, 4), ...(rows.length > 7 ? rows.slice(-3) : rows.slice(4))];
  return (
    <ChartCard
      title="Ziskovost podle zákazníka"
      help="Marže na hodinu práce ukazuje, kdo firmě opravdu vydělává a kdo jen zabírá čas. Nahoře nejlepší, dole nejhorší."
      csv={{ name: `zakaznici-${months}m`, rows: [['Zákazník', 'Zakázek', 'Tržby', 'Marže', 'Marže %', 'Marže/h', 'Reklamace'], ...rows.map((r) => [r.name, r.jobs, r.revenue, r.margin, Math.round(r.marginPct * 1000) / 10, Math.round(r.marginPerHour), r.claims])] }}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr className="border-b border-line">
              <th className="py-2 pr-2 font-medium">Zákazník</th>
              <th className="px-2 py-2 text-right font-medium">Zakázek</th>
              <th className="px-2 py-2 text-right font-medium">Tržby</th>
              <th className="px-2 py-2 text-right font-medium">Marže</th>
              <th className="py-2 pl-2 text-right font-medium">Na hodinu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => (
              <tr key={r.key}>
                <td className="py-2 pr-2">
                  {r.name}
                  {r.claims > 0 && <span className="ml-1.5 rounded bg-warn/12 px-1.5 text-xs text-warn-ink">{r.claims}× reklamace</span>}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{r.jobs}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt.czk(r.revenue)}</td>
                <td className={`px-2 py-2 text-right tabular-nums ${r.margin < 0 ? 'text-crit-ink' : ''}`}>{fmt.pct(r.marginPct)}</td>
                <td className={`py-2 pl-2 text-right font-semibold tabular-nums ${r.marginPerHour < 100 ? 'text-warn-ink' : ''}`}>{fmt.czk(r.marginPerHour)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 7 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-sm font-medium text-series-1-ink underline-offset-4 hover:underline">
          {all ? 'Jen nejlepší a nejhorší' : `Zobrazit všech ${rows.length}`}
        </button>
      )}
    </ChartCard>
  );
}

/* ---------- vývoj pracovníků ---------- */

export function WorkerTrendCard({ snap }: { snap: Snapshot }) {
  const months = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - 5 + i);
        return monthKey(d);
      }),
    [],
  );
  const rows = useMemo(() => workerTrend(completed12(snap), snap.members, months), [snap, months]);
  const label = (m: string) => new Date(`${m}-15`).toLocaleDateString('cs-CZ', { month: 'short' });
  return (
    <ChartCard title="Vývoj efektivity pracovníků" help="Plánované ÷ skutečné hodiny na zakázkách dokončených v daném měsíci. Nad 100 % = rychlejší než plán. Změna porovnává poslední 3 měsíce s předchozími.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr className="border-b border-line">
              <th className="py-2 pr-2 font-medium">Pracovník</th>
              {months.map((m) => (
                <th key={m} className="px-1 py-2 text-right font-medium capitalize">
                  {label(m)}
                </th>
              ))}
              <th className="py-2 pl-2 text-right font-medium">Změna</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.uid}>
                <td className="py-2 pr-2">{r.name}</td>
                {r.months.map((m) => (
                  <td key={m.month} className={`px-1 py-2 text-right tabular-nums ${m.efficiency === null ? 'text-ink-3' : m.efficiency >= 1 ? 'text-good-ink' : m.efficiency < 0.85 ? 'text-crit-ink' : 'text-ink'}`}>
                    {m.efficiency === null ? '—' : `${Math.round(m.efficiency * 100)} %`}
                  </td>
                ))}
                <td className="py-2 pl-2 text-right font-medium tabular-nums">
                  {r.delta === null ? '—' : <span className={r.delta >= 0 ? 'text-good-ink' : 'text-crit-ink'}>{`${r.delta >= 0 ? '+' : '−'}${Math.abs(Math.round(r.delta * 100))} p. b.`}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

const completed12 = (snap: Snapshot) => completed(snap.jobs, 7);

/* ---------- co kdyby ---------- */

const SLIDERS: Array<{ key: keyof WhatIfInput; label: string; min: number; max: number; step: number; fmt: (v: number) => string }> = [
  { key: 'rateDelta', label: 'Hodinová sazba', min: -100, max: 200, step: 10, fmt: (v) => `${v >= 0 ? '+' : ''}${v} Kč/h` },
  { key: 'markupDelta', label: 'Přirážka na materiál', min: -10, max: 20, step: 1, fmt: (v) => `${v >= 0 ? '+' : ''}${v} p. b.` },
  { key: 'churn', label: 'Odejde zákazníků kvůli ceně', min: 0, max: 0.3, step: 0.01, fmt: (v) => `${Math.round(v * 100)} %` },
  { key: 'newWorkers', label: 'Noví montéři', min: 0, max: 3, step: 1, fmt: (v) => `${v}` },
  { key: 'overheadDelta', label: 'Měsíční režie', min: -30000, max: 60000, step: 5000, fmt: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('cs-CZ')} Kč` },
];

export function WhatIfCard({ snap }: { snap: Snapshot }) {
  const [input, setInput] = useState<WhatIfInput>({ rateDelta: 50, markupDelta: 0, newWorkers: 0, overheadDelta: 0, churn: 0.05 });
  const done = useMemo(() => completed(snap.jobs, 12), [snap.jobs]);
  const r = useMemo(() => whatIf(done, snap.members, snap.settings, input), [done, snap.members, snap.settings, input]);
  const diff = r.scenario.profit - r.base.profit;
  const maxAbs = Math.max(1, ...r.levers.map((l) => Math.abs(l.amount)));

  return (
    <ChartCard title="Co kdyby…" help="Roční dopad změn na zisk po režii, spočítaný z dokončených zakázek za posledních 12 měsíců. Nový montér: 150 h měsíčně s vytížením 75 %.">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {SLIDERS.map((s) => (
            <label key={s.key} className="block">
              <span className="flex items-baseline justify-between text-sm">
                <span className="text-ink-2">{s.label}</span>
                <span className="font-medium text-ink tabular-nums">{s.fmt(input[s.key])}</span>
              </span>
              <input type="range" min={s.min} max={s.max} step={s.step} value={input[s.key]} onChange={(e) => setInput({ ...input, [s.key]: Number(e.target.value) })} className="mt-1 w-full accent-ink" />
            </label>
          ))}
        </div>
        <div>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-concrete/60 p-3">
              <dt className="text-sm text-ink-2">Zisk dnes (za rok)</dt>
              <dd className="font-display text-xl font-semibold tabular-nums">{fmt.czk(r.base.profit)}</dd>
            </div>
            <div className="rounded-lg bg-concrete/60 p-3">
              <dt className="text-sm text-ink-2">Zisk ve scénáři</dt>
              <dd className="font-display text-xl font-semibold tabular-nums">{fmt.czk(r.scenario.profit)}</dd>
              <dd className={`text-sm font-medium tabular-nums ${diff >= 0 ? 'text-good-ink' : 'text-crit-ink'}`}>
                {diff >= 0 ? '+' : '−'}
                {fmt.czk(Math.abs(diff))}
              </dd>
            </div>
          </dl>
          <ul className="mt-4 space-y-2">
            {r.levers.map((l) => (
              <li key={l.label} className="grid grid-cols-[minmax(120px,1fr)_2fr_auto] items-center gap-2 text-sm">
                <span className="truncate text-ink-2">{l.label}</span>
                <span className="relative h-2 rounded-full bg-line">
                  <span className={`absolute top-0 h-2 rounded-full ${l.amount >= 0 ? 'left-1/2 bg-good' : 'right-1/2 bg-crit'}`} style={{ width: `${(Math.abs(l.amount) / maxAbs) * 50}%` }} />
                  <span className="absolute top-[-2px] left-1/2 h-3 w-px bg-ink-3" />
                </span>
                <span className={`w-24 text-right font-medium tabular-nums ${l.amount >= 0 ? 'text-good-ink' : 'text-crit-ink'}`}>
                  {l.amount >= 0 ? '+' : '−'}
                  {fmt.czkShort(Math.abs(l.amount))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-3">Orientační model. Nezahrnuje sezónnost ani to, že nový montér se první měsíce zaučuje.</p>
        </div>
      </div>
    </ChartCard>
  );
}
