'use client';

import { LayoutGroup, motion } from 'framer-motion';
import { Settings, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { stockRows } from '@/lib/stock';
import { paymentSummary } from '@/lib/money';
import { allAlerts } from '@/lib/analytics';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { certStatus } from '@/lib/operations';
import { useSnapshot } from '@/lib/mock/useSnapshot';

const LINKS = [
  { href: '/dashboard', label: 'Zakázky' },
  { href: '/kalendar', label: 'Kalendář' },
  { href: '/analytika', label: 'Analytika' },
  { href: '/nabidky', label: 'Nabídky' },
  { href: '/penize', label: 'Peníze' },
  { href: '/sklad', label: 'Sklad' },
  { href: '/objednavky', label: 'Objednávky' },
  { href: '/sablony', label: 'Šablony' },
  { href: '/zakaznici', label: 'Zákazníci' },
  { href: '/tym', label: 'Tým' },
] as const;

/** Horní navigace kanceláře. Odkazy přes next/link = přechod bez načtení stránky. */
export function OwnerNav() {
  const path = usePathname();
  const snap = useSnapshot();

  const badges = useMemo(() => {
    const out: Record<string, number> = {};
    if (!snap) return out;
    out['/sklad'] = stockRows(snap.catalog, snap.stockMoves, snap.vans).filter((r) => r.low).length;
    out['/analytika'] = new Set(allAlerts(snap.jobs).filter((a) => a.level === 'critical').map((a) => a.job.id)).size;
    out['/tym'] = snap.certificates.filter((c) => certStatus(c) === 'expired' || certStatus(c) === 'expiring').length;
    out['/zakaznici'] = snap.recurring.filter((r) => r.active && r.nextDate.getTime() - Date.now() < 14 * 86_400_000).length;
    out['/objednavky'] = snap.orders.filter((o) => o.status !== 'received').length;
    out['/penize'] =
      snap.jobs.filter((j) => j.status === 'approved').length +
      snap.jobs.reduce((a, j) => a + paymentSummary(j, snap.settings).overdue.length, 0);
    return out;
  }, [snap]);

  return (
    <nav className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur print:hidden" aria-label="Hlavní navigace">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2 font-display text-base font-bold text-ink">
          {/* eslint-disable-next-line @next/next/no-img-element -- malá statická ikona */}
          <img src="/icons/icon-192.png" alt="" className="size-7 rounded-md" />
          <span className="max-sm:hidden">Stavbyvedoucí</span>
        </Link>
        <LayoutGroup id="owner-nav">
          <ul className="flex h-full min-w-0 flex-1 items-stretch gap-1 overflow-x-auto">
            {LINKS.map((l) => {
              const active = path === l.href || path.startsWith(`${l.href}/`);
              const badge = badges[l.href];
              return (
                <li key={l.href} className="relative flex">
                  <Link
                    href={l.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-1.5 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 ${
                      active ? 'text-ink' : 'text-ink-2 hover:text-ink'
                    }`}
                  >
                    {l.label}
                    {badge ? (
                      <span className="rounded-full bg-warn px-1.5 text-xs font-semibold text-white tabular-nums">{badge}</span>
                    ) : null}
                  </Link>
                  {active && <motion.span layoutId="nav-underline" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-ink" />}
                </li>
              );
            })}
          </ul>
        </LayoutGroup>
        <ThemeToggle />
        <Link
          href="/nastaveni"
          aria-label="Nastavení"
          aria-current={path === '/nastaveni' ? 'page' : undefined}
          className={`grid size-9 shrink-0 place-items-center rounded-lg transition ${path === '/nastaveni' ? 'bg-concrete text-ink' : 'text-ink-2 hover:text-ink'}`}
        >
          <Settings className="size-4" />
        </Link>
        <a
          href="/w"
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 transition hover:text-ink"
        >
          <Smartphone className="size-4" /> <span className="max-md:hidden">Pohled dělníka</span>
        </a>
      </div>
    </nav>
  );
}
