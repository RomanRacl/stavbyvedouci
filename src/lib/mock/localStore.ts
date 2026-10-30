import type {
  ActiveTimer,
  AuditEntry,
  Certificate,
  Client,
  RecurringPlan,
  CompanySettings,
  Job,
  JobNote,
  JobPhoto,
  JobTemplate,
  MaterialItem,
  MaterialUsage,
  PurchaseOrder,
  Quote,
  StockMove,
  Supplier,
  TimeLog,
} from '@/types/firestore';

/**
 * Úložiště v prohlížeči pro režim bez Firebase.
 * Drží jen změny proti ukázkovým datům: nové zakázky, úpravy zakázek,
 * běžící časovače dělníků a zapsané výdeje materiálu.
 */
const KEY = 'stavbyvedouci:v1';
export const CHANGE_EVENT = 'stavbyvedouci:change';

export interface Stored {
  created: Job[];
  patches: Record<string, Partial<Job>>;
  timers: Record<string, ActiveTimer | null>; // uid -> běžící měření (null = zastaveno)
  usage: MaterialUsage[];
  photos: JobPhoto[]; // jen metadata, soubory jsou v IndexedDB (photoBlobs.ts)
  deleted: string[]; // smazané zakázky (i ukázkové)
  notes: JobNote[];
  timeLogs: TimeLog[];
  dayReports: Record<string, Date>; // `${uid}_${YYYY-MM-DD}` -> kdy potvrzeno
  /** Upravený katalog; null = ukázkový katalog beze změn. */
  catalog: MaterialItem[] | null;
  stockMoves: StockMove[];
  orders: PurchaseOrder[];
  templates: JobTemplate[] | null;
  suppliers: Supplier[] | null;
  settings: CompanySettings | null;
  quotes: Quote[] | null;
  audit: AuditEntry[];
  clients: Client[];
  recurring: RecurringPlan[] | null;
  certificates: Certificate[] | null;
}

const EMPTY: Stored = {
  created: [],
  patches: {},
  timers: {},
  usage: [],
  photos: [],
  deleted: [],
  notes: [],
  timeLogs: [],
  dayReports: {},
  catalog: null,
  stockMoves: [],
  orders: [],
  templates: null,
  suppliers: null,
  settings: null,
  quotes: null,
  audit: [],
  clients: [],
  recurring: null,
  certificates: null,
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const reviveDates = (_k: string, v: unknown) => (typeof v === 'string' && ISO_DATE.test(v) ? new Date(v) : v);

export function readStore(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw, reviveDates) as Partial<Stored>) };
  } catch {
    /* soukromé okno nebo poškozená data – začneme načisto */
  }
  return { ...EMPTY };
}

/** Atomická úprava + oznámení ostatním částem aplikace v této záložce. */
export function updateStore(fn: (s: Stored) => Stored) {
  const next = fn(readStore());
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* plné nebo zakázané úložiště – změna platí jen do obnovení stránky */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Volá `cb` při změně v této záložce i v jiných záložkách (událost `storage`). */
export function subscribeStore(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function resetStore() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nic */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
