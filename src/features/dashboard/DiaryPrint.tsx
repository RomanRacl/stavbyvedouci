'use client';

import { DocumentShell } from '@/components/print/DocumentShell';
import { AUDIT_LABEL } from '@/lib/audit';
import { buildDiary } from '@/lib/diary';
import { useSnapshot } from '@/lib/mock/useSnapshot';

const h = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });

/** Stavební deník zakázky k tisku (A4) – po dnech, nejstarší nahoře jako v papírovém deníku. */
export default function DiaryPrint({ jobId }: { jobId: string }) {
  const snap = useSnapshot();
  if (!snap) return null;
  const job = snap.jobs.find((j) => j.id === jobId);
  if (!job) return <p className="p-10 text-center text-ink-2">Zakázka nebyla nalezena.</p>;
  const days = buildDiary(job, snap).reverse();
  const name = (uid: string) => snap.members.find((m) => m.uid === uid)?.displayName ?? uid;

  return (
    <DocumentShell settings={snap.settings} kind="Stavební deník" number={job.code}>
      <section className="mt-5 grid grid-cols-2 gap-8">
        <div>
          <p className="text-xs text-ink-3">Stavba</p>
          <p className="font-semibold">{job.title}</p>
          <p>{job.client.address}</p>
        </div>
        <div>
          <p className="text-xs text-ink-3">Objednatel</p>
          <p className="font-semibold">{job.client.name}</p>
          <p>
            Termín {job.schedule.start.toLocaleDateString('cs-CZ')} – {job.schedule.due.toLocaleDateString('cs-CZ')}
          </p>
        </div>
      </section>
      {days.map((d) => (
        <section key={d.date} className="mt-5 break-inside-avoid">
          <h2 className="border-b border-ink pb-1 text-sm font-semibold capitalize">
            {new Date(`${d.date}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </h2>
          {d.people.length > 0 && (
            <p className="mt-1 text-xs">
              <span className="font-semibold">Na stavbě:</span>{' '}
              {d.people.map((p) => `${p.name} ${p.from.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}–${p.to.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })} (${h(p.hours)} h)`).join(', ')}
              {d.photos > 0 && `. Pořízeno ${d.photos} fotek.`}
            </p>
          )}
          <ul className="mt-1 space-y-0.5 text-xs">
            {d.entries.map((e, i) => (
              <li key={i}>
                <span className="tabular-nums">{e.at.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</span>{' '}
                <span className="font-semibold">{AUDIT_LABEL[e.kind as keyof typeof AUDIT_LABEL] ?? e.kind}:</span> {e.text} <span className="text-ink-3">({name(e.by)})</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-8 text-xs text-ink-3">Deník je sestaven automaticky z docházky, výdejů materiálu, fotek, zpráv a záznamů v aplikaci, doplněný o ruční zápisy.</p>
      <footer className="mt-12 flex justify-between gap-8 text-xs">
        <div className="w-60 border-t border-ink pt-1 text-center">Stavbyvedoucí / mistr</div>
        <div className="w-60 border-t border-ink pt-1 text-center">Technický dozor objednatele</div>
      </footer>
    </DocumentShell>
  );
}
