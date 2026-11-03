'use client';

import { LayoutGroup, motion } from 'framer-motion';
import { AlertTriangle, FileText, Layers, Plus, TrendingUp } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { btnPrimary, PageHeader } from '@/components/shell/PageHeader';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { fmt } from '@/features/analytics/lib/metrics';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { quoteTotals } from '@/lib/money';
import { quotesHitByPrices, recentPriceChanges } from '@/lib/finance';
import { repriceQuote } from '@/lib/mock/localBackend';
import type { Quote } from '@/types/firestore';
import { QuoteDrawer } from './QuoteDrawer';

const STATUS: Record<Quote['status'], { label: string; cls: string }> = {
  draft: { label: 'Koncept', cls: 'bg-concrete text-ink-2' },
  sent: { label: 'Odesláno', cls: 'bg-series-1/10 text-series-1-ink' },
  accepted: { label: 'Přijato', cls: 'bg-good/12 text-good-ink' },
  rejected: { label: 'Odmítnuto', cls: 'bg-concrete text-ink-3' },
};

const FILTERS = [
  { id: 'open', label: 'Rozpracované' },
  { id: 'accepted', label: 'Přijaté' },
  { id: 'rejected', label: 'Odmítnuté' },
  { id: 'all', label: 'Vše' },
] as const;

