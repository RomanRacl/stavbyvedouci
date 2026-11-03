'use client';

import { DocumentShell, VatSummary } from '@/components/print/DocumentShell';
import { needsTaxDoc, splitGross, variableSymbol } from '@/lib/finance';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { jobVat, VAT_MODES } from '@/lib/money';
import { QrPayment } from './QrPayment';

const czk = (n: number) => n.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 2 });

/**
 * Doklady k záloze (A4):
 *  - `request`: výzva k platbě zálohy (zálohová faktura) – není daňový doklad, s QR platbou,
 *  - `receipt`: daňový doklad k přijaté platbě (u neplátce potvrzení o přijetí platby).
 * `id` = `{jobId}~{paymentId}`.
 */
export default function AdvancePrint({ id, kind }: { id: string; kind: 'request' | 'receipt' }) {
  const snap = useSnapshot();
  if (!snap) return null;
  const [jobId, paymentId] = id.split('~');
  const job = snap.jobs.find((j) => j.id === jobId);
  const p = job?.payments?.find((x) => x.id === paymentId);
  if (!job || !p) return <p className="p-10 text-center text-ink-2">Záloha nebyla nalezena.</p>;
  const s = snap.settings;
  const mode = jobVat(job, s);
  const split = splitGross(p.amount, mode);
  const taxDoc = needsTaxDoc(mode);

  if (kind === 'receipt' && !p.paidAt) return <p className="p-10 text-center text-ink-2">Záloha zatím není zaplacená, daňový doklad vznikne po úhradě.</p>;

  const title = kind === 'request' ? 'Zálohová faktura' : taxDoc ? 'Daňový doklad k přijaté platbě' : 'Potvrzení o přijetí platby';
  const number = kind === 'request' ? p.number ?? p.label : p.taxDocNumber ?? p.number ?? p.label;

  return (
    <DocumentShell settings={s} kind={title} number={number} date={kind === 'request' ? p.issuedAt : p.paidAt ?? undefined}>
      <section className="mt-5 grid grid-cols-2 gap-8">
        <div>
          <p className="text-xs text-ink-3">Odběratel</p>
          <p className="font-semibold">{job.client.name}</p>
          <p>{job.client.address}</p>
        </div>
        <div>
          <p className="text-xs text-ink-3">Zakázka</p>
          <p className="font-semibold">
            {job.code}, {job.title}
          </p>
          {kind === 'request' ? (
            <p>Splatnost {p.dueDate.toLocaleDateString('cs-CZ')}</p>
          ) : (
            <p>
              Přijato {p.paidAt!.toLocaleDateString('cs-CZ')}
              {taxDoc && `, datum uskutečnění plnění ${p.paidAt!.toLocaleDateString('cs-CZ')}`}
            </p>
          )}
          {s.bankAccount && (
            <p>
              Účet {s.bankAccount}, VS {variableSymbol(p.number ?? job.code)}
            </p>
          )}
        </div>
      </section>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-b border-ink text-left text-xs">
            <th className="py-2 pr-2 font-semibold">Položka</th>
            <th className="w-36 py-2 text-right font-semibold">{kind === 'receipt' && taxDoc ? 'Základ' : 'Částka'}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line">
            <td className="py-1.5 pr-2">
              {p.label} na dílo „{job.title}“ ({job.code})
            </td>
            <td className="py-1.5 text-right tabular-nums">{czk(kind === 'receipt' && taxDoc ? split.net : p.amount)}</td>
          </tr>
        </tbody>
      </table>

      {kind === 'receipt' && taxDoc ? (
        <>
          <VatSummary net={split.net} vat={split.vat} gross={p.amount} rateLabel={VAT_MODES[mode].short} />
          {VAT_MODES[mode].invoiceNote && <p className="mt-2 text-right text-xs font-semibold">{VAT_MODES[mode].invoiceNote}</p>}
          <p className="mt-6 text-xs text-ink-2">
            Přijatá platba {czk(p.amount)} se odečte v konečné faktuře za dílo. Doklad je vystaven podle § 28 odst. 9 zákona o DPH.
          </p>
        </>
      ) : (
        <>
          <div className="mt-6 flex justify-end">
            <table className="w-80 text-right">
              <tbody>
                <tr className="border-t-2 border-ink">
                  <td className="pt-1 pr-4 font-bold">{kind === 'request' ? 'K úhradě' : 'Přijato'}</td>
                  <td className="pt-1 text-base font-bold tabular-nums">{czk(p.amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {kind === 'request' && !p.paidAt && <QrPayment settings={s} amount={p.amount} docNumber={p.number ?? job.code} due={p.dueDate} message={`${p.label} ${job.code}`} />}
          {kind === 'request' && p.paidAt && (
            <p className="mt-6 inline-block rotate-[-2deg] rounded border-2 border-good px-3 py-1 text-sm font-bold text-good-ink">UHRAZENO {p.paidAt.toLocaleDateString('cs-CZ')}</p>
          )}
          <p className="mt-6 text-xs text-ink-3">
            {kind === 'request'
              ? taxDoc
                ? 'Zálohová faktura není daňovým dokladem. Daňový doklad k přijaté platbě vystavíme do 15 dnů od přijetí platby.'
                : 'Nejsme plátci DPH.'
              : 'Nejsme plátci DPH.'}
          </p>
        </>
      )}
    </DocumentShell>
  );
}
