'use client';

import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fmt } from '@/features/analytics/lib/metrics';
import type { MaterialItem } from '@/types/firestore';

interface Props {
  catalog: MaterialItem[];
  excludeIds: string[];
  onPick: (item: MaterialItem) => void;
  /** `touch` = větší řádky pro mobil dělníka. */
  variant?: 'desktop' | 'touch';
  autoFocus?: boolean;
}

/** Hledání v katalogu materiálu podle názvu, kódu nebo kategorie. Bez dotazu ukáže první položky. */
export function MaterialSearch({ catalog, excludeIds, onPick, variant = 'desktop', autoFocus }: Props) {
  const [q, setQ] = useState('');
  const touch = variant === 'touch';

  const results = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('cs');
    return catalog
      .filter((m) => !excludeIds.includes(m.id))
      .filter((m) => !needle || [m.name, m.sku, m.category].some((v) => v.toLocaleLowerCase('cs').includes(needle)))
      .slice(0, touch ? 6 : 8);
  }, [catalog, excludeIds, q, touch]);

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Hledat materiál</span>
        <Search className={`pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3 ${touch ? 'size-5' : 'size-4'}`} />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hledat v katalogu, např. kabel, PPR, pěna"
          className={`w-full rounded-lg border border-line bg-surface text-ink placeholder:text-ink-3 focus:border-series-1 focus:outline-none ${
            touch ? 'h-12 pl-10 text-base' : 'h-10 pl-9 text-sm'
          }`}
        />
      </label>
      <ul className="mt-2 divide-y divide-line">
        {results.length === 0 && (
          <li className={`py-3 text-ink-2 ${touch ? 'text-base' : 'text-sm'}`}>
            Nic nenalezeno. Zkuste jiné slovo{touch ? ' nebo požádejte kancelář o doplnění katalogu.' : '.'}
          </li>
        )}
        {results.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onPick(m)}
              className={`flex w-full items-center gap-3 text-left transition hover:bg-concrete/60 active:bg-concrete ${touch ? 'min-h-14 py-2' : 'py-2'}`}
            >
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-ink ${touch ? 'text-base' : 'text-sm font-medium'}`}>{m.name}</span>
                <span className="block text-xs text-ink-3">
                  {m.category}, {fmt.czk(m.unitCost)}/{m.unit}
                  {!touch && `, skladem ${fmt.num(m.stockQty)} ${m.unit}`}
                </span>
              </span>
              <span className={`grid shrink-0 place-items-center rounded-lg border border-line text-ink-2 ${touch ? 'size-11' : 'size-8'}`}>
                <Plus className="size-4" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
