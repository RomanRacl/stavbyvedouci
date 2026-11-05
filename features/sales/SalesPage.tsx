'use client';

import { LayoutGroup, motion } from 'framer-motion';
import { CalendarClock, Check, Copy, FileText, Phone, Plus, Trash2, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState, type DragEvent } from 'react';
import { btnPrimary, btnSecondary, inputCls, PageHeader } from '@/components/shell/PageHeader';
import { Drawer } from '@/components/ui/Drawer';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { fmt } from '@/features/analytics/lib/metrics';
import { QuoteDrawer } from '@/features/quotes/QuoteDrawer';
import { createFromRecurring, deleteLead, markServiceDone, saveLead, setLeadStage, type Snapshot } from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { LEAD_SOURCES, LEAD_STAGES, leadView, LOST_REASONS, serviceReminders, winStats, type ServiceReminder } from '@/lib/sales';
import { TRADE_LABEL, TRADES } from '@/lib/trades';
import type { Lead, LeadSource, LeadStage, LostReason, Quote } from '@/types/firestore';

const TABS = [
  { id: 'pipeline', label: 'Poptávky' },
  { id: 'stats', label: 'Úspěšnost' },
  { id: 'service', label: 'Servis a záruky' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const DAY = 86_400_000;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Obchod: pipeline poptávek, úspěšnost nabídek a připomínky servisu zákazníkům. */
export default function SalesPage() {
  const snap = useSnapshot();
  const [tab, setTab] = useState<Tab>('pipeline');
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const say = (text: string, tone: ToastMsg['tone'] = 'success') => setToast({ text, tone, id: Date.now() });

  if (!snap) return <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" />;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Obchod" description="Poptávky od prvního telefonátu po podepsanou zakázku, proč nabídky vyhráváte a prohráváte, a komu se připomenout se servisem." />
      <LayoutGroup id="sales-tabs">
        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Části">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`relative shrink-0 px-3 pb-3 text-sm font-medium ${tab === t.id ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}>
              {t.label}
              {tab === t.id && <motion.span layoutId="sales-tab" className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-ink" />}
            </button>
          ))}
        </div>
      </LayoutGroup>
      {tab === 'pipeline' && <Pipeline snap={snap} say={say} />}
      {tab === 'stats' && <Stats snap={snap} />}
      {tab === 'service' && <Service snap={snap} say={say} />}
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}

/* ---------- pipeline ---------- */

