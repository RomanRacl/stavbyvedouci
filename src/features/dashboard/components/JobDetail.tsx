'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Check, Loader2, MapPin, Package, Phone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';
import { InfoTip } from '@/components/ui/InfoTip';
import { StatusPill } from '@/components/ui/StatusPill';
import { fmt, forecastMaterial, jobFinancials, type MaterialForecast } from '@/features/analytics/lib/metrics';
import type { Job, Member } from '@/types/firestore';
import { chart } from '../chartTheme';

interface Props {
  job: Job;
  members: Member[];
  approving: boolean;
  onApprove: () => void;
  onOpenMaterials: () => void;
  onBack: () => void;
}

const TRADE_LABEL: Record<Job['trade'], string> = {
  electro: 'Elektro',
  plumbing: 'Voda a topení',
  windows: 'Okna a dveře',
  construction: 'Stavba',
  hvac: 'Vzduchotechnika a TČ',
};

const RISK_TEXT = { ok: 'V plánu', watch: 'Na hraně', overrun: 'Překročení' } as const;

export function RiskBadge({ risk }: { risk: MaterialForecast['risk'] }) {
  const cls = {
    ok: 'bg-good/12 text-good-ink',
    watch: 'bg-warn/12 text-warn-ink',
    overrun: 'bg-crit/12 text-crit-ink',
  }[risk];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {risk === 'ok' ? <Check className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
      {RISK_TEXT[risk]}
    </span>
  );
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Metric({ label, value, help, tone }: { label: string; value: string; help: string; tone?: 'crit' | 'good' }) {
  const toneCls = tone === 'crit' ? 'text-crit-ink' : tone === 'good' ? 'text-good-ink' : 'text-ink';
  return (
    <div>
      <dt className="flex items-center gap-1 text-sm text-ink-2">
        {label}
        <InfoTip>{help}</InfoTip>
      </dt>
      <dd className={`mt-0.5 font-display text-xl font-semibold tabular-nums ${toneCls}`}>{value}</dd>
    </div>
  );
}

export function JobDetail({ job, members, approving, onApprove, onOpenMaterials, onBack }: Props) {
  const f = jobFinancials(job);
  const now = useNow();
  const crew = members.filter((m) => job.assignedWorkerIds.includes(m.uid));
  const materials = useMemo(
    () => job.materialPlan.map((l) => forecastMaterial(l, job.progressPct)).sort((a, b) => b.overrunCost - a.overrunCost),
    [job.materialPlan, job.progressPct],
  );
  const overrunTotal = materials.reduce((a, m) => a + m.overrunCost, 0);

  const budgetRows = [
    { name: 'Práce', budget: job.budget.laborCost, spent: job.actuals.laborCost },
    { name: 'Materiál', budget: job.budget.materialCost, spent: job.actuals.materialCost },
  ];

  const isApproved = job.status === 'approved';
  const canApprove = job.status === 'awaiting_approval' || isApproved;

  return (
    <motion.article
      key={job.id}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full flex-col"
      aria-labelledby={`job-title-${job.id}`}
    >
      {/* Hlavička */}
      <header className="border-b border-line px-6 pt-5 pb-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink lg:hidden"
        >
          <ArrowLeft className="size-4" /> Zpět na zakázky
        </button>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <span className="font-display font-semibold tabular-nums">{job.code}</span>
              <span aria-hidden className="h-3 w-px bg-line" />
              {TRADE_LABEL[job.trade]}
            </div>
            <h2 id={`job-title-${job.id}`} className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
              {job.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
              <StatusPill status={job.status} />
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {job.client.address}
              </span>
              <a href={`tel:${job.client.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 hover:text-ink">
                <Phone className="size-3.5" aria-hidden /> {job.client.name}
              </a>
            </div>
          </div>

          {canApprove && (
            <motion.button
              type="button"
              onClick={onApprove}
              disabled={isApproved}
              whileTap={{ scale: 0.96 }}
              layout
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:outline-none ${
                isApproved ? 'bg-good/12 text-good-ink' : 'bg-ink text-white hover:bg-ink/90'
              }`}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {isApproved ? (
                  <motion.span
                    key="done"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-flex items-center gap-2"
                  >
                    {approving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Schváleno
                  </motion.span>
                ) : (
                  <motion.span key="idle" exit={{ opacity: 0, y: -6 }} className="inline-flex items-center gap-2">
                    <Check className="size-4" /> Schválit zakázku
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {/* Finanční souhrn */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Metric label="Cena zakázky" value={fmt.czk(f.revenue)} help="Cena pro zákazníka bez DPH podle nabídky." />
          <Metric
            label="Prognóza nákladů"
            value={fmt.czk(f.forecastCost)}
            help="Dosavadní náklady přepočtené na 100 % dokončení (EAC). Pod 10 % dokončenosti platí rozpočet."
          />
          <Metric
            label="Prognóza marže"
            value={fmt.pct(f.forecastMarginPct)}
            tone={f.forecastMarginPct < 0 ? 'crit' : f.forecastMarginPct >= f.budgetMarginPct ? 'good' : undefined}
            help={`Plánovaná marže byla ${fmt.pct(f.budgetMarginPct)}. Zelená = lepší než plán, červená = ztráta.`}
          />
          <Metric
            label="Efektivita práce"
            value={job.actuals.laborHours ? fmt.pct(f.laborEfficiency) : '—'}
            tone={f.laborEfficiency && f.laborEfficiency < 0.9 ? 'crit' : undefined}
            help="Rozpočtované hodiny pro aktuální dokončenost ÷ skutečně odpracované hodiny. Nad 100 % parta šetří čas."
          />
        </dl>

        {/* Rozpočet vs. čerpání */}
        <section aria-labelledby={`budget-${job.id}`}>
          <div className="mb-2 flex items-center gap-4">
            <h3 id={`budget-${job.id}`} className="text-sm font-semibold text-ink">
              Rozpočet a čerpání
            </h3>
            <ul className="flex gap-3 text-xs text-ink-2" aria-label="Legenda">
              <li className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: chart.budget }} /> Rozpočet
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: chart.spent }} /> Čerpáno
              </li>
            </ul>
            <span className="ml-auto text-sm text-ink-2 tabular-nums">dokončeno {job.progressPct} %</span>
          </div>
          <div className="h-32" role="img" aria-label={`Práce čerpáno ${fmt.czk(job.actuals.laborCost)} z ${fmt.czk(job.budget.laborCost)}, materiál ${fmt.czk(job.actuals.materialCost)} z ${fmt.czk(job.budget.materialCost)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetRows} layout="vertical" barGap={2} barCategoryGap="28%" margin={{ left: 0, right: 16 }}>
                <CartesianGrid horizontal={false} stroke={chart.grid} />
                <XAxis type="number" tickFormatter={fmt.czkShort} tickLine={false} axisLine={false} tick={{ fill: chart.axis, fontSize: chart.font }} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={64} tick={{ fill: '#4a5561', fontSize: 13 }} />
                <Tooltip
                  cursor={{ fill: 'rgba(22,32,42,0.04)' }}
                  formatter={(v: number, n: string) => [fmt.czk(v), n === 'budget' ? 'Rozpočet' : 'Čerpáno']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #dde1e5', fontSize: 13 }}
                />
                <Bar dataKey="budget" fill={chart.budget} radius={[0, 4, 4, 0]} animationDuration={chart.motion.duration} />
                <Bar dataKey="spent" fill={chart.spent} radius={[0, 4, 4, 0]} animationDuration={chart.motion.duration} animationBegin={150} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Parta s živými časovači */}
        <section aria-labelledby={`crew-${job.id}`}>
          <h3 id={`crew-${job.id}`} className="mb-2 text-sm font-semibold text-ink">
            Parta na zakázce
          </h3>
          {crew.length === 0 && (
            <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-2">
              Na zakázku zatím není nikdo přiřazený.
            </p>
          )}
          <ul className="grid gap-2 sm:grid-cols-2">
            {crew.map((m) => {
              const running = m.activeTimer?.jobId === job.id ? m.activeTimer : null;
              const mins = running ? Math.max(0, Math.floor((now - running.startedAt.getTime()) / 60000)) : 0;
              return (
                <li key={m.uid} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
                  <span className="grid size-9 place-items-center rounded-full bg-concrete text-sm font-semibold text-ink-2">
                    {m.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{m.displayName}</span>
                    <span className="block text-xs text-ink-3">{fmt.czk(m.hourlyCost)}/h náklad</span>
                  </span>
                  {running ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-good-ink tabular-nums">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60 motion-reduce:hidden" />
                        <span className="relative inline-flex size-2 rounded-full bg-good" />
                      </span>
                      Na místě {Math.floor(mins / 60)} h {mins % 60} min
                    </span>
                  ) : (
                    <span className="text-xs text-ink-3">Neměří čas</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Materiál – Accordion s predikcí */}
        <section aria-labelledby={`mat-${job.id}`}>
          <div className="mb-2 flex items-center gap-2">
            <h3 id={`mat-${job.id}`} className="flex items-center gap-1 text-sm font-semibold text-ink">
              Materiál a predikce spotřeby
              <InfoTip>
                Spotřeba se extrapoluje podle dokončenosti zakázky. Překročení = predikce přesáhne plán o více než 8 %.
              </InfoTip>
            </h3>
            {overrunTotal > 0 && (
              <span className="text-sm text-crit-ink tabular-nums">+{fmt.czk(overrunTotal)} nad plán</span>
            )}
            <button
              type="button"
              onClick={onOpenMaterials}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-series-1-ink transition hover:bg-series-1/10 focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:outline-none"
            >
              <Package className="size-4" /> Výdeje materiálu
            </button>
          </div>
          {materials.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-2">
              Materiál zatím není naplánovaný. Výdeje se objeví, jakmile je parta zapíše v mobilu.
            </p>
          ) : (
          <Accordion>
            {materials.map((m) => {
              const usedPct = Math.min(100, (m.usedQty / Math.max(m.projectedQty, m.plannedQty)) * 100);
              const planPct = Math.min(100, (m.plannedQty / Math.max(m.projectedQty, m.plannedQty)) * 100);
              return (
                <AccordionItem
                  key={m.materialId}
                  id={m.materialId}
                  header={
                    <span className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{m.name}</span>
                      <span className="text-sm text-ink-2 tabular-nums">
                        {fmt.num(m.usedQty)} / {fmt.num(m.plannedQty)} {m.unit}
                      </span>
                      <RiskBadge risk={m.risk} />
                    </span>
                  }
                >
                  {/* Lišta: čerpáno (plné) | plán (ryska) | predikce (konec lišty) */}
                  <div className="relative mt-1 h-2 rounded-full bg-line" aria-hidden>
                    <div className="h-full rounded-full bg-ink-2" style={{ width: `${usedPct}%` }} />
                    <div className="absolute -top-1 h-4 w-0.5 rounded bg-ink" style={{ left: `calc(${planPct}% - 1px)` }} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-ink-3">Predikce celkem</dt>
                      <dd className="font-medium text-ink tabular-nums">{fmt.num(m.projectedQty)} {m.unit}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-3">Zbývá dokoupit</dt>
                      <dd className="font-medium text-ink tabular-nums">{fmt.num(m.remainingToBuy)} {m.unit}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-3">Jedn. cena</dt>
                      <dd className="font-medium text-ink tabular-nums">{fmt.czk(m.unitCost)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-3">Dopad na náklady</dt>
                      <dd className={`font-medium tabular-nums ${m.overrunCost > 0 ? 'text-crit-ink' : 'text-ink'}`}>
                        {m.overrunCost > 0 ? `+${fmt.czk(m.overrunCost)}` : 'žádný'}
                      </dd>
                    </div>
                  </dl>
                </AccordionItem>
              );
            })}
          </Accordion>
          )}
        </section>
      </div>
    </motion.article>
  );
}
