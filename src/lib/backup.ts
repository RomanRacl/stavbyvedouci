'use client';

import { readStore, replaceStore, type Stored } from '@/lib/mock/localStore';
import { forgetPhotoUrl, getPhotoBlob, putPhotoBlob } from '@/lib/photos/photoBlobs';

/**
 * Záloha všech dat z prohlížeče do jednoho souboru a obnova z něj.
 * Dokud nejede Firebase, je to jediná ochrana proti smazání historie prohlížeče
 * a jediný způsob, jak data přenést na jiný počítač.
 */
export const BACKUP_FORMAT = 'stavbyvedouci-zaloha';
const LAST_KEY = 'stavbyvedouci:last-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  createdAt: string;
  company: string;
  store: Stored;
  /** Soubory fotek (zakázky i vlastní fotky na pozadí) jako data URL. */
  blobs: Record<string, string>;
}

/** Všechna ID souborů, na které data odkazují. */
export function blobIdsOf(s: Stored): string[] {
  const ids = new Set<string>();
  for (const p of s.photos) ids.add(p.id);
  for (const id of Object.values(s.settings?.backdrops ?? {})) if (id) ids.add(id);
  return [...ids];
}

const toDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

async function fromDataUrl(url: string): Promise<Blob> {
  const [head, data] = url.split(',', 2);
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function makeBackup(withPhotos: boolean): Promise<BackupFile> {
  const store = readStore();
  const blobs: Record<string, string> = {};
  if (withPhotos) {
    for (const id of blobIdsOf(store)) {
      const b = await getPhotoBlob(id).catch(() => undefined);
      if (b) blobs[id] = await toDataUrl(b);
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    company: store.settings?.name || (store.fresh ? 'firma' : 'ukazkova-firma'),
    store,
    blobs,
  };
}

/** „zaloha-novak-stavby-2026-11-06.json“ */
export function backupFileName(b: BackupFile): string {
  const slug = b.company
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `zaloha-${slug || 'firma'}-${b.createdAt.slice(0, 10)}.json`;
}

/** Stáhne zálohu jako soubor a zapamatuje si, kdy se zálohovalo. */
export async function downloadBackup(withPhotos: boolean): Promise<{ name: string; bytes: number }> {
  const b = await makeBackup(withPhotos);
  const text = JSON.stringify(b);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(b);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  try {
    localStorage.setItem(LAST_KEY, b.createdAt);
  } catch {
    /* nic */
  }
  return { name: a.download, bytes: blob.size };
}

export function lastBackupAt(): Date | null {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const reviveDates = (_k: string, v: unknown) => (typeof v === 'string' && ISO_DATE.test(v) ? new Date(v) : v);

/** Přečte a zkontroluje soubor zálohy. Vyhodí srozumitelnou chybu, když to záloha není. */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text, reviveDates);
  } catch {
    throw new Error('Soubor není záloha z této aplikace (nejde přečíst).');
  }
  const b = data as Partial<BackupFile>;
  if (b?.format !== BACKUP_FORMAT || !b.store || typeof b.store !== 'object') throw new Error('Soubor není záloha z této aplikace.');
  if (b.version !== 1) throw new Error('Záloha je z novější verze aplikace. Nejdřív aplikaci aktualizujte.');
  return { ...b, blobs: b.blobs ?? {} } as BackupFile;
}

/** Shrnutí pro potvrzení před obnovou. */
export function backupSummary(b: BackupFile) {
  const s = b.store;
  return {
    company: b.company,
    createdAt: new Date(b.createdAt),
    jobs: s.created.length,
    fresh: s.fresh,
    photos: Object.keys(b.blobs).length,
  };
}

/** Nahradí data v prohlížeči obsahem zálohy (včetně souborů fotek). */
export async function restoreBackup(b: BackupFile): Promise<void> {
  for (const [id, url] of Object.entries(b.blobs)) {
    await putPhotoBlob(id, await fromDataUrl(url));
    forgetPhotoUrl(id);
  }
  replaceStore(b.store);
}
