'use client';

import { DocumentShell, VatSummary } from '@/components/print/DocumentShell';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { invoiceBasis, VAT_MODES } from '@/lib/money';

const czk = (n: number) => n.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 2 });

/**
 * Podklad k fakturaci (A4): soupis díla, schválených víceprací, rekapitulace DPH
 * a odpočet uhrazených záloh. Jako příloha soupis odpracovaných hodin a materiálu.
 */
export default function InvoicePrint({ jobId }: { jobId: string }) {
  const snap = useSnapshot();
  if (!snap) return null;
  const job = snap.jobs.find((j) => j.id === jobId);
  if (!job) return <p className="p-10 text-center text-ink-2">Zakázka nebyla nalezena.</p>;
  const b = invoiceBasis(job, snap.settings);
  const inv = job.invoice;
  const paid = (job.payments ?? []).filter((p) => p.paidAt);
  const logs = snap.timeLogs.filter((l) => l.jobId === job.id && l.endedAt);
  const byWorker = snap.members
    .map((m) => ({ m, hours: logs.filter((l) => l.workerId === m.uid).reduce((a, l) => a + (l.durationMin ?? 0), 0) / 60 }))
    .filter((x) => x.hours > 0);

  return (
    <DocumentShell settings={snap.settings} kind="Podklad k fakturaci" number={inv?.number ?? 'koncept'} date={inv?.issuedAt ?? new Date()}>
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
          {inv && (
            <p>
              DUZP {inv.taxDate.toLocaleDateString('cs-CZ')}, splatnost {inv.dueDate.toLocaleDateString('cs-CZ')}
            </p>
          )}
          {snap.settings.bankAccount && <p>Účet {snap.settings.bankAccount}</p>}
        </div>
      </section>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-b border-ink text-left text-xs">
            <th className="py-2 pr-2 font-semibold">Položka</th>
            <th className="w-24 py-2 pr-2 text-right font-semibold">Množství</th>
            <th className="w-32 py-2 text-right font-semibold">Bez DPH</th>
          </tr>
        </thead>
        <tbody>
          {b.lines.map((l, i) => (
            <tr key={i} className="border-b border-line">
              <td className="py-1.5 pr-2">{l.text}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {l.qty} {l.unit}
              </td>
              <td className="py-1.5 text-right tabular-nums">{czk(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <VatSummary
        net={b.net}
        vat={b.vat}
        gross={b.gross}
        rateLabel={VAT_MODES[b.mode].short}
        extra={
          <>
            {paid.map((p) => (
              <tr key={p.id}>
                <td className="py-0.5 pr-4 text-ink-2">
                  Uhrazeno: {p.label} ({p.paidAt!.toLocaleDateString('cs-CZ')})
                </td>
                <td className="tabular-nums">−{czk(p.amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink">
              <td className="pt-1 pr-4 font-bold">Zbývá uhradit</td>
              <td className="pt-1 text-base font-bold tabular-nums">{czk(b.toPay)}</td>
            </tr>
          </>
        }
      />
      {b.note && <p className="mt-2 text-right text-xs font-semibold">{b.note}</p>}

      {(byWorker.length > 0 || job.materialPlan.some((l) => l.usedQty > 0)) && (
        <section className="mt-10 break-inside-avoid">
          <h2 className="border-b border-ink pb-1 text-sm font-semibold">Příloha: soupis práce a materiálu</h2>
          {byWorker.length > 0 && (
            <p className="mt-2">
              Odpracováno celkem {(byWorker.reduce((a, x) => a + x.hours, 0)).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} h
              {' ('}
              {byWorker.map((x) => `${x.m.displayName} ${x.hours.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} h`).join(', ')}
              {')'}.
            </p>
          )}
          <table className="mt-2 w-full border-collapse text-xs">
            <tbody>
              {job.materialPlan
                .filter((l) => l.usedQty > 0)
                .map((l) => (
                  <tr key={l.materialId} className="border-b border-line">
                    <td className="py-1 pr-2">{l.name}</td>
                    <td className="py-1 text-right tabular-nums">
                      {l.usedQty.toLocaleString('cs-CZ')} {l.unit}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {job.handover && (
        <p className="mt-6 text-xs text-ink-2">
          Dílo předáno {job.handover.signedAt.toLocaleDateString('cs-CZ')}
          {job.handover.signature ? `, převzal(a) ${job.handover.clientName} (podepsaný předávací protokol).` : ' bez podpisu zákazníka.'}
        </p>
      )}
      <p className="mt-6 text-xs text-ink-3">Tento podklad není daňovým dokladem. Fakturu vystaví účetní program podle tohoto podkladu.</p>
    </DocumentShell>
  );
}
