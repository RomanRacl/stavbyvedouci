import type {
  ActiveTimer,
  AuditEntry,
  Certificate,
  Client,
  Lead,
  Absence,
  Reservation,
  Subcontractor,
  Tool,
  ToolEvent,
  Trip,
  RecurringPlan,
  CompanySettings,
  Job,
  Member,
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
  leads: Lead[] | null;
  /** Odeslané servisní připomínky: klíč připomínky -> kdy. */
  serviceDone: Record<string, Date>;
  trips: Trip[];
  tools: Tool[] | null;
  toolEvents: ToolEvent[];
  reservations: Reservation[] | null;
  absences: Absence[] | null;
  subcontractors: Subcontractor[] | null;
  /** Počet zátěžových zakázek (test rychlosti), 0 = vypnuto. */
  loadTest: number;
  /** Firma začala naostro: ukázková data se nepřimíchávají. */
  fresh: boolean;
  /** Lidé ve firmě; null = ukázková parta. */
  members: Member[] | null;
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
  leads: null,
  serviceDone: {},
  trips: [],
  tools: null,
  toolEvents: [],
  reservations: null,
  absences: null,
  subcontractors: null,
  loadTest: 0,
  fresh: false,
  members: null,
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

/** Verze dat – roste s každou změnou; podle ní se drží v paměti hotový snímek. */
let version = 0;
export const storeVersion = () => version;
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) version++;
  });
}

/** Atomická úprava + oznámení ostatním částem aplikace v této záložce. */
export function updateStore(fn: (s: Stored) => Stored) {
  version++;
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
  version++;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nic */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Celý obsah úložiště najednou (obnova ze zálohy, začátek naostro). */
export function replaceStore(next: Partial<Stored>) {
  version++;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...EMPTY, ...next }));
  } catch {
    /* plné úložiště */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export const emptyStore = (): Stored => ({ ...EMPTY });
