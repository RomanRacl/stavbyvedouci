'use client';

import { AlertTriangle, BadgeCheck, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { btnSecondary, inputCls, PageHeader } from '@/components/shell/PageHeader';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { fmt } from '@/features/analytics/lib/metrics';
import { deleteCertificate, saveCertificate, type Snapshot } from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { CERT_KINDS, certStatus, needsSafety, type CertStatus } from '@/lib/operations';
import type { CertKind, Certificate, Member } from '@/types/firestore';

const STATUS_CLS: Record<CertStatus, string> = {
  valid: 'bg-good/12 text-good-ink',
  expiring: 'bg-warn/12 text-warn-ink',
  expired: 'bg-crit/12 text-crit-ink',
  none: 'bg-concrete text-ink-3',
};
const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function statusText(c: Certificate) {
  const st = certStatus(c);
  if (!c.validUntil) return 'bez omezení';
  if (st === 'expired') return `prošlé ${c.validUntil.toLocaleDateString('cs-CZ')}`;
  return `do ${c.validUntil.toLocaleDateString('cs-CZ')}`;
}

/** Tým: lidé, jejich oprávnění a školení s hlídáním platnosti, a kdo nepotvrdil poučení BOZP. */
export default function TeamPage() {
  const snap = useSnapshot();
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  if (!snap) return <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" />;

  const people = snap.members.filter((m) => m.role !== 'owner');
  const problems = snap.certificates.filter((c) => ['expired', 'expiring'].includes(certStatus(c)) && people.some((p) => p.uid === c.uid));
  const pendingSafety = snap.jobs
    .filter((j) => j.status === 'scheduled' || j.status === 'in_progress')
    .flatMap((j) => j.assignedWorkerIds.filter((u) => needsSafety(j, u)).map((u) => ({ job: j, uid: u })));
  const name = (uid: string) => snap.members.find((m) => m.uid === uid)?.displayName ?? uid;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Tým" description="Oprávnění a školení lidí s hlídáním platnosti. Aplikace upozorní, když někoho přiřadíte na práci, na kterou nemá platné oprávnění." />

      {(problems.length > 0 || pendingSafety.length > 0) && (
        <div className="mb-5 grid gap-3 lg:grid-cols-2">
          {problems.length > 0 && (
            <section className="rounded-xl border border-warn/40 bg-warn/8 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <AlertTriangle className="size-4 text-warn-ink" /> Platnost oprávnění ({problems.length})
              </h2>
              <ul className="mt-2 space-y-1 text-sm text-ink-2">
                {problems.map((c) => (
                  <li key={c.id}>
                    <strong className="text-ink">{name(c.uid)}</strong>: {c.label} {statusText(c)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {pendingSafety.length > 0 && (
            <section className="rounded-xl border border-line bg-surface p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ShieldAlert className="size-4 text-ink-2" /> Nepotvrzené poučení BOZP ({pendingSafety.length})
              </h2>
              <ul className="mt-2 space-y-1 text-sm text-ink-2">
                {pendingSafety.map(({ job, uid }) => (
                  <li key={job.id + uid}>
                    <strong className="text-ink">{name(uid)}</strong> na{' '}
                    <Link href={`/dashboard?job=${job.id}`} className="underline underline-offset-2">
                      {job.code} {job.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-3">Mobil si poučení vyžádá automaticky před prvním začátkem práce na zakázce.</p>
            </section>
          )}
        </div>
      )}

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {people.map((m) => (
          <PersonCard key={m.uid} member={m} snap={snap} onSaved={(t) => setToast({ text: t, tone: 'success', id: Date.now() })} />
        ))}
      </ul>
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}

function PersonCard({ member: m, snap, onSaved }: { member: Member; snap: Snapshot; onSaved: (t: string) => void }) {
  const certs = snap.certificates.filter((c) => c.uid === m.uid).sort((a, b) => (a.validUntil?.getTime() ?? Infinity) - (b.validUntil?.getTime() ?? Infinity));
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ kind: 'bozp' as CertKind, label: '', number: '', validUntil: toInputDate(new Date(Date.now() + 365 * 86_400_000)) });
  const job = m.activeTimer ? snap.jobs.find((j) => j.id === m.activeTimer!.jobId) : null;

  return (
    <li className="flex flex-col rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-ink font-display font-semibold text-white">{m.initials}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink">{m.displayName}</h2>
          <p className="text-xs text-ink-3">
            {m.role === 'manager' ? 'Mistr' : 'Montér'}, {fmt.czk(m.hourlyCost)}/h, {m.phone}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-2">{job ? `Teď na místě: ${job.code} ${job.title}` : 'Teď neměří čas'}</p>

      <ul className="mt-4 flex-1 space-y-1.5">
        {certs.length === 0 && <li className="text-sm text-ink-3">Žádná evidovaná oprávnění.</li>}
        {certs.map((c) => {
          const st = certStatus(c);
          return (
            <li key={c.id} className="group flex items-center gap-2 text-sm">
              <BadgeCheck className={`size-4 shrink-0 ${st === 'valid' ? 'text-good-ink' : st === 'expiring' ? 'text-warn-ink' : 'text-crit-ink'}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{c.label}</span>
                {c.number && <span className="block text-xs text-ink-3">č. {c.number}</span>}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[st]}`}>{statusText(c)}</span>
              <button type="button" aria-label={`Odebrat ${c.label}`} onClick={() => deleteCertificate(c.id)} className="grid size-7 place-items-center rounded text-ink-3 opacity-0 group-hover:opacity-100 hover:text-crit-ink focus-visible:opacity-100">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-concrete/60 p-3 text-sm">
          <select aria-label="Druh" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CertKind, label: f.label || CERT_KINDS[e.target.value as CertKind].label })} className={`${inputCls} col-span-2`}>
            {(Object.keys(CERT_KINDS) as CertKind[]).map((k) => (
              <option key={k} value={k}>
                {CERT_KINDS[k].label}
              </option>
            ))}
          </select>
          <input aria-label="Název" placeholder="Název, např. § 6 vyhl. 50/1978" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} className={`${inputCls} col-span-2`} />
          <input aria-label="Číslo" placeholder="Číslo dokladu" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} className={inputCls} />
          <input aria-label="Platí do" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} className={inputCls} />
          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="h-9 rounded-md px-3 text-ink-2 hover:bg-surface">
              Zrušit
            </button>
            <button
              type="button"
              onClick={() => {
                saveCertificate({ id: '', uid: m.uid, kind: f.kind, label: f.label.trim() || CERT_KINDS[f.kind].label, number: f.number.trim(), validUntil: f.validUntil ? new Date(f.validUntil) : null });
                setAdding(false);
                onSaved(`Oprávnění přidáno: ${m.displayName}.`);
              }}
              className="h-9 rounded-md bg-ink px-3 font-semibold text-white"
            >
              Přidat
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${btnSecondary} mt-4 justify-center`}>
          <Plus className="size-4" /> Přidat oprávnění nebo školení
        </button>
      )}
    </li>
  );
}
