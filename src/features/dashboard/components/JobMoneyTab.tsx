'use client';

import { BadgeCheck, Check, FileOutput, FileText, Plus, Printer, Receipt, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { fmt, jobFinancials } from '@/features/analytics/lib/metrics';
import { addPayment, deletePayment, issueInvoice, setInvoicePaid, setPaymentPaid, updateJob } from '@/lib/mock/localBackend';
import { needsTaxDoc, toEur } from '@/lib/finance';
import { SubcontractsSection } from './SubcontractsSection';
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
  const eur = job.currency === 'EUR' && job.eurRate ? job.eurRate : null;
  const taxDoc = needsTaxDoc(mode);
  const settlement = (issuedAt: Date) => Boolean(job.invoice && issuedAt.getTime() >= job.invoice.issuedAt.getTime() - 60_000);

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
          {eur && (
            <>
              <dt className="text-ink-2">Celkem v EUR</dt>
              <dd className="text-right tabular-nums">{toEur(b.gross, eur).toLocaleString('cs-CZ', { style: 'currency', currency: 'EUR' })}</dd>
            </>
          )}
        </dl>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <label className="text-xs text-ink-2">
            Měna dokladů
            <select
              value={job.currency ?? 'CZK'}
              disabled={Boolean(job.invoice)}
              onChange={(e) => {
                const currency = e.target.value as 'CZK' | 'EUR';
                updateJob(job.id, { currency, eurRate: currency === 'EUR' ? job.eurRate ?? settings.eurRate ?? 25 : null });
                onToast(currency === 'EUR' ? 'Doklady se přepočtou do EUR.' : 'Doklady v Kč.');
              }}
              className="mt-1 block h-9 rounded-md border border-line bg-surface px-2 text-sm"
            >
              <option value="CZK">Kč</option>
              <option value="EUR">EUR (zahraniční zákazník)</option>
            </select>
          </label>
          {job.currency === 'EUR' && (
            <label className="text-xs text-ink-2">
              Kurz Kč za 1 €
              <input
                inputMode="decimal"
                defaultValue={String(job.eurRate ?? settings.eurRate ?? 25).replace('.', ',')}
                disabled={Boolean(job.invoice)}
                onBlur={(e) => {
                  const v = Number(e.target.value.replace(',', '.'));
                  if (v > 1) updateJob(job.id, { eurRate: v });
                }}
                className="mt-1 block h-9 w-24 rounded-md border border-line bg-surface px-2 text-right text-sm tabular-nums"
              />
            </label>
          )}
          {job.currency === 'EUR' && <p className="pb-2 text-xs text-ink-3">Účetnictví vedete v Kč, na podkladu bude i částka v EUR. Kurz ČNB ke dni plnění.</p>}
        </div>
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
                  onToast('Záloha přidána. Zálohovou fakturu s QR platbou vytisknete ikonou u zálohy.');
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
                    <span className="block text-ink">
                      {p.label}
                      {p.number && <span className="ml-1.5 text-xs text-ink-3 tabular-nums">{p.number}</span>}
                    </span>
                    <span className={`block text-xs ${overdue ? 'font-medium text-crit-ink' : 'text-ink-3'}`}>
                      {p.paidAt ? `zaplaceno ${p.paidAt.toLocaleDateString('cs-CZ')}` : `${overdue ? 'po splatnosti, ' : ''}splatné ${p.dueDate.toLocaleDateString('cs-CZ')}`}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{fmt.czk(p.amount)}</span>
                  {!settlement(p.issuedAt) && (
                    <button
                      type="button"
                      title="Zálohová faktura s QR platbou"
                      aria-label="Tisk zálohové faktury"
                      onClick={() => window.open(`/tisk/zaloha/${job.id}~${p.id}`, '_blank')}
                      className="grid size-8 place-items-center rounded text-ink-2 hover:bg-concrete hover:text-ink"
                    >
                      <FileText className="size-4" />
                    </button>
                  )}
                  {p.paidAt && !settlement(p.issuedAt) && (
                    <button
                      type="button"
                      title={taxDoc ? `Daňový doklad k přijaté platbě ${p.taxDocNumber ?? ''}` : 'Potvrzení o přijetí platby'}
                      aria-label="Tisk dokladu k přijaté platbě"
                      onClick={() => window.open(`/tisk/doklad/${job.id}~${p.id}`, '_blank')}
                      className="grid size-8 place-items-center rounded text-ink-2 hover:bg-concrete hover:text-ink"
                    >
                      <Receipt className="size-4" />
                    </button>
                  )}
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
              {job.invoice.paidAt ? (
                <span className="ml-1 inline-flex items-center gap-1 font-medium text-good-ink">
                  <BadgeCheck className="size-4" /> Uhrazeno {job.invoice.paidAt.toLocaleDateString('cs-CZ')}
                </span>
              ) : (
                (job.invoice.reminders ?? []).length > 0 && <span className="ml-1 text-warn-ink">Odesláno upomínek: {job.invoice.reminders!.length}.</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setInvoicePaid(job.id, !job.invoice!.paidAt);
                onToast(job.invoice!.paidAt ? 'Faktura vrácena mezi neuhrazené.' : 'Faktura označena jako uhrazená.');
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:border-ink-3"
            >
              <Check className="size-4" /> {job.invoice.paidAt ? 'Zrušit úhradu' : 'Zaplaceno'}
            </button>
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

      <SubcontractsSection job={job} onToast={onToast} />

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
