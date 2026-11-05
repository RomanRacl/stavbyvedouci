import type { Absence, AbsenceKind, CompanySettings, Job, Member, MessageTemplate, Reservation, Subcontractor, TimeLog, Tool, ToolEvent, Trip } from '@/types/firestore';
import { monthKey } from './money';

const DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/* ---------- absence ---------- */

export const ABSENCE_KINDS: Record<AbsenceKind, { label: string; cls: string }> = {
  vacation: { label: 'Dovolená', cls: 'bg-series-1/12 text-series-1-ink' },
  sick: { label: 'Nemoc', cls: 'bg-crit/12 text-crit-ink' },
  doctor: { label: 'Lékař', cls: 'bg-warn/12 text-warn-ink' },
  other: { label: 'Volno', cls: 'bg-concrete text-ink-2' },
};

/** Pracovní dny (po–pá) v rozsahu absence, volitelně jen v daném měsíci (YYYY-MM). */
export function absenceWorkdays(a: Pick<Absence, 'from' | 'to'>, month?: string): number {
  let n = 0;
  for (let d = startOfDay(a.from); d <= startOfDay(a.to); d = new Date(d.getTime() + DAY)) {
    const wd = d.getDay();
    if (wd === 0 || wd === 6) continue;
    if (month && monthKey(d) !== month) continue;
    n++;
  }
  return n;
}

const overlaps = (aFrom: Date, aTo: Date, bFrom: Date, bTo: Date) => startOfDay(aFrom) <= startOfDay(bTo) && startOfDay(bFrom) <= startOfDay(aTo);

/** Kdo je v daný den pryč (schválená nebo čekající absence). */
export const absentOn = (absences: Absence[], uid: string, day: Date) =>
  absences.find((a) => a.uid === uid && a.status !== 'rejected' && overlaps(a.from, a.to, day, day)) ?? null;

export interface AbsenceConflict {
  absence: Absence;
  job: Job;
}

/** Zakázky, na které je přiřazen někdo, kdo má v jejich termínu volno. */
export function absenceConflicts(absences: Absence[], jobs: Job[]): AbsenceConflict[] {
  const out: AbsenceConflict[] = [];
  for (const a of absences.filter((x) => x.status !== 'rejected' && x.to.getTime() >= Date.now() - DAY)) {
    for (const j of jobs) {
      if (j.status !== 'scheduled' && j.status !== 'in_progress') continue;
      if (j.assignedWorkerIds.includes(a.uid) && overlaps(a.from, a.to, j.schedule.start, j.schedule.due)) out.push({ absence: a, job: j });
    }
  }
  return out;
}

/** Vyčerpaná dovolená v roce (pracovní dny). */
export const vacationUsed = (absences: Absence[], uid: string, year: number) =>
  absences.filter((a) => a.uid === uid && a.kind === 'vacation' && a.status === 'approved' && a.from.getFullYear() === year).reduce((n, a) => n + absenceWorkdays(a), 0);

/* ---------- odměny ---------- */

export const DEFAULT_BONUS_SHARE = 20;

export interface JobBonus {
  job: Job;
  savedHours: number;
  pool: number;
  /** Rozdělení podle odpracovaných hodin. */
  split: Array<{ uid: string; hours: number; amount: number }>;
  /** Proč odměna není (reklamace). */
  blocked: string | null;
}

/**
 * Odměna za zakázku hotovou pod rozpočtem hodin: (plán − skutečnost) × průměrný náklad hodiny
 * × podíl z Nastavení. Dělí se podle hodin na zakázce. Reklamace odměnu ruší.
 */
export function jobBonus(job: Job, s: CompanySettings, logs: TimeLog[], claims: Job[]): JobBonus | null {
  if (job.status !== 'approved' && job.status !== 'invoiced') return null;
  if (job.claimOf || job.actuals.laborHours <= 0) return null;
  const savedHours = round2(job.budget.laborHours - job.actuals.laborHours);
  if (savedHours < 1) return null;
  const share = (s.bonusSharePct ?? DEFAULT_BONUS_SHARE) / 100;
  const hourCost = job.actuals.laborCost / job.actuals.laborHours;
  const pool = Math.round((savedHours * hourCost * share) / 10) * 10;
  const mine = logs.filter((l) => l.jobId === job.id && l.endedAt);
  const byUid = new Map<string, number>();
  for (const l of mine) byUid.set(l.workerId, (byUid.get(l.workerId) ?? 0) + (l.durationMin ?? 0) / 60);
  if (!byUid.size) for (const w of job.assignedWorkerIds) byUid.set(w, job.actuals.laborHours / Math.max(1, job.assignedWorkerIds.length));
  const total = [...byUid.values()].reduce((a, b) => a + b, 0) || 1;
  const split = [...byUid].map(([uid, hours]) => ({ uid, hours: round2(hours), amount: Math.round(((pool * hours) / total) / 10) * 10 }));
  const claim = claims.find((c) => c.claimOf === job.id);
  return { job, savedHours, pool, split, blocked: claim ? `Reklamace ${claim.code}` : null };
}

