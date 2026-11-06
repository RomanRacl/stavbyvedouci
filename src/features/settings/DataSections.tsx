'use client';

import { Download, ImagePlus, RotateCcw, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { btnPrimary, btnSecondary } from '@/components/shell/PageHeader';
import { PHOTOS, SECTION_LABELS, unsplashUrl, useCustomPhoto } from '@/components/shell/SectionBackdrop';
import { backupSummary, downloadBackup, lastBackupAt, parseBackup, restoreBackup, type BackupFile } from '@/lib/backup';
import { saveSettings } from '@/lib/mock/localBackend';
import type { Snapshot } from '@/lib/mock/localBackend';
import { compressImage } from '@/lib/photos/compress';
import { deletePhotoBlob, forgetPhotoUrl, putPhotoBlob } from '@/lib/photos/photoBlobs';

type Say = (text: string, tone?: 'success' | 'error') => void;

const ago = (d: Date) => {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days <= 0 ? 'dnes' : days === 1 ? 'včera' : `před ${days} dny`;
};

/* ---------- záloha ---------- */

export function BackupSection({ say }: { say: Say }) {
  const [withPhotos, setWithPhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [last, setLast] = useState(() => lastBackupAt());
  const fileRef = useRef<HTMLInputElement>(null);
  const sum = pending ? backupSummary(pending) : null;

  return (
    <section id="zaloha" className="mt-8 scroll-mt-20 rounded-xl border border-line bg-surface p-5" aria-labelledby="backup-h">
      <h2 id="backup-h" className="text-base font-semibold text-ink">
        Záloha dat
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Data jsou zatím uložená jen v tomto prohlížeči. Záloha je jeden soubor se vším (zakázky, nabídky, lidé, nastavení, fotky). Uložte si ho třeba na disk nebo do e-mailu, ze zálohy pak data obnovíte i na jiném
        počítači.
      </p>
      <p className={`mt-2 text-sm ${last && Date.now() - last.getTime() < 7 * 86_400_000 ? 'text-good-ink' : 'text-warn-ink'}`}>
        {last ? `Poslední záloha: ${ago(last)} (${last.toLocaleDateString('cs-CZ')}).` : 'V tomto prohlížeči jste zatím nezálohovali.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await downloadBackup(withPhotos);
              setLast(lastBackupAt());
              say(`Záloha stažena: ${r.name} (${(r.bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB).`);
            } catch {
              say('Zálohu se nepodařilo vytvořit.', 'error');
            }
            setBusy(false);
          }}
          className={btnPrimary}
        >
          <Download className="size-4" /> {busy ? 'Připravuji…' : 'Stáhnout zálohu'}
        </button>
        <label className="flex h-10 items-center gap-2 px-1 text-sm text-ink-2">
          <input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} className="size-4" /> včetně fotek
        </label>
        <button type="button" onClick={() => fileRef.current?.click()} className={`${btnSecondary} sm:ml-auto`}>
          <Upload className="size-4" /> Obnovit ze zálohy
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Soubor zálohy"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              setPending(parseBackup(await file.text()));
            } catch (err) {
              say(err instanceof Error ? err.message : 'Soubor nejde přečíst.', 'error');
            }
          }}
        />
      </div>
      {sum && (
        <div role="alertdialog" aria-labelledby="restore-h" className="mt-4 rounded-lg border border-warn/40 bg-warn/10 p-4">
          <p id="restore-h" className="text-sm font-semibold text-ink">
            Obnovit zálohu firmy {sum.company} z {sum.createdAt.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}?
          </p>
          <p className="mt-1 text-sm text-ink-2">
            {sum.fresh ? 'Vlastní data firmy' : 'Ukázková data s vašimi změnami'}, {sum.jobs} vlastních zakázek, {sum.photos} fotek. Současná data v tomto prohlížeči se nahradí.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await restoreBackup(pending!);
                  say('Záloha obnovena.');
                } catch {
                  say('Obnova se nepovedla. Data zůstala beze změny.', 'error');
                }
                setPending(null);
                setBusy(false);
              }}
              className="inline-flex h-10 items-center rounded-lg bg-crit px-4 text-sm font-semibold text-white"
            >
              Ano, obnovit
            </button>
            <button type="button" onClick={() => setPending(null)} className={btnSecondary}>
              Zrušit
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- vlastní fotky na pozadí ---------- */

