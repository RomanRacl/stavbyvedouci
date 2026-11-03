'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, ExternalLink, Layers, LayoutTemplate, Mail, Plus, Printer, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { btnPrimary, btnSecondary, inputCls } from '@/components/shell/PageHeader';
import { fmt } from '@/features/analytics/lib/metrics';
import { MaterialSearch } from '@/features/materials/MaterialSearch';
import { acceptQuote, createQuote, deleteQuote, linkLeadQuote, repriceQuote, setQuoteStatus, updateQuote, type Snapshot } from '@/lib/mock/localBackend';
import { lineTotal, quoteTotals, TIERS, VAT_MODES } from '@/lib/money';
import { priceLevelsOf, quotesHitByPrices, toEur } from '@/lib/finance';
import { clientKey, clientsView } from '@/lib/operations';
import { LOST_REASONS } from '@/lib/sales';
import { TRADES } from '@/lib/trades';
import type { LostReason, Quote, QuoteItem, QuoteTier, VatMode } from '@/types/firestore';

interface Props {
  open: boolean;
  quote: Quote | null; // null = nová
  /** Předvyplnění nové nabídky (např. z poptávky v pipeline). */
  prefill?: Partial<Draft> & { leadId?: string };
  snap: Snapshot;
  onClose: () => void;
  onDone: (message: string) => void;
}

type Draft = Omit<Quote, 'id' | 'number' | 'status' | 'createdAt' | 'sentAt' | 'decidedAt' | 'jobId'>;

const KIND = {
  labor: { label: 'Práce', cls: 'bg-series-1/10 text-series-1-ink' },
  material: { label: 'Materiál', cls: 'bg-warn/12 text-warn-ink' },
  other: { label: 'Ostatní', cls: 'bg-concrete text-ink-2' },
} as const;

