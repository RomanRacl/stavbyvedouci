'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Building2, Check, Download, HardHat, ImagePlus, Plus, Rocket, Trash2, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { btnPrimary, btnSecondary, inputCls } from '@/components/shell/PageHeader';
import { downloadBackup } from '@/lib/backup';
import { defaultSettings, startFresh } from '@/lib/mock/localBackend';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import type { CompanySettings, Member, Role } from '@/types/firestore';

/** Zmenší logo na max. 400 px a uloží jako PNG data URL (průhlednost zůstane). */
async function logoToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/png');
}

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter((w) => !/^(ing|mgr|bc|ph\.?d|dis)\.?$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

const newUid = (name: string) =>
  `u_${name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '')
    .slice(0, 10) || 'clen'}_${Math.random().toString(36).slice(2, 6)}`;

interface PersonRow {
  uid: string;
  name: string;
  phone: string;
  role: Role;
  cost: string;
}

const STEPS = [
  { id: 'firma', label: 'Firma', Icon: Building2 },
  { id: 'ceny', label: 'Ceny', Icon: Wallet },
  { id: 'lide', label: 'Lidé', Icon: HardHat },
  { id: 'start', label: 'Start', Icon: Rocket },
] as const;

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block text-sm font-medium text-ink ${wide ? 'sm:col-span-2' : ''}`}>
      {label}
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-xs font-normal text-ink-3">{hint}</span>}
    </label>
  );
}

const num = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.')) || 0;

/**
 * Průvodce „Začít naostro“: smaže ukázkovou firmu a připraví aplikaci pro skutečnou firmu.
 * Čtyři kroky, každý jde přeskočit a doplnit později v Nastavení.
 */
export default function FreshStartWizard() {
  const snap = useSnapshot();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [s, setS] = useState<CompanySettings>(() => defaultSettings());
  const [markupPct, setMarkupPct] = useState('15');
  const [people, setPeople] = useState<PersonRow[]>([
    { uid: 'u_owner', name: '', phone: '', role: 'owner', cost: '0' },
    { uid: newUid('a'), name: '', phone: '', role: 'worker', cost: '350' },
  ]);
  const [keepCatalog, setKeepCatalog] = useState(true);
  const [confirm, setConfirm] = useState('');
  const [backedUp, setBackedUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Když firma už jede naostro, předvyplníme současné údaje (průvodce jde projít znovu).
  useEffect(() => {
    if (!snap?.fresh) return;
    setS({ ...snap.settings });
    setMarkupPct(String(Math.round((snap.settings.materialMarkup - 1) * 100)));
    if (snap.members.length) setPeople(snap.members.map((m) => ({ uid: m.uid, name: m.displayName, phone: m.phone, role: m.role, cost: String(m.hourlyCost) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jen při prvním načtení
  }, [snap?.fresh]);

  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const owner = people[0];
  const crew = people.slice(1).filter((p) => p.name.trim());
  const icoBad = !!s.ico && !/^\d{8}$/.test(s.ico);

  const problems = useMemo(() => {
    const out: string[] = [];
    if (!s.name.trim()) out.push('Chybí název firmy (krok Firma).');
    if (icoBad) out.push('IČO má 8 číslic (krok Firma).');
    if (!owner.name.trim()) out.push('Chybí vaše jméno (krok Lidé).');
    return out;
  }, [s.name, icoBad, owner.name]);

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setStep(to);
    setError(null);
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  const finish = () => {
    if (problems.length) return setError(problems[0]);
    const members: Member[] = [owner, ...crew].map((p) => ({
      uid: p.uid,
      displayName: p.name.trim(),
      initials: initialsOf(p.name),
      role: p.role,
      phone: p.phone.trim(),
      hourlyCost: p.role === 'owner' ? num(p.cost) : num(p.cost) || 350,
      active: true,
      activeTimer: null,
    }));
    startFresh({
      settings: { ...s, name: s.name.trim(), materialMarkup: 1 + num(markupPct) / 100, defaultVatMode: s.vatPayer ? 'standard21' : 'none' },
      members,
      keepCatalog,
    });
    router.push('/dashboard?vitejte=1');
  };

  if (!snap) return <main className="mx-auto max-w-3xl px-4 py-6" aria-busy="true" />;

  const panel = (
    <>
      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Název firmy *" wide>
            <input autoFocus value={s.name} onChange={(e) => set('name', e.target.value)} placeholder="např. Elektro Dvořák s.r.o." className={inputCls} />
          </Field>
          <Field label="IČO" hint={icoBad ? 'IČO má 8 číslic.' : undefined}>
            <input inputMode="numeric" value={s.ico} onChange={(e) => set('ico', e.target.value.replace(/\D/g, '').slice(0, 8))} aria-invalid={icoBad} className={inputCls} />
          </Field>
          <Field label="DIČ">
            <input value={s.dic} onChange={(e) => set('dic', e.target.value.toUpperCase())} placeholder="CZ12345678" className={inputCls} />
          </Field>
          <Field label="Adresa sídla" wide>
            <input value={s.address} onChange={(e) => set('address', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Telefon">
            <input type="tel" value={s.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
          </Field>
          <Field label="E-mail">
            <input type="email" value={s.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Číslo účtu" hint="Pro QR platby na zálohách a fakturách.">
            <input value={s.bankAccount} onChange={(e) => set('bankAccount', e.target.value)} placeholder="123456789/0800" className={inputCls} />
          </Field>
          <Field label="DPH">
            <span className="flex h-10 items-center gap-2 text-sm font-normal text-ink">
              <input type="checkbox" checked={s.vatPayer} onChange={(e) => set('vatPayer', e.target.checked)} className="size-4" /> Jsme plátci DPH
            </span>
          </Field>
          <div className="sm:col-span-2">
            <p className="text-sm font-medium text-ink">Logo</p>
            <div className="mt-1 flex items-center gap-3">
              <span className="grid size-16 place-items-center overflow-hidden rounded-lg border border-line bg-concrete">
                {/* eslint-disable-next-line @next/next/no-img-element -- náhled loga */}
                {s.logo ? <img src={s.logo} alt="Logo firmy" className="max-h-full max-w-full" /> : <ImagePlus className="size-5 text-ink-3" aria-hidden />}
              </span>
              <label className={`${btnSecondary} cursor-pointer`}>
                {s.logo ? 'Změnit logo' : 'Nahrát logo'}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) set('logo', await logoToDataUrl(f));
                  }}
                />
              </label>
              {s.logo && (
                <button type="button" onClick={() => set('logo', null)} className="text-sm text-ink-2 underline-offset-2 hover:underline">
                  Odebrat
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Hodinová sazba práce pro zákazníka" hint="Kč/h bez DPH, použije se v nabídkách a vícepracích.">
            <input inputMode="numeric" value={s.billRate} onChange={(e) => set('billRate', num(e.target.value))} className={`${inputCls} text-right tabular-nums`} />
          </Field>
          <Field label="Přirážka na materiál" hint="% nad nákupní cenu.">
            <input inputMode="numeric" value={markupPct} onChange={(e) => setMarkupPct(e.target.value.replace(/[^\d,]/g, ''))} className={`${inputCls} text-right tabular-nums`} />
          </Field>
          <Field label="Splatnost faktur" hint="dní">
            <input inputMode="numeric" value={s.paymentDueDays} onChange={(e) => set('paymentDueDays', num(e.target.value))} className={`${inputCls} text-right tabular-nums`} />
          </Field>
          <Field label="Záruka na dílo" hint="měsíců">
            <input inputMode="numeric" value={s.warrantyMonths ?? 24} onChange={(e) => set('warrantyMonths', num(e.target.value))} className={`${inputCls} text-right tabular-nums`} />
          </Field>
          <Field label="Právní forma" hint="Pro odhad daní v sekci Peníze.">
            <select value={s.legalForm ?? 'sro'} onChange={(e) => set('legalForm', e.target.value as 'sro' | 'osvc')} className={inputCls}>
              <option value="sro">s.r.o.</option>
              <option value="osvc">OSVČ (živnostník)</option>
            </select>
          </Field>
          <Field label="Kolik hodin parta měsíčně odpracuje na zakázkách" hint="Podle toho se rozpočítá režie. Stačí odhad.">
            <input inputMode="numeric" value={s.capacityHours} onChange={(e) => set('capacityHours', num(e.target.value))} className={`${inputCls} text-right tabular-nums`} />
          </Field>
          <p className="text-sm text-ink-2 sm:col-span-2">Režijní náklady (auta, sklad, účetní…) a roční cíle doplníte později v Nastavení a Analytice.</p>
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="text-sm text-ink-2">Lidé z party se pak v mobilu vyberou ze seznamu. Náklad na hodinu je mzda včetně odvodů, z něj se počítá zisk zakázek. Další lidi přidáte kdykoli v sekci Tým.</p>
          <ul className="mt-4 flex flex-col gap-3">
            {people.map((p, i) => (
              <li key={p.uid} className="grid gap-2 rounded-lg border border-line bg-surface p-3 sm:grid-cols-[1.4fr_1fr_0.9fr_0.8fr_auto] sm:items-end">
                <Field label={i === 0 ? 'Vaše jméno *' : 'Jméno'}>
                  <input value={p.name} onChange={(e) => setPeople((xs) => xs.map((x) => (x.uid === p.uid ? { ...x, name: e.target.value } : x)))} className={inputCls} />
                </Field>
                <Field label="Telefon">
                  <input type="tel" value={p.phone} onChange={(e) => setPeople((xs) => xs.map((x) => (x.uid === p.uid ? { ...x, phone: e.target.value } : x)))} className={inputCls} />
                </Field>
                <Field label="Role">
                  {i === 0 ? (
                    <input value="Majitel" readOnly className={`${inputCls} text-ink-2`} />
                  ) : (
                    <select value={p.role} onChange={(e) => setPeople((xs) => xs.map((x) => (x.uid === p.uid ? { ...x, role: e.target.value as Role } : x)))} className={inputCls}>
                      <option value="worker">Montér / dělník</option>
                      <option value="manager">Parťák / stavbyvedoucí</option>
                    </select>
                  )}
                </Field>
                <Field label="Náklad Kč/h">
                  <input inputMode="numeric" value={p.cost} onChange={(e) => setPeople((xs) => xs.map((x) => (x.uid === p.uid ? { ...x, cost: e.target.value.replace(/\D/g, '') } : x)))} className={`${inputCls} text-right tabular-nums`} />
                </Field>
                {i > 0 ? (
                  <button type="button" onClick={() => setPeople((xs) => xs.filter((x) => x.uid !== p.uid))} aria-label={`Odebrat ${p.name || 'řádek'}`} className="grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-concrete hover:text-crit">
                    <Trash2 className="size-4" />
                  </button>
                ) : (
                  <span className="hidden size-10 sm:block" />
                )}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setPeople((xs) => [...xs, { uid: newUid(String(xs.length)), name: '', phone: '', role: 'worker', cost: '350' }])} className={`${btnSecondary} mt-3`}>
            <Plus className="size-4" /> Přidat člověka
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-5">
          <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-line bg-surface p-4 text-sm sm:grid-cols-[180px_1fr]">
            <dt className="text-ink-2">Firma</dt>
            <dd className="font-medium text-ink">{s.name || '–'}{s.ico ? `, IČO ${s.ico}` : ''}</dd>
            <dt className="text-ink-2">Sazba a přirážka</dt>
            <dd className="text-ink">{s.billRate.toLocaleString('cs-CZ')} Kč/h, materiál +{markupPct} %</dd>
            <dt className="text-ink-2">Lidé</dt>
            <dd className="text-ink">{[owner, ...crew].map((p) => p.name.trim() || '?').join(', ')}</dd>
          </dl>
          <label className="flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" checked={keepCatalog} onChange={(e) => setKeepCatalog(e.target.checked)} className="mt-0.5 size-4" />
            <span>
              Ponechat ukázkový ceník materiálu, dodavatele a šablony zakázek
              <span className="block text-ink-2">Dobrý začátek – ceny a položky si pak upravíte ve Skladu a Šablonách.</span>
            </span>
          </label>
          <div className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm">
            <p className="font-semibold text-ink">Ukázková firma i všechno, co jste v ní zkoušeli, se smaže.</p>
            <p className="mt-1 text-ink-2">Chcete-li si současný stav nechat, stáhněte si nejdřív zálohu.</p>
            <button
              type="button"
              onClick={async () => {
                await downloadBackup(true);
                setBackedUp(true);
              }}
              className={`${btnSecondary} mt-3`}
            >
              {backedUp ? <Check className="size-4 text-good" /> : <Download className="size-4" />} {backedUp ? 'Záloha stažena' : 'Stáhnout zálohu'}
            </button>
            <label className="mt-4 block text-ink">
              Pro potvrzení napište <b>NAOSTRO</b>
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${inputCls} mt-1 max-w-48 uppercase`} aria-label="Potvrzení: napište NAOSTRO" />
            </label>
          </div>
          {problems.length > 0 && (
            <ul className="text-sm text-crit-ink">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <p className="text-sm text-ink-2">Průvodce</p>
      <h1 className="font-display text-3xl font-bold text-ink">Začít naostro</h1>

      <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="Kroky průvodce">
        {STEPS.map(({ id, label, Icon }, i) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => go(i)}
              aria-current={i === step ? 'step' : undefined}
              className={`flex w-full flex-col items-start gap-1 rounded-lg border-t-4 px-1 pt-2 text-left text-sm transition-colors ${i <= step ? 'border-ink text-ink' : 'border-line text-ink-3'}`}
            >
              <span className="flex items-center gap-1.5 font-semibold">
                <Icon className="size-4" aria-hidden /> <span className="max-sm:sr-only">{label}</span>
              </span>
              <span className="text-xs text-ink-3">krok {i + 1}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="mt-6 overflow-hidden rounded-xl border border-line bg-surface p-5 sm:p-6" aria-live="polite">
        <h2 className="mb-4 text-lg font-semibold text-ink">{['Údaje firmy', 'Ceny a lhůty', 'Lidé ve firmě', 'Kontrola a start'][step]}</h2>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 * dir }}
            transition={{ duration: 0.18 }}
          >
            {panel}
          </motion.div>
        </AnimatePresence>
      </section>

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-crit-ink">
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <button type="button" onClick={() => (step ? go(step - 1) : router.push('/nastaveni'))} className={btnSecondary}>
          <ArrowLeft className="size-4" /> {step ? 'Zpět' : 'Zrušit'}
        </button>
        {step < 3 ? (
          <button type="button" onClick={() => go(step + 1)} className={btnPrimary}>
            Pokračovat <ArrowRight className="size-4" />
          </button>
        ) : (
          <button type="button" disabled={confirm.trim().toUpperCase() !== 'NAOSTRO'} onClick={finish} className={btnPrimary}>
            <Rocket className="size-4" /> Začít naostro
          </button>
        )}
      </div>
    </main>
  );
}
