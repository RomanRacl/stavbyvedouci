import type { Job, JobStatus, MaterialPlanLine, PeriodStat } from '@/types/firestore';

/** Čisté funkce – žádný React, žádný Firebase. Snadno testovatelné (Vitest). */

const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

export interface JobFinancials {
  revenue: number;
  costToDate: number;
  budgetCost: number;
  /** Odhad nákladů při dokončení (EAC) = náklady / dokončenost. */
  forecastCost: number;
  forecastMargin: number;
  forecastMarginPct: number;
  budgetMarginPct: number;
  /** >1 = parta je rychlejší než rozpočet (vydělané hodiny / skutečné hodiny). */
  laborEfficiency: number;
  costBurnPct: number;
}

export function jobFinancials(job: Job): JobFinancials {
  const { budget, actuals } = job;
  const progress = Math.max(job.progressPct, 0) / 100;
  const costToDate = actuals.laborCost + actuals.materialCost;
  const budgetCost = budget.laborCost + budget.materialCost;

  // Pod 10 % dokončenosti je extrapolace šum -> držíme se rozpočtu.
  const forecastCost = progress >= 0.1 ? Math.round(costToDate / progress) : Math.max(budgetCost, costToDate);
  const forecastMargin = budget.revenue - forecastCost;

  return {
    revenue: budget.revenue,
    costToDate,
    budgetCost,
    forecastCost,
    forecastMargin,
    forecastMarginPct: safeDiv(forecastMargin, budget.revenue),
    budgetMarginPct: safeDiv(budget.revenue - budgetCost, budget.revenue),
    laborEfficiency: safeDiv(budget.laborHours * progress, actuals.laborHours),
    costBurnPct: safeDiv(costToDate, budgetCost),
  };
}

export type MaterialRisk = 'ok' | 'watch' | 'overrun';

export interface MaterialForecast extends MaterialPlanLine {
  projectedQty: number;
  overrunQty: number;
  overrunCost: number;
  remainingToBuy: number;
  risk: MaterialRisk;
}

/** Predikce spotřeby: lineární extrapolace čerpání vůči dokončenosti zakázky. */
export function forecastMaterial(line: MaterialPlanLine, progressPct: number): MaterialForecast {
  const progress = progressPct / 100;
  const projectedQty =
    progress >= 0.15 && progress < 1 ? Math.ceil(line.usedQty / progress) : Math.max(line.plannedQty, line.usedQty);
  const overrunQty = Math.max(0, projectedQty - line.plannedQty);
  const ratio = safeDiv(projectedQty, line.plannedQty);
  return {
    ...line,
    projectedQty,
    overrunQty,
    overrunCost: overrunQty * line.unitCost,
    remainingToBuy: Math.max(0, projectedQty - line.usedQty),
    // Materiál mimo plán (plán 0) je vždy překročení.
    risk: line.plannedQty === 0 && projectedQty > 0 ? 'overrun' : ratio > 1.08 ? 'overrun' : ratio > 1.0 ? 'watch' : 'ok',
  };
}

export interface CompanyKpis {
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  hours: number;
  revenueDeltaPct: number;
  marginPctDelta: number; // procentní body
  hoursDeltaPct: number;
  awaitingApproval: number;
  awaitingApprovalValue: number;
}

/** KPI za posledních `window` týdnů vs. předchozí stejně dlouhé okno. */
export function companyKpis(stats: PeriodStat[], jobs: Job[], window = 4): CompanyKpis {
  const sum = (rows: PeriodStat[]) =>
    rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        cost: acc.cost + r.laborCost + r.materialCost,
        hours: acc.hours + r.hours,
      }),
      { revenue: 0, cost: 0, hours: 0 },
    );

  const cur = sum(stats.slice(-window));
  const prev = sum(stats.slice(-window * 2, -window));
  const marginPct = safeDiv(cur.revenue - cur.cost, cur.revenue);
  const prevMarginPct = safeDiv(prev.revenue - prev.cost, prev.revenue);
  const pending = jobs.filter((j) => j.status === 'awaiting_approval');

  return {
    revenue: cur.revenue,
    cost: cur.cost,
    margin: cur.revenue - cur.cost,
    marginPct,
    hours: cur.hours,
    revenueDeltaPct: safeDiv(cur.revenue - prev.revenue, prev.revenue),
    marginPctDelta: (marginPct - prevMarginPct) * 100,
    hoursDeltaPct: safeDiv(cur.hours - prev.hours, prev.hours),
    awaitingApproval: pending.length,
    awaitingApprovalValue: pending.reduce((a, j) => a + j.budget.revenue, 0),
  };
}

export const STATUS_META: Record<JobStatus, { label: string; tone: 'neutral' | 'info' | 'warn' | 'good' | 'muted' }> = {
  draft: { label: 'Koncept', tone: 'muted' },
  scheduled: { label: 'Naplánováno', tone: 'neutral' },
  in_progress: { label: 'Probíhá', tone: 'info' },
  awaiting_approval: { label: 'Ke schválení', tone: 'warn' },
  approved: { label: 'Schváleno', tone: 'good' },
  invoiced: { label: 'Fakturováno', tone: 'muted' },
};

const czk = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('cs-CZ', { style: 'percent', maximumFractionDigits: 1 });

export const fmt = {
  czk: (v: number) => czk.format(v),
  /** Kompaktní tvar pro osy grafu: 312 tis. */
  czkShort: (v: number) => (Math.abs(v) >= 1_000_000 ? `${num.format(v / 1_000_000)} mil.` : `${Math.round(v / 1000)} tis.`),
  num: (v: number) => num.format(v),
  pct: (v: number) => pct.format(v),
  signedPct: (v: number) => `${v > 0 ? '+' : ''}${pct.format(v)}`,
  date: (dt: Date) => dt.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
  dateTime: (dt: Date) =>
    dt.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }),
};