const blankLead = (): Lead => ({
  id: '',
  title: '',
  trade: 'electro',
  clientName: '',
  phone: '',
  email: '',
  address: '',
  source: 'phone',
  stage: 'inquiry',
  value: 0,
  note: '',
  nextStep: new Date(Date.now() + DAY),
  quoteId: null,
  lostReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

function Pipeline({ snap, say }: { snap: Snapshot; say: (t: string, tone?: 'success' | 'error') => void }) {
  const leads = useMemo(() => snap.leads.map((l) => leadView(l, snap.quotes)), [snap.leads, snap.quotes]);
  const stats = useMemo(() => winStats(snap.quotes, snap.leads), [snap.quotes, snap.leads]);
  const [edit, setEdit] = useState<Lead | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [quoteFor, setQuoteFor] = useState<{ lead: Lead | null; quote: Quote | null } | null>(null);
  const today = startOfToday().getTime();
  const open = leads.filter((l) => l.stage !== 'won' && l.stage !== 'lost');
  const followUps = open.filter((l) => l.nextStep && l.nextStep.getTime() < today + DAY);
  const recentDays = 90;
  const visible = leads.filter((l) => (l.stage !== 'won' && l.stage !== 'lost') || l.updatedAt.getTime() > Date.now() - recentDays * DAY);

  const drop = (e: DragEvent, stage: LeadStage) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/lead');
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    if (lead.quote && (lead.quote.status === 'accepted' || lead.quote.status === 'rejected')) {
      say('O fázi rozhoduje nabídka, která už je uzavřená.', 'error');
      return;
    }
    if (stage === 'lost') {
      setEdit({ ...lead, stage: 'lost', lostReason: lead.lostReason ?? 'other' });
      return;
    }
    setLeadStage(id, stage);
    say(`${lead.clientName}: ${LEAD_STAGES.find((s) => s.id === stage)?.label}.`);
  };

  return (
    <>
      <section className="mb-5 grid grid-cols-2 divide-line rounded-xl border border-line bg-surface lg:grid-cols-4 lg:divide-x max-lg:gap-y-1" aria-label="Souhrn">
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Ve hře</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{fmt.czk(stats.pipelineValue)}</p>
          <p className="text-xs text-ink-3">{open.length} poptávek a otevřené nabídky, bez DPH</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Pravděpodobně vyhrajete</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{fmt.czk(stats.weightedValue)}</p>
          <p className="text-xs text-ink-3">vážené podle fáze a vaší úspěšnosti</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Úspěšnost nabídek</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{stats.winRate === null ? '—' : fmt.pct(stats.winRate)}</p>
          <p className="text-xs text-ink-3">za 12 měsíců</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Ozvat se dnes</p>
          <p className={`font-display text-2xl font-semibold tabular-nums ${followUps.length ? 'text-warn-ink' : ''}`}>{followUps.length}</p>
          <p className="truncate text-xs text-ink-3">{followUps.map((l) => l.clientName).join(', ') || 'nikdo nečeká'}</p>
        </div>
      </section>

      <div className="mb-3 flex items-center gap-2">
        <p className="mr-auto text-sm text-ink-2">Přetáhněte kartu do další fáze. Vyhrané a prohrané se zobrazují 90 dní.</p>
        <button type="button" onClick={() => setEdit(blankLead())} className={btnPrimary}>
          <Plus className="size-4" /> Nová poptávka
        </button>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[1080px] grid-cols-6 gap-3">
          {LEAD_STAGES.map((st) => {
            const col = visible.filter((l) => l.stage === st.id);
            const value = col.reduce((a, l) => a + l.value, 0);
            return (
              <section
                key={st.id}
                aria-label={st.label}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(st.id);
                }}
                onDragLeave={() => setOver((o) => (o === st.id ? null : o))}
                onDrop={(e) => drop(e, st.id)}
                className={`flex min-h-64 flex-col rounded-xl border p-2 transition-colors ${over === st.id ? 'border-series-1 bg-series-1/5' : 'border-line bg-concrete/50'}`}
              >
                <header className="mb-2 px-1">
                  <p className="flex items-baseline justify-between text-sm font-semibold text-ink">
                    {st.label} <span className="text-xs font-normal text-ink-3 tabular-nums">{col.length}</span>
                  </p>
                  <p className="text-xs text-ink-3 tabular-nums">{value ? fmt.czk(value) : st.hint}</p>
                </header>
                <ul className="flex flex-1 flex-col gap-2">
                  {col.map((l) => {
                    const late = l.nextStep && l.nextStep.getTime() < today && st.id !== 'won' && st.id !== 'lost';
                    return (
                      <li key={l.id}>
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/lead', l.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onClick={() => setEdit(snap.leads.find((x) => x.id === l.id) ?? l)}
                          onKeyDown={(e) => e.key === 'Enter' && setEdit(snap.leads.find((x) => x.id === l.id) ?? l)}
                          role="button"
                          tabIndex={0}
                          className="cursor-grab rounded-lg border border-line bg-surface p-2.5 text-left shadow-sm transition hover:border-ink-3 focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:outline-none active:cursor-grabbing"
                        >
                          <p className="text-sm font-medium leading-snug text-ink">{l.clientName}</p>
                          <p className="text-xs text-ink-2">{l.title}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                            {l.value > 0 && <span className="font-semibold text-ink tabular-nums">{fmt.czk(l.value)}</span>}
                            <span className="rounded bg-concrete px-1.5 py-0.5 text-ink-2">{LEAD_SOURCES[l.source]}</span>
                            {l.quote && <span className="rounded bg-series-1/10 px-1.5 py-0.5 text-series-1-ink">{l.quote.number}</span>}
                          </div>
                          {st.id === 'lost' && l.lostReason && <p className="mt-1 text-xs text-ink-3">{LOST_REASONS[l.lostReason]}</p>}
                          {l.nextStep && st.id !== 'won' && st.id !== 'lost' && (
                            <p className={`mt-1 flex items-center gap-1 text-xs ${late ? 'font-medium text-crit-ink' : 'text-ink-3'}`}>
                              <CalendarClock className="size-3.5" />
                              {l.nextStep.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}
                              {late && ', zpoždění'}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <LeadDrawer
        lead={edit}
        snap={snap}
        onClose={() => setEdit(null)}
        onSaved={(t) => {
          setEdit(null);
          say(t);
        }}
        onQuote={(lead) => {
          const q = lead.quoteId ? snap.quotes.find((x) => x.id === lead.quoteId) ?? null : null;
          setEdit(null);
          setQuoteFor({ lead, quote: q });
        }}
      />
      <QuoteDrawer
        open={Boolean(quoteFor)}
        quote={quoteFor?.quote ?? null}
        prefill={
          quoteFor?.lead && !quoteFor.quote
            ? {
                leadId: quoteFor.lead.id,
                title: quoteFor.lead.title,
                trade: quoteFor.lead.trade,
                client: { name: quoteFor.lead.clientName, phone: quoteFor.lead.phone, email: quoteFor.lead.email, address: quoteFor.lead.address, ico: '' },
              }
            : undefined
        }
        snap={snap}
        onClose={() => setQuoteFor(null)}
        onDone={(t) => {
          setQuoteFor(null);
          say(t);
        }}
      />
    </>
  );
}

function LeadDrawer({ lead, snap, onClose, onSaved, onQuote }: { lead: Lead | null; snap: Snapshot; onClose: () => void; onSaved: (t: string) => void; onQuote: (l: Lead) => void }) {
  const [f, setF] = useState<Lead>(blankLead);
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = lead ? `${lead.id}:${lead.stage}` : null;
  if (lead && loaded !== key) {
    setLoaded(key);
    setF(lead);
  }
  if (!lead && loaded !== null) setLoaded(null);
  const view = lead ? leadView(f, snap.quotes) : null;
  const decided = view?.quote && (view.quote.status === 'accepted' || view.quote.status === 'rejected');
  const valid = f.clientName.trim() && f.title.trim();

  const save = (msg?: string) => {
    if (!valid) return;
    const saved = saveLead({ ...f, lostReason: f.stage === 'lost' ? f.lostReason ?? 'other' : null });
    onSaved(msg ?? (lead?.id ? 'Poptávka uložena.' : `Poptávka ${saved.clientName} přidána.`));
    return saved;
  };

  return (
    <Drawer
      open={Boolean(lead)}
      onClose={onClose}
      title={lead?.id ? f.clientName || 'Poptávka' : 'Nová poptávka'}
      subtitle={lead?.id ? `${f.title}, ${LEAD_STAGES.find((s) => s.id === (view?.stage ?? f.stage))?.label}` : 'Zapište si kontakt hned po telefonátu, ať nic nezapadne.'}
      width={560}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {lead?.id && !f.quoteId && (
            <button
              type="button"
              onClick={() => {
                deleteLead(f.id);
                onSaved('Poptávka smazána.');
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-2 hover:bg-crit/10 hover:text-crit-ink"
            >
              <Trash2 className="size-4" /> Smazat
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            disabled={!valid}
            onClick={() => {
              const saved = save('Poptávka uložena.');
              if (saved) onQuote(saved);
            }}
            className={btnSecondary}
          >
            <FileText className="size-4" /> {f.quoteId ? 'Otevřít nabídku' : 'Připravit nabídku'}
          </button>
          <button type="button" disabled={!valid} onClick={() => save()} className={btnPrimary}>
            <Check className="size-4" /> Uložit
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <input aria-label="Zákazník" placeholder="Jméno nebo firma" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} className={`${inputCls} col-span-2`} />
        <input aria-label="Co poptává" placeholder="Co poptává, např. rekonstrukce koupelny" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={`${inputCls} col-span-2`} />
        <input aria-label="Telefon" type="tel" placeholder="Telefon" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inputCls} />
        <input aria-label="E-mail" type="email" placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputCls} />
        <input aria-label="Adresa" placeholder="Adresa" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className={`${inputCls} col-span-2`} />
        <label className="text-xs text-ink-2">
          Obor
          <select value={f.trade} onChange={(e) => setF({ ...f, trade: e.target.value as Lead['trade'] })} className={`${inputCls} mt-1`}>
            {TRADES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-2">
          Odkud přišla
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as LeadSource })} className={`${inputCls} mt-1`}>
            {(Object.keys(LEAD_SOURCES) as LeadSource[]).map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCES[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-2">
          Odhad hodnoty bez DPH
          <input inputMode="numeric" value={f.value || ''} placeholder="0" onChange={(e) => setF({ ...f, value: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={`${inputCls} mt-1 text-right tabular-nums`} />
        </label>
        <label className="text-xs text-ink-2">
          Další krok (obhlídka, telefonát)
          <input type="date" value={f.nextStep ? toInputDate(f.nextStep) : ''} onChange={(e) => setF({ ...f, nextStep: e.target.value ? new Date(e.target.value) : null })} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-xs text-ink-2">
          Fáze
          <select value={view?.stage ?? f.stage} disabled={Boolean(decided)} onChange={(e) => setF({ ...f, stage: e.target.value as LeadStage })} className={`${inputCls} mt-1`}>
            {LEAD_STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {(view?.stage ?? f.stage) === 'lost' && (
          <label className="text-xs text-ink-2">
            Důvod prohry
            <select value={view?.lostReason ?? f.lostReason ?? 'other'} disabled={Boolean(decided)} onChange={(e) => setF({ ...f, lostReason: e.target.value as LostReason })} className={`${inputCls} mt-1`}>
              {(Object.keys(LOST_REASONS) as LostReason[]).map((r) => (
                <option key={r} value={r}>
                  {LOST_REASONS[r]}
                </option>
              ))}
            </select>
          </label>
        )}
        <textarea aria-label="Poznámka" placeholder="Poznámka: co zákazník chce, rozpočet, termín…" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={3} className="col-span-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-series-1 focus:outline-none" />
      </div>
      {view?.quote && (
        <p className="mt-4 rounded-lg bg-concrete/60 px-3 py-2 text-sm text-ink-2">
          Nabídka {view.quote.number}: {view.quote.status === 'accepted' ? 'přijata, vznikla zakázka' : view.quote.status === 'rejected' ? 'odmítnuta' : view.quote.status === 'sent' ? 'odeslaná, čeká na zákazníka' : 'koncept'}.
          {decided && ' Fázi poptávky určuje nabídka.'}
        </p>
      )}
      {f.phone && (
        <a href={`tel:${f.phone.replace(/\s/g, '')}`} className={`${btnSecondary} mt-4`}>
          <Phone className="size-4" /> {f.phone}
        </a>
      )}
    </Drawer>
  );
}

/* ---------- úspěšnost ---------- */

function Meter({ label, value, max, right, tone = 'bg-series-1' }: { label: string; value: number; max: number; right: string; tone?: string }) {
  return (
    <li className="grid grid-cols-[minmax(110px,160px)_1fr_auto] items-center gap-3 text-sm">
      <span className="truncate text-ink-2">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-line">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${max ? Math.max(3, (value / max) * 100) : 0}%` }} />
      </span>
      <span className="w-28 text-right font-medium text-ink tabular-nums">{right}</span>
    </li>
  );
}

function Stats({ snap }: { snap: Snapshot }) {
  const ws = useMemo(() => winStats(snap.quotes, snap.leads), [snap.quotes, snap.leads]);
  const maxReason = Math.max(1, ...ws.reasons.map((r) => r.count));
  const top = ws.reasons[0];

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 divide-line rounded-xl border border-line bg-surface lg:grid-cols-4 lg:divide-x" aria-label="Úspěšnost za 12 měsíců">
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Vyhrané nabídky</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{ws.winRate === null ? '—' : fmt.pct(ws.winRate)}</p>
          <p className="text-xs text-ink-3">
            {ws.won} z {ws.decided} rozhodnutých
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Podle hodnoty</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{ws.valueRate === null ? '—' : fmt.pct(ws.valueRate)}</p>
          <p className="text-xs text-ink-3">vyhráno {fmt.czk(ws.wonValue)}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Prohráno</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{fmt.czk(ws.lostValue)}</p>
          <p className="text-xs text-ink-3">bez DPH</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Rozhodnutí zákazníka</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{ws.avgDaysToDecision === null ? '—' : `${Math.round(ws.avgDaysToDecision)} dní`}</p>
          <p className="text-xs text-ink-3">průměr od odeslání</p>
        </div>
      </section>

      {top && (
        <p className="rounded-xl border border-line bg-surface px-5 py-4 text-sm text-ink">
          Nejčastější důvod prohry: <strong>{top.label.toLowerCase()}</strong> ({top.count}× za {fmt.czk(top.value)}).
          {top.reason === 'price' && ' Zkuste posílat nabídky ve třech variantách: zákazník, kterému vadí cena, si často vybere Základ místo odchodu ke konkurenci.'}
          {top.reason === 'no_response' && ' Pomůže zavolat 3 dny po odeslání nabídky. Termín si zapište do Dalšího kroku u poptávky.'}
          {top.reason === 'term' && ' Ukažte zákazníkovi nejbližší volný termín z Kalendáře hned v nabídce.'}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-ink">Proč prohráváte</h2>
          {ws.reasons.length === 0 ? (
            <p className="mt-2 text-sm text-ink-2">Zatím žádná prohraná nabídka s důvodem.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {ws.reasons.map((r) => (
                <Meter key={r.reason} label={r.label} value={r.count} max={maxReason} right={`${r.count}× ${fmt.czkShort(r.value)}`} tone="bg-series-2" />
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-ink">Úspěšnost podle oboru</h2>
          <ul className="mt-3 space-y-2.5">
            {ws.byTrade.map((t) => (
              <Meter key={t.trade} label={TRADE_LABEL[t.trade]} value={t.rate} max={1} right={`${fmt.pct(t.rate)} (${t.won}/${t.decided})`} />
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-ink">Odkud přicházejí zakázky</h2>
          {ws.bySource.length === 0 ? (
            <p className="mt-2 text-sm text-ink-2">Uzavřené poptávky zatím nejsou. Zdroj se zapisuje u každé poptávky.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {ws.bySource.map((s) => (
                <Meter key={s.source} label={s.label} value={s.rate} max={1} right={`${fmt.pct(s.rate)} (${s.won}/${s.leads})`} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ---------- servis a záruky ---------- */

const KIND: Record<ServiceReminder['kind'], { label: string; cls: string }> = {
  recurring: { label: 'Pravidelný servis', cls: 'bg-series-1/10 text-series-1-ink' },
  revision: { label: 'Revize', cls: 'bg-warn/12 text-warn-ink' },
  warranty: { label: 'Konec záruky', cls: 'bg-concrete text-ink-2' },
};

function Service({ snap, say }: { snap: Snapshot; say: (t: string) => void }) {
  const list = useMemo(() => serviceReminders({ jobs: snap.jobs, recurring: snap.recurring, settings: snap.settings }, 60), [snap.jobs, snap.recurring, snap.settings]);
  const [showDone, setShowDone] = useState(false);
  const pending = list.filter((r) => !snap.serviceDone[r.key]);
  const shown = showDone ? list : pending;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      say('Text zkopírován, vložte ho do SMS nebo e-mailu.');
    } catch {
      say('Text se nepodařilo zkopírovat, označte ho ručně.');
    }
  };

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="mr-auto text-base font-semibold text-ink">
          Připomenout zákazníkům v příštích 60 dnech <span className="font-normal text-ink-3">({pending.length})</span>
        </h2>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="size-4 accent-ink" /> i vyřízené
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-2">Nikomu teď není potřeba nic připomínat.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((r) => {
            const done = snap.serviceDone[r.key];
            return (
              <li key={r.key} className={`px-4 py-3 ${done ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND[r.kind].cls}`}>{KIND[r.kind].label}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{r.clientName}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {r.title}, {r.address}
                    </span>
                  </span>
                  <span className={`text-sm tabular-nums ${r.daysLeft <= 7 ? 'font-medium text-warn-ink' : 'text-ink-2'}`}>
                    {r.due.toLocaleDateString('cs-CZ')} ({r.daysLeft < 0 ? `před ${-r.daysLeft} dny` : r.daysLeft === 0 ? 'dnes' : `za ${r.daysLeft} dní`})
                  </span>
                </div>
                <p className="mt-2 rounded-lg bg-concrete/60 px-3 py-2 text-sm text-ink-2">{r.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => copy(r.message)} className={btnSecondary}>
                    <Copy className="size-4" /> Kopírovat text
                  </button>
                  {r.phone && (
                    <a href={`sms:${r.phone.replace(/\s/g, '')}?body=${encodeURIComponent(r.message)}`} className={btnSecondary}>
                      <Phone className="size-4" /> SMS {r.phone}
                    </a>
                  )}
                  {r.recurringId && (
                    <button
                      type="button"
                      onClick={() => {
                        const j = createFromRecurring(r.recurringId!);
                        markServiceDone(r.key);
                        if (j) say(`Zakázka ${j.code} naplánovaná na ${j.schedule.start.toLocaleDateString('cs-CZ')}.`);
                      }}
                      className={btnSecondary}
                    >
                      <Wrench className="size-4" /> Založit zakázku
                    </button>
                  )}
                  {r.jobId && !r.recurringId && (
                    <Link href={`/dashboard?job=${r.jobId}`} className={btnSecondary}>
                      Původní zakázka
                    </Link>
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => {
                      markServiceDone(r.key, !done);
                      say(done ? 'Vráceno mezi nevyřízené.' : `${r.clientName}: vyřízeno.`);
                    }}
                    className={done ? btnSecondary : btnPrimary}
                  >
                    <Check className="size-4" /> {done ? 'Vrátit' : 'Vyřízeno'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
