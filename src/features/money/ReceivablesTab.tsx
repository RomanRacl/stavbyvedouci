'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, Check, Copy, Mail } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { btnPrimary, btnSecondary } from '@/components/shell/PageHeader';
import { fmt } from '@/features/analytics/lib/metrics';
import { receivables, reminderText, DEFAULT_REMINDER_DAYS, type Receivable } from '@/lib/finance';
import { recordReminder, setInvoicePaid, setPaymentPaid, type Snapshot } from '@/lib/mock/localBackend';

const FILTERS = [
  { id: 'due', label: 'Upomínka na řadě' },
  { id: 'overdue', label: 'Po splatnosti' },
  { id: 'all', label: 'Všechny neuhrazené' },
] as const;
type Filter = (typeof FILTERS)[number]['id'];

const LEVEL_CLS = ['bg-concrete text-ink-2', 'bg-warn/12 text-warn-ink', 'bg-warn/20 text-warn-ink', 'bg-crit/12 text-crit-ink'];

/** Pohledávky: neuhrazené faktury a zálohy, upomínky ve třech stupních a označení úhrady. */
export function ReceivablesTab({ snap, say }: { snap: Snapshot; say: (t: string, tone?: 'success' | 'error') => void }) {
  const s = snap.settings;
  const steps = s.reminderDays ?? DEFAULT_REMINDER_DAYS;
  const all = useMemo(() => receivables(snap.jobs, s), [snap.jobs, s]);
  const dueNow = all.filter((r) => r.nextLevel);
  const overdue = all.filter((r) => r.daysOverdue > 0);
  const [filter, setFilter] = useState<Filter>(dueNow.length ? 'due' : 'all');
  const [open, setOpen] = useState<string | null>(null);
  const list = filter === 'due' ? dueNow : filter === 'overdue' ? overdue : all;
  const sum = (rs: Receivable[]) => rs.reduce((a, r) => a + r.amount, 0);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 divide-line rounded-xl border border-line bg-surface sm:grid-cols-3 sm:divide-x max-sm:divide-y" aria-label="Souhrn pohledávek">
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Neuhrazeno celkem</p>
          <p className="font-display text-2xl font-semibold text-ink tabular-nums">{fmt.czk(sum(all))}</p>
          <p className="text-xs text-ink-3">{all.length} dokladů s DPH</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Po splatnosti</p>
          <p className={`font-display text-2xl font-semibold tabular-nums ${overdue.length ? 'text-crit-ink' : 'text-ink'}`}>{fmt.czk(sum(overdue))}</p>
          <p className="text-xs text-ink-3">{overdue.length} dokladů</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Upomínky k odeslání</p>
          <p className={`font-display text-2xl font-semibold tabular-nums ${dueNow.length ? 'text-warn-ink' : 'text-ink'}`}>{dueNow.length}</p>
          <p className="text-xs text-ink-3">
            {steps[0]}, {steps[1]} a {steps[2]} dní po splatnosti (Nastavení)
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface">
        <div className="flex gap-1 overflow-x-auto border-b border-line p-3" role="tablist" aria-label="Filtr pohledávek">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${filter === f.id ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'}`}
            >
              {f.label} <span className="tabular-nums opacity-70">{f.id === 'due' ? dueNow.length : f.id === 'overdue' ? overdue.length : all.length}</span>
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-2">{filter === 'due' ? 'Žádná upomínka není na řadě. Peníze chodí včas.' : 'Nic neuhrazeného.'}</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <Row
                key={`${r.key}-${r.reminders.length}`}
                r={r}
                snap={snap}
                open={open === r.key}
                onToggle={() => setOpen(open === r.key ? null : r.key)}
                onSent={(level) => {
                  recordReminder(r.key, level);
                  setOpen(null);
                  say(`${level}. upomínka k ${r.number} zapsána.`);
                }}
                onPaid={() => {
                  if (r.kind === 'invoice') setInvoicePaid(r.job.id, true);
                  else if (r.payment) setPaymentPaid(r.job.id, r.payment.id, true);
                  say(`${r.number} označeno jako uhrazené.`);
                }}
              />
            ))}
          </ul>
        )}
        <p className="border-t border-line px-4 py-3 text-xs text-ink-3">
          Upomínky zatím odesíláte ze svého e-mailu (text zkopírujete nebo otevřete v poště). Automatické odesílání a párování plateb z banky přijde s napojením na banku.
        </p>
      </section>
    </div>
  );
}

function Row({ r, snap, open, onToggle, onSent, onPaid }: { r: Receivable; snap: Snapshot; open: boolean; onToggle: () => void; onSent: (l: 1 | 2 | 3) => void; onPaid: () => void }) {
  const level = (r.nextLevel ?? Math.min(3, Math.max(1, r.reminders.length + 1))) as 1 | 2 | 3;
  const text = reminderText(r, level, snap.settings);
  const [body, setBody] = useState(text.body);
  const email = snap.quotes.find((q) => q.jobId === r.job.id)?.client.email ?? '';
  const last = r.reminders.at(-1);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${text.subject}\n\n${body}`);
    } catch {
      /* prohlížeč nepovolil schránku – text zůstává k označení v poli */
    }
  };

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="w-32 font-display text-sm font-semibold text-ink-2 tabular-nums">{r.number}</span>
        <Link href={`/dashboard?job=${r.job.id}`} className="min-w-0 flex-1 hover:underline">
          <span className="block truncate font-medium text-ink">{r.job.client.name}</span>
          <span className="block truncate text-xs text-ink-3">
            {r.kind === 'invoice' ? 'Faktura' : r.label}, {r.job.code} {r.job.title}
          </span>
        </Link>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_CLS[r.dueLevel]}`}>
          {r.daysOverdue > 0 ? `${r.daysOverdue} dní po splatnosti` : r.daysOverdue === 0 ? 'splatné dnes' : `splatné za ${-r.daysOverdue} dní`}
        </span>
        <span className="w-28 text-right font-semibold text-ink tabular-nums">{fmt.czk(r.amount)}</span>
        <span className="flex gap-1">
          {(r.nextLevel || r.daysOverdue > 0) && (
            <button type="button" onClick={onToggle} aria-expanded={open} className={r.nextLevel ? btnPrimary : btnSecondary}>
              <BellRing className="size-4" /> {level}. upomínka
            </button>
          )}
          <button type="button" onClick={onPaid} className={btnSecondary}>
            <Check className="size-4" /> Zaplaceno
          </button>
        </span>
      </div>
      {last && (
        <p className="mt-1 text-xs text-ink-3 sm:pl-36">
          Odesláno upomínek: {r.reminders.length}, poslední {last.at.toLocaleDateString('cs-CZ')}.
        </p>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 rounded-lg bg-concrete/60 p-3">
              <p className="text-sm font-semibold text-ink">{text.subject}</p>
              <textarea aria-label="Text upomínky" value={body} onChange={(e) => setBody(e.target.value)} rows={9} className="mt-2 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-series-1 focus:outline-none" />
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={copy} className={btnSecondary}>
                  <Copy className="size-4" /> Kopírovat text
                </button>
                <a href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(text.subject)}&body=${encodeURIComponent(body)}`} className={btnSecondary}>
                  <Mail className="size-4" /> Otevřít v poště
                </a>
                <span className="flex-1" />
                <button type="button" onClick={() => onSent(level)} className={btnPrimary}>
                  <Check className="size-4" /> Odesláno, zapsat
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