const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const itemId = () => `qi_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Editor cenové nabídky: položky práce, materiálu a ostatní, DPH, tisk, odeslání a přijetí → zakázka. */
export function QuoteDrawer({ open, quote, prefill, snap, onClose, onDone }: Props) {
  const s = snap.settings;
  const blank = (): Draft => ({
    title: '',
    trade: 'electro',
    vatMode: s.vatPayer ? s.defaultVatMode : 'none',
    client: { name: '', phone: '', email: '', address: '', ico: '' },
    items: [],
    note: '',
    validUntil: new Date(Date.now() + s.quoteValidityDays * 86_400_000),
    templateId: null,
    tiers: false,
    chosenTier: null,
    discountPct: 0,
    currency: 'CZK',
    eurRate: null,
  });
  const [d, setD] = useState<Draft>(blank);
  const [error, setError] = useState('');
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [plan, setPlan] = useState({ start: '', due: '', workerIds: [] as string[] });
  const [rejecting, setRejecting] = useState(false);
  const levels = priceLevelsOf(s);
  const directory = useMemo(() => clientsView({ clients: snap.clients, jobs: snap.jobs, quotes: snap.quotes }), [snap.clients, snap.jobs, snap.quotes]);
  const live = quote ? snap.quotes.find((q) => q.id === quote.id) ?? quote : null;
  const locked = live?.status === 'accepted';

  useEffect(() => {
    if (!open) return;
    if (live) setD(structuredClone({ ...live }));
    else {
      const { leadId: _lead, ...rest } = prefill ?? {};
      setD({ ...blank(), ...rest, client: { ...blank().client, ...(rest.client ?? {}) } });
    }
    setError('');
    setAddingMaterial(false);
    setAccepting(false);
    setRejecting(false);
    const start = new Date(Date.now() + 7 * 86_400_000);
    setPlan({ start: toInputDate(start), due: toInputDate(new Date(start.getTime() + 14 * 86_400_000)), workerIds: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- koncept se načte jen při otevření
  }, [open, quote?.id]);

  const totals = useMemo(() => quoteTotals(d), [d]);
  const setItem = (id: string, patch: Partial<QuoteItem>) => setD({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const num = (v: string) => Math.max(0, Number(v.replace(/\s/g, '').replace(',', '.')) || 0);
  const sale = (cost: number) => Math.round(cost * s.materialMarkup);

  const fromTemplate = (id: string) => {
    const t = snap.templates.find((x) => x.id === id);
    if (!t) return;
    const items: QuoteItem[] = [
      { id: itemId(), kind: 'labor', text: `Práce: ${t.title}`, qty: t.laborHours, unit: 'h', unitPrice: s.billRate },
      ...t.materialLines.flatMap((l) => {
        const c = snap.catalog.find((x) => x.id === l.materialId);
        return c ? [{ id: itemId(), kind: 'material' as const, text: c.name, qty: l.qty, unit: c.unit, unitPrice: sale(c.unitCost), materialId: c.id }] : [];
      }),
    ];
    setD({ ...d, title: d.title || t.title, trade: t.trade, items, templateId: t.id });
  };

  const validate = () => {
    if (!d.client.name.trim()) return 'Vyplňte jméno nebo firmu zákazníka.';
    if (!d.title.trim()) return 'Napište, co nabídka zahrnuje.';
    if (!d.items.length) return 'Přidejte aspoň jednu položku.';
    return '';
  };

  /** Uloží koncept a vrátí id (u nové nabídky ji založí). */
  const persist = (): Quote | null => {
    const err = validate();
    setError(err);
    if (err) return null;
    if (live) {
      updateQuote(live.id, d);
      return { ...live, ...d };
    }
    const q = createQuote(d);
    if (prefill?.leadId) linkLeadQuote(prefill.leadId, q.id);
    return q;
  };

  /** Výběr zákazníka z adresáře doplní kontakty a slevu podle cenové hladiny. */
  const pickClient = (name: string) => {
    const c = directory.find((x) => x.id === clientKey(name));
    if (!c) return setD({ ...d, client: { ...d.client, name } });
    const level = levels.find((l) => l.id === c.priceLevelId);
    setD({
      ...d,
      client: { name: c.name, phone: d.client.phone || c.phone, email: d.client.email || c.email, address: d.client.address || c.address, ico: d.client.ico || c.ico },
      discountPct: level ? level.discountPct : d.discountPct,
    });
  };
  const tierTotals = useMemo(() => (d.tiers ? TIERS.map((t) => ({ ...t, totals: quoteTotals(d, t.id) })) : []), [d]);
  const hit = live && !locked ? quotesHitByPrices([{ ...live, ...d }], snap.catalog, s.materialMarkup)[0] : undefined;

  const mailto = (q: Quote) => {
    const body = [
      'Dobrý den,',
      '',
      `posíláme cenovou nabídku ${q.number} na ${q.title}.`,
      `Celková cena je ${fmt.czk(totals.gross)} ${q.vatMode === 'standard21' || q.vatMode === 'reduced12' ? 'včetně DPH' : ''}, nabídka platí do ${q.validUntil.toLocaleDateString('cs-CZ')}.`,
      'Nabídku v PDF najdete v příloze.',
      '',
      'S pozdravem',
      s.name,
      s.phone,
    ].join('\n');
    return `mailto:${encodeURIComponent(q.client.email)}?subject=${encodeURIComponent(`Cenová nabídka ${q.number}, ${s.name}`)}&body=${encodeURIComponent(body)}`;
  };

  const job = live?.jobId ? snap.jobs.find((j) => j.id === live.jobId) : null;
  const workers = snap.members.filter((m) => m.role !== 'owner');

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={live ? `Nabídka ${live.number}` : 'Nová nabídka'}
      subtitle={live ? `${d.client.name || 'bez zákazníka'}, ${d.title}` : 'Práce, materiál a ostatní položky pro zákazníka'}
      width={780}
      footer={
        locked ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-good-ink">Zákazník nabídku přijal{job ? `, vznikla zakázka ${job.code}` : ''}.</p>
            {job && (
              <Link href={`/dashboard?job=${job.id}`} className={btnPrimary}>
                <ExternalLink className="size-4" /> Otevřít zakázku
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto text-sm">
              <span className="text-ink-2">Celkem </span>
              <strong className="font-display text-lg text-ink tabular-nums">{fmt.czk(totals.gross)}</strong>
              <span className="text-ink-3"> {VAT_MODES[d.vatMode].rate > 0 ? `vč. DPH ${VAT_MODES[d.vatMode].short}` : VAT_MODES[d.vatMode].short}</span>
            </div>
            {live?.status === 'draft' && (
              <button
                type="button"
                onClick={() => {
                  deleteQuote(live.id);
                  onDone(`Koncept ${live.number} smazán.`);
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-2 hover:bg-crit/10 hover:text-crit-ink"
              >
                <Trash2 className="size-4" /> Smazat
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const q = persist();
                if (q) window.open(`/tisk/nabidka/${q.id}`, '_blank');
              }}
              className={btnSecondary}
            >
              <Printer className="size-4" /> Tisk / PDF
            </button>
            <button
              type="button"
              onClick={() => {
                const q = persist();
                if (q) onDone(live ? 'Nabídka uložena.' : `Nabídka ${q.number} vytvořena.`);
              }}
              className={btnPrimary}
            >
              <Check className="size-4" /> Uložit
            </button>
          </div>
        )
      }
    >
      {/* Stav a rozhodnutí zákazníka */}
      {live && !locked && (
        <section className="mb-6 rounded-lg bg-concrete/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={d.client.email ? mailto({ ...live, ...d }) : undefined}
              aria-disabled={!d.client.email}
              onClick={() => {
                if (!d.client.email) return;
                persist();
                setQuoteStatus(live.id, 'sent');
              }}
              className={`${btnSecondary} ${d.client.email ? '' : 'pointer-events-none opacity-50'}`}
              title={d.client.email ? undefined : 'Doplňte e-mail zákazníka'}
            >
              <Mail className="size-4" /> Poslat e-mailem
            </a>
            {live.status === 'draft' && (
              <button type="button" onClick={() => setQuoteStatus(live.id, 'sent')} className={btnSecondary}>
                Označit jako odeslanou
              </button>
            )}
            <span className="flex-1" />
            {live.status !== 'rejected' ? (
              <button type="button" onClick={() => setRejecting((r) => !r)} aria-expanded={rejecting} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-2 hover:bg-concrete">
                <X className="size-4" /> Zákazník odmítl
              </button>
            ) : (
              <button type="button" onClick={() => setQuoteStatus(live.id, 'sent')} className="h-10 rounded-lg px-3 text-sm text-ink-2 hover:bg-concrete">
                Obnovit nabídku
              </button>
            )}
            <button type="button" onClick={() => setAccepting((a) => !a)} className={`${btnPrimary} bg-good hover:bg-good/90`}>
              <Check className="size-4" /> Zákazník přijal
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-3">E-mail otevře váš poštovní program s textem; PDF z tlačítka Tisk / PDF k němu přiložte.</p>
          {live.status === 'rejected' && live.lostReason && <p className="mt-1 text-xs text-ink-2">Důvod odmítnutí: {LOST_REASONS[live.lostReason]}.</p>}

          <AnimatePresence>
            {rejecting && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-sm font-semibold text-ink">Proč zákazník nešel do toho?</p>
                  <p className="text-xs text-ink-3">Důvody se sčítají ve statistice úspěšnosti v Obchodu.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(Object.keys(LOST_REASONS) as LostReason[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          persist();
                          setQuoteStatus(live.id, 'rejected', r);
                          onDone(`Nabídka ${live.number} odmítnuta: ${LOST_REASONS[r].toLowerCase()}.`);
                        }}
                        className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-ink-2 hover:border-ink-3 hover:text-ink"
                      >
                        {LOST_REASONS[r]}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {accepting && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-sm font-semibold text-ink">Vytvořit zakázku z nabídky</p>
                  {d.tiers && (
                    <p className="mt-1 text-xs text-ink-2">
                      Zakázka vznikne z varianty <strong>{TIERS.find((t) => t.id === (d.chosenTier ?? 'standard'))?.label}</strong>. Variantu, kterou si zákazník vybral, změníte v části Varianty.
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-xs text-ink-2">
                      Zahájení
                      <input type="date" value={plan.start} onChange={(e) => setPlan({ ...plan, start: e.target.value })} className={`${inputCls} mt-1`} />
                    </label>
                    <label className="text-xs text-ink-2">
                      Dokončení
                      <input type="date" value={plan.due} onChange={(e) => setPlan({ ...plan, due: e.target.value })} className={`${inputCls} mt-1`} />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {workers.map((w) => {
                      const on = plan.workerIds.includes(w.uid);
                      return (
                        <button
                          key={w.uid}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setPlan({ ...plan, workerIds: on ? plan.workerIds.filter((x) => x !== w.uid) : [...plan.workerIds, w.uid] })}
                          className={`h-9 rounded-lg border px-3 text-sm transition ${on ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2'}`}
                        >
                          {w.displayName}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={!plan.start || !plan.due || plan.due < plan.start}
                    onClick={() => {
                      if (!persist()) return;
                      const j = acceptQuote(live.id, { start: new Date(plan.start), due: new Date(plan.due), workerIds: plan.workerIds });
                      if (j) onDone(`Zakázka ${j.code} vytvořena z nabídky ${live.number}.`);
                    }}
                    className={`${btnPrimary} mt-3`}
                  >
                    Vytvořit zakázku
                  </button>
                  <p className="mt-1.5 text-xs text-ink-3">Cena, hodiny, plán materiálu, DPH a kontrolní seznam se převezmou z nabídky.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {hit && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-warn/40 bg-warn/8 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-warn-ink" />
          <p className="min-w-0 flex-1 text-ink">
            Dodavatel zdražil {hit.lines.length === 1 ? `položku ${hit.lines[0].text}` : `${hit.lines.length} položky`}. Při současné ceně přicházíte o {fmt.czk(hit.shortfall)} z přirážky.
          </p>
          <button
            type="button"
            onClick={() => {
              setD({ ...d, items: d.items.map((i) => ({ ...i, unitPrice: hit.lines.find((l) => l.itemId === i.id)?.newPrice ?? i.unitPrice })) });
              repriceQuote(live!.id, hit.lines.map((l) => ({ itemId: l.itemId, unitPrice: l.newPrice })));
            }}
            className={btnSecondary}
          >
            Přepočítat ceny
          </button>
        </div>
      )}

      <fieldset disabled={locked} className="space-y-6">
        {/* Zákazník */}
        <section className="grid grid-cols-2 gap-3">
          <h3 className="col-span-2 text-sm font-semibold text-ink">Zákazník</h3>
          <input aria-label="Jméno nebo firma" placeholder="Jméno nebo firma" list="quote-clients" value={d.client.name} onChange={(e) => pickClient(e.target.value)} className={inputCls} />
          <datalist id="quote-clients">
            {directory.slice(0, 200).map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <input aria-label="IČO" placeholder="IČO (u firmy)" value={d.client.ico} onChange={(e) => setD({ ...d, client: { ...d.client, ico: e.target.value.replace(/\D/g, '') } })} className={inputCls} />
          <input aria-label="Adresa zakázky" placeholder="Adresa zakázky" value={d.client.address} onChange={(e) => setD({ ...d, client: { ...d.client, address: e.target.value } })} className={`${inputCls} col-span-2`} />
          <input aria-label="E-mail" type="email" placeholder="E-mail" value={d.client.email} onChange={(e) => setD({ ...d, client: { ...d.client, email: e.target.value } })} className={inputCls} />
          <input aria-label="Telefon" type="tel" placeholder="Telefon" value={d.client.phone} onChange={(e) => setD({ ...d, client: { ...d.client, phone: e.target.value } })} className={inputCls} />
        </section>

        {/* Předmět */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">Předmět nabídky</h3>
          <input aria-label="Předmět" placeholder="např. Rekonstrukce koupelny v 1. patře" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} className={inputCls} />
          <div className="flex flex-wrap gap-1.5">
            {TRADES.map((t) => (
              <button key={t.id} type="button" aria-pressed={d.trade === t.id} onClick={() => setD({ ...d, trade: t.id })} className={`h-8 rounded-lg border px-3 text-sm ${d.trade === t.id ? 'border-ink bg-ink text-white' : 'border-line text-ink-2'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-ink-2">
              DPH
              <select value={d.vatMode} onChange={(e) => setD({ ...d, vatMode: e.target.value as VatMode })} disabled={!s.vatPayer} className={`${inputCls} mt-1`}>
                {(Object.keys(VAT_MODES) as VatMode[]).filter((m) => (s.vatPayer ? m !== 'none' : m === 'none')).map((m) => (
                  <option key={m} value={m}>
                    {VAT_MODES[m].label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-ink-3">{VAT_MODES[d.vatMode].hint}</span>
            </label>
            <label className="text-xs text-ink-2">
              Platnost do
              <input type="date" value={toInputDate(d.validUntil)} onChange={(e) => e.target.value && setD({ ...d, validUntil: new Date(e.target.value) })} className={`${inputCls} mt-1`} />
            </label>
          </div>
          {!live && snap.templates.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-2">
                <LayoutTemplate className="size-3.5" /> Načíst položky ze šablony
              </p>
              <div className="flex flex-wrap gap-1.5">
                {snap.templates.map((t) => (
                  <button key={t.id} type="button" onClick={() => fromTemplate(t.id)} className={`h-8 rounded-lg border px-3 text-sm ${d.templateId === t.id ? 'border-ink bg-ink text-white' : 'border-line text-ink-2 hover:text-ink'}`}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Položky */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Položky</h3>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-concrete/60 text-left text-xs text-ink-2">
                <tr>
                  <th className="px-2 py-2 font-medium">Popis</th>
                  <th className="w-20 px-2 py-2 text-right font-medium">Množství</th>
                  <th className="w-16 px-2 py-2 font-medium">MJ</th>
                  <th className="w-24 px-2 py-2 text-right font-medium">Cena/j.</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">Celkem</th>
                  {d.tiers && <th className="w-28 px-2 py-2 font-medium">Od varianty</th>}
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.items.length === 0 && (
                  <tr>
                    <td colSpan={d.tiers ? 7 : 6} className="px-3 py-6 text-center text-ink-2">
                      Přidejte práci a materiál tlačítky níže, nebo načtěte šablonu.
                    </td>
                  </tr>
                )}
                {d.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-2 py-1.5">
                      <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND[i.kind].cls}`}>{KIND[i.kind].label}</span>
                      <input aria-label="Popis položky" value={i.text} onChange={(e) => setItem(i.id, { text: e.target.value })} className="mt-1 h-8 w-full rounded-md border border-transparent px-1.5 hover:border-line focus:border-series-1 focus:outline-none" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input aria-label="Množství" inputMode="decimal" value={i.qty} onChange={(e) => setItem(i.id, { qty: num(e.target.value) })} className="h-8 w-full rounded-md border border-line px-1.5 text-right tabular-nums focus:border-series-1 focus:outline-none" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input aria-label="Jednotka" value={i.unit} onChange={(e) => setItem(i.id, { unit: e.target.value })} className="h-8 w-full rounded-md border border-line px-1.5 focus:border-series-1 focus:outline-none" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input aria-label="Cena za jednotku" inputMode="decimal" value={i.unitPrice} onChange={(e) => setItem(i.id, { unitPrice: num(e.target.value) })} className="h-8 w-full rounded-md border border-line px-1.5 text-right tabular-nums focus:border-series-1 focus:outline-none" />
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium text-ink tabular-nums">{fmt.czk(lineTotal(i))}</td>
                    {d.tiers && (
                      <td className="px-2 py-1.5">
                        <select aria-label="Od které varianty" value={i.tier ?? 'basic'} onChange={(e) => setItem(i.id, { tier: e.target.value === 'basic' ? undefined : (e.target.value as QuoteTier) })} className="h-8 w-full rounded-md border border-line bg-surface px-1 text-sm">
                          {TIERS.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="pr-1">
                      <button type="button" aria-label="Odebrat položku" onClick={() => setD({ ...d, items: d.items.filter((x) => x.id !== i.id) })} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-crit/10 hover:text-crit-ink">
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!locked && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setD({ ...d, items: [...d.items, { id: itemId(), kind: 'labor', text: 'Práce', qty: 8, unit: 'h', unitPrice: s.billRate }] })} className={btnSecondary}>
                <Plus className="size-4" /> Práce
              </button>
              <button type="button" onClick={() => setAddingMaterial((a) => !a)} aria-expanded={addingMaterial} className={btnSecondary}>
                <Plus className="size-4" /> Materiál z katalogu
              </button>
              <button type="button" onClick={() => setD({ ...d, items: [...d.items, { id: itemId(), kind: 'other', text: '', qty: 1, unit: 'kpl', unitPrice: 0 }] })} className={btnSecondary}>
                <Plus className="size-4" /> Ostatní (doprava, revize…)
              </button>
            </div>
          )}
          {addingMaterial && !locked && (
            <div className="mt-3 rounded-lg border border-line p-3">
              <MaterialSearch
                catalog={snap.catalog}
                excludeIds={d.items.flatMap((i) => (i.materialId ? [i.materialId] : []))}
                onPick={(c) => setD({ ...d, items: [...d.items, { id: itemId(), kind: 'material', text: c.name, qty: 1, unit: c.unit, unitPrice: sale(c.unitCost), materialId: c.id }] })}
                autoFocus
              />
              <p className="mt-1 text-xs text-ink-3">Prodejní cena = nákupní cena + přirážka {Math.round((s.materialMarkup - 1) * 100)} % (mění se v Nastavení).</p>
            </div>
          )}

          <section className="mt-5 space-y-4 rounded-lg border border-line p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" checked={Boolean(d.tiers)} onChange={(e) => setD({ ...d, tiers: e.target.checked, chosenTier: e.target.checked ? d.chosenTier ?? null : null })} className="size-4 accent-ink" />
              <Layers className="size-4" /> Nabídnout ve třech variantách
            </label>
            {d.tiers && (
              <div>
                <p className="mb-2 text-xs text-ink-3">U každé položky zvolte, od které varianty je v ceně. Zákazník vybere jednu, ta se pak stane zakázkou.</p>
                <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Varianta, kterou zákazník vybral">
                  {tierTotals.map((t) => {
                    const chosen = (d.chosenTier ?? null) === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        onClick={() => setD({ ...d, chosenTier: chosen ? null : t.id })}
                        className={`rounded-lg border p-3 text-left transition ${chosen ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink-3'}`}
                      >
                        <span className="block text-sm font-semibold text-ink">{t.label}</span>
                        <span className="block text-xs text-ink-3">{t.hint}</span>
                        <span className="mt-1 block font-display text-lg font-semibold tabular-nums">{fmt.czk(t.totals.gross)}</span>
                        <span className="block text-xs text-ink-3">{chosen ? 'zákazník vybral' : 'klepnutím označíte výběr zákazníka'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-ink-2">
                Cenová hladina zákazníka
                <select
                  value={levels.find((l) => l.discountPct === (d.discountPct ?? 0))?.id ?? 'custom'}
                  onChange={(e) => {
                    const l = levels.find((x) => x.id === e.target.value);
                    if (l) setD({ ...d, discountPct: l.discountPct });
                  }}
                  className={`${inputCls} mt-1`}
                >
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} {l.discountPct ? `(−${l.discountPct} %)` : ''}
                    </option>
                  ))}
                  <option value="custom">Vlastní sleva</option>
                </select>
              </label>
              <label className="text-xs text-ink-2">
                Sleva %
                <input inputMode="numeric" value={d.discountPct ?? 0} onChange={(e) => setD({ ...d, discountPct: Math.min(50, Number(e.target.value.replace(/\D/g, '')) || 0) })} className={`${inputCls} mt-1 text-right tabular-nums`} />
              </label>
              <label className="text-xs text-ink-2">
                Měna nabídky
                <select
                  value={d.currency ?? 'CZK'}
                  onChange={(e) => setD({ ...d, currency: e.target.value as 'CZK' | 'EUR', eurRate: e.target.value === 'EUR' ? d.eurRate ?? s.eurRate ?? 25 : null })}
                  className={`${inputCls} mt-1`}
                >
                  <option value="CZK">Kč</option>
                  <option value="EUR">EUR, kurz {String(d.eurRate ?? s.eurRate ?? 25).replace('.', ',')}</option>
                </select>
              </label>
            </div>
          </section>

          <dl className="mt-4 ml-auto grid w-72 grid-cols-2 gap-y-1 text-sm">
            {totals.discount > 0 && (
              <>
                <dt className="text-ink-2">Ceník</dt>
                <dd className="text-right tabular-nums">{fmt.czk(totals.list)}</dd>
                <dt className="text-ink-2">Sleva {totals.discountPct} %</dt>
                <dd className="text-right text-good-ink tabular-nums">−{fmt.czk(totals.discount)}</dd>
              </>
            )}
            <dt className="text-ink-2">Práce</dt>
            <dd className="text-right tabular-nums">{fmt.czk(totals.labor)}</dd>
            <dt className="text-ink-2">Materiál</dt>
            <dd className="text-right tabular-nums">{fmt.czk(totals.material)}</dd>
            <dt className="text-ink-2">Ostatní</dt>
            <dd className="text-right tabular-nums">{fmt.czk(totals.other)}</dd>
            <dt className="border-t border-line pt-1 font-medium text-ink">Bez DPH</dt>
            <dd className="border-t border-line pt-1 text-right font-medium tabular-nums">{fmt.czk(totals.net)}</dd>
            <dt className="text-ink-2">DPH {VAT_MODES[d.vatMode].short}</dt>
            <dd className="text-right tabular-nums">{fmt.czk(totals.vat)}</dd>
            <dt className="font-semibold text-ink">Celkem{d.tiers ? ` (${TIERS.find((t) => t.id === (d.chosenTier ?? 'standard'))?.label})` : ''}</dt>
            <dd className="text-right font-semibold tabular-nums">{fmt.czk(totals.gross)}</dd>
            {d.currency === 'EUR' && (
              <>
                <dt className="text-ink-2">V EUR</dt>
                <dd className="text-right tabular-nums">{toEur(totals.gross, d.eurRate ?? s.eurRate ?? 25).toLocaleString('cs-CZ', { style: 'currency', currency: 'EUR' })}</dd>
              </>
            )}
          </dl>
        </section>

        <label className="block text-sm font-semibold text-ink">
          Poznámka pro zákazníka
          <textarea value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} rows={2} placeholder="např. Cena nezahrnuje malování." className="mt-1.5 block w-full rounded-lg border border-line px-3 py-2 text-sm font-normal text-ink focus:border-series-1 focus:outline-none" />
        </label>
      </fieldset>
      {error && <p className="mt-3 text-sm text-crit-ink">{error}</p>}
    </Drawer>
  );
}
