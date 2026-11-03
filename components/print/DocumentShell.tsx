'use client';

import { ArrowLeft, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CompanySettings } from '@/types/firestore';

interface Props {
  settings: CompanySettings;
  kind: string; // „Cenová nabídka“, „Podklad k fakturaci“…
  number?: string;
  date?: Date;
  children: ReactNode;
}

/**
 * Společný rám tištěných dokumentů (A4): logo a údaje firmy vlevo, druh a číslo dokladu vpravo.
 * „Uložit jako PDF“ nabízí dialog tisku každého prohlížeče.
 */
export function DocumentShell({ settings, kind, number, date, children }: Props) {
  return (
    <div className="theme-light min-h-dvh bg-concrete py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4 print:hidden">
        <button type="button" onClick={() => window.close()} className="inline-flex h-10 items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" /> Zavřít
        </button>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90">
          <Printer className="size-4" /> Tisk / Uložit jako PDF
        </button>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-[16mm] py-[14mm] text-[13px] leading-relaxed text-ink shadow-xl print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-ink pb-5">
          <div className="flex items-start gap-4">
            {settings.logo && (
              // eslint-disable-next-line @next/next/no-img-element -- logo jako data URL
              <img src={settings.logo} alt="" className="max-h-16 max-w-36 object-contain" />
            )}
            <div>
              <p className="font-display text-lg font-bold">{settings.name}</p>
              <p>{settings.address}</p>
              {(settings.ico || settings.dic) && (
                <p>
                  {settings.ico && `IČO ${settings.ico}`}
                  {settings.ico && settings.dic && ', '}
                  {settings.dic && `DIČ ${settings.dic}`}
                </p>
              )}
              <p>
                {settings.phone}
                {settings.email && `, ${settings.email}`}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <h1 className="font-display text-2xl font-bold">{kind}</h1>
            {number && <p className="font-display text-base font-semibold tabular-nums">{number}</p>}
            {date && <p>ze dne {date.toLocaleDateString('cs-CZ')}</p>}
          </div>
        </header>
        {children}
      </article>
    </div>
  );
}

/** Tabulka rekapitulace DPH: základ, DPH, celkem. */
export function VatSummary({ net, vat, gross, rateLabel, note, extra }: { net: number; vat: number; gross: number; rateLabel: string; note?: string; extra?: ReactNode }) {
  const czk = (n: number) => n.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 2 });
  return (
    <div className="mt-6 flex justify-end">
      <table className="w-80 text-right">
        <tbody>
          <tr>
            <td className="py-0.5 pr-4 text-ink-2">Základ</td>
            <td className="tabular-nums">{czk(net)}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-4 text-ink-2">DPH {rateLabel}</td>
            <td className="tabular-nums">{czk(vat)}</td>
          </tr>
          <tr className="border-t border-ink">
            <td className="pt-1 pr-4 font-semibold">Celkem</td>
            <td className="pt-1 font-bold tabular-nums">{czk(gross)}</td>
          </tr>
          {extra}
        </tbody>
      </table>
      {note && <p className="sr-only">{note}</p>}
    </div>
  );
}
