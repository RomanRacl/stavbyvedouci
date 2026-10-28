import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Job, JobStatus, MaterialUsage, PeriodStat } from '@/types/firestore';
import { converter } from './converters';
import { db } from './client';

const jobsCol = (companyId: string) => collection(db, 'companies', companyId, 'jobs').withConverter(converter<Job>());
const statsCol = (companyId: string) =>
  collection(db, 'companies', companyId, 'stats').withConverter(converter<PeriodStat>());
const usageCol = (companyId: string) =>
  collection(db, 'companies', companyId, 'materialUsage').withConverter(converter<MaterialUsage>());

type Listener<T> = (rows: T[], meta: { fromCache: boolean }) => void;

/** Realtime stream aktivních zakázek. Index: status ASC, updatedAt DESC. */
export function subscribeJobs(
  companyId: string,
  statuses: JobStatus[],
  onData: Listener<Job>,
  onError: (e: Error) => void,
): Unsubscribe {
  const q = query(jobsCol(companyId), where('status', 'in', statuses), orderBy('updatedAt', 'desc'), limit(200));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => onData(snap.docs.map((d) => d.data()), { fromCache: snap.metadata.fromCache }),
    onError,
  );
}

/** Dashboard čte jen předagregované statistiky – ne tisíce TimeLogů (cena čtení!). */
export function subscribeWeeklyStats(companyId: string, weeks: number, onData: Listener<PeriodStat>): Unsubscribe {
  const q = query(
    statsCol(companyId),
    where('granularity', '==', 'week'),
    orderBy('periodStart', 'desc'),
    limit(weeks),
  );
  return onSnapshot(q, (snap) =>
    onData(snap.docs.map((d) => d.data()).reverse(), { fromCache: snap.metadata.fromCache }),
  );
}

/** Log čerpání materiálu pro jednu zakázku – načítá se líně až při otevření Draweru. */
export function subscribeMaterialUsage(companyId: string, jobId: string, onData: Listener<MaterialUsage>): Unsubscribe {
  const q = query(usageCol(companyId), where('jobId', '==', jobId), orderBy('usedAt', 'desc'), limit(300));
  return onSnapshot(q, (snap) => onData(snap.docs.map((d) => d.data()), { fromCache: snap.metadata.fromCache }));
}

/**
 * Schválení zakázky. Rules povolí přechod jen awaiting_approval -> approved a jen roli owner/manager.
 * UI volá optimisticky; snapshot listener pak stav potvrdí (hasPendingWrites).
 */
export async function approveJob(companyId: string, jobId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'companies', companyId, 'jobs', jobId), {
    status: 'approved',
    approval: { approvedBy: uid, approvedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
}
