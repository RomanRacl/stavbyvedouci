import type { CompanySettings, Job, Member, Payment, Quote, QuoteItem, TimeLog, VatMode } from '@/types/firestore';
import { extraWorkOf } from './jobDefaults';

/* ---------- DPH ---------- */

export const VAT_MODES: Record<VatMode, { label: string; short: string; rate: number; hint: string; invoiceNote?: string }> = {
  standard21: { label: 'Základní sazba 21 %', short: '21 %', rate: 0.21, hint: 'Novostavby, nebytové stavby, služby firmám neplátcům.' },
  reduced12: {
    label: 'Snížená sazba 12 %',
    short: '12 %',
    rate: 0.12,
    hint: 'Opravy, rekonstrukce a údržba hotových bytů a rodinných domů (stavby pro bydlení).',
  },
  reverse: {
    label: 'Přenesená daňová povinnost',
    short: 'PDP',
    rate: 0,
    hint: 'Stavební a montážní práce (CZ-CPA 41–43) pro jiného plátce DPH. Daň přiznává odběratel.',
    invoiceNote: 'Daň odvede zákazník. Režim přenesení daňové povinnosti podle § 92e zákona o DPH.',
  },
  none: { label: 'Bez DPH (neplátce)', short: 'bez DPH', rate: 0, hint: 'Firma není plátcem DPH.', invoiceNote: 'Nejsme plátci DPH.' },
};

export const vatOf = (net: number, mode: VatMode) => Math.round(net * VAT_MODES[mode].rate * 100) / 100;
export const grossOf = (net: number, mode: VatMode) => Math.round((net + vatOf(net, mode)) * 100) / 100;
export const jobVat = (job: Job, s: CompanySettings): VatMode => job.vatMode ?? (s.vatPayer ? s.defaultVatMode : 'none');

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- nabídky ---------- */

export const lineTotal = (i: QuoteItem) => round2(i.qty * i.unitPrice);

export function quoteTotals(q: Pick<Quote, 'items' | 'vatMode'>) {
  const net = round2(q.items.reduce((a, i) => a + lineTotal(i), 0));
  const labor = round2(q.items.filter((i) => i.kind === 'labor').reduce((a, i) => a + lineTotal(i), 0));
  const material = round2(q.items.filter((i) => i.kind === 'material').reduce((a, i) => a + lineTotal(i), 0));
  const vat = vatOf(net, q.vatMode);
  return { net, labor, material, other: round2(net - labor - material), vat, gross: round2(net + vat) };
}

/** Hodiny práce v nabídce = součet řádků práce v hodinách. */
export const quoteHours = (q: Pick<Quote, 'items'>) => q.items.filter((i) => i.kind === 'labor' && i.unit === 'h').reduce((a, i) => a + i.qty, 0);

/* ---------- zálohy a fakturace ---------- */

export const paymentsOf = (job: Job): Payment[] => job.payments ?? [];

export interface BasisLine {
  text: string;
  qty: number;
  unit: string;
  unitPrice: number; // bez DPH
  total: number; // bez DPH
}

/**
 * Podklad k fakturaci: cena díla podle zakázky (bez schválených víceprací, které jsou
 * v ceně zakázky už započtené – proto se odečtou a vypíšou zvlášť) + schválené vícepráce.
 * Od výsledku se odečtou uhrazené zálohy.
 */
export function invoiceBasis(job: Job, s: CompanySettings) {
  const mode = jobVat(job, s);
  const extras = extraWorkOf(job).filter((e) => e.status === 'approved');
  const extrasSum = extras.reduce((a, e) => a + (e.price ?? 0), 0);
  const base = job.budget.revenue - extrasSum;
  const lines: BasisLine[] = [
    { text: `${job.title} (zakázka ${job.code})`, qty: 1, unit: 'kpl', unitPrice: base, total: base },
    ...extras.map((e) => ({ text: `Vícepráce: ${e.description}`, qty: 1, unit: 'kpl', unitPrice: e.price ?? 0, total: e.price ?? 0 })),
  ];
  const net = round2(lines.reduce((a, l) => a + l.total, 0));
  const vat = vatOf(net, mode);
  const gross = round2(net + vat);
  const paid = round2(paymentsOf(job).filter((p) => p.paidAt).reduce((a, p) => a + p.amount, 0));
  return { mode, lines, net, vat, gross, paid, toPay: round2(gross - paid), note: VAT_MODES[mode].invoiceNote };
}

