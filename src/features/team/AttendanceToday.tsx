'use client';

import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { dayKey } from '@/lib/jobDefaults';
import { fmtDistance, geoCheckOn, geoVerdict, mapPointUrl, siteRadius, type GeoVerdict } from '@/lib/geo';
import type { Snapshot } from '@/lib/mock/localBackend';
import type { GeoPoint, Job } from '@/types/firestore';

const hm = (d: Date) => d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
const hours = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;

function GeoBadge({ v, at }: { v: GeoVerdict; at: GeoPoint | null | undefined }) {
  const cls =
    v.kind === 'onsite' ? 'bg-good/12 text-good-ink' : v.kind === 'away' ? 'bg-warn/15 text-warn-ink' : 'bg-concrete text-ink-3';
  const text =
    v.kind === 'onsite' ? 'na stavbě' : v.kind === 'away' ? `${fmtDistance(v.distance)} od stavby` : v.kind === 'nosite' ? 'stavba nemá polohu' : 'poloha nezjištěna';
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{text}</span>
      {at && (
        <a href={mapPointUrl(at)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs text-series-1 underline-offset-2 hover:underline">
          <MapPin className="size-3" aria-hidden /> mapa
        </a>
      )}
    </span>
  );
}

/**
 * Docházka dnes: kdo kde měří, odkdy a jestli začal práci na stavbě.
 * Poloha se ukládá jen jednou při startu, nikoho se během dne nesleduje.
 */
export function AttendanceToday({ snap }: { snap: Snapshot }) {
  const today = dayKey();
  const radius = siteRadius(snap.settings);
  const jobOf = (id: string): Job | undefined => snap.jobs.find((j) => j.id === id);
  const rows = snap.members
    .filter((m) => m.role !== 'owner')
    .map((m) => {
      const logs = snap.timeLogs.filter((l) => l.workerId === m.uid && l.endedAt && dayKey(l.startedAt) === today);
      const t = m.activeTimer;
      const runningMin = t ? Math.max(0, (Date.now() - t.startedAt.getTime() - (t.pausedMs ?? 0) - (t.pausedAt ? Date.now() - t.pausedAt.getTime() : 0)) / 60000) : 0;
      const doneMin = logs.reduce((a, l) => a + (l.durationMin ?? 0), 0);
      const starts = [...logs.map((l) => l.startedAt), ...(t && dayKey(t.startedAt) === today ? [t.startedAt] : [])];
      const first = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
      // Poloha posledního začátku práce: běžící měření, jinak poslední dnešní záznam.
      const last = t ? { jobId: t.jobId, geo: t.geoStart, acc: t.geoAccuracy } : logs.length ? { jobId: logs[0].jobId, geo: logs[0].geoStart, acc: logs[0].geoAccuracy } : null;
      const job = last ? jobOf(last.jobId) : undefined;
      const verdict = last && job ? geoVerdict(last.geo, job.client.geo, last.acc ?? 0, radius) : null;
      return { m, t, job, first, worked: doneMin + runningMin, verdict, geo: last?.geo ?? null };
    });
  const away = rows.filter((r) => r.verdict?.kind === 'away').length;

  return (
    <section className="mb-5 rounded-xl border border-line bg-surface" aria-labelledby="att-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="att-h" className="text-base font-semibold text-ink">
          Docházka dnes
        </h2>
        <p className="text-xs text-ink-3">
          {geoCheckOn(snap.settings)
            ? `Poloha se ukládá jen při začátku práce, okruh stavby ${radius} m.${away ? ` Mimo stavbu: ${away}.` : ''}`
            : 'Ukládání polohy je vypnuté v Nastavení.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th className="px-4 py-2 font-medium">Kdo</th>
              <th className="px-4 py-2 font-medium">Teď</th>
              <th className="px-4 py-2 font-medium">Začal</th>
              <th className="px-4 py-2 text-right font-medium">Dnes odpracováno</th>
              <th className="px-4 py-2 font-medium">Poloha při začátku</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, t, job, first, worked, verdict, geo }) => (
              <tr key={m.uid} className="border-t border-line">
                <td className="px-4 py-2.5 font-medium text-ink">{m.displayName}</td>
                <td className="px-4 py-2.5 text-ink-2">
                  {t && job ? (
                    <Link href={`/dashboard?job=${job.id}`} className="underline-offset-2 hover:underline">
                      <span className={`mr-1.5 inline-block size-2 rounded-full ${t.pausedAt ? 'bg-warn' : 'bg-good'}`} aria-hidden />
                      {t.pausedAt ? 'přestávka, ' : ''}
                      {job.code} {job.title}
                    </Link>
                  ) : (
                    <span className="text-ink-3">neměří</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-ink-2 tabular-nums">{first ? hm(first) : '–'}</td>
                <td className="px-4 py-2.5 text-right text-ink tabular-nums">{worked > 0 ? hours(worked) : '–'}</td>
                <td className="px-4 py-2.5">{verdict ? <GeoBadge v={verdict} at={geo} /> : <span className="text-ink-3">–</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
