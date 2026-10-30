import type { CompanySettings, Job, Member, PurchaseOrder, Quote, Trade } from '@/types/firestore';
import { jobFinancials } from '@/features/analytics/lib/metrics';
import { extraWorkOf } from './jobDefaults';
import { invoiceBasis, jobVat, overheadMonthly, paymentsOf, quoteTotals, VAT_MODES } from './money';
import { TRADES } from './trades';

const DAY = 86_400_000;
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/* ---------- výsledky dokončených zakázek ---------- */

export interface JobOutcome {
  job: Job;
  finishedAt: Date;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  /** Plánované hodiny ÷ skutečné (>1 = rychlejší než plán). */
  efficiency: number;
  /** Skutečné hodiny ÷ plánované (pro odhady: 1.15 = o 15 % déle). */
  hoursRatio: number;
  /** Náklad materiálu nad plán v Kč (jen překročení). */
  materialOverrun: number;
  onTime: boolean;
  daysLate: number;
}

export const isDone = (j: Job) => (j.status === 'approved' || j.status === 'invoiced') && j.progressPct >= 100;

export function outcome(job: Job): JobOutcome {
  const cost = job.actuals.laborCost + job.actuals.materialCost;
  const finishedAt = job.handover?.signedAt ?? job.actuals.updatedAt;
  const daysLate = Math.round((finishedAt.getTime() - job.schedule.due.getTime()) / DAY);
  const overrun = sum(job.materialPlan.map((l) => Math.max(0, l.usedQty - l.plannedQty) * l.unitCost));
  return {
    job,
    finishedAt,
    revenue: job.budget.revenue,
    cost,
    margin: job.budget.revenue - cost,
    marginPct: job.budget.revenue ? (job.budget.revenue - cost) / job.budget.revenue : 0,
    efficiency: job.actuals.laborHours ? job.budget.laborHours / job.actuals.laborHours : 1,
    hoursRatio: job.budget.laborHours ? job.actuals.laborHours / job.budget.laborHours : 1,
    materialOverrun: overrun,
    onTime: daysLate <= 0,
    daysLate,
  };
}

/** Dokončené zakázky za posledních `months` měsíců. */
export function completed(jobs: Job[], months: number, now = Date.now()): JobOutcome[] {
  const from = now - months * 30.4 * DAY;
  return jobs
    .filter(isDone)
    .map(outcome)
    .filter((o) => o.finishedAt.getTime() >= from)
    .sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime());
}

/* ---------- ziskovost podle oboru ---------- */

export interface TradeRow {
  trade: Trade;
  label: string;
  jobs: number;
  revenue: number;
  margin: number;
  marginPct: number;
  /** Medián přetažení hodin (0.12 = o 12 % déle než plán). */
  hoursOverrun: number;
  marginPerHour: number;
}

export function byTrade(outcomes: JobOutcome[]): TradeRow[] {
  return TRADES.map(({ id, label }) => {
    const os = outcomes.filter((o) => o.job.trade === id);
    const revenue = sum(os.map((o) => o.revenue));
    const margin = sum(os.map((o) => o.margin));
    const hours = sum(os.map((o) => o.job.actuals.laborHours));
    return {
      trade: id,
      label,
      jobs: os.length,
      revenue,
      margin,
      marginPct: revenue ? margin / revenue : 0,
      hoursOverrun: os.length ? median(os.map((o) => o.hoursRatio)) - 1 : 0,
      marginPerHour: hours ? margin / hours : 0,
    };
  })
    .filter((r) => r.jobs > 0)
    .sort((a, b) => b.marginPct - a.marginPct);
}

/* ---------- srovnání pracovníků a part ---------- */

export interface PeopleRow {
  key: string;
  label: string;
  memberIds: string[];
  jobs: number;
  hours: number;
  /** Vážená efektivita: plánované hodiny ÷ skutečné. */
  efficiency: number;
  onTimeShare: number;
  marginPct: number;
  materialOverrunShare: number;
}

function peopleRow(key: string, label: string, ids: string[], os: JobOutcome[]): PeopleRow {
  const planned = sum(os.map((o) => o.job.budget.laborHours));
  const actual = sum(os.map((o) => o.job.actuals.laborHours));
  const revenue = sum(os.map((o) => o.revenue));
  const matBudget = sum(os.map((o) => o.job.budget.materialCost));
  return {
    key,
    label,
    memberIds: ids,
    jobs: os.length,
    hours: actual,
    efficiency: actual ? planned / actual : 1,
    onTimeShare: os.length ? os.filter((o) => o.onTime).length / os.length : 0,
    marginPct: revenue ? sum(os.map((o) => o.margin)) / revenue : 0,
    materialOverrunShare: matBudget ? sum(os.map((o) => o.materialOverrun)) / matBudget : 0,
  };
}

