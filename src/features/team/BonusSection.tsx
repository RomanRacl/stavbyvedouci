'use client';

import { Award } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { fmt } from '@/features/analytics/lib/metrics';
import type { Snapshot } from '@/lib/mock/localBackend';
import { monthKey, monthLabel } from '@/lib/money';
import { bonusesForMonth, DEFAULT_BONUS_SHARE } from '@/lib/people';

const lastMonths = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return monthKey(d);
  });

/** Odměny za zakázky hotové pod rozpočtem hodin: kolik a komu, za který měsíc. */
export function BonusSection({ snap }: { snap: Snapshot }) {
  const months = lastMonths(6);
  const [month, setMonth] = useState(months[0]);
  const list = bonusesForMonth(snap.jobs, snap.settings, snap.timeLogs, month);
  const valid = list.filter((b) => !b.blocked);
  const perPerson = new Map<string, number>();
  for (const b of valid) for (const x of b.split) perPerson.set(x.uid, (perPerson.get(x.uid) ?? 0) + x.amount);
  const name = (uid: string) => snap.members.find((m) => m.uid === uid)?.displayName ?? uid;

  return (
    <section className="mt-8 rounded-xl border border-line bg-surface" aria-labelledby="bonus-h">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 id="bonus-h" className="mr-auto flex items-center gap-2 text-base font-semibold text-ink">
          <Award className="size-4" /> Odměny za ušetřenou práci
        </h2>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Měsíc" className="h-10 rounded-lg border border-line bg-surface px-3 text-sm capitalize">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>
      <p className="px-4 pt-3 text-sm text-ink-2">
        Když parta dokončí zakázku za méně hodin, než bylo v rozpočtu, dostane {snap.settings.bonusSharePct ?? DEFAULT_BONUS_SHARE} % z ušetřených nákladů na práci (mění se v Nastavení). Dělí se podle odpracovaných hodin. Reklamace odměnu ruší.
      </p>
      {list.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-3">V tomto měsíci žádná zakázka neskončila pod rozpočtem hodin.</p>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-[2fr_1fr]">
          <ul className="divide-y divide-line rounded-lg border border-line">
            {list.map((b) => (
              <li key={b.job.id} className={`px-3 py-2.5 text-sm ${b.blocked ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <Link href={`/dashboard?job=${b.job.id}`} className="min-w-0 flex-1 font-medium text-ink hover:underline">
                    {b.job.code} {b.job.title}
                  </Link>
                  <span className="text-ink-2 tabular-nums">ušetřeno {fmt.num(b.savedHours)} h</span>
                  <span className="w-24 text-right font-semibold tabular-nums">{b.blocked ? '0 Kč' : fmt.czk(b.pool)}</span>
                </div>
                <p className="text-xs text-ink-3">{b.blocked ? `Bez odměny: ${b.blocked}.` : b.split.map((x) => `${name(x.uid)} ${fmt.czk(x.amount)}`).join(', ')}</p>
              </li>
            ))}
          </ul>
          <div className="rounded-lg bg-concrete/60 p-3">
            <p className="text-sm font-semibold text-ink">Do mezd za {monthLabel(month)}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {[...perPerson].map(([uid, amount]) => (
                <li key={uid} className="flex justify-between">
                  <span>{name(uid)}</span>
                  <span className="font-medium tabular-nums">{fmt.czk(amount)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-3">Parta vidí svou odměnu v mobilu v Mém výdělku.</p>
          </div>
        </div>
      )}
    </section>
  );
}
