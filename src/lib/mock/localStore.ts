import type { Job } from '@/types/firestore';

/**
 * Úložiště v prohlížeči pro režim bez Firebase.
 * Ukládá jen to, co udělal uživatel (nové zakázky + změny ukázkových),
 * simulované realtime přírůstky se neukládají.
 */
const KEY = 'stavbyvedouci:v1';

interface Stored {
  created: Job[];
  patches: Record<string, Partial<Job>>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const reviveDates = (_k: string, v: unknown) => (typeof v === 'string' && ISO_DATE.test(v) ? new Date(v) : v);

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw, reviveDates) as Stored;
  } catch {
    /* soukromé okno nebo poškozená data – začneme načisto */
  }
  return { created: [], patches: {} };
}

function write(data: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* plné nebo zakázané úložiště – změna platí jen do obnovení stránky */
  }
}

/** Ukázkové zakázky + uživatelovy změny + nově založené zakázky. */
export function loadJobs(seed: Job[]): Job[] {
  const { created, patches } = read();
  return [...created, ...seed].map((j) => (patches[j.id] ? { ...j, ...patches[j.id] } : j));
}

export function saveCreatedJob(job: Job) {
  const data = read();
  write({ ...data, created: [job, ...data.created] });
}

export function savePatch(jobId: string, patch: Partial<Job>) {
  const data = read();
  const isCreated = data.created.some((j) => j.id === jobId);
  if (isCreated) {
    write({ ...data, created: data.created.map((j) => (j.id === jobId ? { ...j, ...patch } : j)) });
  } else {
    write({ ...data, patches: { ...data.patches, [jobId]: { ...data.patches[jobId], ...patch } } });
  }
}

export function resetLocalData() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nic */
  }
}
