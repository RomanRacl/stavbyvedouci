import type { CompanySettings, Job, Lead, LeadSource, LeadStage, LostReason, Quote, RecurringPlan, Trade } from '@/types/firestore';
import { warrantyUntil } from './finance';
import { quoteTotals } from './money';

const DAY = 86_400_000;

export const LEAD_STAGES: Array<{ id: LeadStage; label: string; hint: string }> = [
  { id: 'inquiry', label: 'Poptávka', hint: 'první kontakt' },
  { id: 'survey', label: 'Obhlídka', hint: 'domluvená návštěva' },
  { id: 'quote', label: 'Nabídka', hint: 'odeslaná cena' },
  { id: 'negotiation', label: 'Jednání', hint: 'ladí se detaily' },
  { id: 'won', label: 'Vyhráno', hint: 'vznikla zakázka' },
  { id: 'lost', label: 'Prohráno', hint: 'zákazník nešel' },
];

export const LEAD_SOURCES: Record<LeadSource, string> = {
  web: 'Web',
  phone: 'Telefon',
  referral: 'Doporučení',
  repeat: 'Stálý zákazník',
  portal: 'Poptávkový portál',
  other: 'Jiné',
};

export const LOST_REASONS: Record<LostReason, string> = {
  price: 'Vysoká cena',
  term: 'Termín',
  competitor: 'Vybral konkurenci',
  no_response: 'Neozval se',
  scope: 'Změna rozsahu, odložil',
  other: 'Jiný důvod',
};

/**
 * Skutečná fáze poptávky: když už k ní existuje nabídka, rozhoduje stav nabídky
 * (přijatá = vyhráno, odmítnutá = prohráno, odeslaná = aspoň fáze Nabídka).
 */
export function leadView(lead: Lead, quotes: Quote[]): Lead & { quote: Quote | null } {
  const quote = lead.quoteId ? quotes.find((q) => q.id === lead.quoteId) ?? null : null;
  if (!quote) return { ...lead, quote };
  if (quote.status === 'accepted') return { ...lead, quote, stage: 'won', value: Math.round(quoteTotals(quote).net) };
  if (quote.status === 'rejected') return { ...lead, quote, stage: 'lost', lostReason: quote.lostReason ?? lead.lostReason ?? 'other' };
  const early = lead.stage === 'inquiry' || lead.stage === 'survey';
  return { ...lead, quote, stage: quote.status === 'sent' && early ? 'quote' : lead.stage, value: Math.round(quoteTotals(quote).net) || lead.value };
}

/* ---------- úspěšnost nabídek ---------- */

export interface WinStats {
  decided: number;
  won: number;
  winRate: number | null;
  wonValue: number;
  lostValue: number;
  valueRate: number | null;
  avgDaysToDecision: number | null;
  reasons: Array<{ reason: LostReason; label: string; count: number; value: number }>;
  byTrade: Array<{ trade: Trade; decided: number; won: number; rate: number }>;
  bySource: Array<{ source: LeadSource; label: string; leads: number; won: number; rate: number }>;
  /** Kolik je ve hře (otevřené nabídky a poptávky) – vážené pravděpodobností výhry. */
  pipelineValue: number;
  weightedValue: number;
}

/** Statistika rozhodnutých nabídek za posledních `months` měsíců. */
export function winStats(quotes: Quote[], leads: Lead[], months = 12, now = new Date()): WinStats {
  const since = new Date(now);
  since.setMonth(since.getMonth() - months);
  const decided = quotes.filter((q) => (q.status === 'accepted' || q.status === 'rejected') && (q.decidedAt ?? q.createdAt) >= since);
  const won = decided.filter((q) => q.status === 'accepted');
  const lost = decided.filter((q) => q.status === 'rejected');
  const val = (q: Quote) => quoteTotals(q).net;
  const wonValue = won.reduce((a, q) => a + val(q), 0);
  const lostValue = lost.reduce((a, q) => a + val(q), 0);
  const timed = decided.filter((q) => q.decidedAt && (q.sentAt ?? q.createdAt));
  const avgDays = timed.length ? timed.reduce((a, q) => a + (q.decidedAt!.getTime() - (q.sentAt ?? q.createdAt).getTime()) / DAY, 0) / timed.length : null;

  const views = leads.map((l) => leadView(l, quotes));
  const lostLeads = views.filter((l) => l.stage === 'lost' && !l.quote);
  const reasonMap = new Map<LostReason, { count: number; value: number }>();
  for (const q of lost) {
    const r = q.lostReason ?? 'other';
    const cur = reasonMap.get(r) ?? { count: 0, value: 0 };
    reasonMap.set(r, { count: cur.count + 1, value: cur.value + val(q) });
  }
  for (const l of lostLeads) {
    const r = l.lostReason ?? 'other';
    const cur = reasonMap.get(r) ?? { count: 0, value: 0 };
    reasonMap.set(r, { count: cur.count + 1, value: cur.value + l.value });
  }
  const reasons = [...reasonMap].map(([reason, x]) => ({ reason, label: LOST_REASONS[reason], ...x })).sort((a, b) => b.count - a.count);

  const tradeMap = new Map<Trade, { decided: number; won: number }>();
  for (const q of decided) {
    const cur = tradeMap.get(q.trade) ?? { decided: 0, won: 0 };
    tradeMap.set(q.trade, { decided: cur.decided + 1, won: cur.won + (q.status === 'accepted' ? 1 : 0) });
  }
  const byTrade = [...tradeMap].map(([trade, x]) => ({ trade, ...x, rate: x.won / x.decided })).sort((a, b) => b.decided - a.decided);

  const srcMap = new Map<LeadSource, { leads: number; won: number }>();
  for (const l of views.filter((x) => x.stage === 'won' || x.stage === 'lost')) {
    const cur = srcMap.get(l.source) ?? { leads: 0, won: 0 };
    srcMap.set(l.source, { leads: cur.leads + 1, won: cur.won + (l.stage === 'won' ? 1 : 0) });
  }
  const bySource = [...srcMap].map(([source, x]) => ({ source, label: LEAD_SOURCES[source], ...x, rate: x.won / x.leads })).sort((a, b) => b.leads - a.leads);

  const rate = decided.length ? won.length / decided.length : null;
  const open = views.filter((l) => l.stage !== 'won' && l.stage !== 'lost');
  const openQuotes = quotes.filter((q) => (q.status === 'sent' || q.status === 'draft') && !leads.some((l) => l.quoteId === q.id));
  const STAGE_P: Record<LeadStage, number> = { inquiry: 0.15, survey: 0.3, quote: rate ?? 0.4, negotiation: 0.7, won: 1, lost: 0 };
  const pipelineValue = open.reduce((a, l) => a + l.value, 0) + openQuotes.reduce((a, q) => a + val(q), 0);
  const weightedValue = open.reduce((a, l) => a + l.value * STAGE_P[l.stage], 0) + openQuotes.reduce((a, q) => a + val(q) * (rate ?? 0.4), 0);

  return {
    decided: decided.length,
    won: won.length,
    winRate: rate,
    wonValue,
    lostValue,
    valueRate: wonValue + lostValue ? wonValue / (wonValue + lostValue) : null,
    avgDaysToDecision: avgDays,
    reasons,
    byTrade,
    bySource,
    pipelineValue: Math.round(pipelineValue),
    weightedValue: Math.round(weightedValue),
  };
}

