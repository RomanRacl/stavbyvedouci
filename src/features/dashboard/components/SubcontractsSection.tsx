'use client';

import { HardHat, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { fmt } from '@/features/analytics/lib/metrics';
import { newSubcontractId, setSubcontracts } from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { subScore } from '@/lib/people';
import type { Job, Subcontract } from '@/types/firestore';

const STATUS: Record<Subcontract['status'], string> = { ordered: 'Objednáno', done: 'Hotovo', paid: 'Zaplaceno' };

/** Práce zadané subdodavatelům: cena se počítá do nákladů zakázky. */
export function SubcontractsSection({ job, onToast }: { job: Job; onToast: (t: string) => void }) {
  const snap = useSnapshot();
  const [form, setForm] = useState<{ subId: string; description: string; price: string } | null>(null);
  if (!snap) return null;
  const list = job.subcontracts ?? [];
  const subs = [...snap.subcontractors].sort((a, b) => (a.trade === job.trade ? -1 : 0) - (b.trade === job.trade ? -1 : 0));
  const sub = (id: string) => snap.subcontractors.find((s) => s.id === id);
  const total = list.reduce((a, x) => a + x.price, 0);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-ink">
          <HardHat className="size-4" /> Subdodávky
          {total > 0 && <span className="font-normal text-ink-3 tabular-nums">{fmt.czk(total)}</span>}
        </h3>
        {!form && (
          <button type="button" onClick={() => setForm({ subId: subs[0]?.id ?? '', description: '', price: '' })} className="inline-flex h-8 items-center gap-1 rounded-md border border-ink px-2.5 text-sm font-medium text-ink hover:bg-ink hover:text-white">
            <Plus className="size-3.5" /> Zadat práci
          </button>
        )}
      </div>
      {form && (
        <div className="mb-3 grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_1fr_120px]">
          <select aria-label="Subdodavatel" value={form.subId} onChange={(e) => setForm({ ...form, subId: e.target.value })} className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
            {subs.map((s) => {
              const sc = subScore(s);
              return (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {sc ? ` (${sc.overall.toLocaleString('cs-CZ')} ★)` : ''}
                </option>
              );
            })}
          </select>
          <input aria-label="Co dělá" placeholder="Co dělá, např. obklady koupelny" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="h-9 rounded-md border border-line bg-surface px-2 text-sm" />
          <input aria-label="Cena" inputMode="numeric" placeholder="Cena Kč" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, '') })} className="h-9 rounded-md border border-line bg-surface px-2 text-right text-sm tabular-nums" />
          <div className="flex justify-end gap-2 sm:col-span-3">
            <button type="button" onClick={() => setForm(null)} className="h-9 rounded-md px-3 text-sm text-ink-2 hover:bg-concrete">
              Zrušit
            </button>
            <button
              type="button"
              disabled={!form.subId || !form.description.trim() || !Number(form.price)}
              onClick={() => {
                setSubcontracts(job.id, [...list, { id: newSubcontractId(), subId: form.subId, description: form.description.trim(), price: Number(form.price), status: 'ordered', due: null }]);
                setForm(null);
                onToast('Subdodávka přidána do nákladů zakázky.');
              }}
              className="h-9 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:bg-line disabled:text-ink-3"
            >
              Přidat
            </button>
          </div>
        </div>
      )}
      {list.length === 0 ? (
        !form && (
          <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-2">
            Žádné. Subdodavatele spravujete v{' '}
            <Link href="/provoz" className="font-medium text-series-1-ink underline underline-offset-2">
              Provozu
            </Link>
            .
          </p>
        )
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block text-ink">{x.description}</span>
                <span className="block text-xs text-ink-3">{sub(x.subId)?.name ?? 'smazaný subdodavatel'}</span>
              </span>
              <select
                aria-label="Stav"
                value={x.status}
                onChange={(e) => setSubcontracts(job.id, list.map((y) => (y.id === x.id ? { ...y, status: e.target.value as Subcontract['status'] } : y)))}
                className="h-8 rounded-md border border-line bg-surface px-1.5 text-sm"
              >
                {(Object.keys(STATUS) as Subcontract['status'][]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s]}
                  </option>
                ))}
              </select>
              <span className="w-24 text-right font-semibold tabular-nums">{fmt.czk(x.price)}</span>
              <button type="button" aria-label="Odebrat" onClick={() => setSubcontracts(job.id, list.filter((y) => y.id !== x.id))} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-crit/10 hover:text-crit-ink">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