/** Cenové nabídky: od konceptu přes odeslání po přijetí, ze kterého jedním klikem vznikne zakázka. */
export default function QuotesPage() {
  const snap = useSnapshot();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('open');
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Quote | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const stats = useMemo(() => {
    if (!snap) return null;
    const sent = snap.quotes.filter((q) => q.status === 'sent');
    const decided = snap.quotes.filter((q) => q.status === 'accepted' || q.status === 'rejected');
    return {
      pendingValue: sent.reduce((a, q) => a + quoteTotals(q).net, 0),
      pendingCount: sent.length,
      winRate: decided.length ? decided.filter((q) => q.status === 'accepted').length / decided.length : null,
      expired: sent.filter((q) => q.validUntil.getTime() < Date.now()).length,
    };
  }, [snap]);

  const priceWatch = useMemo(() => {
    if (!snap) return null;
    const hits = quotesHitByPrices(snap.quotes, snap.catalog, snap.settings.materialMarkup);
    const changes = recentPriceChanges(snap.catalog).filter((c) => c.pct > 0);
    return hits.length || changes.length ? { hits, changes } : null;
  }, [snap]);

  if (!snap || !stats) return <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" />;

  const list = snap.quotes
    .filter((q) => (filter === 'all' ? true : filter === 'open' ? q.status === 'draft' || q.status === 'sent' : q.status === filter))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Nabídky"
        description="Cenové nabídky pro zákazníky. Když zákazník přijme, zakázka vznikne jedním klikem i s materiálem a kontrolním seznamem."
        actions={
          <button
            type="button"
            onClick={() => {
              setCurrent(null);
              setOpen(true);
            }}
            className={btnPrimary}
          >
            <Plus className="size-4" /> Nová nabídka
          </button>
        }
      />

      <section className="mb-5 grid grid-cols-1 divide-line rounded-xl border border-line bg-surface sm:grid-cols-3 sm:divide-x max-sm:divide-y" aria-label="Přehled nabídek">
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Čeká na zákazníka</p>
          <p className="font-display text-2xl font-semibold text-ink tabular-nums">{fmt.czk(stats.pendingValue)}</p>
          <p className="text-xs text-ink-3">{stats.pendingCount} odeslaných nabídek, bez DPH</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Úspěšnost</p>
          <p className="font-display text-2xl font-semibold text-ink tabular-nums">{stats.winRate === null ? '—' : fmt.pct(stats.winRate)}</p>
          <p className="text-xs text-ink-3">přijaté z rozhodnutých</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Prošlá platnost</p>
          <p className={`font-display text-2xl font-semibold tabular-nums ${stats.expired ? 'text-warn-ink' : 'text-ink'}`}>{stats.expired}</p>
          <p className="text-xs text-ink-3">odeslané nabídky po termínu, stojí za telefonát</p>
        </div>
      </section>

      {priceWatch && (
        <section className="mb-5 rounded-xl border border-warn/40 bg-warn/8 p-4" aria-labelledby="price-watch">
          <h2 id="price-watch" className="flex items-center gap-2 text-base font-semibold text-ink">
            <TrendingUp className="size-4 text-warn-ink" /> Dodavatelé zdražili
          </h2>
          {priceWatch.changes.length > 0 && (
            <p className="mt-1 text-sm text-ink-2">
              Za posledních 60 dní:{' '}
              {priceWatch.changes
                .slice(0, 4)
                .map((c) => `${c.item.name} +${Math.round(c.pct * 100)} % (${c.from} → ${c.to} Kč)`)
                .join(', ')}
              {priceWatch.changes.length > 4 && ` a dalších ${priceWatch.changes.length - 4}`}.
            </p>
          )}
          {priceWatch.hits.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {priceWatch.hits.map((h) => (
                <li key={h.quote.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-ink">
                      {h.quote.number} {h.quote.client.name}
                    </span>
                    <span className="block text-xs text-ink-3">{h.lines.map((l) => `${l.text} ${l.oldPrice} → ${l.newPrice} Kč`).join(', ')}</span>
                  </span>
                  <span className="text-warn-ink tabular-nums">−{fmt.czk(h.shortfall)} z přirážky</span>
                  <button
                    type="button"
                    onClick={() => {
                      repriceQuote(h.quote.id, h.lines.map((l) => ({ itemId: l.itemId, unitPrice: l.newPrice })));
                      setToast({ text: `Ceny v ${h.quote.number} přepočítány.${h.quote.status === 'sent' ? ' Nabídka už je u zákazníka, pošlete mu novou verzi.' : ''}`, tone: 'success', id: Date.now() });
                    }}
                    className="h-8 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink hover:border-ink-3"
                  >
                    Přepočítat ceny
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-2">Otevřené nabídky to nijak neohrožuje.</p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-line bg-surface">
        <LayoutGroup id="quote-filters">
          <div className="flex gap-1 overflow-x-auto border-b border-line p-3" role="tablist" aria-label="Filtr nabídek">
            {FILTERS.map((f) => {
              const active = f.id === filter;
              return (
                <button key={f.id} role="tab" aria-selected={active} onClick={() => setFilter(f.id)} className={`relative shrink-0 rounded-md px-3 py-1.5 text-sm ${active ? 'text-white' : 'text-ink-2 hover:text-ink'}`}>
                  {active && <motion.span layoutId="quote-filter" className="absolute inset-0 rounded-md bg-ink" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <span className="relative">{f.label}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
        {list.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <FileText className="mx-auto size-8 text-ink-3" />
            <p className="mt-3 font-medium text-ink">Žádné nabídky v tomto filtru</p>
            <p className="mt-1 text-sm text-ink-2">Novou nabídku připravíte za pár minut, rychleji ze šablony.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((q) => {
              const t = quoteTotals(q);
              const expired = q.status === 'sent' && q.validUntil.getTime() < Date.now();
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrent(q);
                      setOpen(true);
                    }}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-concrete/60"
                  >
                    <span className="w-32 font-display text-sm font-semibold text-ink-2 tabular-nums">{q.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate font-medium text-ink">
                        {q.title}
                        {q.tiers && <Layers className="size-3.5 shrink-0 text-ink-3" aria-label="ve třech variantách" />}
                      </span>
                      <span className="block truncate text-xs text-ink-3">
                        {q.client.name}, {q.client.address}
                      </span>
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs ${expired ? 'font-medium text-warn-ink' : 'text-ink-3'}`}>
                      {expired && <AlertTriangle className="size-3.5" />}
                      platí do {q.validUntil.toLocaleDateString('cs-CZ')}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[q.status].cls}`}>{STATUS[q.status].label}</span>
                    <span className="w-32 text-right">
                      <span className="block font-semibold text-ink tabular-nums">{fmt.czk(t.net)}</span>
                      <span className="block text-xs text-ink-3">bez DPH</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <QuoteDrawer
        open={open}
        quote={current}
        snap={snap}
        onClose={() => setOpen(false)}
        onDone={(text) => {
          setOpen(false);
          setToast({ text, tone: 'success', id: Date.now() });
        }}
      />
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}
