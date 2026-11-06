'use client';

import { Bell, CheckCheck, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { lastBackupAt } from '@/lib/backup';
import { readStore } from '@/lib/mock/localStore';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { notificationsOf, type Notice, type NoticeLevel } from '@/lib/notifications';
import { announceParams } from '@/lib/useTabParam';

const SEEN_KEY = 'stavbyvedouci:seen-notices';
const LEVEL: Record<NoticeLevel, { dot: string; label: string }> = {
  critical: { dot: 'bg-crit', label: 'Hoří' },
  warning: { dot: 'bg-warn', label: 'Pozor' },
  info: { dot: 'bg-series-1', label: 'Na řadě' },
};

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Upozornění + kolik z nich majitel ještě neviděl. */
export function useNotices() {
  const snap = useSnapshot();
  const [seen, setSeen] = useState<Set<string>>(new Set());
  useEffect(() => setSeen(readSeen()), []);
  const notices = useMemo(() => (snap ? notificationsOf(snap, { lastBackup: lastBackupAt(), ownData: readStore().created.length > 0 }) : []), [snap]);
  const unseen = notices.filter((n) => !seen.has(n.id)).length;
  const markSeen = useCallback(() => {
    const ids = notices.map((n) => n.id);
    try {
      // Pamatujeme jen aktuální upozornění – vyřešené z paměti samy vypadnou.
      localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(0, 400)));
    } catch {
      /* nic */
    }
    setSeen(new Set(ids));
  }, [notices]);
  return { notices, seen, unseen, markSeen };
}

export function BellButton({ unseen, onClick, className = '' }: { unseen: number; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={unseen ? `Upozornění, nových ${unseen}` : 'Upozornění'}
      title="Upozornění"
      className={`relative grid place-items-center rounded-lg text-ink-2 transition hover:bg-concrete hover:text-ink ${className}`}
    >
      <Bell className="size-[18px]" />
      {unseen > 0 && (
        <span className="absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full bg-crit px-1 text-[11px] leading-[18px] font-bold text-white tabular-nums ring-2 ring-surface">
          {unseen > 99 ? '99+' : unseen}
        </span>
      )}
    </button>
  );
}

/** Panel upozornění zprava, seskupený podle oblasti. Otevřením se vše označí jako viděné. */
export function NotificationDrawer({ open, onClose, notices, seen }: { open: boolean; onClose: () => void; notices: Notice[]; seen: Set<string> }) {
  const groups = useMemo(() => {
    const m = new Map<string, Notice[]>();
    for (const n of notices) m.set(n.group, [...(m.get(n.group) ?? []), n]);
    return [...m.entries()];
  }, [notices]);
  const counts = { critical: notices.filter((n) => n.level === 'critical').length, warning: notices.filter((n) => n.level === 'warning').length };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Upozornění"
      subtitle={notices.length ? `${notices.length} věcí čeká${counts.critical ? `, ${counts.critical} hoří` : ''}${counts.warning ? `, ${counts.warning} k pozornosti` : ''}.` : 'Všechno je vyřízené.'}
      width={460}
    >
      {notices.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <CheckCheck className="size-10 text-good" aria-hidden />
          <p className="mt-3 text-base font-semibold text-ink">Nic nehoří</p>
          <p className="mt-1 text-sm text-ink-2">Nové věci se tu objeví, jakmile budou potřebovat vaši pozornost.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([group, items]) => (
            <section key={group} aria-label={group}>
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{group}</h3>
              <ul className="flex flex-col gap-1">
                {items.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      onClick={() => {
                        onClose();
                        announceParams(n.href);
                        if (n.href.includes('#')) setTimeout(() => document.getElementById(n.href.split('#')[1])?.scrollIntoView({ behavior: 'smooth' }), 300);
                      }}
                      className="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-concrete"
                    >
                      <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${LEVEL[n.level].dot}`} title={LEVEL[n.level].label} aria-label={LEVEL[n.level].label} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-ink">{n.title}</span>
                          {!seen.has(n.id) && <span className="shrink-0 rounded-full bg-series-1/12 px-1.5 text-[11px] font-semibold text-series-1-ink">nové</span>}
                        </span>
                        <span className="mt-0.5 block text-sm text-ink-2">{n.detail}</span>
                      </span>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-ink-3 transition group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Drawer>
  );
}
