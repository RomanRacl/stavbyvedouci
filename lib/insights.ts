import type { CompanySettings, Goals, Job, Lead, Member, Quote, TimeLog } from '@/types/firestore';
import { completed, isDone, outcome, type JobOutcome } from './analytics';
import { clientKey } from './operations';
import { invoiceBasis, monthKey, overheadMonthly, paymentsOf, quoteTotals } from './money';
import { winStats } from './sales';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/* ---------- ziskovost podle zákazníka ---------- */

export interface ClientProfit {
  key: string;
  name: string;
  jobs: number;
  revenue: number;
  margin: number;
  marginPct: number;
  hours: number;
  /** Marže na hodinu práce – kdo vydělává a kdo jen bere čas. */
  marginPerHour: number;
  claims: number;
}

export function profitByClient(outcomes: JobOutcome[], allJobs: Job[]): ClientProfit[] {
  const map = new Map<string, JobOutcome[]>();
  for (const o of outcomes) {
    const k = clientKey(o.job.client.name);
    map.set(k, [...(map.get(k) ?? []), o]);
  }
  return [...map]
    .map(([key, os]) => {
      const revenue = sum(os.map((o) => o.revenue));
      const margin = sum(os.map((o) => o.margin));
      const hours = sum(os.map((o) => o.job.actuals.laborHours));
      const ids = new Set(os.map((o) => o.job.id));
      return {
        key,
        name: os[0].job.client.name,
        jobs: os.length,
        revenue,
        margin,
        marginPct: revenue ? margin / revenue : 0,
        hours,
        marginPerHour: hours ? margin / hours : 0,
        claims: allJobs.filter((j) => j.claimOf && ids.has(j.claimOf)).length,
      };
    })
    .sort((a, b) => b.margin - a.margin);
}

/* ---------- vývoj pracovníků v čase ---------- */

export interface WorkerTrend {
  uid: string;
  name: string;
  months: Array<{ month: string; efficiency: number | null; jobs: number }>;
  /** Změna efektivity poslední 3 měsíce proti předchozím 3 (procentní body). */
  delta: number | null;
}

export function workerTrend(outcomes: JobOutcome[], members: Member[], months: string[]): WorkerTrend[] {
  return members
    .filter((m) => m.role !== 'owner')
    .map((m) => {
      const mine = outcomes.filter((o) => o.job.assignedWorkerIds.includes(m.uid));
      const row = months.map((month) => {
        const os = mine.filter((o) => monthKey(o.finishedAt) === month);
        const planned = sum(os.map((o) => o.job.budget.laborHours));
        const actual = sum(os.map((o) => o.job.actuals.laborHours));
        return { month, efficiency: actual ? planned / actual : null, jobs: os.length };
      });
      const eff = (xs: typeof row) => {
        const v = xs.filter((x) => x.efficiency !== null);
        return v.length ? sum(v.map((x) => x.efficiency!)) / v.length : null;
      };
      const recent = eff(row.slice(-3));
      const before = eff(row.slice(-6, -3));
      return { uid: m.uid, name: m.displayName, months: row, delta: recent !== null && before !== null ? recent - before : null };
    })
    .filter((t) => t.months.some((x) => x.jobs > 0));
}

/* ---------- scénáře „co kdyby“ ---------- */

export interface WhatIfInput {
  /** Navýšení hodinové sazby pro zákazníka (Kč/h). */
  rateDelta: number;
  /** Navýšení přirážky na materiál (procentní body). */
  markupDelta: number;
  /** Počet nových montérů. */
  newWorkers: number;
  /** Změna měsíční režie (Kč). */
  overheadDelta: number;
  /** Kolik zakázek odejde kvůli zdražení (0–1). */
  churn: number;
}

export interface WhatIfResult {
  base: { revenue: number; cost: number; overhead: number; profit: number };
  scenario: { revenue: number; cost: number; overhead: number; profit: number };
  levers: Array<{ label: string; amount: number }>;
}

/**
 * Roční dopad změn na zisk podle dokončených zakázek za posledních 12 měsíců.
 * Nový montér: 150 h měsíčně s vytížením 75 %, každá hodina přinese průměrnou
 * marži na hodinu, náklad = průměrná nákladová sazba × 168 h.
 */
export function whatIf(outcomes: JobOutcome[], members: Member[], s: CompanySettings, input: WhatIfInput): WhatIfResult {
  const revenue = sum(outcomes.map((o) => o.revenue));
  const cost = sum(outcomes.map((o) => o.cost));
  const material = sum(outcomes.map((o) => o.job.actuals.materialCost));
  const billedHours = sum(outcomes.map((o) => o.job.budget.laborHours));
  const hours = sum(outcomes.map((o) => o.job.actuals.laborHours));
  const overhead = overheadMonthly(s) * 12;
  const base = { revenue, cost, overhead, profit: revenue - cost - overhead };

  const keep = 1 - Math.min(0.9, Math.max(0, input.churn));
  const rate = billedHours * input.rateDelta;
  const markup = (material * input.markupDelta) / 100;
  const workers = members.filter((m) => m.role !== 'owner');
  const avgCost = workers.length ? sum(workers.map((m) => m.hourlyCost)) / workers.length : 380;
  // Nový montér: tržba za jeho hodiny průměrem firmy, náklad = materiál k těm hodinám + celá mzda (i nevytížené hodiny).
  const newHours = input.newWorkers * 150 * 12 * 0.75;
  const revPerHour = hours ? revenue / hours : 0;
  const nonLaborPerHour = hours ? (cost - sum(outcomes.map((o) => o.job.actuals.laborCost))) / hours : 0;
  const workerGain = Math.round(newHours * revPerHour);
  const workerCost = Math.round(newHours * nonLaborPerHour + input.newWorkers * avgCost * 168 * 12);
  const newWorkerNet = workerGain - workerCost;

  const scRevenue = Math.round((revenue + rate + markup) * keep + workerGain);
  const scCost = Math.round(cost * keep + workerCost);
  const scOverhead = overhead + input.overheadDelta * 12;
  const scenario = { revenue: scRevenue, cost: scCost, overhead: scOverhead, profit: scRevenue - scCost - scOverhead };

  const levers = [
    { label: `Sazba ${input.rateDelta >= 0 ? '+' : ''}${input.rateDelta} Kč/h`, amount: Math.round(rate * keep) },
    { label: `Přirážka na materiál ${input.markupDelta >= 0 ? '+' : ''}${input.markupDelta} p. b.`, amount: Math.round(markup * keep) },
    { label: `Ztráta ${Math.round(input.churn * 100)} % zakázek`, amount: -Math.round((revenue - cost) * (1 - keep)) },
    { label: input.newWorkers === 1 ? '1 nový montér' : `${input.newWorkers} noví montéři`, amount: newWorkerNet },
    { label: 'Změna režie', amount: -input.overheadDelta * 12 },
  ].filter((l) => l.amount !== 0);
  return { base, scenario, levers };
}

