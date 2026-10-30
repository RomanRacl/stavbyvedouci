'use client';

import { Check, FileOutput, Plus, Printer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { fmt, jobFinancials } from '@/features/analytics/lib/metrics';
import { addPayment, deletePayment, issueInvoice, setPaymentPaid, updateJob } from '@/lib/mock/localBackend';
import { invoiceBasis, jobVat, marginAfterOverhead, overheadRate, paymentSummary, VAT_MODES } from '@/lib/money';
import type { CompanySettings, Job, VatMode } from '@/types/firestore';

const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Záložka Peníze v detailu zakázky: DPH, zálohy, podklad k fakturaci a marže po režii. */
export function JobMoneyTab({ job, settings, onToast }: { job: Job; settings: CompanySettings; onToast: (t: string) => void }) {
  const mode = jobVat(job, settings);
  const b = invoiceBasis(job, settings);
  const ps = paymentSummary(job, settings);
  const f = jobFinancials(job);
  const oh = marginAfterOverhead(job, settings, f.forecastCost);
  const [form, setForm] = useState<{ label: string; amount: string; due: string } | null>(null);

  const openForm = (share?: number) =>
    setForm({
      label: share ? `Záloha ${Math.round(share * 100)} %` : 'Záloha',
      amount: share ? String(Math.round(b.gross * share)) : '',
      due: toInputDate(new Date(Date.now() + settings.paymentDueDays * 86_400_000)),
    });

  return (
    <div className="space-y-7">
      <section className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-ink">
          DPH zakázky
          <select
            value={mode}
            disabled={!settings.vatPayer || Boolean(job.invoice)}
            onChange={(e) => {
              updateJob(job.id, { vatMode: e.target.value as VatMode });
              onToast('Režim DPH změněn.');
            }}
            className="mt-1 block h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm font-normal"
          >
            {(Object.keys(VAT_MODES) as VatMode[]).filter((m) => (settings.vatPayer ? m !== 'none' : m === 'none')).map((m) => (
              <option key={m} value={m}>
                {VAT_MODES[m].label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-ink-3">{VAT_MODES[mode].hint}</span>
        </label>
        <dl className="grid grid-cols-2 gap-y-1 rounded-lg bg-concrete/60 p-3 text-sm">
          <dt className="text-ink-2">Cena bez DPH</dt>
          <dd className="text-right tabular-nums">{fmt.czk(b.net)}</dd>
          <dt className="text-ink-2">DPH {VAT_MODES[mode].short}</dt>
          <dd className="text-right tabular-nums">{fmt.czk(b.vat)}</dd>
          <dt className="font-medium text-ink">Celkem pro zákazníka</dt>
          <dd className="text-right font-semibold tabular-nums">{fmt.czk(b.gross)}</dd>
          <dt className="text-ink-2">Zaplaceno</dt>
          <dd className="text-right text-good-ink tabular-nums">{fmt.czk(ps.paid)}</dd>
          <dt className="font-medium text-ink">Zbývá</dt>
          <dd className="text-right font-semibold tabular-nums">{fmt.czk(ps.remaining)}</dd>
        </dl>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold text-ink">Zálohy a platby</h3>
          {!job.invoice && (
            <>
              <button type="button" onClick={() => openForm(0.3)} className="h-8 rounded-md border border-line px-2.5 text-sm text-ink-2 hover:text-ink">
                30 %
              </button>
              <button type="button" onClick={() => openForm(0.5)} className="h-8 rounded-md border border-line px-2.5 text-sm text-ink-2 hover:text-ink">
                50 %
              </button>
              <button type="button" onClick={() => openForm()} className="inline-flex h-8 items-center gap-1 rounded-md border border-ink px-2.5 text-sm font-medium text-ink hover:bg-ink hover:text-white">
                <Plus className="size-3.5" /> Záloha
              </button>
            </>
          )}
        </div>
        {form && (
          <div className="mb-3 grid grid-cols-[1fr_120px_150px] items-end gap-2 rounded-lg border border-line p-3">
            <label className="text-xs text-ink-2">
              Popis
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-line px-2 text-sm" />
            </label>
            <label className="text-xs text-ink-2">
              Částka s DPH
              <input inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })} className="mt-1 h-9 w-full rounded-md border border-line px-2 text-right text-sm tabular-nums" />
            </label>
            <label className="text-xs text-ink-2">
              Splatnost
              <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-line px-2 text-sm" />
            </label>
            <div className="col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="h-9 rounded-md px-3 text-sm text-ink-2 hover:bg-concrete">
                Zrušit
              </button>
              <button
                type="button"
                disabled={!form.label.trim() || !Number(form.amount) || !form.due}
                onClick={() => {
                  addPayment(job.id, { label: form.label.trim(), amount: Number(form.amount), dueDate: new Date(form.due) });
                  setForm(null);
                  onToast('Záloha přidána. Zákazníkovi ji pošlete jako zálohovou fakturu z účetního programu.');
                }}
                className="h-9 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:bg-line disabled:text-ink-3"
              >
                Přidat
              </button>
            </div>
          </div>
        )}
        {(job.payments ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-2">Žádné zálohy. U větších zakázek se vyplatí chtít zálohu na materiál předem.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {(job.payments ?? []).map((p) => {
              const overdue = !p.paidAt && p.dueDate.getTime() < Date.now();
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={Boolean(p.paidAt)}
                    aria-label={p.paidAt ? 'Označit jako nezaplacené' : 'Označit jako zaplacené'}
                    onClick={() => {
                      setPaymentPaid(job.id, p.id, !p.paidAt);
                      onToast(p.paidAt ? 'Platba vrácena mezi nezaplacené.' : 'Platba označena jako zaplacená.');
                    }}
                    className={`grid size-6 shrink-0 place-items-center rounded-md border-2 transition ${p.paidAt ? 'border-good bg-good text-white' : 'border-line hover:border-ink-3'}`}
                  >
                    {p.paidAt && <Check className="size-3.5" strokeWidth={3} />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block text-ink">{p.label}</span>
                    <span className={`block text-xs ${overdue ? 'font-medium text-crit-ink' : 'text-ink-3'}`}>
                      {p.paidAt ? `zaplaceno ${p.paidAt.toLocaleDateString('cs-CZ')}` : `${overdue ? 'po splatnosti, ' : ''}splatné ${p.dueDate.toLocaleDateString('cs-CZ')}`}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{fmt.czk(p.amount)}</span>
                  {!p.paidAt && (
                    <button type="button" aria-label="Smazat zálohu" onClick={() => deletePayment(job.id, p.id)} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-crit/10 hover:text-crit-ink">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">Fakturace</h3>
        {job.invoice ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 text-sm">
            <span className="flex-1">
              Podklad <strong>{job.invoice.number}</strong> vystaven {job.invoice.issuedAt.toLocaleDateString('cs-CZ')}, splatnost {job.invoice.dueDate.toLocaleDateString('cs-CZ')}.
            </span>
            <button type="button" onClick={() => window.open(`/tisk/podklad/${job.id}`, '_blank')} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:border-ink-3">
              <Printer className="size-4" /> Tisk / PDF
            </button>
          </div>
        ) : job.status === 'approved' ? (
          <button
            type="button"
            onClick={() => {
              issueInvoice(job.id, { taxDate: job.handover?.signedAt ?? new Date(), dueDays: settings.paymentDueDays });
              window.open(`/tisk/podklad/${job.id}`, '_blank');
              onToast('Podklad k fakturaci vystaven.');
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90"
          >
            <FileOutput className="size-4" /> Vystavit podklad k fakturaci
          </button>
        ) : (
          <p className="text-sm text-ink-2">Podklad půjde vystavit, až zakázku schválíte.</p>
        )}
      </section>

      <section className="rounded-lg bg-concrete/60 p-4">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-ink">
          Marže po započtení režie
          <InfoTip>
            Režie firmy (auta, sklad, účetní…) rozpočítaná podle hodin: {fmt.czk(overheadRate(settings))} na hodinu práce. Nastavíte v Peníze → Režie.
          </InfoTip>
        </h3>
        <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-ink-3">Bez režie</dt>
            <dd className="font-display text-lg font-semibold tabular-nums">{fmt.pct(f.forecastMarginPct)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Režie</dt>
            <dd className="font-display text-lg font-semibold text-ink-2 tabular-nums">−{fmt.czk(oh.overhead)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Po režii</dt>
            <dd className={`font-display text-lg font-semibold tabular-nums ${oh.margin < 0 ? 'text-crit-ink' : 'text-ink'}`}>
              {fmt.czk(oh.margin)} ({fmt.pct(oh.marginPct)})
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
