'use client';

import { useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmt } from '@/features/analytics/lib/metrics';
import { chart } from '@/features/dashboard/chartTheme';
import type { CapacityWeek, CashWeek, TradeRow } from '@/lib/analytics';
import { ChartCard, ChartTip, LegendDot } from './ChartCard';

const WARN = chart.warn; // stavová barva „pozor“ – jen pro přetížené týdny
const axis = { tickLine: false, tick: { fill: chart.axis, fontSize: chart.font } } as const;

/** Vstup vlastního tooltipu – volně typovaný, aby seděl na TooltipProps z Recharts. */
interface TipIn {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}

/** Vykreslí tooltip jen pro aktivní bod a předá mu řádek dat grafu. */
function tip<T>(p: TipIn, render: (row: T) => ReactNode): ReactNode {
  const row = p.active ? p.payload?.[0]?.payload : undefined;
  return row ? render(row as T) : null;
}

/* ---------- Ziskovost podle oboru ---------- */

export function TradeChart({ rows, months }: { rows: TradeRow[]; months: number }) {
  const [table, setTable] = useState(false);
  const data = rows.map((r) => ({ ...r, pct: Math.round(r.marginPct * 1000) / 10 }));
  return (
    <ChartCard
      title="Ziskovost podle oboru"
      help="Hrubá marže dokončených zakázek (cena − skutečná práce − materiál), bez režie. Delší pruh = výnosnější obor."
      table={{ on: table, toggle: () => setTable((t) => !t) }}
      csv={{
        name: `ziskovost-obory-${months}m`,
        rows: [['Obor', 'Zakázek', 'Tržby', 'Marže Kč', 'Marže %', 'Marže na hodinu', 'Přetažení hodin %'], ...rows.map((r) => [r.label, r.jobs, r.revenue, Math.round(r.margin), Math.round(r.marginPct * 1000) / 10, Math.round(r.marginPerHour), Math.round(r.hoursOverrun * 100)])],
      }}
    >
      {table ? (
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-ink-2">
            <tr>
              <th className="py-1.5 font-medium">Obor</th>
              <th className="py-1.5 text-right font-medium">Zakázek</th>
              <th className="py-1.5 text-right font-medium">Marže</th>
              <th className="py-1.5 text-right font-medium">Na hodinu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.trade}>
                <td className="py-1.5 text-ink">{r.label}</td>
                <td className="py-1.5 text-right">{r.jobs}</td>
                <td className="py-1.5 text-right">
                  {fmt.czk(r.margin)} ({fmt.pct(r.marginPct)})
                </td>
                <td className="py-1.5 text-right">{fmt.czk(r.marginPerHour)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-64" role="img" aria-label={`Marže podle oboru: ${rows.map((r) => `${r.label} ${fmt.pct(r.marginPct)}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 56, top: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid horizontal={false} stroke={chart.grid} />
              <XAxis type="number" {...axis} axisLine={false} tickFormatter={(v: number) => `${v} %`} />
              <YAxis type="category" dataKey="label" {...axis} axisLine={false} width={150} tick={{ fill: chart.label, fontSize: 13 }} />
              <ReferenceLine x={0} stroke={chart.axis} />
              <Tooltip
                cursor={{ fill: 'color-mix(in oklab, var(--color-ink) 7%, transparent)' }}
                content={(p: TipIn) => tip<(typeof data)[number]>(p, (row) => (
                    <ChartTip
                      title={row.label}
                      rows={[
                        { color: chart.revenue, label: 'Marže', value: `${fmt.czk(row.margin)} (${fmt.pct(row.marginPct)})`, strong: true },
                        { label: 'Na hodinu práce', value: fmt.czk(row.marginPerHour) },
                        { label: 'Zakázek', value: String(row.jobs) },
                      ]}
                    />
                  ))
                }
              />
              <Bar dataKey="pct" fill={chart.revenue} radius={[0, 4, 4, 0]} animationDuration={chart.motion.duration}>
                <LabelList dataKey="pct" position="right" formatter={(v: unknown) => `${String(v).replace('.', ',')} %`} style={{ fill: chart.label, fontSize: 12 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

/* ---------- Cash-flow ---------- */

export function CashflowChart({ weeks, startBalance, onBalance }: { weeks: CashWeek[]; startBalance: number; onBalance: (v: number) => void }) {
  const [table, setTable] = useState(false);
  const [draft, setDraft] = useState(String(startBalance));
  const lowest = weeks.reduce((m, w) => (w.balance < m.balance ? w : m), weeks[0]);
  return (
    <ChartCard
      title="Cash-flow na 8 týdnů"
      help="Příjmy: nezaplacené zálohy a faktury podle splatnosti, zbytek rozpracovaných zakázek po dokončení + splatnost. Výdaje: režie, mzdy a materiál zbývající práce, otevřené objednávky. Je to odhad, ne účetnictví."
      table={{ on: table, toggle: () => setTable((t) => !t) }}
      csv={{ name: 'cashflow-8-tydnu', rows: [['Týden od', 'Příjmy', 'Výdaje', 'Rozdíl', 'Stav účtu'], ...weeks.map((w) => [w.label, w.income, w.expense, w.net, w.balance])] }}
      legend={
        <ul className="flex gap-4" aria-label="Legenda">
          <LegendDot color={chart.revenue} label="Příjmy" />
          <LegendDot color={chart.cost} label="Výdaje" />
        </ul>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <label className="text-sm text-ink-2">
          Stav účtu dnes
          <input
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d-]/g, ''))}
            onBlur={() => onBalance(Number(draft) || 0)}
            onKeyDown={(e) => e.key === 'Enter' && onBalance(Number(draft) || 0)}
            className="mt-1 block h-9 w-40 rounded-lg border border-line px-3 text-right text-ink tabular-nums focus:border-series-1 focus:outline-none"
          />
        </label>
        <p className="text-sm text-ink-2">
          Nejnižší stav <strong className={`tabular-nums ${lowest.balance < 0 ? 'text-crit-ink' : 'text-ink'}`}>{fmt.czk(lowest.balance)}</strong> v týdnu od {lowest.label}
          {lowest.balance < 0 && ', hrozí nedostatek peněz. Zvažte zálohy nebo posunutí nákupů.'}
        </p>
      </div>
      {table ? (
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-ink-2">
            <tr>
              <th className="py-1.5 font-medium">Týden od</th>
              <th className="py-1.5 text-right font-medium">Příjmy</th>
              <th className="py-1.5 text-right font-medium">Výdaje</th>
              <th className="py-1.5 text-right font-medium">Stav účtu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {weeks.map((w) => (
              <tr key={w.label}>
                <td className="py-1.5">{w.label}</td>
                <td className="py-1.5 text-right">{fmt.czk(w.income)}</td>
                <td className="py-1.5 text-right">{fmt.czk(w.expense)}</td>
                <td className={`py-1.5 text-right font-medium ${w.balance < 0 ? 'text-crit-ink' : ''}`}>{fmt.czk(w.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div className="h-56" role="img" aria-label="Sloupcový graf příjmů a výdajů po týdnech">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} barGap={2} barCategoryGap="24%" margin={{ left: 4, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} stroke={chart.grid} />
                <XAxis dataKey="label" {...axis} axisLine={{ stroke: chart.grid }} />
                <YAxis {...axis} axisLine={false} tickFormatter={fmt.czkShort} width={56} />
                <Tooltip
                  cursor={{ fill: 'color-mix(in oklab, var(--color-ink) 7%, transparent)' }}
                  content={(p: TipIn) => tip<CashWeek>(p, (row) => (
                      <ChartTip
                        title={`Týden od ${row.label}`}
                        rows={[
                          { color: chart.revenue, label: 'Příjmy', value: fmt.czk(row.income) },
                          { color: chart.cost, label: 'Výdaje', value: fmt.czk(row.expense) },
                          { label: 'Stav účtu po týdnu', value: fmt.czk(row.balance), strong: true },
                        ]}
                      />
                    ))
                  }
                />
                <Bar dataKey="income" fill={chart.revenue} radius={[4, 4, 0, 0]} animationDuration={chart.motion.duration} />
                <Bar dataKey="expense" fill={chart.cost} radius={[4, 4, 0, 0]} animationDuration={chart.motion.duration} animationBegin={120} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-5 mb-1 text-sm font-medium text-ink">Stav účtu</p>
          <div className="h-32" role="img" aria-label={`Odhad stavu účtu, na konci ${fmt.czk(weeks.at(-1)?.balance ?? 0)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeks} margin={{ left: 4, right: 8, top: 6 }}>
                <CartesianGrid vertical={false} stroke={chart.grid} />
                <XAxis dataKey="label" {...axis} axisLine={{ stroke: chart.grid }} />
                <YAxis {...axis} axisLine={false} tickFormatter={fmt.czkShort} width={56} />
                <ReferenceLine y={0} stroke={chart.crit} strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ stroke: chart.axis, strokeDasharray: '3 3' }}
                  content={(p: TipIn) => tip<CashWeek>(p, (row) => <ChartTip title={`Po týdnu od ${row.label}`} rows={[{ color: chart.label, label: 'Stav účtu', value: fmt.czk(row.balance), strong: true }]} />)
                  }
                />
                <Line type="monotone" dataKey="balance" stroke={chart.label} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} animationDuration={chart.motion.duration} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </ChartCard>
  );
}

/* ---------- Kapacity ---------- */

export function CapacityChart({ weeks }: { weeks: CapacityWeek[] }) {
  const [table, setTable] = useState(false);
  const overCount = weeks.filter((w) => w.over).length;
  const free = weeks.slice(0, 4).reduce((a, w) => a + Math.max(0, w.capacity - w.planned), 0);
  return (
    <ChartCard
      title="Vytížení na 8 týdnů"
      help="Zbývající hodiny naplánovaných a rozpracovaných zakázek rozložené do pracovních dní do termínu. Kapacita = odpracovatelné hodiny z Nastavení režie."
      table={{ on: table, toggle: () => setTable((t) => !t) }}
      csv={{ name: 'vytizeni-8-tydnu', rows: [['Týden od', 'Naplánováno h', 'Kapacita h'], ...weeks.map((w) => [w.label, w.planned, w.capacity])] }}
      legend={
        <ul className="flex gap-4" aria-label="Legenda">
          <LegendDot color={chart.revenue} label="Naplánováno" />
          <LegendDot color={WARN} label="Nad kapacitu" />
          <LegendDot color={chart.axis} label="Kapacita" line />
        </ul>
      }
    >
      <p className="mb-3 text-sm text-ink-2">
        V příštích 4 týdnech je volných <strong className="text-ink tabular-nums">{fmt.num(Math.round(free))} h</strong>
        {overCount > 0 && <>, {overCount} {overCount === 1 ? 'týden je' : 'týdny jsou'} přetížené</>}.
      </p>
      {table ? (
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-ink-2">
            <tr>
              <th className="py-1.5 font-medium">Týden od</th>
              <th className="py-1.5 text-right font-medium">Naplánováno</th>
              <th className="py-1.5 text-right font-medium">Kapacita</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {weeks.map((w) => (
              <tr key={w.label}>
                <td className="py-1.5">{w.label}</td>
                <td className={`py-1.5 text-right ${w.over ? 'font-semibold text-warn-ink' : ''}`}>{w.planned} h</td>
                <td className="py-1.5 text-right">{w.capacity} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-56" role="img" aria-label="Sloupcový graf naplánovaných hodin proti kapacitě">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks} barCategoryGap="28%" margin={{ left: 4, right: 8, top: 16 }}>
              <CartesianGrid vertical={false} stroke={chart.grid} />
              <XAxis dataKey="label" {...axis} axisLine={{ stroke: chart.grid }} />
              <YAxis {...axis} axisLine={false} width={44} tickFormatter={(v: number) => `${v} h`} />
              <ReferenceLine y={weeks[0]?.capacity} stroke={chart.axis} strokeDasharray="5 4" label={{ value: 'kapacita', position: 'insideTopRight', fill: chart.axis, fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: 'color-mix(in oklab, var(--color-ink) 7%, transparent)' }}
                content={(p: TipIn) => tip<CapacityWeek>(p, (row) => (
                    <ChartTip
                      title={`Týden od ${row.label}`}
                      rows={[
                        { color: row.over ? WARN : chart.revenue, label: 'Naplánováno', value: `${row.planned} h`, strong: true },
                        { label: 'Kapacita', value: `${row.capacity} h` },
                        { label: row.over ? 'Chybí' : 'Volno', value: `${Math.abs(row.capacity - row.planned)} h` },
                      ]}
                    />
                  ))
                }
              />
              <Bar dataKey="planned" radius={[4, 4, 0, 0]} animationDuration={chart.motion.duration}>
                {weeks.map((w) => (
                  <Cell key={w.label} fill={w.over ? WARN : chart.revenue} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