export function paymentSummary(job: Job, s: CompanySettings) {
  const { gross } = invoiceBasis(job, s);
  const list = paymentsOf(job);
  const requested = list.reduce((a, p) => a + p.amount, 0);
  const paid = list.filter((p) => p.paidAt).reduce((a, p) => a + p.amount, 0);
  const overdue = list.filter((p) => !p.paidAt && p.dueDate.getTime() < Date.now());
  return { gross, requested, paid, remaining: round2(gross - paid), overdue };
}

/* ---------- režie ---------- */

export const overheadMonthly = (s: CompanySettings) => s.overheadItems.reduce((a, i) => a + i.monthly, 0);
/** Režie na hodinu práce = měsíční režie ÷ odpracovatelné hodiny. */
export const overheadRate = (s: CompanySettings) => (s.capacityHours > 0 ? Math.round(overheadMonthly(s) / s.capacityHours) : 0);

/** Marže po režii: z odpracovaných hodin (u nezačaté zakázky z rozpočtu). */
export function marginAfterOverhead(job: Job, s: CompanySettings, forecastCost: number) {
  const hours = Math.max(job.actuals.laborHours, job.progressPct > 0 ? job.actuals.laborHours / (job.progressPct / 100) : job.budget.laborHours);
  const overhead = Math.round(hours * overheadRate(s));
  const margin = job.budget.revenue - forecastCost - overhead;
  return { overhead, margin, marginPct: job.budget.revenue ? margin / job.budget.revenue : 0 };
}

/* ---------- mzdy ---------- */

export interface PayrollRow {
  member: Member;
  days: number;
  hours: number;
  breakHours: number;
  cost: number;
  confirmedDays: number;
  byJob: Array<{ jobId: string; hours: number }>;
}

/** Mzdové podklady za měsíc (YYYY-MM) z uzavřených časových záznamů. */
export function payroll(month: string, logs: TimeLog[], members: Member[], dayReports: Record<string, Date>): PayrollRow[] {
  const inMonth = logs.filter((l) => l.endedAt && monthKey(l.startedAt) === month);
  return members
    .filter((m) => m.role !== 'owner')
    .map((member) => {
      const mine = inMonth.filter((l) => l.workerId === member.uid);
      const days = new Set(mine.map((l) => dayKeyOf(l.startedAt)));
      const byJob = new Map<string, number>();
      for (const l of mine) byJob.set(l.jobId, (byJob.get(l.jobId) ?? 0) + (l.durationMin ?? 0) / 60);
      const minutes = mine.reduce((a, l) => a + (l.durationMin ?? 0), 0);
      return {
        member,
        days: days.size,
        hours: round2(minutes / 60),
        breakHours: round2(mine.reduce((a, l) => a + (l.breakMin ?? 0), 0) / 60),
        cost: Math.round(mine.reduce((a, l) => a + (l.costSnapshot ?? 0), 0)),
        confirmedDays: [...days].filter((d) => dayReports[`${member.uid}_${d}`]).length,
        byJob: [...byJob].map(([jobId, hours]) => ({ jobId, hours: round2(hours) })).sort((a, b) => b.hours - a.hours),
      };
    });
}

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const dayKeyOf = (d: Date) => `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`;
export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
};

/* ---------- exporty ---------- */

