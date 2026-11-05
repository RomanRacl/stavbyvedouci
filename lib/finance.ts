import type { CompanySettings, Currency, Job, MaterialItem, Payment, PriceLevel, Quote, ReminderSent, VatMode } from '@/types/firestore';
import { invoiceBasis, paymentsOf, VAT_MODES } from './money';

const DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- QR platba (SPAYD) ---------- */

function mod97(digits: string): number {
  let r = 0;
  for (const ch of digits) r = (r * 10 + Number(ch)) % 97;
  return r;
}

/**
 * Převede české číslo účtu („19-2000145399/0800“) na IBAN. Když už je zadaný IBAN, jen ho očistí.
 * Vrací null pro neplatný formát.
 */
export function ibanFromAccount(account: string): string | null {
  const clean = account.replace(/\s/g, '').toUpperCase();
  if (/^CZ\d{22}$/.test(clean)) return mod97(clean.slice(4) + '1235' + clean.slice(2, 4)) === 1 ? clean : null;
  const m = clean.match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (!m) return null;
  const bban = m[3] + (m[1] ?? '').padStart(6, '0') + m[2].padStart(10, '0');
  const check = 98 - mod97(bban + '123500'); // C=12, Z=35, 00
  return `CZ${String(check).padStart(2, '0')}${bban}`;
}

/** Variabilní symbol z čísla dokladu: „PF-2026-0012“ → „20260012“ (max. 10 číslic). */
export function variableSymbol(docNumber: string) {
  // Zálohy začínají 1, ať se VS nekryje s fakturou se stejným pořadím (ZF-2026-0001 → 120260001).
  const prefix = docNumber.startsWith('ZF-') ? '1' : '';
  return (prefix + docNumber.replace(/\D/g, '')).slice(-10);
}

const spaydText = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\*/g, ' ')
    .toUpperCase()
    .slice(0, 60)
    .trim();

const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/**
 * Řetězec pro QR platbu podle standardu České bankovní asociace (SPAYD 1.0).
 * Naskenuje ho mobilní bankovnictví všech českých bank.
 */
export function spayd(input: { account: string; amount: number; vs?: string; message?: string; due?: Date; currency?: Currency }): string | null {
  const iban = ibanFromAccount(input.account);
  if (!iban || !(input.amount > 0)) return null;
  const parts = ['SPD', '1.0', `ACC:${iban}`, `AM:${input.amount.toFixed(2)}`, `CC:${input.currency ?? 'CZK'}`];
  if (input.due) parts.push(`DT:${ymd(input.due)}`);
  if (input.message) parts.push(`MSG:${spaydText(input.message)}`);
  if (input.vs) parts.push(`X-VS:${input.vs}`);
  return parts.join('*');
}

/* ---------- měna ---------- */

