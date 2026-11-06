'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ClipboardList, CornerDownLeft, Download, FileText, Handshake, Plus, Rocket, Search, User, Users, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadBackup } from '@/lib/backup';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { clientsView } from '@/lib/operations';
import { matchScore } from '@/lib/search';
import { announceParams } from '@/lib/useTabParam';

export interface PaletteLink {
  href: string;
  label: string;
  Icon: LucideIcon;
}

interface Item {
  id: string;
  group: 'Akce' | 'Sekce' | 'Zakázky' | 'Zákazníci' | 'Nabídky' | 'Poptávky' | 'Lidé';
  label: string;
  hint?: string;
  Icon: LucideIcon;
  /** Text, ve kterém se hledá (kromě názvu). */
  keywords?: string;
  run: () => void;
}

export const PALETTE_EVENT = 'stavbyvedouci:palette';
export const openPalette = () => window.dispatchEvent(new Event(PALETTE_EVENT));

const PER_GROUP = 6;

/**
 * Rychlé hledání (Ctrl+K / ⌘K): kus jména, adresy nebo kódu a Enter.
 * Najde zakázky, zákazníky, nabídky, poptávky, lidi i sekce a nabídne časté akce.
 */
export function CommandPalette({ links }: { links: PaletteLink[] }) {
  const snap = useSnapshot();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    const prev = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => prev?.focus?.();
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
    announceParams(href);
  };

  const all = useMemo<Item[]>(() => {
    const items: Item[] = [
      { id: 'a:new', group: 'Akce', label: 'Nová zakázka', Icon: Plus, keywords: 'založit vytvořit přidat', run: () => go('/dashboard?nova=1') },
      { id: 'a:quote', group: 'Akce', label: 'Nová nabídka', Icon: FileText, keywords: 'cenová nabídka vytvořit', run: () => go('/nabidky?open=new') },
      { id: 'a:backup', group: 'Akce', label: 'Stáhnout zálohu dat', Icon: Download, keywords: 'záloha export uložit', run: () => (setOpen(false), void downloadBackup(true)) },
      ...(snap && !snap.fresh ? [{ id: 'a:fresh', group: 'Akce' as const, label: 'Začít naostro', Icon: Rocket, keywords: 'průvodce smazat ukázková data', run: () => go('/zacit') }] : []),
      ...links.map((l) => ({ id: `s:${l.href}`, group: 'Sekce' as const, label: l.label, Icon: l.Icon, hint: 'sekce', run: () => go(l.href) })),
    ];
    if (!snap) return items;
    for (const j of snap.jobs) {
      if (j.id.startsWith('lt_')) continue; // zátěžová data nehledáme
      items.push({
        id: `j:${j.id}`,
        group: 'Zakázky',
        label: `${j.code} ${j.title}`,
        hint: j.client.name,
        Icon: ClipboardList,
        keywords: `${j.client.name} ${j.client.address} ${j.client.phone}`,
        run: () => go(`/dashboard?job=${j.id}`),
      });
    }
    for (const c of clientsView(snap)) {
      items.push({ id: `c:${c.name}`, group: 'Zákazníci', label: c.name, hint: c.address, Icon: User, keywords: `${c.address} ${c.phone} ${c.email}`, run: () => go(`/zakaznici?klient=${encodeURIComponent(c.name)}`) });
    }
    for (const x of snap.quotes) {
      items.push({ id: `q:${x.id}`, group: 'Nabídky', label: `${x.number} ${x.title}`, hint: x.client.name, Icon: FileText, keywords: `${x.client.name} ${x.client.address}`, run: () => go(`/nabidky?open=${x.id}`) });
    }
    for (const l of snap.leads) {
      items.push({ id: `l:${l.id}`, group: 'Poptávky', label: l.title, hint: l.clientName, Icon: Handshake, keywords: `${l.clientName} ${l.address} ${l.phone}`, run: () => go(`/obchod?open=${l.id}`) });
    }
    for (const m of snap.members.filter((x) => x.active)) {
      items.push({ id: `m:${m.uid}`, group: 'Lidé', label: m.displayName, hint: m.phone, Icon: Users, keywords: m.phone, run: () => go('/tym') });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` je stabilní v rámci otevření
  }, [snap, links]);

  const results = useMemo(() => {
    const query = q.trim();
    if (!query) return all.filter((i) => i.group === 'Akce' || i.group === 'Sekce');
    const scored = all
      .map((i) => ({ i, s: matchScore(query, `${i.label} ${i.hint ?? ''} ${i.keywords ?? ''}`) + (matchScore(query, i.label) ? 2 : 0) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    const perGroup: Record<string, number> = {};
    const out: Item[] = [];
    for (const { i } of scored) {
      perGroup[i.group] = (perGroup[i.group] ?? 0) + 1;
      if (perGroup[i.group] <= PER_GROUP) out.push(i);
    }
    // Skupiny drží pevné pořadí, uvnitř podle shody.
    const order = ['Akce', 'Zakázky', 'Zákazníci', 'Nabídky', 'Poptávky', 'Lidé', 'Sekce'];
    return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }, [q, all]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] print:hidden">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 bg-[#0b1015]/45 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Rychlé hledání"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="absolute inset-x-3 top-[8vh] mx-auto flex max-h-[76vh] max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 shrink-0 text-ink-3" aria-hidden />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Hledat zakázku, zákazníka, nabídku…"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={results[active] ? `pi-${active}` : undefined}
                aria-label="Hledat"
                className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
              />
              <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-xs text-ink-3 sm:block">Esc</kbd>
            </div>
            <ul ref={listRef} id="palette-list" role="listbox" aria-label="Výsledky" className="overflow-y-auto overscroll-contain p-2">
              {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-2">Nic nenalezeno. Zkuste kód zakázky, příjmení nebo ulici.</li>}
              {results.map((r, i) => {
                const head = i === 0 || results[i - 1].group !== r.group;
                return (
                  <li key={r.id} role="presentation">
                    {head && <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{r.group}</p>}
                    <div
                      id={`pi-${i}`}
                      data-idx={i}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => r.run()}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${i === active ? 'bg-concrete text-ink' : 'text-ink-2'}`}
                    >
                      <r.Icon className="size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-ink">{r.label}</span>
                        {r.hint && <span className="ml-2 text-ink-3">{r.hint}</span>}
                      </span>
                      {i === active ? <CornerDownLeft className="size-4 shrink-0 text-ink-3" aria-hidden /> : <ArrowRight className="size-4 shrink-0 opacity-0" aria-hidden />}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="hidden border-t border-line px-4 py-2 text-xs text-ink-3 sm:block">
              <kbd className="font-sans">↑↓</kbd> výběr · <kbd className="font-sans">Enter</kbd> otevřít · <kbd className="font-sans">Ctrl K</kbd> kdykoli otevře hledání
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