/** CSV pro Excel: středníky, čárka jako desetinný oddělovač, BOM kvůli diakritice. */
export function toCSV(rows: Array<Array<string | number>>): string {
  const cell = (v: string | number) => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const POHODA_RATE: Record<VatMode, string> = { standard21: 'high', reduced12: 'low', reverse: 'none', none: 'none' };

/**
 * Vydané faktury ve formátu XML pro import do POHODY (dataPack verze 2.0).
 * Čísla faktur přidělí POHODA podle své číselné řady; číslo podkladu je v textu.
 * U přenesené daňové povinnosti je nutné v POHODĚ zkontrolovat členění DPH.
 */
export function pohodaXml(jobs: Job[], s: CompanySettings): string {
  const items = jobs
    .filter((j) => j.invoice)
    .map((job, idx) => {
      const b = invoiceBasis(job, s);
      const inv = job.invoice!;
      const lines = b.lines
        .map(
          (l) => `        <inv:invoiceItem>
          <inv:text>${xml(l.text.slice(0, 90))}</inv:text>
          <inv:quantity>${l.qty}</inv:quantity>
          <inv:unit>${xml(l.unit)}</inv:unit>
          <inv:payVAT>false</inv:payVAT>
          <inv:rateVAT>${POHODA_RATE[b.mode]}</inv:rateVAT>
          <inv:homeCurrency>
            <typ:unitPrice>${l.unitPrice.toFixed(2)}</typ:unitPrice>
          </inv:homeCurrency>
        </inv:invoiceItem>`,
        )
        .join('\n');
      return `  <dat:dataPackItem id="${idx + 1}" version="2.0">
    <inv:invoice version="2.0">
      <inv:invoiceHeader>
        <inv:invoiceType>issuedInvoice</inv:invoiceType>
        <inv:date>${isoDate(inv.issuedAt)}</inv:date>
        <inv:dateTax>${isoDate(inv.taxDate)}</inv:dateTax>
        <inv:dateDue>${isoDate(inv.dueDate)}</inv:dateDue>
        <inv:text>${xml(`${job.title}, podklad ${inv.number}`.slice(0, 240))}</inv:text>
        <inv:partnerIdentity>
          <typ:address>
            <typ:company>${xml(job.client.name)}</typ:company>
            <typ:street>${xml(job.client.address)}</typ:street>
          </typ:address>
        </inv:partnerIdentity>
        <inv:numberOrder>${xml(job.code)}</inv:numberOrder>
        <inv:paymentType>
          <typ:paymentType>draft</typ:paymentType>
        </inv:paymentType>${b.note ? `\n        <inv:note>${xml(b.note)}</inv:note>` : ''}
      </inv:invoiceHeader>
      <inv:invoiceDetail>
${lines}
      </inv:invoiceDetail>
    </inv:invoice>
  </dat:dataPackItem>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<dat:dataPack id="stavbyvedouci-${Date.now()}" ico="${xml(s.ico)}" application="Stavbyvedoucí" version="2.0" note="Export podkladů k fakturaci"
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">
${items}
</dat:dataPack>
`;
}

/** Univerzální export podkladů do CSV (Excel, Money, Fakturoid – přes jejich import z tabulky). */
export function invoicesCsv(jobs: Job[], s: CompanySettings): string {
  const rows: Array<Array<string | number>> = [
    ['Číslo podkladu', 'Zakázka', 'Odběratel', 'Adresa', 'Vystaveno', 'DUZP', 'Splatnost', 'Režim DPH', 'Základ', 'DPH', 'Celkem s DPH', 'Uhrazeno zálohami', 'K úhradě'],
  ];
  for (const job of jobs.filter((j) => j.invoice)) {
    const b = invoiceBasis(job, s);
    const inv = job.invoice!;
    rows.push([
      inv.number,
      `${job.code} ${job.title}`,
      job.client.name,
      job.client.address,
      inv.issuedAt.toLocaleDateString('cs-CZ'),
      inv.taxDate.toLocaleDateString('cs-CZ'),
      inv.dueDate.toLocaleDateString('cs-CZ'),
      VAT_MODES[b.mode].short,
      b.net,
      b.vat,
      b.gross,
      b.paid,
      b.toPay,
    ]);
  }
  return toCSV(rows);
}
