'use client';

import { FileSpreadsheet, ImagePlus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ImportDataDrawer } from './ImportDataDrawer';
import { BackdropSection, BackupSection, FreshStartCard } from './DataSections';
import type { ImportKind } from '@/lib/import/dataImport';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { btnPrimary, btnSecondary, inputCls, PageHeader } from '@/components/shell/PageHeader';
import { Toast, type ToastMsg } from '@/components/ui/Toast';
import { saveSettings, setLoadTest } from '@/lib/mock/localBackend';
import { readStore } from '@/lib/mock/localStore';
import { resetStore } from '@/lib/mock/localStore';
import { useSnapshot } from '@/lib/mock/useSnapshot';
import { VAT_MODES } from '@/lib/money';
import { DEFAULT_REMINDER_DAYS, ibanFromAccount, priceLevelsOf } from '@/lib/finance';
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
  const [importing, setImporting] = useState<ImportKind | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (snap && !f) setF(snap.settings);
  }, [snap, f]);

  if (!snap || !f) return <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6" aria-busy="true" />;

  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setF({ ...f, [k]: v });
  // Fotky na pozadí se ukládají hned po nahrání, do rozpracovaného formuláře nepatří.
  const strip = (x: CompanySettings) => ({ ...x, backdrops: undefined });
  const dirty = JSON.stringify(strip(f)) !== JSON.stringify(strip(snap.settings));
  const say = (text: string, tone: 'success' | 'error' = 'success') => setToast({ text, tone, id: Date.now() });
  const icoValid = !f.ico || /^\d{8}$/.test(f.ico);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!icoValid) return setToast({ text: 'IČO má 8 číslic.', tone: 'error', id: Date.now() });
    saveSettings({ ...f, backdrops: snap.settings.backdrops, defaultVatMode: f.vatPayer ? (f.defaultVatMode === 'none' ? 'standard21' : f.defaultVatMode) : 'none' });
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
          <Field
            label="Číslo účtu"
            wide
            hint={!f.bankAccount ? 'Zobrazí se na dokladech a vytvoří se z něj QR platba.' : ibanFromAccount(f.bankAccount) ? `IBAN ${ibanFromAccount(f.bankAccount)}, QR platba bude na dokladech.` : 'Nerozpoznaný formát, QR platba nebude. Zadejte např. 123456789/0100.'}
          >
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

        <Section title="Zákazníci a pohledávky" description="Slevy pro stálé zákazníky, délka záruky na dílo a kdy připomínat neuhrazené faktury.">
          <div className="sm:col-span-2">
            <span className="text-sm font-medium text-ink">Cenové hladiny</span>
            <ul className="mt-1 space-y-2">
              {priceLevelsOf(f).map((l, idx) => (
                <li key={l.id} className="flex items-center gap-2">
                  <input
                    aria-label="Název hladiny"
                    value={l.name}
                    onChange={(e) => set('priceLevels', priceLevelsOf(f).map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                    className={`${inputCls} flex-1`}
                  />
                  <input
                    aria-label="Sleva v procentech"
                    inputMode="numeric"
                    value={l.discountPct}
                    onChange={(e) => set('priceLevels', priceLevelsOf(f).map((x, i) => (i === idx ? { ...x, discountPct: Math.min(50, Number(e.target.value.replace(/\D/g, '')) || 0) } : x)))}
                    className={`${inputCls} w-20 text-right tabular-nums`}
                  />
                  <span className="text-sm text-ink-3">%</span>
                  <button
                    type="button"
                    aria-label={`Odebrat ${l.name}`}
                    onClick={() => set('priceLevels', priceLevelsOf(f).filter((_, i) => i !== idx))}
                    className="grid size-10 place-items-center rounded-lg text-ink-3 hover:bg-crit/10 hover:text-crit-ink"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => set('priceLevels', [...priceLevelsOf(f), { id: `pl_${Date.now().toString(36)}`, name: 'Nová hladina', discountPct: 0 }])} className={`${btnSecondary} mt-2`}>
              <Plus className="size-4" /> Přidat hladinu
            </button>
            <p className="mt-1 text-xs text-ink-3">Hladinu přiřadíte zákazníkovi v adresáři. V nabídce se sleva doplní sama.</p>
          </div>
          <Field label="Záruka na dílo" hint="měsíců od předání">
            <input inputMode="numeric" value={f.warrantyMonths ?? 24} onChange={(e) => set('warrantyMonths', Number(e.target.value.replace(/\D/g, '')) || 0)} className={`${inputCls} text-right tabular-nums`} />
          </Field>
          <Field label="Kurz EUR pro nové nabídky" hint="Kč za 1 €">
            <input
              inputMode="decimal"
              value={String(f.eurRate ?? 25).replace('.', ',')}
              onChange={(e) => set('eurRate', Number(e.target.value.replace(',', '.').replace(/[^\d.]/g, '')) || 0)}
              className={`${inputCls} text-right tabular-nums`}
            />
          </Field>
          <Field label="Upomínky po splatnosti" hint="1., 2. a 3. upomínka, dní po splatnosti" wide>
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  aria-label={`${i + 1}. upomínka po dnech`}
                  inputMode="numeric"
                  value={(f.reminderDays ?? DEFAULT_REMINDER_DAYS)[i]}
                  onChange={(e) => {
                    const next = [...(f.reminderDays ?? DEFAULT_REMINDER_DAYS)] as [number, number, number];
                    next[i] = Number(e.target.value.replace(/\D/g, '')) || 0;
                    set('reminderDays', next);
                  }}
                  className={`${inputCls} w-20 text-right tabular-nums`}
                />
              ))}
            </div>
          </Field>
          <Field label="Právní forma" hint="pro odhad daní v Peníze → Daně" wide>
            <select value={f.legalForm ?? 'sro'} onChange={(e) => set('legalForm', e.target.value as 'sro' | 'osvc')} className={inputCls}>
              <option value="sro">Společnost s ručením omezeným (s.r.o.)</option>
              <option value="osvc">Živnostník (OSVČ)</option>
            </select>
          </Field>
        </Section>

        <Section title="Lidé a provoz" description="Odměny party za zakázky hotové pod rozpočtem a sazba za kilometr v knize jízd.">
          <Field label="Odměna z ušetřené práce" hint="% z ušetřených nákladů, dělí se podle hodin">
            <input inputMode="numeric" value={f.bonusSharePct ?? 20} onChange={(e) => set('bonusSharePct', Math.min(100, Number(e.target.value.replace(/\D/g, '')) || 0))} className={`${inputCls} text-right tabular-nums`} />
          </Field>
          <Field label="Sazba za kilometr" hint="Kč/km, náklad dopravy na zakázky">
            <input
              inputMode="decimal"
              value={String(f.kmRate ?? 5.8).replace('.', ',')}
              onChange={(e) => set('kmRate', Number(e.target.value.replace(',', '.').replace(/[^\d.]/g, '')) || 0)}
              className={`${inputCls} text-right tabular-nums`}
            />
          </Field>
        </Section>

        <Section title="Terén a mobil" description="Co mobil party ukládá. Poloha se bere jen jednou při začátku práce, během dne se nikdo nesleduje. Lidi o tom informujte (GDPR).">
          <Field label="Poloha při začátku práce" hint="kancelář uvidí, jestli práce začala na stavbě">
            <span className="flex h-10 items-center gap-2 text-sm font-normal text-ink">
              <input type="checkbox" checked={f.geoCheckIn !== false} onChange={(e) => set('geoCheckIn', e.target.checked)} className="size-4" /> Ukládat polohu
            </span>
          </Field>
          <Field label="Okruh stavby" hint="metrů od stavby, které se ještě berou jako „na místě“">
            <input inputMode="numeric" value={f.siteRadiusM ?? 300} onChange={(e) => set('siteRadiusM', Math.min(5000, Number(e.target.value.replace(/\D/g, '')) || 0))} className={`${inputCls} text-right tabular-nums`} />
          </Field>
          <Field label="Razítko na fotkách" hint="kód zakázky, adresa, datum a čas, poloha přímo v obrázku">
            <span className="flex h-10 items-center gap-2 text-sm font-normal text-ink">
              <input type="checkbox" checked={f.photoStamp !== false} onChange={(e) => set('photoStamp', e.target.checked)} className="size-4" /> Přidávat razítko
            </span>
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

      <section className="mt-8 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Import z Excelu</h2>
        <p className="mt-1 text-sm text-ink-2">Přecházíte z tabulek? Nahrajte seznam zakázek nebo zákazníků. Aplikace sama pozná sloupce a ukáže náhled.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setImporting('jobs')} className={btnSecondary}>
            <FileSpreadsheet className="size-4" /> Zakázky
          </button>
          <button type="button" onClick={() => setImporting('clients')} className={btnSecondary}>
            <FileSpreadsheet className="size-4" /> Zákazníci
          </button>
        </div>
      </section>
      <ImportDataDrawer kind={importing} snap={snap} onClose={() => setImporting(null)} onDone={(t) => { setImporting(null); setToast({ text: t, tone: 'success', id: Date.now() }); }} />

      <BackupSection
        say={(t, tone) => {
          say(t, tone);
          setF(null);
        }}
      />
      <BackdropSection snap={snap} say={say} />
      <FreshStartCard fresh={snap.fresh} />

      <section className="mt-8 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Zátěžový test</h2>
        <p className="mt-1 text-sm text-ink-2">Přidá tisíce smyšlených dokončených zakázek, abyste viděli, jak aplikace zvládá velkou firmu. Data se neukládají, jen se dopočítají.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[1000, 3000, 5000].map((n) => (
            <button key={n} type="button" onClick={() => (setLoadTest(n), setToast({ text: `Přidáno ${n.toLocaleString('cs-CZ')} zátěžových zakázek.`, tone: 'success', id: Date.now() }))} className={btnSecondary}>
              +{n.toLocaleString('cs-CZ')}
            </button>
          ))}
          {readStore().loadTest > 0 && (
            <button type="button" onClick={() => (setLoadTest(0), setToast({ text: 'Zátěžová data vypnuta.', tone: 'success', id: Date.now() }))} className="h-10 rounded-lg px-3 text-sm text-ink-2 hover:bg-concrete">
              Vypnout ({readStore().loadTest.toLocaleString('cs-CZ')})
            </button>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-crit/30 bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Ukázková firma</h2>
        <p className="mt-1 text-sm text-ink-2">Smaže všechno, co jste v tomto prohlížeči vytvořili nebo změnili, a vrátí ukázkovou firmu do původního stavu. Než to uděláte, stáhněte si zálohu.</p>
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