/** Přepočet Kč → EUR na doklad (zaokrouhleno na centy). */
export const toEur = (czk: number, rate: number) => (rate > 0 ? round2(czk / rate) : 0);
export const fmtMoney = (n: number, currency: Currency = 'CZK') =>
  n.toLocaleString('cs-CZ', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- zálohy a daňové doklady ---------- */

/**
 * Rozklad přijaté platby (vč. DPH) na základ a daň – pro daňový doklad k přijaté platbě.
 * U přenesené povinnosti a neplátce se daň neodvádí.
 */
export function splitGross(gross: number, mode: VatMode) {
  const rate = VAT_MODES[mode].rate;
  const vat = rate ? round2((gross * rate) / (1 + rate)) : 0;
  return { net: round2(gross - vat), vat, rate };
}

/** Daňový doklad k platbě vystavuje jen plátce DPH (u neplátce stačí potvrzení o přijetí). */
export const needsTaxDoc = (mode: VatMode) => mode !== 'none';

/* ---------- upomínky ---------- */

export const DEFAULT_REMINDER_DAYS: [number, number, number] = [3, 10, 20];

export interface Receivable {
  key: string; // `inv:${jobId}` nebo `pay:${jobId}:${paymentId}`
  kind: 'invoice' | 'advance';
  job: Job;
  payment: Payment | null;
  number: string;
  label: string;
  amount: number; // s DPH, kolik zbývá
  dueDate: Date;
  daysOverdue: number;
  reminders: ReminderSent[];
  /** Úroveň upomínky, která je právě na řadě (0 = zatím nic). */
  dueLevel: 0 | 1 | 2 | 3;
  /** Další upomínka už byla poslána, nebo je ještě brzy. */
  nextLevel: 1 | 2 | 3 | null;
}

/** Úroveň, na kterou má pohledávka podle počtu dní po splatnosti nárok. */
export function levelForDays(days: number, steps: [number, number, number]): 0 | 1 | 2 | 3 {
  if (days >= steps[2]) return 3;
  if (days >= steps[1]) return 2;
  if (days >= steps[0]) return 1;
  return 0;
}

/** Neuhrazené faktury a výzvy k záloze, seřazené od nejstarší splatnosti. */
export function receivables(jobs: Job[], s: CompanySettings, now = new Date()): Receivable[] {
  const steps = s.reminderDays ?? DEFAULT_REMINDER_DAYS;
  const out: Receivable[] = [];
  const make = (r: Omit<Receivable, 'daysOverdue' | 'dueLevel' | 'nextLevel'>): Receivable => {
    const daysOverdue = Math.floor((now.getTime() - r.dueDate.getTime()) / DAY);
    const dueLevel = levelForDays(daysOverdue, steps);
    const sent = r.reminders.reduce((m, x) => Math.max(m, x.level), 0);
    const nextLevel = dueLevel > sent ? (dueLevel as 1 | 2 | 3) : null;
    return { ...r, daysOverdue, dueLevel, nextLevel };
  };
  for (const job of jobs) {
    if (job.invoice && !job.invoice.paidAt && job.status === 'invoiced') {
      const b = invoiceBasis(job, s);
      if (b.toPay > 0.5)
        out.push(
          make({ key: `inv:${job.id}`, kind: 'invoice', job, payment: null, number: job.invoice.number, label: 'Faktura', amount: b.toPay, dueDate: job.invoice.dueDate, reminders: job.invoice.reminders ?? [] }),
        );
    }
    for (const p of paymentsOf(job)) {
      // Platba vystavená s fakturou je její úhrada – pokrývá ji řádek faktury.
      if (p.paidAt || (job.invoice && p.issuedAt.getTime() >= job.invoice.issuedAt.getTime() - 60_000)) continue;
      out.push(make({ key: `pay:${job.id}:${p.id}`, kind: 'advance', job, payment: p, number: p.number ?? p.label, label: p.label, amount: p.amount, dueDate: p.dueDate, reminders: p.reminders ?? [] }));
    }
  }
  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

const czk = (n: number) => n.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });

/** Text upomínky – každá další je důraznější, třetí s upozorněním na vymáhání. */
export function reminderText(r: Receivable, level: 1 | 2 | 3, s: CompanySettings): { subject: string; body: string } {
  const what = r.kind === 'invoice' ? `fakturu ${r.number}` : `zálohu ${r.number}`;
  const due = r.dueDate.toLocaleDateString('cs-CZ');
  const account = s.bankAccount ? `číslo účtu ${s.bankAccount}, variabilní symbol ${variableSymbol(r.number)}` : 'údaje k platbě najdete na dokladu';
  const head = `Dobrý den,`;
  const sign = `\n\nS pozdravem\n${s.name}\n${s.phone}`;
  const bodies: Record<1 | 2 | 3, string> = {
    1: `${head}\n\ndovolujeme si připomenout ${what} za zakázku „${r.job.title}“ na ${czk(r.amount)}, která byla splatná ${due}. Možná se platba jen zdržela, v tom případě tento e-mail prosím ignorujte.\n\nPlatbu můžete poslat na ${account}.${sign}`,
    2: `${head}\n\nk dnešnímu dni evidujeme neuhrazenou ${what} na ${czk(r.amount)}, splatnou ${due} (${r.daysOverdue} dní po splatnosti). Prosíme o úhradu do 7 dnů na ${account}.\n\nPokud jste už zaplatili, pošlete nám prosím potvrzení o platbě.${sign}`,
    3: `${head}\n\ni přes předchozí upomínky zůstává ${what} na ${czk(r.amount)} neuhrazená ${r.daysOverdue} dní po splatnosti. Žádáme o úhradu nejpozději do 5 pracovních dnů na ${account}.\n\nPokud platba nedorazí, budeme nuceni pohledávku předat k vymáhání a účtovat zákonný úrok z prodlení.${sign}`,
  };
  const subjects: Record<1 | 2 | 3, string> = {
    1: `Připomenutí platby: ${r.number}`,
    2: `2. upomínka: ${r.number} po splatnosti`,
    3: `Poslední upomínka před vymáháním: ${r.number}`,
  };
  return { subject: subjects[level], body: bodies[level] };
}

