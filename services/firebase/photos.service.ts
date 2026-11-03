import { collection, doc, deleteDoc, onSnapshot, orderBy, query, setDoc, where, type Unsubscribe } from 'firebase/firestore';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { compressImage } from '@/lib/photos/compress';
import type { JobPhoto } from '@/types/firestore';
import { converter } from './converters';
import { db, storage } from './client';

/**
 * Produkční varianta fotek (zatím nezapojená, režim bez Firebase používá localBackend).
 * Pořadí: zmenšit → nahrát soubor do Storage → zapsat metadata do Firestore.
 * Díky offline cache Firestore se metadata zapíšou i bez signálu; samotný upload
 * do Storage ale potřebuje připojení – proto UI ukazuje rozpracované fotky.
 */
const photosCol = (companyId: string) =>
  collection(db, 'companies', companyId, 'photos').withConverter(converter<JobPhoto>());

export async function uploadJobPhoto(companyId: string, jobId: string, uid: string, file: File): Promise<JobPhoto> {
  const { blob, width, height } = await compressImage(file);
  const photoRef = doc(photosCol(companyId));
  const storagePath = `companies/${companyId}/jobs/${jobId}/photos/${photoRef.id}.jpg`;
  await uploadBytes(ref(storage, storagePath), blob, {
    contentType: 'image/jpeg',
    customMetadata: { jobId, workerId: uid },
  });
  const photo: JobPhoto = {
    id: photoRef.id,
    jobId,
    workerId: uid,
    takenAt: new Date(file.lastModified || Date.now()),
    storagePath,
    width,
    height,
    sizeBytes: blob.size,
  };
  await setDoc(photoRef, photo);
  return photo;
}

export function subscribeJobPhotos(companyId: string, jobId: string, onData: (rows: JobPhoto[]) => void): Unsubscribe {
  const q = query(photosCol(companyId), where('jobId', '==', jobId), orderBy('takenAt', 'desc'));
  return onSnapshot(q, (snap) => onData(snap.docs.map((d) => d.data())));
}

export async function deleteJobPhoto(companyId: string, photo: JobPhoto) {
  await deleteDoc(doc(db, 'companies', companyId, 'photos', photo.id));
  await deleteObject(ref(storage, photo.storagePath)).catch(() => undefined);
}
