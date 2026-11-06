'use client';

import { useTabParam } from '@/lib/useTabParam';
import { LayoutGroup, motion } from 'framer-motion';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarRange, Car, Check, Plus, Printer, Star, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { btnPrimary, btnSecondary, inputCls, PageHeader } from '@/components/shell/PageHeader';
import { Drawer } from '@/components/ui/Drawer';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { fmt } from '@/features/analytics/lib/metrics';
import {
  addTrip,
  decideAbsence,
  deleteAbsence,
  deleteReservation,
  deleteTrip,
  rateSubcontractor,
  requestAbsence,
  saveReservation,
  saveSubcontractor,
  saveTool,
  toolIn,
  toolOut,
  type Snapshot,
} from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { downloadFile, monthKey, monthLabel, toCSV } from '@/lib/money';
import {
  ABSENCE_KINDS,
  absenceConflicts,
  absenceWorkdays,
  lastOdometer,
  nextFree,
  reservationConflict,
  subScore,
  toolStates,
  tripKm,
  tripSummary,
  vacationUsed,
} from '@/lib/people';
import { TRADE_LABEL, TRADES } from '@/lib/trades';
import type { AbsenceKind, Subcontractor, Tool, ToolKind, Trade } from '@/types/firestore';

const TABS = [
  { id: 'trips', label: 'Kniha jízd' },
  { id: 'tools', label: 'Nářadí a technika' },
  { id: 'absence', label: 'Dovolená a nemoc' },
  { id: 'subs', label: 'Subdodavatelé' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const DAY = 86_400_000;
const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const lastMonths = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return monthKey(d);
  });
type Say = (t: string, tone?: 'success' | 'error') => void;

/** Provoz: kniha jízd, nářadí a technika, absence lidí a subdodavatelé. */
export default function OperationsPage() {
  const snap = useSnapshot();
  const [tab, setTab] = useState<Tab>('trips');
  useTabParam(TABS.map((t) => t.id), setTab);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const say: Say = (text, tone = 'success') => setToast({ text, tone, id: Date.now() });

  if (!snap) return <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" />;
  const pendingAbs = snap.absences.filter((a) => a.status === 'pending').length;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Provoz" description="Auta a kilometry, kdo má jaké nářadí, rezervace techniky, dovolené party a ověření subdodavatelé." />
      <LayoutGroup id="ops-tabs">
        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Části">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`relative shrink-0 px-3 pb-3 text-sm font-medium ${tab === t.id ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}>
              {t.label}
              {t.id === 'absence' && pendingAbs > 0 && <span className="ml-1.5 rounded-full bg-warn px-1.5 text-xs font-semibold text-[#16202a] tabular-nums">{pendingAbs}</span>}
              {tab === t.id && <motion.span layoutId="ops-tab" className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-ink" />}
            </button>
          ))}
        </div>
      </LayoutGroup>
      {tab === 'trips' && <Trips snap={snap} say={say} />}
      {tab === 'tools' && <Tools snap={snap} say={say} />}
      {tab === 'absence' && <Absences snap={snap} say={say} />}
      {tab === 'subs' && <Subs snap={snap} say={say} />}
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}

/* ---------- kniha jízd ---------- */

