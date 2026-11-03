'use client';

import { ArrowDownToLine, ArrowUpFromLine, Car, Minus, Sun, Plus, ScanLine, Wallet, Wrench } from 'lucide-react';
import { useState } from 'react';
import { BarcodeScanner } from '@/components/ui/BarcodeScanner';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { fmt } from '@/features/analytics/lib/metrics';
import { addTrip, requestAbsence, toolIn, toolOut, type Snapshot } from '@/lib/mock/localBackend';
import { monthKey, monthLabel } from '@/lib/money';
import { ABSENCE_KINDS, absenceWorkdays, bonusesForMonth, lastOdometer, payslip, toolStates } from '@/lib/people';
import type { AbsenceKind, Member } from '@/types/firestore';
import { buzz } from '../hooks/useWorkerData';

export type MoreKind = 'trip' | 'tools' | 'absence' | 'earnings';

const BIG = 'flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-ink text-base font-semibold text-white transition active:scale-[0.98] disabled:bg-line disabled:text-ink-3';
const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Dlaždice „Další“ na hlavní obrazovce dělníka. */
export function MoreTiles({ onOpen, badge }: { onOpen: (k: MoreKind) => void; badge: Partial<Record<MoreKind, number>> }) {
  const tiles: Array<{ k: MoreKind; label: string; Icon: typeof Car }> = [
    { k: 'trip', label: 'Kniha jízd', Icon: Car },
    { k: 'tools', label: 'Nářadí', Icon: Wrench },
    { k: 'absence', label: 'Volno a nemoc', Icon: Sun },
    { k: 'earnings', label: 'Můj výdělek', Icon: Wallet },
  ];
  return (
    <section className="mt-8" aria-labelledby="more-h">
      <h2 id="more-h" className="text-base font-semibold text-ink">
        Další
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-3">
        {tiles.map(({ k, label, Icon }) => (
          <li key={k}>
            <button type="button" onClick={() => onOpen(k)} className="relative flex h-20 w-full flex-col items-start justify-between rounded-2xl border border-line bg-surface p-3 text-left active:bg-concrete">
              <Icon className="size-5 text-ink-2" />
              <span className="text-base font-semibold text-ink">{label}</span>
              {badge[k] ? <span className="absolute top-2.5 right-2.5 rounded-full bg-warn px-1.5 text-xs font-semibold text-[#16202a] tabular-nums">{badge[k]}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface SheetProps {
  open: MoreKind | null;
  onClose: () => void;
  snap: Snapshot;
  me: Member;
  say: (t: string, tone?: 'success' | 'error') => void;
}

export function MoreSheets(p: SheetProps) {
  return (
    <>
      <TripSheet {...p} />
      <ToolsSheet {...p} />
      <AbsenceSheet {...p} />
      <EarningsSheet {...p} />
    </>
  );
}

/* ---------- kniha jízd ---------- */

function TripSheet({ open, onClose, snap, me, say }: SheetProps) {
  const myVan = snap.vans.find((v) => v.driverIds.includes(me.uid)) ?? snap.vans[0];
  const myJobs = snap.jobs.filter((j) => j.assignedWorkerIds.includes(me.uid) && (j.status === 'scheduled' || j.status === 'in_progress'));
  const start = lastOdometer(snap.trips, myVan.id);
  const [end, setEnd] = useState('');
  const [jobId, setJobId] = useState<string>('');
  const km = Number(end) - start;
  const job = jobId || myJobs[0]?.id || '';
  const mine = snap.trips.filter((t) => t.driverId === me.uid).sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 4);

  return (
    <BottomSheet
      open={open === 'trip'}
      onClose={onClose}
      title={`Kniha jízd: ${myVan.name} ${myVan.plate}`}
      footer={
        <button
          type="button"
          disabled={!(km > 0 && km < 2000)}
          onClick={() => {
            addTrip({ vanId: myVan.id, driverId: me.uid, date: new Date(), kmStart: start, kmEnd: Number(end), purpose: 'Sklad – stavba – sklad', jobId: job || null });
            buzz();
            say(`Zapsáno ${km} km.`);
            setEnd('');
            onClose();
          }}
          className={BIG}
        >
          Zapsat {km > 0 ? `${km} km` : 'jízdu'}
        </button>
      }
    >
      <div className="space-y-4 pb-4">
        <p className="text-base text-ink-2">
          Tachometr při odjezdu: <strong className="text-ink tabular-nums">{start.toLocaleString('cs-CZ')} km</strong>
        </p>
        <label className="block">
          <span className="mb-1.5 block text-base font-medium text-ink">Stav tachometru teď</span>
          <input
            inputMode="numeric"
            value={end}
            onChange={(e) => setEnd(e.target.value.replace(/\D/g, ''))}
            placeholder={String(start + 40)}
            className="block h-14 w-full rounded-xl border border-line bg-surface px-4 text-right font-display text-2xl font-semibold text-ink tabular-nums focus:border-series-1 focus:outline-none"
          />
        </label>
        {end && km <= 0 && <p className="text-sm text-crit-ink">Stav musí být vyšší než {start.toLocaleString('cs-CZ')}.</p>}
        {myJobs.length > 0 && (
          <div>
            <p className="mb-1.5 text-base font-medium text-ink">Kam</p>
            <div className="grid gap-2">
              {myJobs.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  aria-pressed={job === j.id}
                  onClick={() => setJobId(j.id)}
                  className={`rounded-xl border px-4 py-3 text-left text-base ${job === j.id ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink'}`}
                >
                  {j.title}
                  <span className={`block text-sm ${job === j.id ? 'text-[#c9d1d9]' : 'text-ink-3'}`}>{j.client.address}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {mine.length > 0 && (
          <ul className="text-sm text-ink-2">
            {mine.map((t) => (
              <li key={t.id} className="flex justify-between border-t border-line py-1.5">
                <span>{t.date.toLocaleDateString('cs-CZ')}</span>
                <span className="tabular-nums">{t.kmEnd - t.kmStart} km</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

/* ---------- nářadí ---------- */

function ToolsSheet({ open, onClose, snap, me, say }: SheetProps) {
  const [scan, setScan] = useState(false);
  const [showFree, setShowFree] = useState(false);
  const states = toolStates(snap.tools, snap.toolEvents).filter((s) => s.tool.kind === 'tool');
  const mine = states.filter((s) => s.holderId === me.uid);
  const free = states.filter((s) => !s.holderId);
  const job = snap.jobs.find((j) => j.id === me.activeTimer?.jobId) ?? snap.jobs.find((j) => j.assignedWorkerIds.includes(me.uid) && j.status === 'in_progress');

  const take = (toolId: string) => {
    toolOut(me.uid, toolId, me.uid, job?.id ?? null);
    buzz();
    say(`Máte u sebe: ${snap.tools.find((t) => t.id === toolId)?.name}.`);
  };
  const give = (toolId: string) => {
    toolIn(me.uid, toolId);
    buzz();
    say('Vráceno do skladu.');
  };

  return (
    <BottomSheet
      open={open === 'tools'}
      onClose={onClose}
      title="Nářadí"
      footer={
        <button type="button" onClick={() => setScan(true)} className={BIG}>
          <ScanLine className="size-5" /> Naskenovat QR štítek
        </button>
      }
    >
      <div className="space-y-4 pb-4">
        <p className="text-base font-medium text-ink">Mám u sebe ({mine.length})</p>
        {mine.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-4 text-center text-base text-ink-2">Nic. Nářadí si vezmete naskenováním štítku.</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((s) => (
              <li key={s.tool.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-base text-ink">{s.tool.name}</span>
                  <span className="block text-sm text-ink-3">
                    {s.tool.code}, od {s.since!.toLocaleDateString('cs-CZ')}
                    {s.revision === 'overdue' && ', prošlá revize!'}
                  </span>
                </span>
                <button type="button" onClick={() => give(s.tool.id)} className="flex h-12 items-center gap-1.5 rounded-xl border border-line px-3 text-base font-medium text-ink active:bg-concrete">
                  <ArrowDownToLine className="size-5" /> Vrátit
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setShowFree((v) => !v)} className="text-base font-medium text-series-1-ink underline underline-offset-4">
          {showFree ? 'Skrýt volné nářadí' : `Volné nářadí ve skladu (${free.length})`}
        </button>
        {showFree && (
          <ul className="space-y-2">
            {free.map((s) => (
              <li key={s.tool.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <span className="min-w-0 flex-1 text-base text-ink">{s.tool.name}</span>
                <button type="button" onClick={() => take(s.tool.id)} className="flex h-12 items-center gap-1.5 rounded-xl bg-ink px-3 text-base font-medium text-white">
                  <ArrowUpFromLine className="size-5" /> Vzít
                </button>
              </li>
            ))}
          </ul>
        )}
        {states.filter((s) => s.holderId && s.holderId !== me.uid).length > 0 && (
          <p className="text-sm text-ink-3">
            U ostatních:{' '}
            {states
              .filter((s) => s.holderId && s.holderId !== me.uid)
              .map((s) => `${s.tool.name} (${snap.members.find((m) => m.uid === s.holderId)?.displayName.split(' ')[0]})`)
              .join(', ')}
          </p>
        )}
      </div>
      <BarcodeScanner
        open={scan}
        onClose={() => setScan(false)}
        onCode={(code) => {
          const s = states.find((x) => x.tool.code.toLowerCase() === code.trim().toLowerCase());
          if (!s) return false;
          setScan(false);
          if (s.holderId === me.uid) give(s.tool.id);
          else take(s.tool.id);
          return true;
        }}
      />
    </BottomSheet>
  );
}

/* ---------- volno ---------- */

function AbsenceSheet({ open, onClose, snap, me, say }: SheetProps) {
  const [kind, setKind] = useState<AbsenceKind>('vacation');
  const [from, setFrom] = useState(toInputDate(new Date(Date.now() + 7 * 86_400_000)));
  const [to, setTo] = useState(from);
  const [note, setNote] = useState('');
  const mine = snap.absences.filter((a) => a.uid === me.uid && a.to.getTime() > Date.now() - 30 * 86_400_000).sort((a, b) => b.from.getTime() - a.from.getTime());
  const days = to >= from ? absenceWorkdays({ from: new Date(from), to: new Date(to) }) : 0;

  return (
    <BottomSheet
      open={open === 'absence'}
      onClose={onClose}
      title="Volno a nemoc"
      footer={
        <button
          type="button"
          disabled={!days}
          onClick={() => {
            requestAbsence(me.uid, { kind, from: new Date(from), to: new Date(to), note });
            buzz();
            say(kind === 'sick' ? 'Nemoc nahlášena kanceláři. Brzy se uzdravte.' : 'Žádost odeslána ke schválení.');
            setNote('');
            onClose();
          }}
          className={BIG}
        >
          {kind === 'sick' ? 'Nahlásit nemoc' : `Požádat o ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}`}
        </button>
      }
    >
      <div className="space-y-4 pb-4">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(ABSENCE_KINDS) as AbsenceKind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                if (k === 'sick') {
                  const t = toInputDate(new Date());
                  setFrom(t);
                  setTo(t);
                }
              }}
              className={`h-12 rounded-xl border text-base font-medium ${kind === k ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink'}`}
            >
              {ABSENCE_KINDS[k].label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-base text-ink">
            Od
            <input type="date" value={from} onChange={(e) => {
                setFrom(e.target.value);
                if (to < e.target.value) setTo(e.target.value);
              }} className="mt-1 block h-12 w-full rounded-xl border border-line bg-surface px-3 text-base" />
          </label>
          <label className="text-base text-ink">
            Do
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block h-12 w-full rounded-xl border border-line bg-surface px-3 text-base" />
          </label>
        </div>
        <input aria-label="Poznámka" placeholder="Poznámka pro kancelář (volitelně)" value={note} onChange={(e) => setNote(e.target.value)} className="block h-12 w-full rounded-xl border border-line bg-surface px-3 text-base" />
        {mine.length > 0 && (
          <ul className="space-y-2">
            {mine.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-base">
                <span className="min-w-0 flex-1">
                  {ABSENCE_KINDS[a.kind].label} {a.from.toLocaleDateString('cs-CZ')}–{a.to.toLocaleDateString('cs-CZ')}
                </span>
                <span className={`text-sm font-medium ${a.status === 'approved' ? 'text-good-ink' : a.status === 'rejected' ? 'text-crit-ink' : 'text-warn-ink'}`}>
                  {a.status === 'approved' ? 'schváleno' : a.status === 'rejected' ? 'zamítnuto' : 'čeká'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

/* ---------- výdělek ---------- */

function EarningsSheet({ open, onClose, snap, me }: SheetProps) {
  const [offset, setOffset] = useState(0);
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  const month = monthKey(d);
  const bonuses = bonusesForMonth(snap.jobs, snap.settings, snap.timeLogs, month).filter((b) => !b.blocked);
  const myBonus = bonuses.reduce((a, b) => a + (b.split.find((x) => x.uid === me.uid)?.amount ?? 0), 0);
  const ps = payslip(me, month, snap.timeLogs, snap.absences, myBonus);
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between py-2 ${strong ? 'border-t-2 border-ink font-semibold' : 'border-t border-line'}`}>
      <dt className={strong ? 'text-ink' : 'text-ink-2'}>{label}</dt>
      <dd className="text-ink tabular-nums">{value}</dd>
    </div>
  );

  return (
    <BottomSheet open={open === 'earnings'} onClose={onClose} title="Můj výdělek">
      <div className="pb-6">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" aria-label="Předchozí měsíc" onClick={() => setOffset((o) => Math.min(5, o + 1))} className="grid size-12 place-items-center rounded-xl border border-line bg-surface">
            <Minus className="size-5" />
          </button>
          <p className="text-lg font-semibold capitalize text-ink">{monthLabel(month)}</p>
          <button type="button" aria-label="Další měsíc" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 1))} className="grid size-12 place-items-center rounded-xl border border-line bg-surface disabled:opacity-40">
            <Plus className="size-5" />
          </button>
        </div>
        <div className="rounded-2xl bg-ink p-5 text-white">
          <p className="text-sm text-[#c9d1d9]">Odhad čisté mzdy</p>
          <p className="font-display text-4xl font-bold tabular-nums">{fmt.czk(ps.net)}</p>
          <p className="mt-1 text-sm text-[#c9d1d9]">
            {fmt.num(ps.hours)} h za {ps.days} dní
            {offset === 0 && ', zatím za tento měsíc'}
          </p>
        </div>
        <dl className="mt-4 text-base">
          {row(`Odpracováno ${fmt.num(ps.hours)} h × ${fmt.czk(ps.hourlyWage)}`, fmt.czk(ps.base))}
          {ps.vacationDays + ps.sickDays > 0 && row(`Dovolená ${ps.vacationDays} dní, nemoc ${ps.sickDays} dní`, fmt.czk(ps.vacationPay))}
          {row('Odměny za zakázky pod rozpočtem', fmt.czk(ps.bonus))}
          {row('Hrubá mzda', fmt.czk(ps.gross), true)}
          {row('Sociální a zdravotní pojištění', ps.social + ps.health ? `−${fmt.czk(ps.social + ps.health)}` : fmt.czk(0))}
          {row('Záloha na daň (po slevě)', ps.tax ? `−${fmt.czk(ps.tax)}` : fmt.czk(0))}
          {row('Čistá mzda (odhad)', fmt.czk(ps.net), true)}
        </dl>
        {bonuses.some((b) => b.split.some((x) => x.uid === me.uid)) && (
          <ul className="mt-4 space-y-1 text-sm text-ink-2">
            {bonuses
              .filter((b) => b.split.some((x) => x.uid === me.uid))
              .map((b) => (
                <li key={b.job.id}>
                  {b.job.title}: ušetřeno {fmt.num(b.savedHours)} h, vaše odměna {fmt.czk(b.split.find((x) => x.uid === me.uid)!.amount)}
                </li>
              ))}
          </ul>
        )}
        <p className="mt-4 text-sm text-ink-3">Orientační přehled z docházky v aplikaci. Skutečnou výplatu spočítá mzdová účetní, může se lišit například o slevy na děti.</p>
      </div>
    </BottomSheet>
  );
}