/** Odměny za zakázky schválené v daném měsíci. */
export function bonusesForMonth(jobs: Job[], s: CompanySettings, logs: TimeLog[], month: string): JobBonus[] {
  const claims = jobs.filter((j) => j.claimOf);
  return jobs
    .filter((j) => j.approval && monthKey(j.approval.approvedAt) === month)
    .map((j) => jobBonus(j, s, logs, claims))
    .filter((b): b is JobBonus => Boolean(b));
}

/* ---------- výplatní přehled ---------- */

/** Odvody zaměstnavatele 2026: sociální 24,8 % + zdravotní 9 %. */
export const EMPLOYER_LEVIES = 0.338;

export interface Payslip {
  month: string;
  hours: number;
  days: number;
  hourlyWage: number;
  base: number;
  vacationDays: number;
  vacationPay: number;
  sickDays: number;
  bonus: number;
  gross: number;
  social: number;
  health: number;
  tax: number;
  net: number;
}

/**
 * Orientační výplatní přehled pro mobil: hodinová mzda = náklad firmy ÷ 1,338,
 * dovolená placená průměrem 8 h/den, nemoc první 2 týdny náhrada 60 % (zjednodušeno),
 * zálohová daň 15 % se slevou na poplatníka 2 570 Kč.
 */
export function payslip(member: Member, month: string, logs: TimeLog[], absences: Absence[], bonus: number): Payslip {
  const mine = logs.filter((l) => l.workerId === member.uid && l.endedAt && monthKey(l.startedAt) === month);
  const hours = round2(mine.reduce((a, l) => a + (l.durationMin ?? 0), 0) / 60);
  const days = new Set(mine.map((l) => l.startedAt.toDateString())).size;
  const hourlyWage = Math.round(member.hourlyCost / (1 + EMPLOYER_LEVIES));
  const approved = absences.filter((a) => a.uid === member.uid && a.status === 'approved');
  const vacationDays = approved.filter((a) => a.kind === 'vacation').reduce((n, a) => n + absenceWorkdays(a, month), 0);
  const sickDays = approved.filter((a) => a.kind === 'sick').reduce((n, a) => n + absenceWorkdays(a, month), 0);
  const base = Math.round(hours * hourlyWage);
  const vacationPay = Math.round(vacationDays * 8 * hourlyWage);
  const sickPay = Math.round(Math.max(0, sickDays - 3) * 8 * hourlyWage * 0.6);
  const gross = base + vacationPay + sickPay + bonus;
  const social = Math.ceil(gross * 0.071);
  const health = Math.ceil(gross * 0.045);
  const taxBase = Math.ceil(gross / 100) * 100;
  const tax = Math.max(0, Math.round(taxBase * 0.15) - 2570);
  return { month, hours, days, hourlyWage, base, vacationDays, vacationPay: vacationPay + sickPay, sickDays, bonus, gross, social, health, tax, net: gross - social - health - tax };
}

/* ---------- kniha jízd ---------- */

export const DEFAULT_KM_RATE = 5.8;

export const tripKm = (t: Trip) => Math.max(0, t.kmEnd - t.kmStart);

export interface TripSummary {
  km: number;
  trips: number;
  fuelCost: number;
  /** Náklad dopravy podle sazby za km. */
  cost: number;
  byVan: Array<{ vanId: string; km: number; lastOdometer: number }>;
  byJob: Array<{ jobId: string | null; km: number; cost: number }>;
}

export function tripSummary(trips: Trip[], month: string | null, s: CompanySettings): TripSummary {
  const rate = s.kmRate ?? DEFAULT_KM_RATE;
  const list = month ? trips.filter((t) => monthKey(t.date) === month) : trips;
  const km = list.reduce((a, t) => a + tripKm(t), 0);
  const vans = new Map<string, { km: number; lastOdometer: number }>();
  for (const t of trips) {
    const v = vans.get(t.vanId) ?? { km: 0, lastOdometer: 0 };
    if (!month || monthKey(t.date) === month) v.km += tripKm(t);
    v.lastOdometer = Math.max(v.lastOdometer, t.kmEnd);
    vans.set(t.vanId, v);
  }
  const jobs = new Map<string | null, number>();
  for (const t of list) jobs.set(t.jobId, (jobs.get(t.jobId) ?? 0) + tripKm(t));
  return {
    km,
    trips: list.length,
    fuelCost: list.reduce((a, t) => a + (t.fuelCost ?? 0), 0),
    cost: Math.round(km * rate),
    byVan: [...vans].map(([vanId, v]) => ({ vanId, ...v })),
    byJob: [...jobs].map(([jobId, k]) => ({ jobId, km: k, cost: Math.round(k * rate) })).sort((a, b) => b.km - a.km),
  };
}

/** Poslední stav tachometru auta – nabídne se jako počátek další jízdy. */
export const lastOdometer = (trips: Trip[], vanId: string) => trips.filter((t) => t.vanId === vanId).reduce((m, t) => Math.max(m, t.kmEnd), 0);

