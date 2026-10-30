'use client';

import { Check, LayoutTemplate } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { fmt } from '@/features/analytics/lib/metrics';
import { DEFAULT_HOURLY_COST, defaultChecklist } from '@/lib/jobDefaults';
import { TRADES } from '@/lib/trades';
import { VAT_MODES } from '@/lib/money';
import { estimateHours } from '@/lib/analytics';
import { TRADE_LABEL } from '@/lib/trades';
import { assignmentIssue } from '@/lib/operations';
import type { Certificate, ChecklistItem, CompanySettings, Job, JobTemplate, MaterialItem, MaterialPlanLine, Member, Trade, VatMode } from '@/types/firestore';


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

function formFromJob(j: Job): Form {
  return {
    title: j.title,
    trade: j.trade,
    clientName: j.client.name,
    clientPhone: j.client.phone,
    address: j.client.address,
    start: toInputDate(j.schedule.start),
    due: toInputDate(j.schedule.due),
    revenue: String(j.budget.revenue),
    laborHours: String(j.budget.laborHours),
    materialCost: String(j.budget.materialCost),
    workerIds: [...j.assignedWorkerIds],
  };
}
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
  /** Vyplněno = režim úprav existující zakázky. */
  editing?: Job | null;
  onUpdate?: (jobId: string, patch: Partial<Job>) => void;
  templates?: JobTemplate[];
  catalog?: MaterialItem[];
  settings?: CompanySettings;
  certificates?: Certificate[];
}

