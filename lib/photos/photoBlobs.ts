/**
 * Úložiště souborů fotek v prohlížeči (IndexedDB) pro režim bez Firebase.
 * localStorage má limit ~5 MB a ukládá jen text, proto binární data jdou sem.
 * V produkci tuto roli převezme Firebase Storage.
 */
const DB = 'stavbyvedouci-photos';
const STORE = 'blobs';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const putPhotoBlob = (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id)).then(() => undefined);
export const getPhotoBlob = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id));
export const deletePhotoBlob = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined);

/* Cache object URL, aby se mřížka fotek při každé změně dat znovu nenačítala a neblikala. */
const urlCache = new Map<string, Promise<string | null>>();

export function photoUrl(id: string): Promise<string | null> {
  let p = urlCache.get(id);
  if (!p) {
    p = getPhotoBlob(id)
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null);
    urlCache.set(id, p);
  }
  return p;
}

export function forgetPhotoUrl(id: string) {
  const p = urlCache.get(id);
  urlCache.delete(id);
  p?.then((u) => u && URL.revokeObjectURL(u));
}
