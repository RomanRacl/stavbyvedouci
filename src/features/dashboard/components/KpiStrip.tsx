'use client';

import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { fmt, type CompanyKpis } from '@/features/analytics/lib/metrics';
import { AnimatedNumber } from './AnimatedNumber';

function Delta({ value, unit = 'pct' }: { value: number; unit?: 'pct' | 'pp' }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const text = unit === 'pp' ? `${up ? '+' : ''}${fmt.num(value)} p. b.` : fmt.signedPct(value);
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-good-ink' : 'text-crit-ink'}`}>
      <Icon className="size-3.5" aria-hidden />
      {text}
    </span>
  );
}

function Kpi({ label, help, children, foot }: { label: string; help: string; children: ReactNode; foot: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-5 py-4">
      <div className="flex items-center gap-1 text-sm text-ink-2">
        {label}
        <InfoTip>{help}</InfoTip>
      </div>
      <div className="font-display text-[1.75rem] leading-none font-semibold tracking-tight text-ink tabular-nums">
        {children}
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-3">{foot}</div>
    </div>
  );
}

export function KpiStrip({ kpis, windowWeeks }: { kpis: CompanyKpis; windowWeeks: number }) {
  const vs = `vs. předchozích ${windowWeeks} t.`;
  return (
    <motion.section
      aria-label="Klíčové ukazatele"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="grid grid-cols-2 divide-line rounded-xl border border-line bg-surface max-lg:divide-y lg:grid-cols-5 lg:divide-x"
    >
      <Kpi label="Tržby" help="Součet fakturovatelných prací za zvolené období, bez DPH." foot={<><Delta value={kpis.revenueDeltaPct} />{vs}</>}>
        <AnimatedNumber value={kpis.revenue} format={fmt.czk} />
      </Kpi>
      <Kpi label="Náklady" help="Práce (odpracované hodiny × nákladová sazba dělníka) + spotřebovaný materiál." foot={<>práce + materiál</>}>
        <AnimatedNumber value={kpis.cost} format={fmt.czk} />
      </Kpi>
      <Kpi label="Hrubá marže" help="Tržby minus přímé náklady. Režie firmy zde není odečtena." foot={<><Delta value={kpis.marginPctDelta} unit="pp" />{fmt.pct(kpis.marginPct)}</>}>
        <AnimatedNumber value={kpis.margin} format={fmt.czk} />
      </Kpi>
      <Kpi label="Odpracováno" help="Hodiny změřené dělníky v mobilní aplikaci (start/stop na zakázce)." foot={<><Delta value={kpis.hoursDeltaPct} />{vs}</>}>
        <AnimatedNumber value={kpis.hours} format={(v) => `${fmt.num(Math.round(v))} h`} />
      </Kpi>
      <Kpi label="Ke schválení" help="Dokončené zakázky čekající na vaše schválení před fakturací." foot={<>v hodnotě {fmt.czk(kpis.awaitingApprovalValue)}</>}>
        <AnimatedNumber value={kpis.awaitingApproval} format={(v) => `${Math.round(v)}`} />
      </Kpi>
    </motion.section>
  );
}
