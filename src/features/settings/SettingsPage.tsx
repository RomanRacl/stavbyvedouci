'use client';

import { ImagePlus, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { btnPrimary, btnSecondary, inputCls, PageHeader } from '@/components/shell/PageHeader';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { saveSettings } from '@/lib/mock/localBackend';
import { resetStore } from '@/lib/mock/localStore';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { VAT_MODES } from '@/lib/money';
import type { CompanySettings, VatMode } from '@/types/firestore';

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

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line py-6 last:border-0 md:grid-cols-[260px_1fr]">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-2">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block text-sm font-medium text-ink ${wide ? 'sm:col-span-2' : ''}`}>
      {label}
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-xs font-normal text-ink-3">{hint}</span>}
    </label>
  );
}

/** Nastavení firmy: údaje na dokladech, logo, DPH, sazby a splatnosti. */
export default function SettingsPage() {
  const snap = useSnapshot();
  const [f, setF] = useState<CompanySettings | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const clearToast = useCallback(() => setToast(null), []);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (snap && !f) setF(snap.settings);
  }, [snap, f]);

  if (!snap || !f) return <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6" aria-busy="true" />;

  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setF({ ...f, [k]: v });
  const dirty = JSON.stringify(f) !== JSON.stringify(snap.settings);
  const icoValid = !f.ico || /^\d{8}$/.test(f.ico);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!icoValid) return setToast({ text: 'IČO má 8 číslic.', tone: 'error', id: Date.now() });
    saveSettings({ ...f, defaultVatMode: f.vatPayer ? (f.defaultVatMode === 'none' ? 'standard21' : f.defaultVatMode) : 'none' });
    setToast({ text: 'Nastavení uloženo.', tone: 'success', id: Date.now() });
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader title="Nastavení" description="Údaje firmy na nabídkách a dokladech, DPH a sazby pro výpočty." />
      <form onSubmit={save} className="rounded-xl border border-line bg-surface px-5">
        <Section title="Firma" description="Zobrazí se v hlavičce nabídek, objednávek a podkladů k fakturaci.">
          <Field label="Název firmy" wide>
            <input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
          </Field>
          <Field label="IČO" hint={icoValid ? undefined : 'IČO má 8 číslic.'}>
            <input inputMode="numeric" value={f.ico} onChange={(e) => set('ico', e.target.value.replace(/\D/g, '').slice(0, 8))} className={`${inputCls} tabular-nums ${icoValid ? '' : 'border-crit'}`} />
          </Field>
          <Field label="DIČ">
            <input value={f.dic} onChange={(e) => set('dic', e.target.value.toUpperCase())} placeholder="CZ12345678" className={inputCls} />
          </Field>
          <Field label="Adresa" wide>
            <input value={f.address} onChange={(e) => set('address', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Telefon">
            <input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
          </Field>
          <Field label="E-mail">
            <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Číslo účtu" wide hint="Zobrazí se na podkladu k fakturaci.">
            <input value={f.bankAccount} onChange={(e) => set('bankAccount', e.target.value)} placeholder="123456789/0100" className={inputCls} />
          </Field>
          <div className="sm:col-span-2">
            <span className="text-sm font-medium text-ink">Logo</span>
            <div className="mt-1 flex items-center gap-3">
              <div className="grid h-20 w-40 place-items-center rounded-lg border border-dashed border-line bg-concrete/40">
                {f.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- náhled data URL
                  <img src={f.logo} alt="Logo firmy" className="max-h-16 max-w-36 object-contain" />
                ) : (
                  <span className="text-xs text-ink-3">bez loga</span>
                )}
              </div>
              <button type="button" onClick={() => fileRef.current?.click()} className={btnSecondary}>
                <ImagePlus className="size-4" /> {f.logo ? 'Změnit' : 'Nahrát logo'}
              </button>
              {f.logo && (
                <button type="button" onClick={() => set('logo', null)} aria-label="Odebrat logo" className="grid size-10 place-items-center rounded-lg text-ink-3 hover:bg-crit/10 hover:text-crit-ink">
                  <Trash2 className="size-4" />
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    set('logo', await logoToDataUrl(file));
                  } catch {
                    setToast({ text: 'Obrázek se nepodařilo načíst. Zkuste PNG nebo JPG.', tone: 'error', id: Date.now() });
                  }
                }}
              />
            </div>
            <p className="mt-1 text-xs text-ink-3">Nejlépe PNG s průhledným pozadím. Zmenší se na 400 px.</p>
          </div>
        </Section>

        <Section title="DPH" description="Výchozí režim pro nové zakázky a nabídky. U každé zakázky ho můžete změnit.">
          <label className="flex items-center gap-2 text-sm font-medium text-ink sm:col-span-2">
            <input type="checkbox" checked={f.vatPayer} onChange={(e) => set('vatPayer', e.target.checked)} className="size-4 accent-ink" />
            Jsme plátci DPH
          </label>
          {f.vatPayer && (
            <Field label="Výchozí sazba" wide hint={VAT_MODES[f.defaultVatMode].hint}>
              <select value={f.defaultVatMode} onChange={(e) => set('defaultVatMode', e.target.value as VatMode)} className={inputCls}>
                {(['reduced12', 'standard21', 'reverse'] as VatMode[]).map((m) => (
                  <option key={m} value={m}>
                    {VAT_MODES[m].label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Section>

        <Section title="Ceny a lhůty" description="Používají se při sestavení nabídky a návrhu ceny víceprací.">
          <Field label="Fakturační sazba práce" hint="Kč za hodinu bez DPH">
            <input inputMode="numeric" value={f.billRate} onChange={(e) => set('billRate', Number(e.target.value.replace(/\D/g, '')) || 0)} className={`${inputCls} text-right tabular-nums`} />
          </Field>
          <Field label="Přirážka na materiál" hint="% k nákupní ceně">
            <input
              inputMode="numeric"
              value={Math.round((f.materialMarkup - 1) * 100)}
              onChange={(e) => set('materialMarkup', 1 + (Number(e.target.value.replace(/\D/g, '')) || 0) / 100)}
              className={`${inputCls} text-right tabular-nums`}
            />
          </Field>
          <Field label="Splatnost faktur" hint="dní">
            <input inputMode="numeric" value={f.paymentDueDays} onChange={(e) => set('paymentDueDays', Number(e.target.value.replace(/\D/g, '')) || 0)} className={`${inputCls} text-right tabular-nums`} />
          </Field>
          <Field label="Platnost nabídek" hint="dní">
            <input inputMode="numeric" value={f.quoteValidityDays} onChange={(e) => set('quoteValidityDays', Number(e.target.value.replace(/\D/g, '')) || 0)} className={`${inputCls} text-right tabular-nums`} />
          </Field>
        </Section>

        <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">
          <button type="button" disabled={!dirty} onClick={() => setF(snap.settings)} className={btnSecondary}>
            Zahodit změny
          </button>
          <button type="submit" disabled={!dirty} className={btnPrimary}>
            Uložit nastavení
          </button>
        </div>
      </form>

      <section className="mt-8 rounded-xl border border-crit/30 bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Ukázková data</h2>
        <p className="mt-1 text-sm text-ink-2">Smaže všechno, co jste v tomto prohlížeči vytvořili nebo změnili, a vrátí ukázkovou firmu do původního stavu. Fotky zůstanou uložené, ale nebudou u žádné zakázky.</p>
        {confirmReset ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                resetStore();
                setF(null);
                setConfirmReset(false);
                setToast({ text: 'Ukázková data obnovena.', tone: 'success', id: Date.now() });
              }}
              className="h-10 rounded-lg bg-crit px-4 text-sm font-semibold text-white"
            >
              Ano, smazat moje změny
            </button>
            <button type="button" onClick={() => setConfirmReset(false)} className={btnSecondary}>
              Ne
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmReset(true)} className={`${btnSecondary} mt-3`}>
            <RotateCcw className="size-4" /> Obnovit ukázková data
          </button>
        )}
      </section>
      <Toast message={toast} onDone={clearToast} />
    </main>
  );
}