/** Podle jednotlivců: každý se počítá u všech zakázek, na kterých byl. */
export function byWorker(outcomes: JobOutcome[], members: Member[]): PeopleRow[] {
  return members
    .filter((m) => m.role !== 'owner')
    .map((m) => peopleRow(m.uid, m.displayName, [m.uid], outcomes.filter((o) => o.job.assignedWorkerIds.includes(m.uid))))
    .filter((r) => r.jobs > 0)
    .sort((a, b) => b.efficiency - a.efficiency);
}

/** Podle part: stejné složení lidí = jedna parta. */
export function byCrew(outcomes: JobOutcome[], members: Member[]): PeopleRow[] {
  const groups = new Map<string, JobOutcome[]>();
  for (const o of outcomes) {
    const key = [...o.job.assignedWorkerIds].sort().join('+');
    if (key) groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  const name = (uid: string) => members.find((m) => m.uid === uid)?.displayName.split(' ').at(-1) ?? '?';
  return [...groups]
    .map(([key, os]) => peopleRow(key, key.split('+').map(name).join(' + '), key.split('+'), os))
    .sort((a, b) => b.efficiency - a.efficiency);
}

/* ---------- odhad hodin z historie ---------- */

export interface HoursEstimate {
  ratio: number; // medián skutečné ÷ plánované
  basedOn: number; // počet zakázek
  suggested: number;
}

/**
 * Návrh realistického počtu hodin: plán × medián poměru skutečnost/plán u dokončených
 * zakázek stejného oboru. Pod 3 zakázkami historie nic nenavrhuje (malý vzorek).
 */
export function estimateHours(trade: Trade, plannedHours: number, jobs: Job[]): HoursEstimate | null {
  const os = jobs.filter((j) => isDone(j) && j.trade === trade && j.budget.laborHours > 0).map(outcome);
  if (os.length < 3 || plannedHours <= 0) return null;
  const ratio = median(os.map((o) => o.hoursRatio));
  return { ratio, basedOn: os.length, suggested: Math.round(plannedHours * ratio) };
}

/* ---------- včasné varování ---------- */

export type AlertLevel = 'critical' | 'warning';
export interface JobAlert {
  job: Job;
  level: AlertLevel;
  code: 'loss' | 'burn' | 'late' | 'slow' | 'material' | 'unpaid';
  text: string;
}

const czk = (n: number) => n.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });

/** Varování u rozpracovaných zakázek – dřív, než se problém projeví ve výsledku. */
export function jobAlerts(job: Job, now = Date.now()): JobAlert[] {
  const out: JobAlert[] = [];
  const active = job.status === 'in_progress' || job.status === 'scheduled';
  const f = jobFinancials(job);
  if (active && job.progressPct >= 10) {
    if (f.forecastMargin < 0) out.push({ job, level: 'critical', code: 'loss', text: `Míří do ztráty ${czk(-f.forecastMargin)} podle dosavadních nákladů.` });
    else if (f.forecastMarginPct < f.budgetMarginPct - 0.1)
      out.push({ job, level: 'warning', code: 'loss', text: `Marže klesá na ${Math.round(f.forecastMarginPct * 100)} % z plánovaných ${Math.round(f.budgetMarginPct * 100)} %.` });
    const burn = f.costBurnPct - job.progressPct / 100;
    if (burn > 0.15) out.push({ job, level: 'warning', code: 'burn', text: `Spotřebováno ${Math.round(f.costBurnPct * 100)} % rozpočtu při ${job.progressPct} % hotovo.` });
    if (job.actuals.laborHours > 8 && f.laborEfficiency < 0.8)
      out.push({ job, level: 'warning', code: 'slow', text: `Práce jde pomaleji než plán (efektivita ${Math.round(f.laborEfficiency * 100)} %).` });
  }
  if (active) {
    const daysLeft = (job.schedule.due.getTime() - now) / DAY;
    if (daysLeft < 0) out.push({ job, level: 'critical', code: 'late', text: `Termín uplynul před ${Math.ceil(-daysLeft)} dny, hotovo ${job.progressPct} %.` });
    else {
      const total = Math.max(1, (job.schedule.due.getTime() - job.schedule.start.getTime()) / DAY);
      const elapsed = Math.min(1, Math.max(0, (now - job.schedule.start.getTime()) / DAY / total));
      if (elapsed - job.progressPct / 100 > 0.25 && daysLeft < 7)
        out.push({ job, level: 'warning', code: 'late', text: `Do termínu zbývá ${Math.ceil(daysLeft)} dní a hotovo je jen ${job.progressPct} %.` });
    }
    const over = sum(job.materialPlan.map((l) => Math.max(0, l.usedQty - l.plannedQty) * l.unitCost));
    if (over > 0 && over > job.budget.materialCost * 0.1) out.push({ job, level: 'warning', code: 'material', text: `Materiál nad plán za ${czk(over)}.` });
  }
  const overdue = paymentsOf(job).filter((p) => !p.paidAt && p.dueDate.getTime() < now);
  if (overdue.length) {
    const amount = sum(overdue.map((p) => p.amount));
    const days = Math.max(...overdue.map((p) => Math.floor((now - p.dueDate.getTime()) / DAY)));
    out.push({ job, level: days > 14 ? 'critical' : 'warning', code: 'unpaid', text: `Zákazník dluží ${czk(amount)}, ${days} dní po splatnosti.` });
  }
  return out;
}