/* ---------- cíle ---------- */

export interface GoalProgress {
  goals: Goals;
  revenue: number;
  revenueTarget: number;
  /** Kde by měly tržby být k dnešku při rovnoměrném plnění. */
  revenueExpected: number;
  marginPct: number;
  winRate: number | null;
  forecastRevenue: number;
}

export function goalProgress(jobs: Job[], quotes: Quote[], leads: Lead[], goals: Goals, now = new Date()): GoalProgress {
  const yearDone = jobs.filter((j) => isDone(j) && !j.claimOf && (j.invoice?.taxDate ?? j.approval?.approvedAt ?? j.updatedAt).getFullYear() === goals.year);
  const os = yearDone.map(outcome);
  const revenue = sum(os.map((o) => o.revenue));
  const margin = sum(os.map((o) => o.margin));
  const start = new Date(goals.year, 0, 1).getTime();
  const end = new Date(goals.year + 1, 0, 1).getTime();
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
  return {
    goals,
    revenue,
    revenueTarget: goals.revenue,
    revenueExpected: Math.round(goals.revenue * elapsed),
    marginPct: revenue ? margin / revenue : 0,
    winRate: winStats(quotes, leads).winRate,
    forecastRevenue: elapsed > 0.05 ? Math.round(revenue / elapsed) : revenue,
  };
}

/* ---------- měsíční report ---------- */

export interface MonthReport {
  month: string;
  invoicedNet: number;
  invoices: number;
  cashIn: number;
  completed: JobOutcome[];
  margin: number;
  marginPct: number;
  hours: number;
  efficiency: number;
  onTimeShare: number;
  best: JobOutcome[];
  worst: JobOutcome[];
  quotesSent: number;
  quotesWon: number;
  quotesWonValue: number;
  newLeads: number;
  receivables: number;
  activeJobs: number;
  overhead: number;
  profitAfterOverhead: number;
}

export function monthReport(month: string, data: { jobs: Job[]; quotes: Quote[]; leads: Lead[]; timeLogs: TimeLog[]; settings: CompanySettings }): MonthReport {
  const { jobs, quotes, leads, settings } = data;
  const inMonth = (d: Date | null | undefined) => Boolean(d && monthKey(d) === month);
  const invoiced = jobs.filter((j) => inMonth(j.invoice?.issuedAt));
  const done = completed(jobs, 24).filter((o) => inMonth(o.finishedAt) && !o.job.claimOf);
  const margin = sum(done.map((o) => o.margin));
  const revenue = sum(done.map((o) => o.revenue));
  const planned = sum(done.map((o) => o.job.budget.laborHours));
  const hours = sum(data.timeLogs.filter((l) => l.endedAt && inMonth(l.startedAt)).map((l) => (l.durationMin ?? 0) / 60));
  const actual = sum(done.map((o) => o.job.actuals.laborHours));
  const sorted = [...done].sort((a, b) => b.marginPct - a.marginPct);
  const sent = quotes.filter((q) => inMonth(q.sentAt));
  const won = quotes.filter((q) => q.status === 'accepted' && inMonth(q.decidedAt));
  const receivables = sum(
    jobs.flatMap((j) => {
      const paidAll = j.invoice ? invoiceBasis(j, settings).toPay : 0;
      return j.invoice && !j.invoice.paidAt ? [Math.max(0, paidAll)] : [];
    }),
  );
  const overhead = overheadMonthly(settings);
  return {
    month,
    invoicedNet: sum(invoiced.map((j) => invoiceBasis(j, settings).net)),
    invoices: invoiced.length,
    cashIn: sum(jobs.flatMap((j) => paymentsOf(j).filter((p) => inMonth(p.paidAt)).map((p) => p.amount))),
    completed: done,
    margin,
    marginPct: revenue ? margin / revenue : 0,
    hours,
    efficiency: actual ? planned / actual : 1,
    onTimeShare: done.length ? done.filter((o) => o.onTime).length / done.length : 0,
    best: sorted.slice(0, 3),
    worst: sorted.length > 3 ? sorted.slice(-3).reverse() : [],
    quotesSent: sent.length,
    quotesWon: won.length,
    quotesWonValue: sum(won.map((q) => quoteTotals(q).net)),
    newLeads: leads.filter((l) => inMonth(l.createdAt)).length,
    receivables,
    activeJobs: jobs.filter((j) => j.status === 'in_progress' || j.status === 'scheduled').length,
    overhead,
    profitAfterOverhead: margin - overhead,
  };
}
