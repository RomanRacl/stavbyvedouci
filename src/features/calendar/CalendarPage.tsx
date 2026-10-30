'use client';

import { AlertTriangle, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, type DragEvent } from 'react';
import { btnSecondary, PageHeader } from '@/components/shell/PageHeader';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { rescheduleJob } from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { assignmentIssue } from '@/lib/operations';
import { TRADE_LABEL } from '@/lib/trades';
import type { Job } from '@/types/firestore';

const DAY = 86_400_000;
const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
const ACTIVE = new Set<Job['status']>(['scheduled', 'in_progress']);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mondayOf = (d: Date) => {
  const m = startOfDay(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};
const covers = (j: Job, day: Date) => startOfDay(j.schedule.start) <= day && day <= startOfDay(j.schedule.due);

interface DragData {
  jobId: string;
  fromWorker: string | null;
  fromDay: number; // ms začátku dne, odkud se táhlo
}

/** Týdenní plánovač party: kdo je kde, přesun zakázek přetažením a hlídání dvojího obsazení. */
export default function CalendarPage() {
  const snap = useSnapshot();
  const router = useRouter();
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [withSaturday, setWithSaturday] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const days = useMemo(() => Array.from({ length: withSaturday ? 6 : 5 }, (_, i) => new Date(week.getTime() + i * DAY)), [week, withSaturday]);
  const today = startOfDay(new Date()).getTime();

  if (!snap) return <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" />;

  const workers = snap.members.filter((m) => m.role !== 'owner');
  const jobs = snap.jobs.filter((j) => ACTIVE.has(j.status));
  const unassigned = jobs.filter((j) => j.assignedWorkerIds.length === 0);
  const cell = (uid: string, day: Date) => jobs.filter((j) => j.assignedWorkerIds.includes(uid) && covers(j, day));
  const conflicts = workers.reduce((a, w) => a + days.filter((d) => cell(w.uid, d).length > 1).length, 0);

  const onDragStart = (e: DragEvent, data: DragData) => {
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = (e: DragEvent, toWorker: string, day: Date) => {
    e.preventDefault();
    setOver(null);
    let data: DragData;
    try {
      data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData;
    } catch {
      return;
    }
    const job = snap.jobs.find((j) => j.id === data.jobId);
    if (!job) return;
    const shiftDays = Math.round((day.getTime() - data.fromDay) / DAY);
    if (!shiftDays && data.fromWorker === toWorker) return;
    rescheduleJob(job.id, { shiftDays, fromWorker: data.fromWorker ?? undefined, toWorker });
    const who = workers.find((w) => w.uid === toWorker)?.displayName ?? '';
    const issue = assignmentIssue(snap.certificates, toWorker, job.trade);
    setToast(
      issue
        ? { text: `${job.code} přesunuta na ${who}, ale pozor: ${issue}.`, tone: 'error', id: Date.now() }
        : { text: `${job.code} přesunuta${data.fromWorker !== toWorker ? ` na ${who}` : ''}${shiftDays ? ` o ${shiftDays > 0 ? '+' : ''}${shiftDays} ${Math.abs(shiftDays) === 1 ? 'den' : Math.abs(shiftDays) < 5 ? 'dny' : 'dní'}` : ''}.`, tone: 'success', id: Date.now() },
    );
  };

  const range = `${days[0].toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })} – ${days.at(-1)!.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })}`;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Kalendář"
        description="Kdo je kde tento týden. Zakázku přetáhněte na jiného člověka nebo jiný den; termín se posune celý."
        actions={
          <>
            <div className="flex items-center rounded-lg border border-line bg-surface">
              <button type="button" aria-label="Předchozí týden" onClick={() => setWeek(new Date(week.getTime() - 7 * DAY))} className="grid size-10 place-items-center text-ink-2 hover:text-ink">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" onClick={() => setWeek(mondayOf(new Date()))} className="h-10 px-3 text-sm font-medium text-ink">
                {range}
              </button>
              <button type="button" aria-label="Další týden" onClick={() => setWeek(new Date(week.getTime() + 7 * DAY))} className="grid size-10 place-items-center text-ink-2 hover:text-ink">
                <ChevronRight className="size-4" />
              </button>
            </div>
            <label className={`${btnSecondary} cursor-pointer`}>
              <input type="checkbox" checked={withSaturday} onChange={(e) => setWithSaturday(e.target.checked)} className="size-4 accent-ink" />
              Sobota
            </label>
          </>
        }
      />

      {conflicts > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/8 px-4 py-3 text-sm text-ink">
          <AlertTriangle className="size-4 text-warn-ink" /> Tento týden je {conflicts}× dvojí obsazení: jeden člověk má ve stejný den víc zakázek.
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_260px]">
        <section className="overflow-x-auto rounded-xl border border-line bg-surface" aria-label="Týdenní plán party">
          <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="w-44 px-3 py-2.5 text-left text-xs font-medium text-ink-2">Pracovník</th>
                {days.map((d, i) => {
                  const isToday = d.getTime() === today;
                  return (
                    <th key={d.getTime()} className={`px-2 py-2.5 text-left text-xs font-medium ${isToday ? 'text-ink' : 'text-ink-2'}`}>
                      <span className={isToday ? 'rounded-md bg-ink px-1.5 py-0.5 text-white' : ''}>
                        {DAYS[i]} {d.getDate()}. {d.getMonth() + 1}.
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.uid} className="border-b border-line last:border-0">
                  <th scope="row" className="px-3 py-2 text-left align-top font-normal">
                    <span className="flex items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-full bg-concrete text-xs font-semibold text-ink-2">{w.initials}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{w.displayName}</span>
                        {w.activeTimer && <span className="block text-xs text-good-ink">teď na místě</span>}
                      </span>
                    </span>
                  </th>
                  {days.map((d) => {
                    const list = cell(w.uid, d);
                    const key = `${w.uid}_${d.getTime()}`;
                    const clash = list.length > 1;
                    return (
                      <td
                        key={key}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setOver(key);
                        }}
                        onDragLeave={() => setOver((o) => (o === key ? null : o))}
                        onDrop={(e) => onDrop(e, w.uid, d)}
                        className={`h-20 border-l border-line px-1.5 py-1.5 align-top transition-colors ${over === key ? 'bg-series-1/10' : clash ? 'bg-warn/8' : d.getTime() === today ? 'bg-concrete/50' : ''}`}
                      >
                        <div className="space-y-1">
                          {list.map((j) => {
                            const issue = assignmentIssue(snap.certificates, w.uid, j.trade);
                            return (
                              // Obyčejný div: framer-motion by si onDragStart přivlastnil pro vlastní gesto.
                              <div
                                key={j.id}
                                draggable
                                onDragStart={(e) => onDragStart(e, { jobId: j.id, fromWorker: w.uid, fromDay: d.getTime() })}
                                onDoubleClick={() => router.push(`/dashboard?job=${j.id}`)}
                                title={`${j.code} ${j.title} (${TRADE_LABEL[j.trade]}), ${j.schedule.start.toLocaleDateString('cs-CZ')} – ${j.schedule.due.toLocaleDateString('cs-CZ')}. Dvojklik otevře detail.`}
                                className={`group flex cursor-grab items-start gap-1 rounded-md px-1.5 py-1 text-xs active:cursor-grabbing ${
                                  j.status === 'in_progress' ? 'bg-series-1/12 text-ink' : 'border border-dashed border-ink-3/50 text-ink-2'
                                } ${clash ? 'ring-1 ring-warn' : ''}`}
                              >
                                <GripVertical className="mt-0.5 size-3 shrink-0 text-ink-3 opacity-0 group-hover:opacity-100" aria-hidden />
                                <span className="min-w-0">
                                  <span className="block font-semibold tabular-nums">{j.code.slice(-4)}</span>
                                  <span className="block truncate">{j.title}</span>
                                  {issue && (
                                    <span className="mt-0.5 flex items-center gap-0.5 text-crit-ink">
                                      <AlertTriangle className="size-3" aria-hidden /> {issue}
                                    </span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold text-ink">Bez party ({unassigned.length})</h2>
            {unassigned.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">Všechny naplánované zakázky mají přiřazené lidi.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {unassigned.map((j) => (
                  <li
                    key={j.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, { jobId: j.id, fromWorker: null, fromDay: startOfDay(j.schedule.start).getTime() })}
                    className="cursor-grab rounded-md border border-dashed border-ink-3/50 px-2 py-1.5 text-sm text-ink active:cursor-grabbing"
                  >
                    <span className="font-semibold tabular-nums">{j.code}</span> {j.title}
                    <span className="block text-xs text-ink-3">od {j.schedule.start.toLocaleDateString('cs-CZ')}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-3">Přetáhněte zakázku na člověka a den, kdy má začít.</p>
          </section>
          <section className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">
            <h2 className="mb-2 text-sm font-semibold text-ink">Legenda</h2>
            <p className="flex items-center gap-2">
              <span className="h-4 w-6 rounded bg-series-1/12" /> probíhá
            </p>
            <p className="mt-1 flex items-center gap-2">
              <span className="h-4 w-6 rounded border border-dashed border-ink-3/50" /> naplánováno
            </p>
            <p className="mt-1 flex items-center gap-2">
              <span className="h-4 w-6 rounded bg-warn/8 ring-1 ring-warn" /> dvojí obsazení
            </p>
            <p className="mt-3">
              Dvojklik na zakázku otevře detail. Oprávnění lidí spravujete v{' '}
              <Link href="/tym" className="font-medium text-series-1-ink underline underline-offset-2">
                Týmu
              </Link>
              .
            </p>
          </section>
        </aside>
      </div>
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}