function BackdropTile({ section, customId, onUpload, onReset }: { section: string; customId?: string; onUpload: (f: File) => void; onReset: () => void }) {
  const custom = useCustomPhoto(customId);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <li className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="relative aspect-[16/9] bg-concrete">
        {/* eslint-disable-next-line @next/next/no-img-element -- náhled fotky */}
        <img src={custom ?? unsplashUrl(PHOTOS[section].id, 400)} alt="" loading="lazy" className="size-full object-cover" />
        <span className={`absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${customId ? 'bg-good text-white' : 'bg-[#0b1015]/60 text-[#ffffff]'}`}>
          {customId ? 'vlastní' : 'výchozí'}
        </span>
      </div>
      <div className="flex items-center gap-1 p-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{SECTION_LABELS[section]}</p>
        <button type="button" onClick={() => ref.current?.click()} aria-label={`Nahrát vlastní fotku: ${SECTION_LABELS[section]}`} title="Nahrát vlastní fotku" className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-concrete hover:text-ink">
          <ImagePlus className="size-4" />
        </button>
        {customId && (
          <button type="button" onClick={onReset} aria-label={`Vrátit výchozí fotku: ${SECTION_LABELS[section]}`} title="Vrátit výchozí" className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-concrete hover:text-ink">
            <RotateCcw className="size-4" />
          </button>
        )}
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label={`Fotka pro sekci ${SECTION_LABELS[section]}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onUpload(f);
          }}
        />
      </div>
    </li>
  );
}

/**
 * Fotky na pozadí pro účet firmy: výchozí jsou z Unsplash, firma je může nahradit vlastními
 * (třeba fotkami svých staveb). Po zapojení Firebase se uloží do úložiště firmy a uvidí je všichni z kanceláře.
 */
export function BackdropSection({ snap, say }: { snap: Snapshot; say: Say }) {
  const custom = snap.settings.backdrops ?? {};
  const set = (section: string, id: string | null) => {
    const next = { ...custom };
    const old = next[section];
    if (id) next[section] = id;
    else delete next[section];
    saveSettings({ backdrops: next });
    if (old) {
      forgetPhotoUrl(old);
      void deletePhotoBlob(old).catch(() => undefined);
    }
  };
  const ownCount = Object.keys(custom).length;

  return (
    <section className="mt-8 rounded-xl border border-line bg-surface p-5" aria-labelledby="bd-h">
      <h2 id="bd-h" className="text-base font-semibold text-ink">
        Fotky na pozadí
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Každá sekce má výchozí fotku. Nahraďte ji fotkou vaší firmy, třeba hotové stavby nebo party na akci. Fotka se zmenší a uloží k účtu firmy.{' '}
        {ownCount > 0 && `Vlastní fotky: ${ownCount}.`}
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Object.keys(PHOTOS).map((section) => (
          <BackdropTile
            key={section}
            section={section}
            customId={custom[section]}
            onReset={() => {
              set(section, null);
              say(`${SECTION_LABELS[section]}: vrácena výchozí fotka.`);
            }}
            onUpload={async (file) => {
              try {
                const { blob } = await compressImage(file, 2400, 0.82);
                const id = `bg_${section.slice(1)}_${Date.now().toString(36)}`;
                await putPhotoBlob(id, blob);
                set(section, id);
                say(`${SECTION_LABELS[section]}: vlastní fotka nastavena.`);
              } catch {
                say('Fotku se nepodařilo načíst. Zkuste JPG nebo PNG.', 'error');
              }
            }}
          />
        ))}
      </ul>
    </section>
  );
}

/* ---------- začátek naostro ---------- */

export function FreshStartCard({ fresh }: { fresh: boolean }) {
  return (
    <section className="mt-8 rounded-xl border border-series-1/40 bg-surface p-5" aria-labelledby="fresh-h">
      <h2 id="fresh-h" className="text-base font-semibold text-ink">
        {fresh ? 'Firma jede naostro' : 'Začít naostro'}
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        {fresh
          ? 'Ukázková firma je smazaná, aplikace pracuje jen s vašimi daty. Průvodce můžete projít znovu (třeba pro jinou firmu), smaže ale všechno současné.'
          : 'Zatím se díváte na ukázkovou firmu. Průvodce smaže ukázková data, zeptá se na údaje vaší firmy a lidi z party. Zabere to pár minut.'}
      </p>
      <Link href="/zacit" className={`${fresh ? btnSecondary : btnPrimary} mt-3`}>
        {fresh ? 'Projít průvodce znovu' : 'Spustit průvodce'}
      </Link>
    </section>
  );
}