/* ---------- odhad daní ---------- */

/** Parametry pro rok 2026 (orientační – ověřte s účetní). */
export const TAX_2026 = {
  dppo: 0.21, // daň z příjmů právnických osob
  dividend: 0.15, // srážková daň z podílu na zisku
  pit: 0.15, // daň z příjmů fyzických osob (do 36násobku průměrné mzdy)
  pitHigh: 0.23,
  pitThreshold: 1_762_812,
  taxpayerCredit: 30_840, // sleva na poplatníka
  socialRate: 0.292,
  socialBase: 0.55,
  healthRate: 0.135,
  healthBase: 0.5,
};

export interface TaxEstimate {
  year: number;
  monthsElapsed: number;
  revenueYtd: number;
  costYtd: number;
  profitYtd: number;
  profitYear: number; // lineární odhad za celý rok
  lines: Array<{ label: string; amount: number; hint: string }>;
  total: number;
  monthlyReserve: number;
}

/**
 * Odhad daní a odvodů ze zisku zakázek: tržby fakturovaných a schválených zakázek v roce,
 * minus práce, materiál a režie. Zisk se lineárně dopočítá na celý rok.
 */
export function taxEstimate(jobs: Job[], s: CompanySettings, overheadMonthly: number, now = new Date()): TaxEstimate {
  const year = now.getFullYear();
  const monthsElapsed = now.getMonth() + now.getDate() / 31;
  const done = jobs.filter((j) => {
    const at = j.invoice?.taxDate ?? (j.status === 'approved' ? j.approval?.approvedAt ?? j.updatedAt : null);
    return at && at.getFullYear() === year && !j.claimOf;
  });
  const claims = jobs.filter((j) => j.claimOf && j.updatedAt.getFullYear() === year);
  const revenueYtd = done.reduce((a, j) => a + j.budget.revenue, 0);
  const jobCost = [...done, ...claims].reduce((a, j) => a + j.actuals.laborCost + j.actuals.materialCost, 0);
  const costYtd = Math.round(jobCost + overheadMonthly * monthsElapsed);
  const profitYtd = revenueYtd - costYtd;
  const profitYear = monthsElapsed > 0.5 ? Math.round((profitYtd / monthsElapsed) * 12) : profitYtd;
  const base = Math.max(0, profitYear);
  const t = TAX_2026;
  const lines: TaxEstimate['lines'] = [];
  if ((s.legalForm ?? 'sro') === 'sro') {
    const dppo = Math.round(base * t.dppo);
    lines.push({ label: 'Daň z příjmů firmy (21 %)', amount: dppo, hint: 'Platí s.r.o. ze zisku. Zálohy se platí podle loňské daně.' });
    lines.push({ label: 'Daň z dividendy (15 %)', amount: Math.round((base - dppo) * t.dividend), hint: 'Jen pokud si zisk vyplatíte jako podíl na zisku.' });
  } else {
    const pit = Math.max(0, Math.round(Math.min(base, t.pitThreshold) * t.pit + Math.max(0, base - t.pitThreshold) * t.pitHigh - t.taxpayerCredit));
    lines.push({ label: 'Daň z příjmů (15 %, nad limit 23 %)', amount: pit, hint: `Po slevě na poplatníka ${czk(t.taxpayerCredit)}.` });
    lines.push({ label: 'Sociální pojištění', amount: Math.round(base * t.socialBase * t.socialRate), hint: '29,2 % z 55 % zisku.' });
    lines.push({ label: 'Zdravotní pojištění', amount: Math.round(base * t.healthBase * t.healthRate), hint: '13,5 % z 50 % zisku.' });
  }
  const total = lines.reduce((a, l) => a + l.amount, 0);
  const monthsLeft = Math.max(1, 12 - Math.floor(monthsElapsed));
  return { year, monthsElapsed, revenueYtd, costYtd, profitYtd, profitYear, lines, total, monthlyReserve: Math.round(total / monthsLeft) };
}

