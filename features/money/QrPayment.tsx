'use client';

import { QrCode } from '@/components/ui/QrCode';
import { spayd, variableSymbol } from '@/lib/finance';
import type { CompanySettings } from '@/types/firestore';

/** Blok „QR Platba“ na dokladu: kód podle standardu ČBA + čitelné platební údaje vedle. */
export function QrPayment({ settings, amount, docNumber, due, message }: { settings: CompanySettings; amount: number; docNumber: string; due?: Date; message: string }) {
  const vs = variableSymbol(docNumber);
  const code = spayd({ account: settings.bankAccount, amount, vs, message, due });
  if (!code) {
    return settings.bankAccount ? (
      <p className="mt-6 text-xs text-ink-3">QR platbu nelze vytvořit: číslo účtu „{settings.bankAccount}“ nemá platný formát (např. 123456789/0100).</p>
    ) : null;
  }
  return (
    <section className="mt-6 flex items-center gap-5 break-inside-avoid rounded-md border border-line p-3">
      <QrCode value={code} size={112} label={`QR platba ${amount.toLocaleString('cs-CZ')} Kč`} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[12px]">
        <dt className="col-span-2 mb-1 font-semibold">QR Platba</dt>
        <dt className="text-ink-3">Účet</dt>
        <dd className="tabular-nums">{settings.bankAccount}</dd>
        <dt className="text-ink-3">Variabilní symbol</dt>
        <dd className="tabular-nums">{vs}</dd>
        <dt className="text-ink-3">Částka</dt>
        <dd className="font-semibold tabular-nums">{amount.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 2 })}</dd>
        {due && (
          <>
            <dt className="text-ink-3">Splatnost</dt>
            <dd className="tabular-nums">{due.toLocaleDateString('cs-CZ')}</dd>
          </>
        )}
        <dd className="col-span-2 mt-1 text-ink-3">Naskenujte v mobilním bankovnictví.</dd>
      </dl>
    </section>
  );
}
