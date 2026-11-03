'use client';

import { Construction, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { toolStates } from '@/lib/people';
import type { Job } from '@/types/firestore';

/** Technika rezervovaná na zakázku a nářadí, které má parta na stavbě. */
export function ReservationsSection({ job }: { job: Job }) {
  const snap = useSnapshot();
  if (!snap) return null;
  const res = snap.reservations.filter((r) => r.jobId === job.id);
  const tools = toolStates(snap.tools, snap.toolEvents).filter((s) => s.jobId === job.id);
  if (!res.length && !tools.length) return null;
  const tool = (id: string) => snap.tools.find((t) => t.id === id);
  const who = (uid: string | null) => snap.members.find((m) => m.uid === uid)?.displayName ?? '';
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Construction className="size-4" /> Technika a nářadí
      </h3>
      <ul className="divide-y divide-line rounded-lg border border-line text-sm">
        {res.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 text-ink">{tool(r.toolId)?.name}</span>
            <span className="text-ink-2 tabular-nums">
              {r.from.toLocaleDateString('cs-CZ')}–{r.to.toLocaleDateString('cs-CZ')}
            </span>
          </li>
        ))}
        {tools.map((s) => (
          <li key={s.tool.id} className="flex items-center gap-3 px-3 py-2">
            <Wrench className="size-3.5 text-ink-3" />
            <span className="min-w-0 flex-1 text-ink">{s.tool.name}</span>
            <span className="text-ink-2">{who(s.holderId)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-ink-3">
        Rezervace a výdej v{' '}
        <Link href="/provoz" className="font-medium text-series-1-ink underline underline-offset-2">
          Provozu
        </Link>
        .
      </p>
    </section>
  );
}
