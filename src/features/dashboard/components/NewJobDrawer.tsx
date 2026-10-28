'use client';

import { Check } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { fmt } from '@/features/analytics/lib/metrics';
import type { Job, Member, Trade } from '@/types/firestore';

const TRADES: Array<{ id: Trade; label: string }> = [
  { id: 'electro', label: 'Elektro' },
  { id: 'plumbing', label: 'Voda a topení' },
  { id: 'windows', label: 'Okna a dveře' },
  { id: 'construction', label: 'Stavba' },
  { id: 'hvac', label: 'Vzduchotechnika a TČ' },
];

const DEFAULT_HOURLY_COST = 380;

const toInputDate = (d: Date) => d.toISOString().slice(0, 10);

function emptyForm() {
  const start = new Date();
  start.setDate(start.getDate() + 3);
  const due = new Date(start);
  due.setDate(due.getDate() + 10);
  return {
    title: '',
    trade: 'electro' as Trade,
    clientName: '',
    clientPhone: '',
    address: '',
    start: toInputDate(start),
    due: toInputDate(due),
    revenue: '',
    laborHours: '',
    materialCost: '',
    workerIds: [] as string[],
  };
}

type Form = ReturnType<typeof emptyForm>;
type Errors = Partial<Record<keyof Form, string>>;

function validate(f: Form): Errors {
  const e: Errors = {};
  if (!f.title.trim()) e.title = 'Napište, o jakou práci jde.';
  if (!f.clientName.trim()) e.clientName = 'Vyplňte jméno nebo firmu klienta.';
  if (!f.address.trim()) e.address = 'Vyplňte adresu, kam parta pojede.';
  if (!(Number(f.revenue) > 0)) e.revenue = 'Zadejte cenu zakázky v Kč.';
  if (f.laborHours && !(Number(f.laborHours) >= 0)) e.laborHours = 'Zadejte počet hodin číslem.';
  if (f.materialCost && !(Number(f.materialCost) >= 0)) e.materialCost = 'Zadejte částku číslem.';
  if (f.due < f.start) e.due = 'Termín dokončení musí být po zahájení.';
  return e;
}

/* ---------- pole formuláře ---------- */

const inputCls =
  'h-11 w-full rounded-lg border bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 transition focus:outline-none focus:ring-2 focus:ring-series-1/30';

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-sm text-crit-ink">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-sm text-ink-3">{hint}</span>
      )}
    </label>
  );
}

const border = (err?: string) => (err ? 'border-crit focus:border-crit' : 'border-line focus:border-series-1');

/* ---------- Drawer ---------- */

interface Props {
  open: boolean;
  onClose: () => void;
  members: Member[];
  existingJobs: Job[];
  onCreate: (job: Job) => void;
}

