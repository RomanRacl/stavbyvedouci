'use client';

import { ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DEFAULT_WARRANTY_MONTHS, warrantyUntil } from '@/lib/finance';
import { createClaim, updateJob } from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import type { CompanySettings, Job } from '@/types/firestore';

const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Záruka na dílo a reklamace: do kdy platí, nahlášení reklamace jako nové navázané zakázky. */
export function WarrantySection({ job, settings, onToast }: { job: Job; settings: CompanySettings; onToast: (t: string) => void }) {
  const snap = useSnapshot();
  const [form, setForm] = useState<{ text: string; start: string } | null>(null);
  if (!snap) return null;

  if (job.claimOf) {
    const orig = snap.jobs.find((j) => j.id === job.claimOf);
    return (
      <section aria-labelledby={`war-${job.id}`} className="rounded-lg border border-warn/40 bg-warn/8 p-4">
        <h3 id={`war-${job.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <ShieldAlert className="size-4 text-warn-ink" /> Reklamace
        </h3>
        <p className="mt-1 text-sm text-ink-2">
          Práce v záruce k zakázce{' '}
          {orig ? (
            <Link href={`/dashboard?job=${orig.id}`} className="font-medium text-series-1-ink underline underline-offset-2">
              {orig.code} {orig.title}
            </Link>
          ) : (
            'která už byla smazána'
          )}
          . Zákazník neplatí, náklady se počítají jako náklady na reklamace.
        </p>
      </section>
    );
  }

  const until = warrantyUntil(job, settings);
  const months = job.warrantyMonths ?? settings.warrantyMonths ?? DEFAULT_WARRANTY_MONTHS;
  const claims = snap.jobs.filter((j) => j.claimOf === job.id);
  const claimCost = claims.reduce((a, j) => a + j.actuals.laborCost + j.actuals.materialCost, 0);
  const active = until && until.getTime() > Date.now();

  return (
    <section aria-labelledby={`war-${job.id}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 id={`war-${job.id}`} className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-ink">
          <ShieldCheck className="size-4" /> Záruka a reklamace
        </h3>
        <label className="text-xs text-ink-2">
          Záruka{' '}
          <select
            value={months}
            onChange={(e) => {
              updateJob(job.id, { warrantyMonths: Number(e.target.value) });
              onToast('Délka záruky změněna.');
            }}
            className="h-8 rounded-md border border-line bg-surface px-2 text-sm"
          >
            {[...new Set([6, 12, 24, 36, 60, months])].sort((a, b) => a - b).map((m) => (
              <option key={m} value={m}>
                {m} měsíců
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded-lg border border-line p-4">
        <p className="text-sm text-ink">
          {until ? (
            active ? (
              <>
                Záruka platí do <strong>{until.toLocaleDateString('cs-CZ')}</strong> (zbývá {Math.ceil((until.getTime() - Date.now()) / 86_400_000)} dní).
              </>
            ) : (
              <>Záruka skončila {until.toLocaleDateString('cs-CZ')}.</>
            )
          ) : (
            'Záruka začne běžet předáním díla.'
          )}
        </p>
        {claims.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line text-sm">
            {claims.map((c) => (
              <li key={c.id}>
                <Link href={`/dashboard?job=${c.id}`} className="flex items-center gap-2 px-3 py-2 hover:bg-concrete/60">
                  <span className="min-w-0 flex-1 truncate">
                    {c.code} {c.title.replace(/^Reklamace: /, '')}
                  </span>
                  <span className="text-xs text-ink-3">{c.schedule.start.toLocaleDateString('cs-CZ')}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {claims.length > 0 && <p className="mt-2 text-xs text-ink-3">Náklady na reklamace zatím {claimCost.toLocaleString('cs-CZ')} Kč.</p>}
        {until && !form && (
          <button type="button" onClick={() => setForm({ text: '', start: toInputDate(new Date(Date.now() + 86_400_000)) })} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:border-ink-3">
            <ShieldAlert className="size-4" /> Nahlásit reklamaci
          </button>
        )}
        {form && (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_160px]">
            <input aria-label="Co je reklamováno" placeholder="Co nefunguje, např. netěsní ventil v koupelně" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} className="h-9 rounded-md border border-line bg-surface px-3 text-sm" />
            <input aria-label="Termín opravy" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="h-9 rounded-md border border-line bg-surface px-2 text-sm" />
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => setForm(null)} className="h-9 rounded-md px-3 text-sm text-ink-2 hover:bg-concrete">
                Zrušit
              </button>
              <button
                type="button"
                disabled={!form.text.trim() || !form.start}
                onClick={() => {
                  const c = createClaim(job.id, { description: form.text.trim(), start: new Date(form.start), workerIds: [] });
                  setForm(null);
                  if (c) onToast(`Reklamace založena jako zakázka ${c.code} pro stejnou partu.${active ? '' : ' Pozor, záruka už skončila.'}`);
                }}
                className="h-9 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:bg-line disabled:text-ink-3"
              >
                Založit reklamaci
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