/** Formulář zakázky – založení nové i úprava existující. */
export function NewJobDrawer({ open, onClose, members, existingJobs, onCreate, editing, onUpdate, templates = [], catalog = [], settings, certificates = [] }: Props) {
  const vatPayer = settings?.vatPayer ?? true;
  const [vatMode, setVatMode] = useState<VatMode>('standard21');
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const template = templates.find((t) => t.id === templateId) ?? null;

  /** Plán materiálu ze šablony s aktuálními cenami z katalogu. */
  const templatePlan = (t: JobTemplate): MaterialPlanLine[] =>
    t.materialLines.flatMap((l) => {
      const c = catalog.find((x) => x.id === l.materialId);
      return c ? [{ materialId: c.id, name: c.name, unit: c.unit, unitCost: c.unitCost, plannedQty: l.qty, usedQty: 0 }] : [];
    });

  const applyTemplate = (t: JobTemplate | null) => {
    setTemplateId(t?.id ?? null);
    if (!t) return;
    const material = templatePlan(t).reduce((a, l) => a + l.plannedQty * l.unitCost, 0);
    setForm((f) => ({ ...f, title: t.title, trade: t.trade, revenue: String(t.revenue), laborHours: String(t.laborHours), materialCost: String(material) }));
  };

  useEffect(() => {
    if (open) {
      setForm(editing ? formFromJob(editing) : emptyForm());
      setErrors({});
      setSubmitted(false);
      setTemplateId(null);
      setVatMode(editing?.vatMode ?? (vatPayer ? settings?.defaultVatMode ?? 'standard21' : 'none'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- formulář se plní jen při otevření, ne při každé živé změně
  }, [open, editing?.id]);

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

  /** Odhad hodin z historie dokončených zakázek stejného oboru. */
  const estimate = useMemo(() => estimateHours(form.trade, Number(form.laborHours) || 0, existingJobs), [form.trade, form.laborHours, existingJobs]);

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
    if (editing) {
      const addressChanged = form.address.trim() !== editing.client.address;
      onUpdate?.(editing.id, {
        title: form.title.trim(),
        trade: form.trade,
        client: {
          name: form.clientName.trim(),
          phone: form.clientPhone.trim(),
          address: form.address.trim(),
          geo: addressChanged ? null : editing.client.geo,
        },
        assignedWorkerIds: form.workerIds,
        schedule: { start: new Date(form.start), due: new Date(form.due) },
        budget: { revenue, laborHours: Number(form.laborHours) || 0, laborCost, materialCost },
        vatMode,
      });
      return;
    }
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
      materialPlan: template ? templatePlan(template) : [],
      checklist: template
        ? template.checklist.map((c, i): ChecklistItem => ({ id: `ck_${now.getTime().toString(36)}_${i}`, text: c.text, required: c.required, doneBy: null, doneAt: null }))
        : defaultChecklist(form.trade),
      extraWork: [],
      handover: null,
      vatMode,
      payments: [],
      invoice: null,
      approval: null,
      createdAt: now,
      updatedAt: now,
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? 'Upravit zakázku' : 'Nová zakázka'}
      subtitle={editing ? editing.code : `Dostane číslo ${nextCode}`}
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
            <Check className="size-4" /> {editing ? 'Uložit změny' : 'Založit zakázku'}
          </button>
        </div>
      }
    >
      <form id="new-job-form" onSubmit={submit} noValidate className="space-y-6">
        {!editing && templates.length > 0 && (
          <fieldset>
            <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <LayoutTemplate className="size-4" /> Začít ze šablony
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => {
                const active = t.id === templateId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => applyTemplate(active ? null : t)}
                    className={`h-9 rounded-lg border px-3 text-sm transition ${active ? 'border-ink bg-ink text-white' : 'border-line text-ink-2 hover:border-ink-3 hover:text-ink'}`}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
            {template && (
              <p className="mt-2 text-sm text-ink-2">
                Předvyplněno: {template.materialLines.length} položek materiálu a {template.checklist.length} bodů kontrolního seznamu. Údaje níže můžete upravit.
              </p>
            )}
          </fieldset>
        )}
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
          {vatPayer && (
            <Field label="DPH" hint={VAT_MODES[vatMode].hint}>
              <select value={vatMode} onChange={(e) => setVatMode(e.target.value as VatMode)} className={`${inputCls} ${border()}`}>
                {(['reduced12', 'standard21', 'reverse'] as VatMode[]).map((m) => (
                  <option key={m} value={m}>
                    {VAT_MODES[m].label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hodiny práce" error={errors.laborHours} hint={`náklad ${fmt.czk(laborCost)} při ${fmt.czk(hourlyCost)}/h`}>
              <input inputMode="decimal" value={form.laborHours} onChange={(e) => set('laborHours', e.target.value.replace(',', '.'))} className={`${inputCls} ${border(errors.laborHours)} tabular-nums`} />
            </Field>
            {estimate && Math.abs(estimate.ratio - 1) >= 0.08 && Number(form.laborHours) !== estimate.suggested && (
              <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-lg bg-series-1/8 px-3 py-2 text-sm text-ink">
                <span className="min-w-0 flex-1">
                  Zakázky oboru {TRADE_LABEL[form.trade]} trvaly v průměru o {Math.round(Math.abs(estimate.ratio - 1) * 100)} % {estimate.ratio > 1 ? 'déle' : 'kratší dobu'} než plán ({estimate.basedOn} zakázek). Realisticky <strong className="tabular-nums">{estimate.suggested} h</strong>.
                </span>
                <button type="button" onClick={() => set('laborHours', String(estimate.suggested))} className="h-8 rounded-md bg-ink px-3 text-sm font-semibold text-white">
                  Použít
                </button>
              </div>
            )}
            <Field label="Materiál (Kč)" error={errors.materialCost} hint="odhad, rozepíšete po založení">
              <input inputMode="numeric" value={form.materialCost} onChange={(e) => set('materialCost', e.target.value.replace(/\s/g, ''))} className={`${inputCls} ${border(errors.materialCost)} tabular-nums`} />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-base font-semibold text-ink">Parta</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {workers.map((w) => {
              const picked = form.workerIds.includes(w.uid);
              const issue = assignmentIssue(certificates, w.uid, form.trade);
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
                    <span className={`block text-xs ${issue ? 'font-medium text-crit-ink' : 'text-ink-3'}`}>{issue ? `Pozor: ${issue}` : `${fmt.czk(w.hourlyCost)}/h`}</span>
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