/* ---------- servisní připomínky ---------- */

export type ServiceKind = 'recurring' | 'revision' | 'warranty';

export interface ServiceReminder {
  key: string;
  kind: ServiceKind;
  title: string;
  clientName: string;
  phone: string;
  address: string;
  due: Date;
  daysLeft: number;
  jobId: string | null;
  recurringId: string | null;
  /** Text SMS nebo e-mailu pro zákazníka. */
  message: string;
}

/**
 * Co je potřeba zákazníkům připomenout v příštích `days` dnech:
 * pravidelný servis, opakované revize a konec záruky (příležitost nabídnout prohlídku).
 */
export function serviceReminders(input: { jobs: Job[]; recurring: RecurringPlan[]; settings: CompanySettings }, days = 45, now = new Date()): ServiceReminder[] {
  const until = now.getTime() + days * DAY;
  const left = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY);
  const date = (d: Date) => d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' });
  const firm = input.settings.name;
  const phone = input.settings.phone;
  const out: ServiceReminder[] = [];

  for (const r of input.recurring) {
    if (!r.active || r.nextDate.getTime() > until) continue;
    out.push({
      key: `rec:${r.id}:${r.nextDate.toISOString().slice(0, 10)}`,
      kind: 'recurring',
      title: r.title,
      clientName: r.clientName,
      phone: r.clientPhone,
      address: r.address,
      due: r.nextDate,
      daysLeft: left(r.nextDate),
      jobId: r.lastJobId,
      recurringId: r.id,
      message: `Dobrý den, blíží se termín pravidelného servisu (${r.title.toLowerCase()}) na adrese ${r.address}. Navrhujeme ${date(r.nextDate)}, vyhovuje vám? Ozvěte se prosím na ${phone}. ${firm}`,
    });
  }

  for (const j of input.jobs) {
    for (const rev of j.revisions ?? []) {
      if (!rev.nextDue || rev.nextDue.getTime() > until) continue;
      out.push({
        key: `rev:${j.id}:${rev.id}`,
        kind: 'revision',
        title: `${rev.kind} (další termín)`,
        clientName: j.client.name,
        phone: j.client.phone,
        address: j.client.address,
        due: rev.nextDue,
        daysLeft: left(rev.nextDue),
        jobId: j.id,
        recurringId: null,
        message: `Dobrý den, ${date(rev.nextDue)} vyprší platnost revize (${rev.kind.toLowerCase()}) na adrese ${j.client.address}. Revizi pro vás rádi zajistíme, stačí se ozvat na ${phone}. ${firm}`,
      });
    }
    const w = j.claimOf ? null : warrantyUntil(j, input.settings);
    if (w && w.getTime() <= until && w.getTime() >= now.getTime() - 7 * DAY) {
      out.push({
        key: `war:${j.id}`,
        kind: 'warranty',
        title: `Konec záruky: ${j.title}`,
        clientName: j.client.name,
        phone: j.client.phone,
        address: j.client.address,
        due: w,
        daysLeft: left(w),
        jobId: j.id,
        recurringId: null,
        message: `Dobrý den, ${date(w)} končí záruka na naši práci (${j.title.toLowerCase()}). Pokud jste si všimli čehokoli, co nefunguje, jak má, dejte nám vědět ještě v záruce na ${phone}. Rádi také nabídneme pozáruční prohlídku. ${firm}`,
      });
    }
  }
  return out.sort((a, b) => a.due.getTime() - b.due.getTime());
}