export function allAlerts(jobs: Job[], now = Date.now()): JobAlert[] {
  return jobs.flatMap((j) => jobAlerts(j, now)).sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1));
}

/* ---------- kapacity a cash-flow po týdnech ---------- */

export interface Week {
  start: Date;
  label: string;
}

/** Následujících `n` týdnů od pondělí tohoto týdne. */
export function nextWeeks(n: number, now = new Date()): Week[] {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: n }, (_, i) => {
    const start = new Date(monday.getTime() + i * 7 * DAY);
    return { start, label: `${start.getDate()}. ${start.getMonth() + 1}.` };
  });
}

const weekIndex = (weeks: Week[], d: Date) => {
  const i = Math.floor((d.getTime() - weeks[0].start.getTime()) / (7 * DAY));
  return i < 0 ? 0 : i; // co je po splatnosti, čekáme hned
};

/** Pracovní dny (po–pá) v intervalu. */
function workdays(from: Date, to: Date) {
  const days: Date[] = [];
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  while (d <= to) {
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Zbývající práce zakázky rozložená rovnoměrně do pracovních dní do termínu (po termínu do příštích 5 dní). */
function spread(job: Job, amount: number, weeks: Week[], now: Date, into: number[]) {
  if (amount <= 0) return;
  const from = new Date(Math.max(now.getTime(), job.schedule.start.getTime()));
  let to = job.schedule.due;
  if (to < from) to = new Date(from.getTime() + 6 * DAY);
  const days = workdays(from, to);
  if (!days.length) return;
  for (const d of days) {
    const i = weekIndex(weeks, d);
    if (i < into.length) into[i] += amount / days.length;
  }
}

const openJobs = (jobs: Job[]) => jobs.filter((j) => j.status === 'scheduled' || j.status === 'in_progress');

export interface CapacityWeek {
  label: string;
  planned: number;
  capacity: number;
  over: boolean;
}

export function capacity(jobs: Job[], s: CompanySettings, n = 8, now = new Date()): CapacityWeek[] {
  const weeks = nextWeeks(n, now);
  const planned = weeks.map(() => 0);
  for (const j of openJobs(jobs)) {
    const remaining = j.status === 'scheduled' ? j.budget.laborHours : Math.max(0, j.budget.laborHours * (1 - j.progressPct / 100));
    spread(j, remaining, weeks, now, planned);
  }
  const weekly = Math.round((s.capacityHours * 12) / 52);
  return weeks.map((w, i) => ({ label: w.label, planned: Math.round(planned[i]), capacity: weekly, over: planned[i] > weekly }));
}

export interface CashWeek {
  label: string;
  income: number;
  expense: number;
  net: number;
  balance: number;
}

/**
 * Odhad cash-flow na `n` týdnů (vše včetně DPH tam, kde ho platí zákazník):
 * příjmy = nezaplacené zálohy a faktury podle splatnosti + zbytek rozpracovaných zakázek
 * v termínu dokončení + splatnost; výdaje = režie, mzdy za zbývající práci, materiál
 * a otevřené objednávky. Přijaté nabídky se nepočítají, dokud z nich není zakázka.
 */
export function cashflow(jobs: Job[], orders: PurchaseOrder[], s: CompanySettings, startBalance: number, n = 8, now = new Date()): CashWeek[] {
  const weeks = nextWeeks(n, now);
  const income = weeks.map(() => 0);
  const expense = weeks.map(() => 0);
  const add = (arr: number[], d: Date, v: number) => {
    const i = weekIndex(weeks, d);
    if (i < arr.length) arr[i] += v;
  };

  for (const j of jobs) {
    for (const p of paymentsOf(j)) if (!p.paidAt) add(income, p.dueDate, p.amount);
    if (j.status === 'scheduled' || j.status === 'in_progress' || j.status === 'awaiting_approval' || j.status === 'approved') {
      const { gross } = invoiceBasis(j, s);
      const requested = sum(paymentsOf(j).map((p) => p.amount));
      const rest = gross - requested;
      const finish = new Date(Math.max(now.getTime(), j.schedule.due.getTime()) + (s.paymentDueDays + 3) * DAY);
      if (rest > 0) add(income, finish, rest);
    }
    if (j.status === 'scheduled' || j.status === 'in_progress') {
      const labor = Math.max(0, j.budget.laborCost - j.actuals.laborCost);
      const material = Math.max(0, j.budget.materialCost - j.actuals.materialCost);
      spread(j, labor + material, weeks, now, expense);
    }
  }
  for (const o of orders.filter((x) => x.status !== 'received')) {
    add(expense, new Date(now.getTime() + 7 * DAY), sum(o.lines.map((l) => l.qty * l.unitCost)) * 1.21);
  }
  const weeklyOverhead = (overheadMonthly(s) * 12) / 52;
  let balance = startBalance;
  return weeks.map((w, i) => {
    const exp = expense[i] + weeklyOverhead;
    const net = income[i] - exp;
    balance += net;
    return { label: w.label, income: Math.round(income[i]), expense: Math.round(exp), net: Math.round(net), balance: Math.round(balance) };
  });
}

/* ---------- týdenní souhrn ---------- */

export function weeklySummary(
  data: { jobs: Job[]; quotes: Quote[]; members: Member[]; timeLogs: { workerId: string; startedAt: Date; durationMin: number | null }[]; settings: CompanySettings },
  now = new Date(),
): string {
  const from = now.getTime() - 7 * DAY;
  const inWeek = (d: Date | null | undefined) => Boolean(d && d.getTime() >= from && d.getTime() <= now.getTime());
  const hours = sum(data.timeLogs.filter((l) => inWeek(l.startedAt)).map((l) => (l.durationMin ?? 0) / 60));
  const finished = data.jobs.filter((j) => inWeek(j.handover?.signedAt));
  const invoiced = data.jobs.filter((j) => inWeek(j.invoice?.issuedAt));
  const invoicedSum = sum(invoiced.map((j) => invoiceBasis(j, data.settings).net));
  const paid = sum(data.jobs.flatMap((j) => paymentsOf(j).filter((p) => inWeek(p.paidAt)).map((p) => p.amount)));
  const newQuotes = data.quotes.filter((q) => inWeek(q.createdAt));
  const accepted = data.quotes.filter((q) => q.status === 'accepted' && inWeek(q.decidedAt));
  const alerts = allAlerts(data.jobs, now.getTime());
  const extras = data.jobs.flatMap((j) => extraWorkOf(j).filter((e) => e.status === 'pending'));
  const h = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 });

  const lines = [
    `Týdenní souhrn ${data.settings.name}`,
    `${new Date(from).toLocaleDateString('cs-CZ')} až ${now.toLocaleDateString('cs-CZ')}`,
    '',
    `Odpracováno: ${h(hours)} h`,
    `Dokončeno zakázek: ${finished.length}${finished.length ? ` (${finished.map((j) => j.code).join(', ')})` : ''}`,
    `Vystaveno k fakturaci: ${czk(invoicedSum)} bez DPH`,
    `Přišlo od zákazníků: ${czk(paid)}`,
    `Nové nabídky: ${newQuotes.length} za ${czk(sum(newQuotes.map((q) => quoteTotals(q).net)))}, přijaté: ${accepted.length}`,
    '',
  ];
  if (alerts.length) {
    lines.push(`Potřebuje pozornost (${alerts.length}):`);
    for (const a of alerts.slice(0, 8)) lines.push(`- ${a.job.code} ${a.job.title}: ${a.text}`);
  } else lines.push('Žádná zakázka teď nepotřebuje zásah.');
  if (extras.length) lines.push('', `Čeká na schválení víceprací: ${extras.length}`);
  return lines.join('\n');
}

/* ---------- pomocné ---------- */

export const vatLabel = (j: Job, s: CompanySettings) => VAT_MODES[jobVat(j, s)].short;
