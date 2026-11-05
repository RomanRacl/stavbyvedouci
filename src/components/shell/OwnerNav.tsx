'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  ClipboardList,
  FileText,
  Handshake,
  HardHat,
  LayoutTemplate,
  Menu,
  Package,
  Pin,
  PinOff,
  Settings,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { allAlerts } from '@/lib/analytics';
import { receivables } from '@/lib/finance';
import { resetLangForOffice } from '@/lib/i18n';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { certStatus } from '@/lib/operations';
import { absenceConflicts, toolStates } from '@/lib/people';
import { leadView, serviceReminders } from '@/lib/sales';
import { stockRows } from '@/lib/stock';

interface NavLink {
  href: string;
  label: string;
  Icon: LucideIcon;
}

/** Navigace rozdělená podle toho, co majitel řeší: práce, obchod, peníze, materiál, firma. */
const GROUPS: Array<{ label: string; links: NavLink[] }> = [
  {
    label: 'Práce',
    links: [
      { href: '/dashboard', label: 'Zakázky', Icon: ClipboardList },
      { href: '/kalendar', label: 'Kalendář', Icon: CalendarDays },
      { href: '/provoz', label: 'Provoz', Icon: Truck },
    ],
  },
  {
    label: 'Obchod',
    links: [
      { href: '/obchod', label: 'Poptávky a obchod', Icon: Handshake },
      { href: '/nabidky', label: 'Nabídky', Icon: FileText },
      { href: '/zakaznici', label: 'Zákazníci', Icon: Users },
    ],
  },
  {
    label: 'Peníze',
    links: [
      { href: '/penize', label: 'Peníze', Icon: Wallet },
      { href: '/analytika', label: 'Analytika', Icon: TrendingUp },
    ],
  },
  {
    label: 'Materiál',
    links: [
      { href: '/sklad', label: 'Sklad', Icon: Package },
      { href: '/objednavky', label: 'Objednávky', Icon: ShoppingCart },
    ],
  },
  {
    label: 'Firma',
    links: [
      { href: '/tym', label: 'Tým', Icon: HardHat },
      { href: '/sablony', label: 'Šablony', Icon: LayoutTemplate },
      { href: '/nastaveni', label: 'Nastavení', Icon: Settings },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.links);
const PIN_KEY = 'stavbyvedouci:nav-pinned';

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** Počty věcí, které čekají na majitele – zobrazí se u položek menu. */
function useBadges() {
  const snap = useSnapshot();
  return useMemo(() => {
    const out: Record<string, number> = {};
    if (!snap) return out;
    out['/sklad'] = stockRows(snap.catalog, snap.stockMoves, snap.vans).filter((r) => r.low).length;
    out['/analytika'] = new Set(allAlerts(snap.jobs).filter((a) => a.level === 'critical').map((a) => a.job.id)).size;
    out['/tym'] = snap.certificates.filter((c) => certStatus(c) === 'expired' || certStatus(c) === 'expiring').length;
    out['/zakaznici'] = snap.recurring.filter((r) => r.active && r.nextDate.getTime() - Date.now() < 14 * 86_400_000).length;
    out['/objednavky'] = snap.orders.filter((o) => o.status !== 'received').length;
    out['/penize'] = snap.jobs.filter((j) => j.status === 'approved').length + receivables(snap.jobs, snap.settings).filter((r) => r.nextLevel).length;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    out['/provoz'] =
      snap.absences.filter((a) => a.status === 'pending').length +
      absenceConflicts(snap.absences, snap.jobs).length +
      toolStates(snap.tools, snap.toolEvents).filter((t) => t.revision === 'overdue').length;
    out['/obchod'] =
      snap.leads.map((l) => leadView(l, snap.quotes)).filter((l) => l.stage !== 'won' && l.stage !== 'lost' && l.nextStep && l.nextStep <= endOfToday).length +
      serviceReminders({ jobs: snap.jobs, recurring: snap.recurring, settings: snap.settings }, 7).filter((r) => !snap.serviceDone[r.key]).length;
    out['/dashboard'] = snap.jobs.filter((j) => j.status === 'awaiting_approval').length;
    return out;
  }, [snap]);
}

function Badge({ n, compact }: { n?: number; compact?: boolean }) {
  if (!n) return null;
  return compact ? (
    <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-warn ring-2 ring-surface" aria-hidden />
  ) : (
    <span className="ml-auto rounded-full bg-warn px-1.5 text-xs font-semibold text-[#16202a] tabular-nums">{n}</span>
  );
}

/** Seznam skupin a odkazů – stejný pro boční lištu i mobilní menu. */
function NavList({ path, badges, expanded, onNavigate }: { path: string; badges: Record<string, number>; expanded: boolean; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p
            className={`mb-1 h-4 px-3 text-[11px] font-semibold tracking-wider whitespace-nowrap text-ink-3 uppercase transition-opacity duration-150 motion-reduce:transition-none ${
              expanded ? 'opacity-100' : 'opacity-0 group-hover/nav:opacity-100 group-focus-within/nav:opacity-100'
            }`}
          >
            {g.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {g.links.map(({ href, label, Icon }) => {
              const active = isActive(path, href);
              const n = badges[href];
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    title={expanded ? undefined : label}
                    className={`relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:outline-none ${
                      active ? 'bg-ink text-white' : 'text-ink-2 hover:bg-concrete hover:text-ink'
                    }`}
                  >
                    <Icon className="size-[18px] shrink-0" aria-hidden />
                    <span
                      className={`flex min-w-0 flex-1 items-center gap-2 transition-opacity duration-150 motion-reduce:transition-none ${
                        expanded ? 'opacity-100' : 'opacity-0 group-hover/nav:opacity-100 group-focus-within/nav:opacity-100'
                      }`}
                    >
                      <span className="truncate">{label}</span>
                      <Badge n={n} />
                    </span>
                    {!expanded && (
                      <span className="group-hover/nav:hidden group-focus-within/nav:hidden">
                        <Badge n={n} compact />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Logo({ withName }: { withName: string }) {
  return (
    <Link href="/dashboard" className="flex h-10 items-center gap-3 rounded-lg px-2 font-display text-base font-bold whitespace-nowrap text-ink">
      {/* eslint-disable-next-line @next/next/no-img-element -- malá statická ikona */}
      <img src="/icons/icon-192.png" alt="" className="size-8 shrink-0 rounded-md" />
      <span className={withName}>Stavbyvedoucí</span>
    </Link>
  );
}

/**
 * Rám kanceláře.
 * Počítač: úzká lišta s ikonami vlevo, po najetí myší (nebo klávesnicí) se rozbalí s názvy.
 * Připínáčkem zůstane rozbalená trvale. Telefon a tablet: horní lišta a menu na klepnutí.
 */
export function OwnerShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  // Kancelář je zatím česky – jazyk zvolený v mobilu party sem nepatří (synchronně, ještě před vykreslením).
  resetLangForOffice();
  const badges = useBadges();
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = ALL.find((l) => isActive(path, l.href));
  const waiting = Object.values(badges).reduce((a, b) => a + b, 0);

  useEffect(() => {
    try {
      setPinned(localStorage.getItem(PIN_KEY) === '1');
    } catch {
      /* soukromé okno */
    }
  }, []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const togglePin = () => {
    setPinned((p) => {
      try {
        localStorage.setItem(PIN_KEY, p ? '0' : '1');
      } catch {
        /* nic */
      }
      return !p;
    });
  };

  const skip = (
    <button
      type="button"
      onClick={() => {
        const main = document.querySelector('main');
        if (!main) return;
        main.setAttribute('tabindex', '-1');
        main.focus();
      }}
      className="sr-only top-2 left-2 z-[60] rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed"
    >
      Přeskočit na obsah
    </button>
  );

  const workerLink = (expanded: boolean) => (
    <a
      href="/w"
      target="_blank"
      rel="noreferrer"
      title={expanded ? undefined : 'Pohled dělníka'}
      className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-ink-2 transition-colors hover:bg-concrete hover:text-ink"
    >
      <Smartphone className="size-[18px] shrink-0" aria-hidden />
      <span className={`transition-opacity duration-150 ${expanded ? '' : 'opacity-0 group-hover/nav:opacity-100 group-focus-within/nav:opacity-100'}`}>Pohled dělníka</span>
    </a>
  );

  return (
    <div className={`min-h-dvh bg-concrete ${pinned ? 'lg:pl-64' : 'lg:pl-16'}`}>
      {skip}

      {/* ---------- počítač: boční lišta ---------- */}
      <nav
        aria-label="Hlavní navigace"
        className={`group/nav fixed inset-y-0 left-0 z-40 hidden flex-col overflow-x-hidden overflow-y-auto border-r border-line bg-surface px-2 py-3 transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none lg:flex print:hidden ${
          pinned ? 'w-64' : 'w-16 hover:w-64 hover:shadow-2xl focus-within:w-64 focus-within:shadow-2xl'
        }`}
      >
        <Logo withName={`transition-opacity duration-150 ${pinned ? '' : 'opacity-0 group-hover/nav:opacity-100 group-focus-within/nav:opacity-100'}`} />
        <div className="mt-5 flex-1">
          <NavList path={path} badges={badges} expanded={pinned} />
        </div>
        <div className="mt-4 flex flex-col gap-0.5 border-t border-line pt-3">
          {workerLink(pinned)}
          <div className="flex items-center gap-1 px-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={togglePin}
              aria-pressed={pinned}
              aria-label={pinned ? 'Sbalit menu do ikon' : 'Připnout menu rozbalené'}
              title={pinned ? 'Sbalit menu do ikon' : 'Připnout menu rozbalené'}
              className={`grid size-9 place-items-center rounded-lg text-ink-2 transition hover:bg-concrete hover:text-ink ${pinned ? '' : 'opacity-0 group-hover/nav:opacity-100 group-focus-within/nav:opacity-100'}`}
            >
              {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </button>
          </div>
        </div>
      </nav>

      {/* ---------- telefon a tablet: horní lišta ---------- */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-2 backdrop-blur sm:px-4 lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label="Otevřít menu"
          className="relative grid size-11 place-items-center rounded-lg text-ink hover:bg-concrete"
        >
          <Menu className="size-5" />
          {waiting > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-warn ring-2 ring-surface" aria-hidden />}
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element -- malá statická ikona */}
        <img src="/icons/icon-192.png" alt="" className="size-7 rounded-md" />
        <p className="min-w-0 flex-1 truncate font-display text-base font-semibold text-ink">{current?.label ?? 'Stavbyvedoucí'}</p>
        <ThemeToggle />
      </header>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" id="mobile-menu">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#0b1015]/50" onClick={() => setOpen(false)} aria-hidden />
            <motion.nav
              aria-label="Hlavní navigace"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              className="absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col overflow-y-auto bg-surface px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <Logo withName="" />
                <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Zavřít menu" className="grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-concrete hover:text-ink">
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-4 flex-1">
                <NavList path={path} badges={badges} expanded onNavigate={() => setOpen(false)} />
              </div>
              <div className="mt-4 border-t border-line pt-3">{workerLink(true)}</div>
            </motion.nav>
          </div>
        )}
      </AnimatePresence>

      {children}
    </div>
  );
}

