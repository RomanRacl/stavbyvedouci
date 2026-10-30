'use client';

import { LayoutGroup, motion } from 'framer-motion';
import { Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DictateButton } from '@/components/ui/DictateButton';
import { fmt } from '@/features/analytics/lib/metrics';
import { AUDIT_LABEL } from '@/lib/audit';
import { buildDiary } from '@/lib/diary';
import { addDiaryEntry } from '@/lib/mock/localBackend';
import type { AuditEntry, AuditKind, Job, JobNote, JobPhoto, MaterialItem, Member, MaterialUsage, TimeLog } from '@/types/firestore';

interface Props {
  job: Job;
  myUid: string;
  members: Member[];
  timeLogs: TimeLog[];
  usage: MaterialUsage[];
  photos: JobPhoto[];
  notes: JobNote[];
  audit: AuditEntry[];
  catalog: MaterialItem[];
}

const KIND_LABEL: Record<string, string> = { ...AUDIT_LABEL };
const dateLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const time = (d: Date) => d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

/** Stavební deník (po dnech) a úplná historie změn zakázky. */
export function DiaryTab(p: Props) {
  const [mode, setMode] = useState<'diary' | 'history'>('diary');
  const [text, setText] = useState('');
  const name = (uid: string) => p.members.find((m) => m.uid === uid)?.displayName ?? uid;
  const days = useMemo(() => buildDiary(p.job, p), [p]);
  const history = useMemo(() => p.audit.filter((a) => a.jobId === p.job.id).sort((a, b) => b.at.getTime() - a.at.getTime()), [p.audit, p.job.id]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LayoutGroup id={`diary-${p.job.id}`}>
          <div role="radiogroup" aria-label="Zobrazit" className="flex rounded-lg bg-concrete p-0.5">
            {(
              [
                ['diary', 'Stavební deník'],
                ['history', 'Historie změn'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={`relative rounded-md px-3 py-1 text-sm ${mode === id ? 'text-ink' : 'text-ink-2'}`}>
                {mode === id && <motion.span layoutId={`diary-pill-${p.job.id}`} className="absolute inset-0 rounded-md bg-surface shadow-sm" />}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>
        <span className="flex-1" />
        <button type="button" onClick={() => window.open(`/tisk/denik/${p.job.id}`, '_blank')} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-sm text-ink-2 hover:text-ink">
          <Printer className="size-4" /> Tisk / PDF
        </button>
      </div>

      {mode === 'diary' && (
        <>
          <div className="mb-5 flex items-end gap-2">
            <label className="min-w-0 flex-1 text-sm font-medium text-ink">
              Zápis do deníku
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                placeholder="např. Počasí: déšť, práce jen uvnitř. Předán klíč od sklepa."
                className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-normal text-ink focus:border-series-1 focus:outline-none"
              />
            </label>
            <DictateButton size="desktop" onText={(t) => setText((c) => (c ? `${c} ${t}` : t))} />
            <button
              type="button"
              disabled={!text.trim()}
              onClick={() => {
                addDiaryEntry(p.myUid, p.job.id, text);
                setText('');
              }}
              className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white disabled:bg-line disabled:text-ink-3"
            >
              Zapsat
            </button>
          </div>
          {days.length === 0 ? (
            <p className="text-sm text-ink-2">Deník se začne plnit, jakmile parta začne na zakázce pracovat.</p>
          ) : (
            <ol className="space-y-4">
              {days.map((d) => (
                <li key={d.date} className="rounded-lg border border-line">
                  <h4 className="flex flex-wrap items-baseline gap-x-3 border-b border-line bg-concrete/50 px-3 py-2 text-sm">
                    <span className="font-semibold capitalize text-ink">{dateLabel(d.date)}</span>
                    {d.people.length > 0 && (
                      <span className="text-ink-2">
                        {d.people.map((x) => `${x.name} ${fmt.num(Math.round(x.hours * 10) / 10)} h`).join(', ')}
                      </span>
                    )}
                    {d.photos > 0 && <span className="text-ink-3">{d.photos} fotek</span>}
                  </h4>
                  {d.entries.length > 0 ? (
                    <ul className="divide-y divide-line text-sm">
                      {d.entries.map((e, i) => (
                        <li key={i} className="flex gap-3 px-3 py-1.5">
                          <span className="w-12 shrink-0 text-ink-3 tabular-nums">{time(e.at)}</span>
                          <span className={`w-20 shrink-0 text-xs leading-5 ${e.kind === 'diary' ? 'font-semibold text-ink' : 'text-ink-3'}`}>{KIND_LABEL[e.kind] ?? e.kind}</span>
                          <span className="min-w-0 flex-1 text-ink">
                            {e.text} <span className="text-ink-3">({name(e.by)})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-1.5 text-sm text-ink-3">Bez dalších záznamů.</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {mode === 'history' &&
        (history.length === 0 ? (
          <p className="text-sm text-ink-2">Zatím žádné změny zaznamenané v aplikaci.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-line pl-5">
            {history.map((a) => (
              <li key={a.id} className="relative text-sm">
                <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-ink-3" aria-hidden />
                <p className="text-ink">{a.text}</p>
                <p className="text-xs text-ink-3">
                  {KIND_LABEL[a.kind as AuditKind]}, {name(a.by)}, {a.at.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </li>
            ))}
          </ol>
        ))}
    </div>
  );
}
