'use client';

import { LayoutGroup, motion } from 'framer-motion';
import { AlertTriangle, CalendarPlus, Mail, Pause, Pencil, Phone, Play, Plus, Repeat, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { btnPrimary, btnSecondary, inputCls, PageHeader } from '@/components/shell/PageHeader';
import { Drawer } from '@/components/ui/Drawer';
import { StatusPill } from '@/components/ui/StatusPill';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { fmt } from '@/features/analytics/lib/metrics';
import { createFromRecurring, deleteRecurring, saveClient, saveRecurring, type Snapshot } from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { clientsView, type ClientView } from '@/lib/operations';
import { TRADE_LABEL, TRADES } from '@/lib/trades';
import type { Job, RecurringPlan, RevisionReport } from '@/types/firestore';

const TABS = [
  { id: 'clients', label: 'Adresář' },
  { id: 'service', label: 'Pravidelný servis' },
  { id: 'revisions', label: 'Revize' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const DAY = 86_400_000;
const daysTo = (d: Date) => Math.ceil((d.getTime() - Date.now()) / DAY);
const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function DueBadge({ date }: { date: Date }) {
  const n = daysTo(date);
  if (n < 0) return <span className="rounded-full bg-crit/12 px-2 py-0.5 text-xs font-medium text-crit-ink">po termínu {-n} d</span>;
  if (n <= 14) return <span className="rounded-full bg-warn/12 px-2 py-0.5 text-xs font-medium text-warn-ink">za {n} d</span>;
  return <span className="text-xs text-ink-3">{date.toLocaleDateString('cs-CZ')}</span>;
}

/** Zákazníci: adresář s historií zakázek, pravidelný servis a hlídání revizí. */
export default function ClientsPage() {
  const snap = useSnapshot();
  const [tab, setTab] = useState<Tab>('clients');
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const say = (text: string) => setToast({ text, tone: 'success', id: Date.now() });

  if (!snap) return <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" />;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Zákazníci" description="Adresář se plní sám ze zakázek a nabídek. Pravidelný servis a revize vám připomenou, komu zavolat." />
      <LayoutGroup id="clients-tabs">
        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`relative shrink-0 px-3 pb-3 text-sm font-medium ${tab === t.id ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}>
              {t.label}
              {tab === t.id && <motion.span layoutId="clients-tab" className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-ink" />}
            </button>
          ))}
        </div>
      </LayoutGroup>
      {tab === 'clients' && <Directory snap={snap} say={say} />}
      {tab === 'service' && <Service snap={snap} say={say} />}
      {tab === 'revisions' && <Revisions snap={snap} say={say} onTab={setTab} />}
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}

/* ---------- Adresář ---------- */

function Directory({ snap, say }: { snap: Snapshot; say: (t: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<ClientView | null>(null);
  const all = useMemo(() => clientsView(snap), [snap]);
  const list = all.filter((c) => {
    const n = q.trim().toLocaleLowerCase('cs');
    return !n || [c.name, c.address, c.phone, c.email].some((v) => v.toLocaleLowerCase('cs').includes(n));
  });

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line p-4">
        <label className="relative block max-w-md">
          <span className="sr-only">Hledat zákazníka</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jméno, adresa, telefon nebo e-mail" className={`${inputCls} pl-9`} />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-medium">Zákazník</th>
              <th className="px-3 py-2.5 font-medium">Kontakt</th>
              <th className="px-3 py-2.5 text-right font-medium">Zakázek</th>
              <th className="px-3 py-2.5 text-right font-medium">Za celou dobu</th>
              <th className="px-4 py-2.5 text-right font-medium">Naposledy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((c) => (
              <tr key={c.id} tabIndex={0} onClick={() => setOpen(c)} onKeyDown={(e) => e.key === 'Enter' && setOpen(c)} className="cursor-pointer hover:bg-concrete/60 focus-visible:bg-concrete focus-visible:outline-none">
                <td className="px-4 py-2.5">
                  <span className="block font-medium text-ink">{c.name}</span>
                  <span className="block truncate text-xs text-ink-3">{c.address}</span>
                </td>
                <td className="px-3 py-2.5 text-ink-2">
                  {c.phone}
                  {c.email && <span className="block text-xs">{c.email}</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{c.jobIds.length}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt.czk(c.revenue)}</td>
                <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{c.lastActivity?.toLocaleDateString('cs-CZ') ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ClientDrawer client={open} snap={snap} onClose={() => setOpen(null)} onSaved={() => say('Údaje zákazníka uloženy.')} />
    </section>
  );
}

function ClientDrawer({ client, snap, onClose, onSaved }: { client: ClientView | null; snap: Snapshot; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ phone: '', email: '', address: '', ico: '', note: '' });
  useEffect(() => {
    if (client) setF({ phone: client.phone, email: client.email, address: client.address, ico: client.ico, note: client.note });
  }, [client]);
  if (!client) return null;
  const jobs = client.jobIds.map((id) => snap.jobs.find((j) => j.id === id)).filter(Boolean) as Job[];
  const quotes = client.quoteIds.map((id) => snap.quotes.find((q) => q.id === id)).filter((q): q is NonNullable<typeof q> => Boolean(q));
  const dirty = (Object.keys(f) as Array<keyof typeof f>).some((k) => f[k] !== client[k]);

  return (
    <Drawer
      open={Boolean(client)}
      onClose={onClose}
      title={client.name}
      subtitle={`${jobs.length} zakázek, ${fmt.czk(client.revenue)} za celou dobu`}
      width={560}
      footer={
        <div className="flex items-center gap-2">
          {client.phone && (
            <a href={`tel:${client.phone.replace(/\s/g, '')}`} className={btnSecondary}>
              <Phone className="size-4" /> Zavolat
            </a>
          )}
          {client.email && (
            <a href={`mailto:${client.email}`} className={btnSecondary}>
              <Mail className="size-4" /> E-mail
            </a>
          )}
          <span className="flex-1" />
          <button
            type="button"
            disabled={!dirty}
            onClick={() => {
              saveClient({ id: client.id, name: client.name, ...f });
              onSaved();
            }}
            className={btnPrimary}
          >
            Uložit
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <input aria-label="Telefon" placeholder="Telefon" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inputCls} />
        <input aria-label="E-mail" placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputCls} />
        <input aria-label="Adresa" placeholder="Adresa" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className={`${inputCls} col-span-2`} />
        <input aria-label="IČO" placeholder="IČO" value={f.ico} onChange={(e) => setF({ ...f, ico: e.target.value.replace(/\D/g, '') })} className={inputCls} />
        <textarea aria-label="Poznámka" placeholder="Poznámka, např. volat jen dopoledne, klíče u sousedky" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} className="col-span-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-series-1 focus:outline-none" />
      </div>
      <h3 className="mt-6 mb-2 text-sm font-semibold text-ink">Zakázky</h3>
      {jobs.length === 0 ? (
        <p className="text-sm text-ink-2">Zatím žádná zakázka.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {jobs
            .sort((a, b) => b.schedule.start.getTime() - a.schedule.start.getTime())
            .map((j) => (
              <li key={j.id}>
                <Link href={`/dashboard?job=${j.id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-concrete/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">
                      {j.code} {j.title}
                    </span>
                    <span className="block text-xs text-ink-3">{j.schedule.start.toLocaleDateString('cs-CZ')}</span>
                  </span>
                  <StatusPill status={j.status} />
                  <span className="w-24 text-right tabular-nums">{fmt.czk(j.budget.revenue)}</span>
                </Link>
              </li>
            ))}
        </ul>
      )}
      {quotes.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 text-sm font-semibold text-ink">Nabídky</h3>
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">
            {quotes.map((q) => (
              <li key={q.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-ink">
                  {q.number} {q.title}
                </span>
                <span className="text-xs text-ink-3">{q.status === 'accepted' ? 'přijato' : q.status === 'rejected' ? 'odmítnuto' : q.status === 'sent' ? 'odesláno' : 'koncept'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  );
}

/* ---------- Pravidelný servis ---------- */

const blankPlan = (): RecurringPlan => ({
  id: '',
  title: '',
  trade: 'hvac',
  clientName: '',
  clientPhone: '',
  address: '',
  intervalMonths: 12,
  nextDate: new Date(Date.now() + 30 * DAY),
  revenue: 0,
  laborHours: 2,
  assignedWorkerIds: [],
  templateId: null,
  active: true,
  lastJobId: null,
});

function Service({ snap, say }: { snap: Snapshot; say: (t: string) => void }) {
  const [edit, setEdit] = useState<RecurringPlan | null>(null);
  const plans = [...snap.recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.nextDate.getTime() - b.nextDate.getTime());
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2">Servisy kotlů, klimatizací a pravidelné revize. Dva týdny před termínem se zvýrazní; zakázku pak založíte jedním klikem.</p>
        <button type="button" onClick={() => setEdit(blankPlan())} className={btnPrimary}>
          <Plus className="size-4" /> Nový servis
        </button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => {
          const last = p.lastJobId ? snap.jobs.find((j) => j.id === p.lastJobId) : null;
          return (
            <li key={p.id} className={`flex flex-col rounded-xl border bg-surface p-4 ${p.active ? 'border-line' : 'border-dashed border-line opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-ink-3">
                    {TRADE_LABEL[p.trade]}, každých {p.intervalMonths} měs.
                  </p>
                  <h3 className="font-semibold text-ink">{p.title}</h3>
                  <p className="text-sm text-ink-2">{p.clientName}</p>
                </div>
                {p.active ? <DueBadge date={p.nextDate} /> : <span className="text-xs text-ink-3">pozastaveno</span>}
              </div>
              <p className="mt-2 flex-1 text-xs text-ink-3">
                {p.address}, {fmt.czk(p.revenue)} bez DPH, {fmt.num(p.laborHours)} h
                {last && <> · naposledy <Link href={`/dashboard?job=${last.id}`} className="underline">{last.code}</Link></>}
              </p>
              <div className="mt-3 flex items-center gap-1 border-t border-line pt-3">
                {p.active && (
                  <button
                    type="button"
                    onClick={() => {
                      const j = createFromRecurring(p.id);
                      if (j) say(`Zakázka ${j.code} založena na ${j.schedule.start.toLocaleDateString('cs-CZ')}, další servis ${p.intervalMonths} měs. poté.`);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3 text-sm font-semibold text-white"
                  >
                    <CalendarPlus className="size-4" /> Založit zakázku
                  </button>
                )}
                {p.clientPhone && (
                  <a href={`tel:${p.clientPhone.replace(/\s/g, '')}`} aria-label="Zavolat zákazníkovi" className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-concrete">
                    <Phone className="size-4" />
                  </a>
                )}
                <span className="flex-1" />
                <button type="button" aria-label={p.active ? 'Pozastavit' : 'Obnovit'} onClick={() => saveRecurring({ ...p, active: !p.active })} className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-concrete">
                  {p.active ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
                <button type="button" aria-label="Upravit" onClick={() => setEdit(p)} className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-concrete">
                  <Pencil className="size-4" />
                </button>
                <button type="button" aria-label="Smazat" onClick={() => deleteRecurring(p.id)} className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-crit/10 hover:text-crit-ink">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <PlanDrawer plan={edit} snap={snap} onClose={() => setEdit(null)} onSaved={(t) => { setEdit(null); say(t); }} />
    </section>
  );
}

function PlanDrawer({ plan, snap, onClose, onSaved }: { plan: RecurringPlan | null; snap: Snapshot; onClose: () => void; onSaved: (t: string) => void }) {
  const [p, setP] = useState<RecurringPlan>(blankPlan);
  useEffect(() => {
    if (plan) setP(plan);
  }, [plan]);
  if (!plan) return null;
  const valid = p.title.trim() && p.clientName.trim() && p.intervalMonths > 0;
  return (
    <Drawer
      open={Boolean(plan)}
      onClose={onClose}
      title={plan.id ? 'Upravit servis' : 'Nový pravidelný servis'}
      width={520}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Zrušit
          </button>
          <button type="button" disabled={!valid} onClick={() => { saveRecurring(p); onSaved(plan.id ? 'Servis uložen.' : 'Pravidelný servis vytvořen.'); }} className={btnPrimary}>
            Uložit
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="col-span-2 font-medium text-ink">
          Co se dělá
          <input value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} placeholder="např. Servis kotle" className={`${inputCls} mt-1`} />
        </label>
        <label className="font-medium text-ink">
          Obor
          <select value={p.trade} onChange={(e) => setP({ ...p, trade: e.target.value as RecurringPlan['trade'] })} className={`${inputCls} mt-1`}>
            {TRADES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="font-medium text-ink">
          Každých (měsíců)
          <input inputMode="numeric" value={p.intervalMonths} onChange={(e) => setP({ ...p, intervalMonths: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={`${inputCls} mt-1 text-right`} />
        </label>
        <label className="col-span-2 font-medium text-ink">
          Zákazník
          <input list="client-names" value={p.clientName} onChange={(e) => {
            const c = clientsView(snap).find((x) => x.name === e.target.value);
            setP({ ...p, clientName: e.target.value, ...(c && { clientPhone: c.phone, address: c.address }) });
          }} className={`${inputCls} mt-1`} />
          <datalist id="client-names">
            {clientsView(snap).map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </label>
        <input aria-label="Telefon" placeholder="Telefon" value={p.clientPhone} onChange={(e) => setP({ ...p, clientPhone: e.target.value })} className={inputCls} />
        <input aria-label="Adresa" placeholder="Adresa" value={p.address} onChange={(e) => setP({ ...p, address: e.target.value })} className={inputCls} />
        <label className="font-medium text-ink">
          Další termín
          <input type="date" value={toInputDate(p.nextDate)} onChange={(e) => e.target.value && setP({ ...p, nextDate: new Date(e.target.value) })} className={`${inputCls} mt-1`} />
        </label>
        <label className="font-medium text-ink">
          Cena bez DPH
          <input inputMode="numeric" value={p.revenue} onChange={(e) => setP({ ...p, revenue: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={`${inputCls} mt-1 text-right`} />
        </label>
        <label className="font-medium text-ink">
          Hodin práce
          <input inputMode="decimal" value={p.laborHours} onChange={(e) => setP({ ...p, laborHours: Number(e.target.value.replace(',', '.')) || 0 })} className={`${inputCls} mt-1 text-right`} />
        </label>
        <div className="col-span-2">
          <span className="font-medium text-ink">Kdo jezdí</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {snap.members.filter((m) => m.role !== 'owner').map((m) => {
              const on = p.assignedWorkerIds.includes(m.uid);
              return (
                <button key={m.uid} type="button" aria-pressed={on} onClick={() => setP({ ...p, assignedWorkerIds: on ? p.assignedWorkerIds.filter((x) => x !== m.uid) : [...p.assignedWorkerIds, m.uid] })} className={`h-8 rounded-lg border px-3 ${on ? 'border-ink bg-ink text-white' : 'border-line text-ink-2'}`}>
                  {m.displayName}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

/* ---------- Revize ---------- */

function Revisions({ snap, say, onTab }: { snap: Snapshot; say: (t: string) => void; onTab: (t: Tab) => void }) {
  const rows = snap.jobs
    .flatMap((j) => (j.revisions ?? []).map((r) => ({ job: j, r })))
    .sort((a, b) => (a.r.nextDue?.getTime() ?? Infinity) - (b.r.nextDue?.getTime() ?? Infinity));
  const toPlan = (job: Job, r: RevisionReport) => {
    const months = r.nextDue ? Math.max(1, Math.round((r.nextDue.getTime() - r.date.getTime()) / (30.4 * DAY))) : 12;
    saveRecurring({
      ...blankPlan(),
      title: r.kind.replace(/výchozí/i, 'Pravidelná').trim(),
      trade: job.trade,
      clientName: job.client.name,
      clientPhone: job.client.phone,
      address: job.client.address,
      intervalMonths: months,
      nextDate: r.nextDue ?? new Date(Date.now() + 365 * DAY),
      laborHours: 4,
      assignedWorkerIds: job.assignedWorkerIds,
    });
    say('Pravidelný servis vytvořen z revize.');
    onTab('service');
  };
  return (
    <section className="rounded-xl border border-line bg-surface">
      {rows.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-ink-2">
          Zatím žádné revizní zprávy. Zapisují se v detailu zakázky na záložce Průběh.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(({ job, r }) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">
                  {r.kind} {r.number && <span className="text-ink-3">č. {r.number}</span>}
                </span>
                <Link href={`/dashboard?job=${job.id}`} className="block truncate text-xs text-ink-3 hover:underline">
                  {job.client.name}, {job.code}, provedeno {r.date.toLocaleDateString('cs-CZ')}
                </Link>
              </span>
              {r.result === 'defects' && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-warn-ink">
                  <AlertTriangle className="size-3.5" /> se závadami
                </span>
              )}
              {r.nextDue ? <DueBadge date={r.nextDue} /> : <span className="text-xs text-ink-3">bez další revize</span>}
              <button type="button" onClick={() => toPlan(job, r)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-sm text-ink-2 hover:text-ink">
                <Repeat className="size-3.5" /> Hlídat opakovaně
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