/* ---------- hlídání nákupních cen ---------- */

export interface PriceChange {
  item: MaterialItem;
  from: number;
  to: number;
  pct: number;
  at: Date;
}

/** Zdražení za posledních `days` dní o víc než `minPct` (porovnává se s cenou před obdobím). */
export function recentPriceChanges(catalog: MaterialItem[], days = 60, minPct = 0.03, now = new Date()): PriceChange[] {
  const since = now.getTime() - days * DAY;
  const out: PriceChange[] = [];
  for (const item of catalog) {
    const hist = item.priceHistory ?? [];
    const recent = hist.filter((h) => h.at.getTime() >= since);
    if (!recent.length) continue;
    const from = recent[0].unitCost; // cena platná před první změnou v období
    const pct = from ? (item.unitCost - from) / from : 0;
    if (Math.abs(pct) >= minPct) out.push({ item, from, to: item.unitCost, pct, at: recent[recent.length - 1].at });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

export interface QuoteImpact {
  quote: Quote;
  lines: Array<{ itemId: string; text: string; qty: number; oldPrice: number; newPrice: number }>;
  /** O kolik by se měla zvýšit cena bez DPH, aby zůstala zachovaná přirážka. */
  shortfall: number;
}

/** Otevřené nabídky, ve kterých je materiál prodávaný pod aktuální nákupní cenou + přirážkou. */
export function quotesHitByPrices(quotes: Quote[], catalog: MaterialItem[], markup: number): QuoteImpact[] {
  const out: QuoteImpact[] = [];
  for (const q of quotes) {
    if (q.status !== 'draft' && q.status !== 'sent') continue;
    const lines = q.items.flatMap((i) => {
      const c = i.kind === 'material' && i.materialId ? catalog.find((x) => x.id === i.materialId) : null;
      if (!c) return [];
      const newPrice = Math.round(c.unitCost * markup);
      return newPrice > i.unitPrice ? [{ itemId: i.id, text: i.text, qty: i.qty, oldPrice: i.unitPrice, newPrice }] : [];
    });
    if (lines.length) out.push({ quote: q, lines, shortfall: Math.round(lines.reduce((a, l) => a + (l.newPrice - l.oldPrice) * l.qty, 0)) });
  }
  return out.sort((a, b) => b.shortfall - a.shortfall);
}

/* ---------- cenové hladiny ---------- */

export const DEFAULT_PRICE_LEVELS: PriceLevel[] = [
  { id: 'pl_std', name: 'Běžný zákazník', discountPct: 0 },
  { id: 'pl_loyal', name: 'Stálý zákazník', discountPct: 5 },
  { id: 'pl_dev', name: 'Developer, správce domů', discountPct: 10 },
];
export const priceLevelsOf = (s: CompanySettings) => s.priceLevels ?? DEFAULT_PRICE_LEVELS;

/* ---------- záruka ---------- */

export const DEFAULT_WARRANTY_MONTHS = 24;

/** Do kdy platí záruka: od předání díla (nebo schválení) + počet měsíců. */
export function warrantyUntil(job: Job, s: CompanySettings): Date | null {
  const start = job.handover?.signedAt ?? job.approval?.approvedAt ?? null;
  if (!start) return null;
  const months = job.warrantyMonths ?? s.warrantyMonths ?? DEFAULT_WARRANTY_MONTHS;
  const d = new Date(start);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Čísla dokladů v řadě: „ZF-2026-0003“. */
export function nextDocNumber(prefix: string, existing: string[], now = new Date()) {
  const year = now.getFullYear();
  const max = existing.filter((n) => n.startsWith(`${prefix}-${year}-`)).reduce((m, n) => Math.max(m, Number(n.split('-')[2]) || 0), 0);
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
}