export function NewJobDrawer({ open, onClose, members, existingJobs, onCreate }: Props) {
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setErrors({});
      setSubmitted(false);
    }
  }, [open]);

  const workers = members.filter((m) => m.role !== 'owner');

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (submitted) setErrors(validate(next)); // po prvním odeslání validujeme živě
  };

  const toggleWorker = (uid: string) =>
    set('workerIds', form.workerIds.includes(uid) ? form.workerIds.filter((w) => w !== uid) : [...form.workerIds, uid]);

  /* Náklad práce = hodiny × průměrná sazba vybrané party. */
  const hourlyCost = useMemo(() => {
    const picked = workers.filter((w) => form.workerIds.includes(w.uid));
    if (!picked.length) return DEFAULT_HOURLY_COST;
    return Math.round(picked.reduce((a, w) => a + w.hourlyCost, 0) / picked.length);
  }, [workers, form.workerIds]);

  const revenue = Number(form.revenue) || 0;
  const laborCost = Math.round((Number(form.laborHours) || 0) * hourlyCost);
  const materialCost = Number(form.materialCost) || 0;
  const plannedMargin = revenue - laborCost - materialCost;

  const nextCode = useMemo(() => {
    const year = new Date().getFullYear();
    const max = existingJobs.reduce((m, j) => Math.max(m, Number(j.code.split('-')[2]) || 0), 0);
    return `Z-${year}-${String(max + 1).padStart(4, '0')}`;
  }, [existingJobs]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const now = new Date();
    onCreate({
      id: `job_${now.getTime().toString(36)}`,
      code: nextCode,
      title: form.title.trim(),
      trade: form.trade,
      status: 'scheduled',
      client: { name: form.clientName.trim(), phone: form.clientPhone.trim(), address: form.address.trim(), geo: null },
      assignedWorkerIds: form.workerIds,
      schedule: { start: new Date(form.start), due: new Date(form.due) },
      budget: { revenue, laborHours: Number(form.laborHours) || 0, laborCost, materialCost },
      actuals: { laborHours: 0, laborCost: 0, materialCost: 0, updatedAt: now },
      progressPct: 0,
      materialPlan: [],
      approval: null,
      createdAt: now,
      updatedAt: now,
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Nová zakázka"
      subtitle={`Dostane číslo ${nextCode}`}
      width={520}
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <span className="text-ink-2">Plánovaná marže </span>
            <span className={`font-semibold tabular-nums ${plannedMargin < 0 ? 'text-crit-ink' : 'text-ink'}`}>
              {revenue ? `${fmt.czk(plannedMargin)} (${fmt.pct(plannedMargin / revenue)})` : '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-lg px-4 text-sm font-medium text-ink-2 hover:bg-concrete hover:text-ink"
          >
            Zrušit
          </button>
          <button
            type="submit"
            form="new-job-form"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-white transition hover:bg-ink/90 focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]"
          >
            <Check className="size-4" /> Založit zakázku
          </button>
        </div>
      }
    >
      <form id="new-job-form" onSubmit={submit} noValidate className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="mb-3 text-base font-semibold text-ink">Práce</legend>
          <Field label="Název zakázky" error={errors.title}>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="např. Elektroinstalace RD, přízemí"
              className={`${inputCls} ${border(errors.title)}`}
            />
          </Field>
          <Field label="Obor">
            <div className="flex flex-wrap gap-2">
              {TRADES.map((t) => {
                const active = form.trade === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set('trade', t.id)}
                    className={`h-9 rounded-lg border px-3 text-sm transition ${
                      active ? 'border-ink bg-ink text-white' : 'border-line text-ink-2 hover:border-ink-3 hover:text-ink'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Zahájení">
              <input type="date" value={form.start} onChange={(e) => set('start', e.target.value)} className={`${inputCls} ${border()}`} />
            </Field>
            <Field label="Dokončení" error={errors.due}>
              <input type="date" value={form.due} onChange={(e) => set('due', e.target.value)} className={`${inputCls} ${border(errors.due)}`} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-base font-semibold text-ink">Klient</legend>
          <Field label="Jméno nebo firma" error={errors.clientName}>
            <input value={form.clientName} onChange={(e) => set('clientName', e.target.value)} className={`${inputCls} ${border(errors.clientName)}`} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <Field label="Adresa zakázky" error={errors.address}>
              <input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Ulice, obec" className={`${inputCls} ${border(errors.address)}`} />
            </Field>
            <Field label="Telefon">
              <input type="tel" value={form.clientPhone} onChange={(e) => set('clientPhone', e.target.value)} placeholder="+420" className={`${inputCls} ${border()}`} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-base font-semibold text-ink">Rozpočet</legend>
          <Field label="Cena pro zákazníka bez DPH (Kč)" error={errors.revenue}>
            <input inputMode="numeric" value={form.revenue} onChange={(e) => set('revenue', e.target.value.replace(/\s/g, ''))} className={`${inputCls} ${border(errors.revenue)} tabular-nums`} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hodiny práce" error={errors.laborHours} hint={`náklad ${fmt.czk(laborCost)} při ${fmt.czk(hourlyCost)}/h`}>
              <input inputMode="decimal" value={form.laborHours} onChange={(e) => set('laborHours', e.target.value.replace(',', '.'))} className={`${inputCls} ${border(errors.laborHours)} tabular-nums`} />
            </Field>
            <Field label="Materiál (Kč)" error={errors.materialCost}>
              <input inputMode="numeric" value={form.materialCost} onChange={(e) => set('materialCost', e.target.value.replace(/\s/g, ''))} className={`${inputCls} ${border(errors.materialCost)} tabular-nums`} />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-base font-semibold text-ink">Parta</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {workers.map((w) => {
              const picked = form.workerIds.includes(w.uid);
              return (
                <button
                  key={w.uid}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => toggleWorker(w.uid)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                    picked ? 'border-ink bg-concrete' : 'border-line hover:border-ink-3'
                  }`}
                >
                  <span className={`grid size-9 place-items-center rounded-full text-sm font-semibold ${picked ? 'bg-ink text-white' : 'bg-concrete text-ink-2'}`}>
                    {picked ? <Check className="size-4" /> : w.initials}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{w.displayName}</span>
                    <span className="block text-xs text-ink-3">{fmt.czk(w.hourlyCost)}/h</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </form>
    </Drawer>
  );
}
