'use client';

import { LayoutGroup, motion } from 'framer-motion';
import { AlertTriangle, Download, FileOutput, Plus, Printer, Trash2, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { btnPrimary, btnSecondary, inputCls, PageHeader } from '@/components/shell/PageHeader';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { fmt, jobFinancials } from '@/features/analytics/lib/metrics';
import { cancelInvoice, issueInvoice, saveSettings } from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import {
  downloadFile,
  invoiceBasis,
  invoicesCsv,
  marginAfterOverhead,
  monthKey,
  monthLabel,
  overheadMonthly,
  overheadRate,
  paymentSummary,
  payroll,
  pohodaXml,
  toCSV,
  VAT_MODES,
} from '@/lib/money';
import type { Job } from '@/types/firestore';

const TABS = [
  { id: 'invoice', label: 'Fakturace' },
  { id: 'payments', label: 'Zálohy a platby' },
  { id: 'payroll', label: 'Mzdy' },
  { id: 'overhead', label: 'Režie' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const lastMonths = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return monthKey(d);
  });

/** Peníze: podklady k fakturaci a export do účetnictví, zálohy, mzdové podklady a režie. */
export default function MoneyPage() {
  const snap = useSnapshot();
  const [tab, setTab] = useState<Tab>('invoice');
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const say = (text: string, tone: ToastMsg['tone'] = 'success') => setToast({ text, tone, id: Date.now() });

  if (!snap) return <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" />;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Peníze" description="Fakturace hotových zakázek, zálohy od zákazníků, podklady pro mzdy a rozpočítání režie." />
      <LayoutGroup id="money-tabs">
        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Části">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`relative shrink-0 px-3 pb-3 text-sm font-medium ${tab === t.id ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}>
              {t.label}
              {tab === t.id && <motion.span layoutId="money-tab" className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-ink" />}
            </button>
          ))}
        </div>
      </LayoutGroup>
      {tab === 'invoice' && <InvoiceTab snap={snap} say={say} />}
      {tab === 'payments' && <PaymentsTab snap={snap} />}
      {tab === 'payroll' && <PayrollTab snap={snap} />}
      {tab === 'overhead' && <OverheadTab snap={snap} say={say} />}
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}

type Snap = NonNullable<ReturnType<typeof useSnapshot>>;

/* ---------- Fakturace ---------- */

