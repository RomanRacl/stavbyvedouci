'use client';

import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { InfoTip } from '@/components/ui/InfoTip';
import { fmt } from '@/features/analytics/lib/metrics';
import type { PeriodStat } from '@/types/firestore';
import { chart } from '../chartTheme';

interface Row {
  label: string;
  revenue: number;
  cost: number;
}

interface TooltipPayload {
  active?: boolean;
  label?: string;
  payload?: Array<{ payload: Row }>;
}

/** Tooltip u crosshairu: obě série + dopočtená marže, text v inkoustových barvách. */
function ChartTooltip({ active, payload, label }: TooltipPayload) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const margin = row.revenue - row.cost;
  return (
    <div className="min-w-48 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm shadow-xl shadow-ink/10">
      <p className="mb-1.5 font-medium text-ink">{label === undefined ? '' : `${label.replace('. t.', '.')} týden`}</p>
      <dl className="space-y-1 tabular-nums">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-3 rounded-full" style={{ background: chart.revenue }} />
          <dt className="text-ink-2">Tržby</dt>
          <dd className="ml-auto font-medium text-ink">{fmt.czk(row.revenue)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-3 rounded-full" style={{ background: chart.cost }} />
          <dt className="text-ink-2">Náklady</dt>
          <dd className="ml-auto font-medium text-ink">{fmt.czk(row.cost)}</dd>
        </div>
        <div className="flex items-center gap-2 border-t border-line pt-1">
          <span className="w-3" />
          <dt className="text-ink-2">Marže</dt>
          <dd className="ml-auto font-medium text-ink">
            {fmt.czk(margin)} <span className="text-ink-3">({fmt.pct(margin / row.revenue)})</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Přímý popisek jen u posledního bodu – identita série nezávisí jen na barvě. */
function EndLabel(name: string, count: number) {
  return function Label(props: { x?: number | string; y?: number | string; index?: number }) {
    if (props.index !== count - 1) return null;
    return (
      <text x={Number(props.x) + 10} y={Number(props.y)} dy={4} fontSize={chart.font} fill="#4a5561">
        {name}
      </text>
    );
  };
}

export function RevenueCostChart({ stats }: { stats: PeriodStat[] }) {
  const [showTable, setShowTable] = useState(false);
  const data: Row[] = useMemo(
    () => stats.map((s) => ({ label: s.label, revenue: s.revenue, cost: s.laborCost + s.materialCost })),
    [stats],
  );

  return (
    <motion.section
      aria-labelledby="rev-cost-title"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-line bg-surface p-5"
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 id="rev-cost-title" className="flex items-center gap-1 text-base font-semibold text-ink">
          Tržby a náklady po týdnech
          <InfoTip>
            Data z předagregovaných týdenních statistik. Rozevírající se nůžky = rostoucí marže; sbíhající se
            čáry = náklady rostou rychleji než tržby.
          </InfoTip>
        </h2>
        <ul className="flex items-center gap-4 text-sm text-ink-2" aria-label="Legenda">
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: chart.revenue }} /> Tržby
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: chart.cost }} /> Náklady
          </li>
        </ul>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="ml-auto text-sm text-series-1-ink underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {showTable ? 'Zobrazit graf' : 'Zobrazit tabulku'}
        </button>
      </header>

      {showTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-surface text-left text-ink-3">
              <tr>
                <th className="py-1.5 font-medium">Týden</th>
                <th className="py-1.5 text-right font-medium">Tržby</th>
                <th className="py-1.5 text-right font-medium">Náklady</th>
                <th className="py-1.5 text-right font-medium">Marže</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              {data.map((r) => (
                <tr key={r.label}>
                  <td className="py-1.5">{r.label}</td>
                  <td className="py-1.5 text-right">{fmt.czk(r.revenue)}</td>
                  <td className="py-1.5 text-right">{fmt.czk(r.cost)}</td>
                  <td className="py-1.5 text-right">{fmt.pct((r.revenue - r.cost) / r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72" role="img" aria-label="Spojnicový graf tržeb a nákladů po týdnech">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 64, bottom: 0, left: 4 }}>
              <CartesianGrid vertical={false} stroke={chart.grid} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: chart.grid }}
                tick={{ fill: chart.axis, fontSize: chart.font }}
                tickMargin={8}
              />
              <YAxis
                tickFormatter={fmt.czkShort}
                tickLine={false}
                axisLine={false}
                tick={{ fill: chart.axis, fontSize: chart.font }}
                width={56}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: chart.axis, strokeWidth: 1, strokeDasharray: '3 3' }}
                wrapperStyle={{ outline: 'none' }}
              />
              {(
                [
                  ['revenue', 'Tržby', chart.revenue],
                  ['cost', 'Náklady', chart.cost],
                ] as const
              ).map(([key, name, color]) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={name}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, stroke: chart.surface, strokeWidth: 2, fill: color }}
                  isAnimationActive
                  animationDuration={chart.motion.duration}
                  animationEasing={chart.motion.easing}
                >
                  <LabelList dataKey={key} content={EndLabel(name, data.length)} />
                </Line>
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.section>
  );
}