function Trips({ snap, say }: { snap: Snapshot; say: Say }) {
  const months = lastMonths(6);
  // Na začátku měsíce ukaž raději minulý, ať je v přehledu co číst.
  const [month, setMonth] = useState(() => (snap.trips.filter((t) => monthKey(t.date) === months[0]).length >= 6 ? months[0] : months[1]));
  const [form, setForm] = useState<{ vanId: string; driverId: string; date: string; kmStart: string; kmEnd: string; purpose: string; jobId: string; fuel: string } | null>(null);
  const sum = tripSummary(snap.trips, month, snap.settings);
  const list = snap.trips.filter((t) => monthKey(t.date) === month).sort((a, b) => b.date.getTime() - a.date.getTime() || b.kmEnd - a.kmEnd);
  const van = (id: string) => snap.vans.find((v) => v.id === id);
  const who = (uid: string) => snap.members.find((m) => m.uid === uid)?.displayName ?? uid;
  const jobName = (id: string | null) => (id ? snap.jobs.find((j) => j.id === id)?.code ?? '?' : 'bez zakázky');
  const workers = snap.members.filter((m) => m.role !== 'owner');
  const active = snap.jobs.filter((j) => j.status === 'scheduled' || j.status === 'in_progress');

  const openForm = () => {
    const v = snap.vans[0];
    setForm({ vanId: v.id, driverId: v.driverIds[0] ?? workers[0].uid, date: toInputDate(new Date()), kmStart: String(lastOdometer(snap.trips, v.id)), kmEnd: '', purpose: 'Sklad – stavba – sklad', jobId: '', fuel: '' });
  };

  const csv = () =>
    toCSV([
      ['Datum', 'Auto', 'SPZ', 'Řidič', 'Stav tachometru od', 'do', 'Km', 'Účel cesty', 'Zakázka', 'Tankování Kč'],
      ...list
        .slice()
        .reverse()
        .map((t) => [t.date.toLocaleDateString('cs-CZ'), van(t.vanId)?.name ?? '', van(t.vanId)?.plate ?? '', who(t.driverId), t.kmStart, t.kmEnd, tripKm(t), t.purpose, jobName(t.jobId), t.fuelCost ?? '']),
    ]);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 divide-line rounded-xl border border-line bg-surface lg:grid-cols-4 lg:divide-x">
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Najeto</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{sum.km.toLocaleString('cs-CZ')} km</p>
          <p className="text-xs text-ink-3">{sum.trips} jízd</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Náklad dopravy</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{fmt.czk(sum.cost)}</p>
          <p className="text-xs text-ink-3">{String(snap.settings.kmRate ?? 5.8).replace('.', ',')} Kč/km (Nastavení)</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Tankování</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{fmt.czk(sum.fuelCost)}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-2">Tachometry</p>
          {sum.byVan.map((v) => (
            <p key={v.vanId} className="text-sm text-ink tabular-nums">
              {van(v.vanId)?.name}: {v.lastOdometer.toLocaleString('cs-CZ')} km
            </p>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Měsíc" className="mr-auto h-10 rounded-lg border border-line bg-surface px-3 text-sm capitalize">
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => downloadFile(`kniha-jizd-${month}.csv`, csv(), 'text/csv;charset=utf-8')} className={btnSecondary}>
              <ArrowDownToLine className="size-4" /> Excel (CSV)
            </button>
            <button type="button" onClick={openForm} className={btnPrimary}>
              <Plus className="size-4" /> Zapsat jízdu
            </button>
          </div>
          {form && (
            <div className="grid gap-2 border-b border-line bg-concrete/50 p-4 sm:grid-cols-4">
              <label className="text-xs text-ink-2">
                Auto
                <select
                  value={form.vanId}
                  onChange={(e) => setForm({ ...form, vanId: e.target.value, kmStart: String(lastOdometer(snap.trips, e.target.value)) })}
                  className={`${inputCls} mt-1`}
                >
                  {snap.vans.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} {v.plate}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-2">
                Řidič
                <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })} className={`${inputCls} mt-1`}>
                  {workers.map((w) => (
                    <option key={w.uid} value={w.uid}>
                      {w.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-2">
                Datum
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${inputCls} mt-1`} />
              </label>
              <label className="text-xs text-ink-2">
                Zakázka
                <select value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })} className={`${inputCls} mt-1`}>
                  <option value="">bez zakázky (sklad, nákup)</option>
                  {active.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.code} {j.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-2">
                Tachometr od
                <input inputMode="numeric" value={form.kmStart} onChange={(e) => setForm({ ...form, kmStart: e.target.value.replace(/\D/g, '') })} className={`${inputCls} mt-1 text-right tabular-nums`} />
              </label>
              <label className="text-xs text-ink-2">
                Tachometr do
                <input inputMode="numeric" autoFocus value={form.kmEnd} onChange={(e) => setForm({ ...form, kmEnd: e.target.value.replace(/\D/g, '') })} className={`${inputCls} mt-1 text-right tabular-nums`} />
              </label>
              <label className="text-xs text-ink-2">
                Účel
                <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className={`${inputCls} mt-1`} />
              </label>
              <label className="text-xs text-ink-2">
                Tankování Kč
                <input inputMode="numeric" value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value.replace(/\D/g, '') })} className={`${inputCls} mt-1 text-right tabular-nums`} />
              </label>
              <div className="flex items-center justify-end gap-2 sm:col-span-4">
                {Number(form.kmEnd) > 0 && Number(form.kmEnd) <= Number(form.kmStart) && <span className="mr-auto text-sm text-crit-ink">Konečný stav musí být vyšší než počáteční.</span>}
                <button type="button" onClick={() => setForm(null)} className={btnSecondary}>
                  Zrušit
                </button>
                <button
                  type="button"
                  disabled={!(Number(form.kmEnd) > Number(form.kmStart)) || !form.date}
                  onClick={() => {
                    addTrip({
                      vanId: form.vanId,
                      driverId: form.driverId,
                      date: new Date(form.date),
                      kmStart: Number(form.kmStart),
                      kmEnd: Number(form.kmEnd),
                      purpose: form.purpose.trim() || 'Pracovní cesta',
                      jobId: form.jobId || null,
                      ...(Number(form.fuel) ? { fuelCost: Number(form.fuel) } : {}),
                    });
                    say(`Jízda ${Number(form.kmEnd) - Number(form.kmStart)} km zapsána.`);
                    setForm(null);
                  }}
                  className={btnPrimary}
                >
                  Uložit jízdu
                </button>
              </div>
            </div>
          )}
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs text-ink-2">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium">Datum</th>
                  <th className="px-2 py-2 font-medium">Auto, řidič</th>
                  <th className="px-2 py-2 font-medium">Zakázka</th>
                  <th className="px-2 py-2 text-right font-medium">Tachometr</th>
                  <th className="px-2 py-2 text-right font-medium">Km</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2 tabular-nums">{t.date.toLocaleDateString('cs-CZ')}</td>
                    <td className="px-2 py-2">
                      {van(t.vanId)?.name} <span className="text-ink-3">{who(t.driverId)}</span>
                    </td>
                    <td className="px-2 py-2">
                      {t.jobId ? (
                        <Link href={`/dashboard?job=${t.jobId}`} className="text-series-1-ink hover:underline">
                          {jobName(t.jobId)}
                        </Link>
                      ) : (
                        <span className="text-ink-3">{t.purpose}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right text-ink-2 tabular-nums">
                      {t.kmStart.toLocaleString('cs-CZ')} → {t.kmEnd.toLocaleString('cs-CZ')}
                    </td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums">{tripKm(t)}</td>
                    <td className="pr-2">
                      {!t.id.startsWith('trip_a') && !t.id.startsWith('trip_b') && (
                        <button type="button" aria-label="Smazat jízdu" onClick={() => deleteTrip(t.id)} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-crit/10 hover:text-crit-ink">
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="h-fit rounded-xl border border-line bg-surface p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Car className="size-4" /> Doprava podle zakázek
          </h2>
          <p className="mt-1 text-xs text-ink-3">Náklad dopravy, který zákazník v ceně obvykle nevidí.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {sum.byJob.map((r) => (
              <li key={r.jobId ?? 'none'} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate">{r.jobId ? `${jobName(r.jobId)} ${snap.jobs.find((j) => j.id === r.jobId)?.title ?? ''}` : 'Bez zakázky'}</span>
                <span className="text-ink-2 tabular-nums">{r.km} km</span>
                <span className="w-20 text-right font-medium tabular-nums">{fmt.czk(r.cost)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ---------- nářadí a technika ---------- */

const REV_CLS = { ok: 'text-ink-3', soon: 'text-warn-ink font-medium', overdue: 'text-crit-ink font-medium', none: 'text-ink-3' } as const;

function Tools({ snap, say }: { snap: Snapshot; say: Say }) {
  const [kind, setKind] = useState<ToolKind>('tool');
  const [edit, setEdit] = useState<Tool | null>(null);
  const [issue, setIssue] = useState<{ toolId: string; holderId: string; jobId: string } | null>(null);
  const [res, setRes] = useState<{ toolId: string; jobId: string; from: string; to: string } | null>(null);
  const states = useMemo(() => toolStates(snap.tools, snap.toolEvents), [snap.tools, snap.toolEvents]);
  const workers = snap.members.filter((m) => m.role !== 'owner');
  const active = snap.jobs.filter((j) => j.status === 'scheduled' || j.status === 'in_progress');
  const who = (uid: string | null) => (uid ? snap.members.find((m) => m.uid === uid)?.displayName ?? uid : '');
  const job = (id: string | null) => (id ? snap.jobs.find((j) => j.id === id) : null);
  const list = states.filter((s) => s.tool.kind === kind);
  const problems = states.filter((s) => s.revision === 'overdue' || s.revision === 'soon');
  const resConflict = res ? reservationConflict(snap.reservations, res.toolId, new Date(res.from), new Date(res.to)) : null;
  const blank = (): Tool => ({ id: '', code: '', name: '', kind, category: kind === 'equipment' ? 'Technika' : 'Elektronářadí', serial: '', value: 0, revisionDue: null, note: '', active: true });

  return (
    <div className="space-y-5">
      {problems.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/40 bg-warn/8 px-4 py-3 text-sm text-ink">
          <AlertTriangle className="size-4 text-warn-ink" /> Revize nebo kalibrace:{' '}
          {problems.map((p) => `${p.tool.name} (${p.revision === 'overdue' ? 'prošlá' : `do ${p.tool.revisionDue!.toLocaleDateString('cs-CZ')}`})`).join(', ')}.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-surface p-0.5" role="radiogroup" aria-label="Druh">
          {(
            [
              ['tool', 'Nářadí'],
              ['equipment', 'Technika k rezervaci'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)} className={`h-9 rounded-md px-3 text-sm ${kind === id ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button type="button" onClick={() => window.open(`/tisk/stitky/${kind}`, '_blank')} className={btnSecondary}>
          <Printer className="size-4" /> QR štítky
        </button>
        <button type="button" onClick={() => setEdit(blank())} className={btnPrimary}>
          <Plus className="size-4" /> {kind === 'tool' ? 'Nové nářadí' : 'Nová technika'}
        </button>
      </div>

      <section className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-medium">Kód</th>
              <th className="px-2 py-2.5 font-medium">Název</th>
              <th className="px-2 py-2.5 font-medium">{kind === 'tool' ? 'Kde je' : 'Rezervace'}</th>
              <th className="px-2 py-2.5 font-medium">Revize</th>
              <th className="px-4 py-2.5 text-right font-medium">Akce</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((s) => {
              const rs = snap.reservations.filter((r) => r.toolId === s.tool.id && r.to.getTime() >= Date.now() - DAY).sort((a, b) => a.from.getTime() - b.from.getTime());
              return (
                <tr key={s.tool.id} className="align-top">
                  <td className="px-4 py-2.5 font-display font-semibold text-ink-2 tabular-nums">{s.tool.code}</td>
                  <td className="px-2 py-2.5">
                    <button type="button" onClick={() => setEdit(s.tool)} className="text-left font-medium text-ink hover:underline">
                      {s.tool.name}
                    </button>
                    <span className="block text-xs text-ink-3">
                      {s.tool.category}
                      {s.tool.value > 0 && `, ${fmt.czk(s.tool.value)}`}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    {kind === 'tool' ? (
                      s.holderId ? (
                        <>
                          <span className="font-medium text-ink">{who(s.holderId)}</span>
                          <span className="block text-xs text-ink-3">
                            od {s.since!.toLocaleDateString('cs-CZ')}
                            {job(s.jobId) && `, ${job(s.jobId)!.code}`}
                          </span>
                        </>
                      ) : (
                        <span className="text-good-ink">Ve skladu</span>
                      )
                    ) : rs.length ? (
                      <ul className="space-y-1">
                        {rs.map((r) => (
                          <li key={r.id} className="flex items-center gap-2">
                            <span className="tabular-nums">
                              {r.from.toLocaleDateString('cs-CZ')}–{r.to.toLocaleDateString('cs-CZ')}
                            </span>
                            <Link href={`/dashboard?job=${r.jobId}`} className="text-series-1-ink hover:underline">
                              {job(r.jobId)?.code}
                            </Link>
                            <button type="button" aria-label="Zrušit rezervaci" onClick={() => deleteReservation(r.id)} className="text-ink-3 hover:text-crit-ink">
                              <X className="size-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-good-ink">Volná</span>
                    )}
                  </td>
                  <td className={`px-2 py-2.5 ${REV_CLS[s.revision]}`}>{s.tool.revisionDue ? s.tool.revisionDue.toLocaleDateString('cs-CZ') : '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    {kind === 'tool' ? (
                      s.holderId ? (
                        <button
                          type="button"
                          onClick={() => {
                            toolIn('u_owner', s.tool.id);
                            say(`${s.tool.name} vráceno do skladu.`);
                          }}
                          className={btnSecondary}
                        >
                          <ArrowDownToLine className="size-4" /> Vrátit
                        </button>
                      ) : (
                        <button type="button" onClick={() => setIssue({ toolId: s.tool.id, holderId: workers[0].uid, jobId: '' })} className={btnSecondary}>
                          <ArrowUpFromLine className="size-4" /> Vydat
                        </button>
                      )
                    ) : (
                      <button type="button" onClick={() => setRes({ toolId: s.tool.id, jobId: active[0]?.id ?? '', from: toInputDate(new Date()), to: toInputDate(new Date(Date.now() + 2 * DAY)) })} className={btnSecondary}>
                        <CalendarRange className="size-4" /> Rezervovat
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <Drawer open={Boolean(issue)} onClose={() => setIssue(null)} title="Vydat nářadí" subtitle={snap.tools.find((t) => t.id === issue?.toolId)?.name} width={440}>
        {issue && (
          <div className="space-y-3">
            <label className="block text-sm text-ink-2">
              Komu
              <select value={issue.holderId} onChange={(e) => setIssue({ ...issue, holderId: e.target.value })} className={`${inputCls} mt-1`}>
                {workers.map((w) => (
                  <option key={w.uid} value={w.uid}>
                    {w.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-ink-2">
              Na zakázku
              <select value={issue.jobId} onChange={(e) => setIssue({ ...issue, jobId: e.target.value })} className={`${inputCls} mt-1`}>
                <option value="">bez zakázky</option>
                {active.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} {j.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                toolOut('u_owner', issue.toolId, issue.holderId, issue.jobId || null);
                say(`Vydáno: ${who(issue.holderId)}.`);
                setIssue(null);
              }}
              className={`${btnPrimary} w-full justify-center`}
            >
              Vydat
            </button>
            <p className="text-xs text-ink-3">Parta si nářadí může vzít i sama: v mobilu naskenuje QR štítek.</p>
          </div>
        )}
      </Drawer>

      <Drawer open={Boolean(res)} onClose={() => setRes(null)} title="Rezervovat techniku" subtitle={snap.tools.find((t) => t.id === res?.toolId)?.name} width={460}>
        {res && (
          <div className="space-y-3">
            <label className="block text-sm text-ink-2">
              Zakázka
              <select value={res.jobId} onChange={(e) => setRes({ ...res, jobId: e.target.value })} className={`${inputCls} mt-1`}>
                {active.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} {j.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-ink-2">
                Od
                <input type="date" value={res.from} onChange={(e) => setRes({ ...res, from: e.target.value })} className={`${inputCls} mt-1`} />
              </label>
              <label className="text-sm text-ink-2">
                Do
                <input type="date" value={res.to} onChange={(e) => setRes({ ...res, to: e.target.value })} className={`${inputCls} mt-1`} />
              </label>
            </div>
            {resConflict && (
              <div className="rounded-lg border border-crit/30 bg-crit/5 p-3 text-sm text-ink">
                V tomto termínu je technika na {job(resConflict.jobId)?.code} ({resConflict.from.toLocaleDateString('cs-CZ')}–{resConflict.to.toLocaleDateString('cs-CZ')}).
                <button
                  type="button"
                  onClick={() => {
                    const len = Math.max(1, Math.round((new Date(res.to).getTime() - new Date(res.from).getTime()) / DAY) + 1);
                    const f = nextFree(snap.reservations, res.toolId, new Date(res.from), len);
                    setRes({ ...res, from: toInputDate(f), to: toInputDate(new Date(f.getTime() + (len - 1) * DAY)) });
                  }}
                  className="ml-1 font-medium text-series-1-ink underline underline-offset-2"
                >
                  Najít nejbližší volný termín
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={Boolean(resConflict) || !res.jobId || res.to < res.from}
              onClick={() => {
                saveReservation({ id: '', toolId: res.toolId, jobId: res.jobId, from: new Date(res.from), to: new Date(res.to), note: '' });
                say('Technika zarezervována.');
                setRes(null);
              }}
              className={`${btnPrimary} w-full justify-center`}
            >
              Rezervovat
            </button>
          </div>
        )}
      </Drawer>

      <Drawer
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={edit?.id ? edit.name : kind === 'tool' ? 'Nové nářadí' : 'Nová technika'}
        subtitle={edit?.code}
        width={460}
        footer={
          <div className="flex justify-end gap-2">
            {edit?.id && (
              <button
                type="button"
                onClick={() => {
                  saveTool({ ...edit, active: false });
                  say(`${edit.name} vyřazeno z evidence.`);
                  setEdit(null);
                }}
                className="mr-auto inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-2 hover:bg-crit/10 hover:text-crit-ink"
              >
                <Trash2 className="size-4" /> Vyřadit
              </button>
            )}
            <button
              type="button"
              disabled={!edit?.name.trim()}
              onClick={() => {
                if (!edit) return;
                const t = saveTool(edit);
                say(`${t.name} uloženo, kód ${t.code}.`);
                setEdit(null);
              }}
              className={btnPrimary}
            >
              Uložit
            </button>
          </div>
        }
      >
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            <input aria-label="Název" placeholder="Název, např. Aku vrtačka Makita" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={`${inputCls} col-span-2`} />
            <input aria-label="Kategorie" placeholder="Kategorie" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} className={inputCls} />
            <input aria-label="Výrobní číslo" placeholder="Výrobní číslo" value={edit.serial} onChange={(e) => setEdit({ ...edit, serial: e.target.value })} className={inputCls} />
            <label className="text-xs text-ink-2">
              Pořizovací cena
              <input inputMode="numeric" value={edit.value || ''} onChange={(e) => setEdit({ ...edit, value: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={`${inputCls} mt-1 text-right tabular-nums`} />
            </label>
            <label className="text-xs text-ink-2">
              Revize / kalibrace do
              <input type="date" value={edit.revisionDue ? toInputDate(edit.revisionDue) : ''} onChange={(e) => setEdit({ ...edit, revisionDue: e.target.value ? new Date(e.target.value) : null })} className={`${inputCls} mt-1`} />
            </label>
            <textarea aria-label="Poznámka" placeholder="Poznámka" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} rows={2} className="col-span-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-series-1 focus:outline-none" />
          </div>
        )}
      </Drawer>
    </div>
  );
}

/* ---------- absence ---------- */

function Absences({ snap, say }: { snap: Snapshot; say: Say }) {
  const workers = snap.members.filter((m) => m.role !== 'owner');
  const [form, setForm] = useState<{ uid: string; kind: AbsenceKind; from: string; to: string; note: string } | null>(null);
  const conflicts = absenceConflicts(snap.absences, snap.jobs);
  const year = new Date().getFullYear();
  const list = snap.absences.filter((a) => a.to.getTime() >= Date.now() - 45 * DAY).sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || a.from.getTime() - b.from.getTime());
  const who = (uid: string) => snap.members.find((m) => m.uid === uid)?.displayName ?? uid;

  return (
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-5">
        {conflicts.length > 0 && (
          <section className="rounded-xl border border-crit/30 bg-crit/5 p-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-crit-ink">
              <AlertTriangle className="size-4" /> Kolize s naplánovanou prací
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {conflicts.map((c) => (
                <li key={c.absence.id + c.job.id}>
                  <strong>{who(c.absence.uid)}</strong> má {ABSENCE_KINDS[c.absence.kind].label.toLowerCase()} {c.absence.from.toLocaleDateString('cs-CZ')}–{c.absence.to.toLocaleDateString('cs-CZ')}, ale je na{' '}
                  <Link href={`/dashboard?job=${c.job.id}`} className="font-medium text-series-1-ink hover:underline">
                    {c.job.code} {c.job.title}
                  </Link>{' '}
                  (do {c.job.schedule.due.toLocaleDateString('cs-CZ')}). Přeplánujte v Kalendáři.
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="rounded-xl border border-line bg-surface">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <h2 className="mr-auto text-base font-semibold text-ink">Absence</h2>
            <button type="button" onClick={() => setForm({ uid: workers[0].uid, kind: 'vacation', from: toInputDate(new Date()), to: toInputDate(new Date()), note: '' })} className={btnPrimary}>
              <Plus className="size-4" /> Zapsat
            </button>
          </div>
          {form && (
            <div className="grid gap-2 border-b border-line bg-concrete/50 p-4 sm:grid-cols-4">
              <select aria-label="Kdo" value={form.uid} onChange={(e) => setForm({ ...form, uid: e.target.value })} className={inputCls}>
                {workers.map((w) => (
                  <option key={w.uid} value={w.uid}>
                    {w.displayName}
                  </option>
                ))}
              </select>
              <select aria-label="Druh" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AbsenceKind })} className={inputCls}>
                {(Object.keys(ABSENCE_KINDS) as AbsenceKind[]).map((k) => (
                  <option key={k} value={k}>
                    {ABSENCE_KINDS[k].label}
                  </option>
                ))}
              </select>
              <input aria-label="Od" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} className={inputCls} />
              <input aria-label="Do" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className={inputCls} />
              <div className="flex justify-end gap-2 sm:col-span-4">
                <button type="button" onClick={() => setForm(null)} className={btnSecondary}>
                  Zrušit
                </button>
                <button
                  type="button"
                  disabled={form.to < form.from}
                  onClick={() => {
                    requestAbsence(form.uid, { kind: form.kind, from: new Date(form.from), to: new Date(form.to), note: form.note }, true);
                    say('Absence zapsána a schválena.');
                    setForm(null);
                  }}
                  className={btnPrimary}
                >
                  Uložit
                </button>
              </div>
            </div>
          )}
          {list.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-2">Nikdo nemá volno.</p>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((a) => (
                <li key={a.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${a.status === 'rejected' ? 'opacity-50' : ''}`}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ABSENCE_KINDS[a.kind].cls}`}>{ABSENCE_KINDS[a.kind].label}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{who(a.uid)}</span>
                    <span className="block text-xs text-ink-3">
                      {a.from.toLocaleDateString('cs-CZ')}–{a.to.toLocaleDateString('cs-CZ')}, {absenceWorkdays(a)} prac. dní{a.note && `, ${a.note}`}
                    </span>
                  </span>
                  {a.status === 'pending' ? (
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          decideAbsence(a.id, false);
                          say('Žádost zamítnuta.');
                        }}
                        className={btnSecondary}
                      >
                        <X className="size-4" /> Zamítnout
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          decideAbsence(a.id, true);
                          say(`${who(a.uid)}: volno schváleno.`);
                        }}
                        className={btnPrimary}
                      >
                        <Check className="size-4" /> Schválit
                      </button>
                    </span>
                  ) : (
                    <>
                      <span className={`text-xs ${a.status === 'approved' ? 'text-good-ink' : 'text-ink-3'}`}>{a.status === 'approved' ? 'schváleno' : 'zamítnuto'}</span>
                      <button type="button" aria-label="Smazat" onClick={() => deleteAbsence(a.id)} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-crit/10 hover:text-crit-ink">
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="h-fit rounded-xl border border-line bg-surface p-4">
        <h2 className="text-base font-semibold text-ink">Dovolená {year}</h2>
        <p className="mt-1 text-xs text-ink-3">Vyčerpáno ze 20 dnů (zákonné minimum 4 týdny).</p>
        <ul className="mt-3 space-y-2.5">
          {workers.map((w) => {
            const used = vacationUsed(snap.absences, w.uid, year);
            return (
              <li key={w.uid} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-ink">{w.displayName}</span>
                <span className="text-ink-2 tabular-nums">{used} / 20 dní</span>
                <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <span className="block h-full rounded-full bg-series-1" style={{ width: `${Math.min(100, (used / 20) * 100)}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/* ---------- subdodavatelé ---------- */

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toLocaleString('cs-CZ')} z 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`size-3.5 ${i <= Math.round(value) ? 'fill-current text-warn' : 'text-line'}`} />
      ))}
    </span>
  );
}

function Subs({ snap, say }: { snap: Snapshot; say: Say }) {
  const [edit, setEdit] = useState<Subcontractor | null>(null);
  const [rate, setRate] = useState<{ subId: string; jobId: string; quality: number; onTime: number; note: string } | null>(null);
  const usedOn = (subId: string) => snap.jobs.filter((j) => (j.subcontracts ?? []).some((x) => x.subId === subId));
  const blank = (): Subcontractor => ({ id: '', name: '', ico: '', trade: 'construction', phone: '', email: '', note: '', ratings: [] });

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <p className="mr-auto text-sm text-ink-2">Práci jim zadáte v detailu zakázky na záložce Peníze. Cena se započte do nákladů zakázky.</p>
        <button type="button" onClick={() => setEdit(blank())} className={btnPrimary}>
          <Plus className="size-4" /> Nový subdodavatel
        </button>
      </div>
      <ul className="divide-y divide-line">
        {snap.subcontractors
          .map((s) => ({ s, score: subScore(s), jobs: usedOn(s.id) }))
          .sort((a, b) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0))
          .map(({ s, score, jobs }) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <button type="button" onClick={() => setEdit(s)} className="min-w-0 flex-1 text-left">
                <span className="block font-medium text-ink hover:underline">{s.name}</span>
                <span className="block text-xs text-ink-3">
                  {TRADE_LABEL[s.trade]}
                  {s.ico && `, IČO ${s.ico}`}
                  {s.phone && `, ${s.phone}`}
                  {s.note && `. ${s.note}`}
                </span>
              </button>
              {score ? (
                <span className="text-sm">
                  <span className="flex items-center gap-2">
                    Kvalita <Stars value={score.quality} />
                  </span>
                  <span className="flex items-center gap-2">
                    Termíny <Stars value={score.onTime} />
                  </span>
                </span>
              ) : (
                <span className="text-xs text-ink-3">zatím bez hodnocení</span>
              )}
              <span className="w-24 text-right text-xs text-ink-3">{jobs.length ? `${jobs.length} zakázek` : '—'}</span>
              <button type="button" onClick={() => setRate({ subId: s.id, jobId: jobs[0]?.id ?? snap.jobs[0].id, quality: 5, onTime: 5, note: '' })} className={btnSecondary}>
                <Star className="size-4" /> Ohodnotit
              </button>
            </li>
          ))}
      </ul>

      <Drawer
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={edit?.id ? edit.name : 'Nový subdodavatel'}
        width={480}
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!edit?.name.trim()}
              onClick={() => {
                if (!edit) return;
                saveSubcontractor(edit);
                say(`${edit.name} uložen.`);
                setEdit(null);
              }}
              className={btnPrimary}
            >
              Uložit
            </button>
          </div>
        }
      >
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            <input aria-label="Název" placeholder="Název firmy nebo jméno" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={`${inputCls} col-span-2`} />
            <input aria-label="IČO" placeholder="IČO" value={edit.ico} onChange={(e) => setEdit({ ...edit, ico: e.target.value.replace(/\D/g, '') })} className={inputCls} />
            <select aria-label="Obor" value={edit.trade} onChange={(e) => setEdit({ ...edit, trade: e.target.value as Trade })} className={inputCls}>
              {TRADES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <input aria-label="Telefon" placeholder="Telefon" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className={inputCls} />
            <input aria-label="E-mail" placeholder="E-mail" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} className={inputCls} />
            <textarea aria-label="Poznámka" placeholder="Poznámka: v čem je dobrý, ceny, dostupnost" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} rows={3} className="col-span-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-series-1 focus:outline-none" />
            {edit.ratings.length > 0 && (
              <ul className="col-span-2 mt-2 divide-y divide-line rounded-lg border border-line text-sm">
                {edit.ratings.map((r) => (
                  <li key={r.jobId} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate">{snap.jobs.find((j) => j.id === r.jobId)?.title ?? r.jobId}</span>
                    <Stars value={(r.quality + r.onTime) / 2} />
                    {r.note && <span className="text-xs text-ink-3">{r.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Drawer>

      <Drawer open={Boolean(rate)} onClose={() => setRate(null)} title="Hodnocení subdodavatele" subtitle={snap.subcontractors.find((s) => s.id === rate?.subId)?.name} width={440}>
        {rate && (
          <div className="space-y-4">
            <label className="block text-sm text-ink-2">
              Zakázka
              <select value={rate.jobId} onChange={(e) => setRate({ ...rate, jobId: e.target.value })} className={`${inputCls} mt-1`}>
                {snap.jobs.slice(0, 60).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} {j.title}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ['quality', 'Kvalita práce'],
                ['onTime', 'Dodržení termínu'],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <p className="text-sm text-ink-2">{label}</p>
                <div className="mt-1 flex gap-1" role="radiogroup" aria-label={label}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button key={i} type="button" role="radio" aria-checked={rate[k] === i} aria-label={`${i} z 5`} onClick={() => setRate({ ...rate, [k]: i })} className="grid size-10 place-items-center rounded-lg hover:bg-concrete">
                      <Star className={`size-6 ${i <= rate[k] ? 'fill-current text-warn' : 'text-line'}`} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <input aria-label="Poznámka" placeholder="Poznámka (volitelně)" value={rate.note} onChange={(e) => setRate({ ...rate, note: e.target.value })} className={inputCls} />
            <button
              type="button"
              onClick={() => {
                rateSubcontractor(rate.subId, { jobId: rate.jobId, quality: rate.quality, onTime: rate.onTime, note: rate.note });
                say('Hodnocení uloženo.');
                setRate(null);
              }}
              className={`${btnPrimary} w-full justify-center`}
            >
              Uložit hodnocení
            </button>
          </div>
        )}
      </Drawer>
    </section>
  );
}