function InvoiceTab({ snap, say }: { snap: Snap; say: (t: string, tone?: ToastMsg['tone']) => void }) {
  const s = snap.settings;
  const ready = snap.jobs.filter((j) => j.status === 'approved');
  const invoiced = snap.jobs.filter((j) => j.invoice).sort((a, b) => b.invoice!.issuedAt.getTime() - a.invoice!.issuedAt.getTime());
  const months = useMemo(() => [...new Set(invoiced.map((j) => monthKey(j.invoice!.issuedAt)))], [invoiced]);
  const [month, setMonth] = useState('all');
  const [issuing, setIssuing] = useState<string | null>(null);
  const [taxDate, setTaxDate] = useState(toInputDate(new Date()));
  const exportJobs = invoiced.filter((j) => month === 'all' || monthKey(j.invoice!.issuedAt) === month);
  const missingCompany = !s.ico;

  const startIssue = (job: Job) => {
    setIssuing(job.id);
    setTaxDate(toInputDate(job.handover?.signedAt ?? new Date()));
  };

  return (
    <div className="space-y-6">
      {missingCompany && (
        <p className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/8 px-4 py-3 text-sm text-ink">
          <AlertTriangle className="size-4 text-warn-ink" /> Na dokladech chybí IČO a DIČ firmy.{' '}
          <Link href="/nastaveni" className="font-medium text-series-1-ink underline underline-offset-2">
            Doplnit v Nastavení
          </Link>
        </p>
      )}

      <section className="rounded-xl border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-3 text-base font-semibold text-ink">K fakturaci ({ready.length})</h2>
        {ready.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-2">Žádná schválená zakázka nečeká na fakturaci.</p>
        ) : (
          <ul className="divide-y divide-line">
            {ready.map((j) => {
              const b = invoiceBasis(j, s);
              return (
                <li key={j.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Link href={`/dashboard?job=${j.id}`} className="min-w-0 flex-1 hover:underline">
                      <span className="block font-medium text-ink">
                        {j.code} {j.title}
                      </span>
                      <span className="block text-xs text-ink-3">
                        {j.client.name}, DPH {VAT_MODES[b.mode].short}
                        {b.paid > 0 && `, zálohy ${fmt.czk(b.paid)}`}
                      </span>
                    </Link>
                    <span className="text-right">
                      <span className="block font-semibold text-ink tabular-nums">{fmt.czk(b.toPay)}</span>
                      <span className="block text-xs text-ink-3">zbývá uhradit</span>
                    </span>
                    {issuing !== j.id && (
                      <button type="button" onClick={() => startIssue(j)} className={btnPrimary}>
                        <FileOutput className="size-4" /> Vystavit podklad
                      </button>
                    )}
                  </div>
                  {issuing === j.id && (
                    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-concrete/60 p-3">
                      <label className="text-xs text-ink-2">
                        Datum zdanitelného plnění
                        <input type="date" value={taxDate} onChange={(e) => setTaxDate(e.target.value)} className={`${inputCls} mt-1 w-44`} />
                      </label>
                      <p className="pb-2 text-xs text-ink-3">splatnost {s.paymentDueDays} dní</p>
                      <span className="flex-1" />
                      <button type="button" onClick={() => setIssuing(null)} className={btnSecondary}>
                        Zrušit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          issueInvoice(j.id, { taxDate: new Date(taxDate), dueDays: s.paymentDueDays });
                          setIssuing(null);
                          window.open(`/tisk/podklad/${j.id}`, '_blank');
                          say(`Podklad pro ${j.code} vystaven, zakázka je ve stavu Fakturováno.`);
                        }}
                        className={btnPrimary}
                      >
                        Vystavit a otevřít
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="mr-auto text-base font-semibold text-ink">Vystavené podklady ({invoiced.length})</h2>
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Měsíc exportu" className="h-10 rounded-lg border border-line bg-surface px-3 text-sm">
            <option value="all">Všechny měsíce</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!exportJobs.length}
            onClick={() => {
              downloadFile(`pohoda-faktury-${month}.xml`, pohodaXml(exportJobs, s), 'application/xml');
              say('Soubor pro POHODU stažen. Při prvním importu ho zkontrolujte s účetní.');
            }}
            className={btnSecondary}
          >
            <Download className="size-4" /> POHODA (XML)
          </button>
          <button
            type="button"
            disabled={!exportJobs.length}
            onClick={() => downloadFile(`podklady-faktury-${month}.csv`, invoicesCsv(exportJobs, s), 'text/csv;charset=utf-8')}
            className={btnSecondary}
          >
            <Download className="size-4" /> Excel (CSV)
          </button>
        </div>
        {invoiced.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-2">Zatím žádné vystavené podklady.</p>
        ) : (
          <ul className="divide-y divide-line">
            {invoiced.map((j) => {
              const b = invoiceBasis(j, s);
              return (
                <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="w-32 font-display text-sm font-semibold text-ink-2 tabular-nums">{j.invoice!.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">
                      {j.code} {j.title}
                    </span>
                    <span className="block text-xs text-ink-3">
                      {j.client.name}, vystaveno {j.invoice!.issuedAt.toLocaleDateString('cs-CZ')}, splatnost {j.invoice!.dueDate.toLocaleDateString('cs-CZ')}
                    </span>
                  </span>
                  <span className="w-32 text-right font-semibold text-ink tabular-nums">{fmt.czk(b.toPay)}</span>
                  <button type="button" onClick={() => window.open(`/tisk/podklad/${j.id}`, '_blank')} aria-label="Tisk podkladu" className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-concrete hover:text-ink">
                    <Printer className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      cancelInvoice(j.id);
                      say(`Podklad ${j.invoice!.number} zrušen, zakázka je zpět ve stavu Schváleno.`);
                    }}
                    aria-label="Zrušit podklad"
                    title="Zrušit podklad"
                    className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-crit/10 hover:text-crit-ink"
                  >
                    <Undo2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t border-line px-4 py-3 text-xs text-ink-3">
          XML pro POHODU obsahuje vydané faktury s položkami a sazbou DPH; čísla faktur přidělí POHODA podle své řady. U přenesené daňové povinnosti v POHODĚ zkontrolujte členění DPH. CSV otevřete v Excelu nebo naimportujete do jiného programu.
        </p>
      </section>
    </div>
  );
}

/* ---------- Zálohy ---------- */

function PaymentsTab({ snap }: { snap: Snap }) {
  const s = snap.settings;
  const rows = snap.jobs
    .filter((j) => j.status !== 'draft')
    .map((j) => ({ j, p: paymentSummary(j, s) }))
    .filter((r) => r.p.remaining > 1 && ((r.j.payments ?? []).length > 0 || r.j.status === 'in_progress' || r.j.status === 'approved' || r.j.status === 'invoiced'));
  const overdue = rows.flatMap((r) => r.p.overdue.map((p) => ({ job: r.j, p })));
  const totalRemaining = rows.reduce((a, r) => a + r.p.remaining, 0);

  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <section className="rounded-xl border border-crit/30 bg-crit/5 p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-crit-ink">
            <AlertTriangle className="size-4" /> Po splatnosti ({overdue.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {overdue.map(({ job, p }) => (
              <li key={p.id} className="flex flex-wrap gap-x-3">
                <Link href={`/dashboard?job=${job.id}`} className="font-medium text-ink hover:underline">
                  {job.code} {job.client.name}
                </Link>
                <span className="text-ink-2">
                  {p.label}, {fmt.czk(p.amount)}, splatné {p.dueDate.toLocaleDateString('cs-CZ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-medium">Zakázka</th>
              <th className="px-3 py-2.5 text-right font-medium">Cena s DPH</th>
              <th className="px-3 py-2.5 text-right font-medium">Vyžádáno</th>
              <th className="px-3 py-2.5 text-right font-medium">Zaplaceno</th>
              <th className="px-3 py-2.5 font-medium">Průběh</th>
              <th className="px-4 py-2.5 text-right font-medium">Zbývá</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ j, p }) => {
              const pct = p.gross ? Math.min(1, p.paid / p.gross) : 0;
              return (
                <tr key={j.id} className="hover:bg-concrete/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/dashboard?job=${j.id}`} className="font-medium text-ink hover:underline">
                      {j.code} {j.title}
                    </Link>
                    <span className="block text-xs text-ink-3">{j.client.name}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt.czk(p.gross)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt.czk(p.requested)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt.czk(p.paid)}</td>
                  <td className="px-3 py-2.5">
                    <span className="block h-1.5 w-28 overflow-hidden rounded-full bg-line" aria-label={`Zaplaceno ${fmt.pct(pct)}`}>
                      <span className="block h-full rounded-full bg-good" style={{ width: `${pct * 100}%` }} />
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmt.czk(p.remaining)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line">
              <td colSpan={5} className="px-4 py-3 text-right text-ink-2">
                Celkem zbývá od zákazníků
              </td>
              <td className="px-4 py-3 text-right font-bold tabular-nums">{fmt.czk(totalRemaining)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="border-t border-line px-4 py-3 text-xs text-ink-3">Zálohy přidáte a označíte jako zaplacené v detailu zakázky na záložce Peníze.</p>
      </section>
    </div>
  );
}

/* ---------- Mzdy ---------- */

function PayrollTab({ snap }: { snap: Snap }) {
  const months = lastMonths(6);
  const [month, setMonth] = useState(months[0]);
  const rows = payroll(month, snap.timeLogs, snap.members, snap.dayReports);
  const jobName = (id: string) => snap.jobs.find((j) => j.id === id)?.code ?? 'smazaná';
  const h = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });

  const csv = () =>
    toCSV([
      ['Pracovník', 'Dny', 'Hodiny', 'Přestávky (h)', 'Potvrzené dny', 'Náklad firmy (Kč)', 'Rozpis po zakázkách'],
      ...rows.map((r) => [r.member.displayName, r.days, r.hours, r.breakHours, r.confirmedDays, r.cost, r.byJob.map((b) => `${jobName(b.jobId)} ${h(b.hours)} h`).join(', ')]),
    ]);

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Měsíc" className="mr-auto h-10 rounded-lg border border-line bg-surface px-3 text-sm capitalize">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => window.open(`/tisk/mzdy/${month}`, '_blank')} className={btnSecondary}>
          <Printer className="size-4" /> Tisk / PDF
        </button>
        <button type="button" onClick={() => downloadFile(`mzdy-${month}.csv`, csv(), 'text/csv;charset=utf-8')} className={btnSecondary}>
          <Download className="size-4" /> Excel (CSV)
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-medium">Pracovník</th>
              <th className="px-3 py-2.5 text-right font-medium">Dny</th>
              <th className="px-3 py-2.5 text-right font-medium">Hodiny</th>
              <th className="px-3 py-2.5 text-right font-medium">Potvrzeno</th>
              <th className="px-4 py-2.5 text-right font-medium">Náklad firmy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.member.uid} className="align-top">
                <td className="px-4 py-2.5">
                  <span className="block font-medium text-ink">{r.member.displayName}</span>
                  <span className="block text-xs text-ink-3">{r.byJob.map((b) => `${jobName(b.jobId)} ${h(b.hours)} h`).join(', ') || 'bez záznamů'}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.days}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{h(r.hours)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${r.confirmedDays < r.days ? 'text-warn-ink' : 'text-ink-2'}`}>
                  {r.confirmedDays}/{r.days} dní
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt.czk(r.cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line">
              <td className="px-4 py-3 font-medium">Celkem</td>
              <td className="px-3 py-3 text-right tabular-nums">{rows.reduce((a, r) => a + r.days, 0)}</td>
              <td className="px-3 py-3 text-right font-bold tabular-nums">{h(rows.reduce((a, r) => a + r.hours, 0))}</td>
              <td />
              <td className="px-4 py-3 text-right font-bold tabular-nums">{fmt.czk(rows.reduce((a, r) => a + r.cost, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="border-t border-line px-4 py-3 text-xs text-ink-3">
        Čistý čas z mobilu bez přestávek. Oranžově jsou pracovníci, kteří nepotvrdili všechny denní výkazy. Náklad firmy = hodiny × nákladová sazba pracovníka.
      </p>
    </section>
  );
}

/* ---------- Režie ---------- */

function OverheadTab({ snap, say }: { snap: Snap; say: (t: string) => void }) {
  const s = snap.settings;
  const [items, setItems] = useState(s.overheadItems);
  const [capacity, setCapacity] = useState(s.capacityHours);
  const dirty = JSON.stringify(items) !== JSON.stringify(s.overheadItems) || capacity !== s.capacityHours;
  const preview = { ...s, overheadItems: items, capacityHours: capacity };
  const jobs = snap.jobs.filter((j) => j.status === 'in_progress' || j.status === 'awaiting_approval' || j.status === 'approved');

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(320px,1fr)_2fr]">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-base font-semibold text-ink">Měsíční režie</h2>
        <p className="mt-1 text-sm text-ink-2">Náklady, které nejsou vidět na žádné zakázce, ale firma je platí každý měsíc.</p>
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2">
              <input aria-label="Položka" value={it.label} onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)))} className={`${inputCls} flex-1`} />
              <input
                aria-label="Kč měsíčně"
                inputMode="numeric"
                value={it.monthly}
                onChange={(e) => setItems(items.map((x) => (x.id === it.id ? { ...x, monthly: Number(e.target.value.replace(/\D/g, '')) || 0 } : x)))}
                className={`${inputCls} w-28 text-right tabular-nums`}
              />
              <button type="button" aria-label="Odebrat" onClick={() => setItems(items.filter((x) => x.id !== it.id))} className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-crit/10 hover:text-crit-ink">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setItems([...items, { id: `oh_${Date.now().toString(36)}`, label: '', monthly: 0 }])} className={`${btnSecondary} mt-2`}>
          <Plus className="size-4" /> Přidat položku
        </button>
        <label className="mt-5 block text-sm font-medium text-ink">
          Odpracovatelné hodiny na zakázkách za měsíc
          <input inputMode="numeric" value={capacity} onChange={(e) => setCapacity(Number(e.target.value.replace(/\D/g, '')) || 0)} className={`${inputCls} mt-1 w-32 text-right tabular-nums`} />
          <span className="mt-1 block text-xs font-normal text-ink-3">Např. 4 montéři × 150 h. Čím přesnější, tím přesnější marže.</span>
        </label>
        <dl className="mt-5 grid grid-cols-2 gap-y-1 border-t border-line pt-4 text-sm">
          <dt className="text-ink-2">Režie celkem</dt>
          <dd className="text-right font-semibold tabular-nums">{fmt.czk(overheadMonthly(preview))}/měs.</dd>
          <dt className="text-ink-2">Na hodinu práce</dt>
          <dd className="text-right font-display text-lg font-semibold tabular-nums">{fmt.czk(overheadRate(preview))}</dd>
        </dl>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => {
            saveSettings({ overheadItems: items.filter((i) => i.label.trim() || i.monthly), capacityHours: capacity });
            say('Režie uložena, marže zakázek se přepočítaly.');
          }}
          className={`${btnPrimary} mt-4 w-full justify-center`}
        >
          Uložit režii
        </button>
      </section>

      <section className="overflow-x-auto rounded-xl border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-3 text-base font-semibold text-ink">Zakázky po započtení režie</h2>
        <table className="w-full min-w-[620px] text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-medium">Zakázka</th>
              <th className="px-3 py-2.5 text-right font-medium">Marže bez režie</th>
              <th className="px-3 py-2.5 text-right font-medium">Režie</th>
              <th className="px-4 py-2.5 text-right font-medium">Marže po režii</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {jobs.map((j) => {
              const f = jobFinancials(j);
              const o = marginAfterOverhead(j, preview, f.forecastCost);
              return (
                <tr key={j.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/dashboard?job=${j.id}`} className="font-medium text-ink hover:underline">
                      {j.code} {j.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt.pct(f.forecastMarginPct)}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2 tabular-nums">−{fmt.czk(o.overhead)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${o.margin < 0 ? 'text-crit-ink' : 'text-ink'}`}>
                    {fmt.czk(o.margin)} ({fmt.pct(o.marginPct)})
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-3 text-xs text-ink-3">Režie se rozpočítá podle hodin: odhad celkových hodin zakázky × sazba režie na hodinu.</p>
      </section>
    </div>
  );
}