/* ---------- nářadí a technika ---------- */

export interface ToolState {
  tool: Tool;
  holderId: string | null;
  jobId: string | null;
  since: Date | null;
  revision: 'ok' | 'soon' | 'overdue' | 'none';
}

export function toolStates(tools: Tool[], events: ToolEvent[], now = Date.now()): ToolState[] {
  return tools
    .filter((t) => t.active)
    .map((tool) => {
      const last = events.filter((e) => e.toolId === tool.id).sort((a, b) => b.at.getTime() - a.at.getTime())[0];
      const out = last?.action === 'out';
      const due = tool.revisionDue?.getTime();
      const revision = due === undefined ? 'none' : due < now ? 'overdue' : due - now < 30 * DAY ? 'soon' : 'ok';
      return { tool, holderId: out ? last.holderId : null, jobId: out ? last.jobId : null, since: out ? last.at : null, revision };
    });
}

/** Překrývající se rezervace stejné techniky. */
export function reservationConflict(list: Reservation[], toolId: string, from: Date, to: Date, exceptId?: string): Reservation | null {
  return list.find((r) => r.toolId === toolId && r.id !== exceptId && overlaps(r.from, r.to, from, to)) ?? null;
}

/** Další volný den techniky od `from` (při délce `days`). */
export function nextFree(list: Reservation[], toolId: string, from: Date, days: number): Date {
  let start = startOfDay(from);
  for (let i = 0; i < 365; i++) {
    const end = new Date(start.getTime() + (days - 1) * DAY);
    if (!reservationConflict(list, toolId, start, end)) return start;
    start = new Date(start.getTime() + DAY);
  }
  return start;
}

/* ---------- subdodavatelé ---------- */

export function subScore(s: Subcontractor) {
  if (!s.ratings.length) return null;
  const q = s.ratings.reduce((a, r) => a + r.quality, 0) / s.ratings.length;
  const t = s.ratings.reduce((a, r) => a + r.onTime, 0) / s.ratings.length;
  return { quality: round2(q), onTime: round2(t), overall: round2((q + t) / 2), count: s.ratings.length };
}

/* ---------- šablony zpráv ---------- */

export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'mt_start',
    name: 'Potvrzení termínu',
    channel: 'sms',
    text: 'Dobrý den, potvrzujeme zahájení prací ({zakazka}) na adrese {adresa} dne {zacatek}. Na místě bude {mistr}. V případě dotazů volejte {telefon}. {firma}',
  },
  {
    id: 'mt_tomorrow',
    name: 'Zítra přijedeme',
    channel: 'sms',
    text: 'Dobrý den, zítra {zacatek} k vám přijede naše parta. Prosíme o zpřístupnění prostor a parkování. Děkujeme, {firma}',
  },
  {
    id: 'mt_done',
    name: 'Hotovo, předání',
    channel: 'email',
    text: 'Dobrý den,\n\npráce na zakázce {zakazka} jsou dokončené. Děkujeme za spolupráci. Fakturu na {castka} vám pošleme v příštích dnech.\n\nPokud budete s prací spokojeni, budeme rádi za doporučení.\n\nS pozdravem\n{firma}\n{telefon}',
  },
  {
    id: 'mt_delay',
    name: 'Posun termínu',
    channel: 'sms',
    text: 'Dobrý den, omlouváme se, termín zakázky {zakazka} se posouvá. Nový termín zahájení je {zacatek}. Děkujeme za pochopení, {firma}',
  },
];

export const templatesOf = (s: CompanySettings) => s.messageTemplates ?? DEFAULT_TEMPLATES;

export const TEMPLATE_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'zakaznik', label: 'Zákazník' },
  { key: 'adresa', label: 'Adresa' },
  { key: 'zakazka', label: 'Název zakázky' },
  { key: 'zacatek', label: 'Zahájení' },
  { key: 'konec', label: 'Dokončení' },
  { key: 'castka', label: 'Cena s DPH' },
  { key: 'mistr', label: 'Vedoucí party' },
  { key: 'firma', label: 'Firma' },
  { key: 'telefon', label: 'Telefon firmy' },
];

export function fillTemplate(text: string, ctx: Record<string, string>): string {
  // Datum končí tečkou („19. 10.“), za polem v šabloně bývá další – zdvojenou tečku sloučíme.
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in ctx ? ctx[k] : m)).replace(/\.\.(?!\.)/g, '.');
}

export function jobContext(job: Job, s: CompanySettings, members: Member[], grossPrice: number): Record<string, string> {
  const date = (d: Date) => d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' });
  const lead = members.find((m) => m.uid === job.assignedWorkerIds[0]);
  return {
    zakaznik: job.client.name,
    adresa: job.client.address,
    zakazka: job.title.toLowerCase(),
    zacatek: date(job.schedule.start),
    konec: date(job.schedule.due),
    castka: grossPrice.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }),
    mistr: lead ? lead.displayName : 'naše parta',
    firma: s.name,
    telefon: s.phone,
  };
}
