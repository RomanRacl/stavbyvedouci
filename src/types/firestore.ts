/**
 * Doménové typy = tvar dokumentů ve Firestore PO průchodu konvertorem
 * (Timestamp -> Date). Peníze jsou vždy celé Kč (integer), nikdy float.
 *
 * Cesty:
 *   users/{uid}                                   -> UserProfile (mapování uid -> firma)
 *   companies/{companyId}                         -> Company
 *   companies/{companyId}/members/{uid}           -> Member
 *   companies/{companyId}/jobs/{jobId}            -> Job (agregáty denormalizované)
 *   companies/{companyId}/materials/{materialId}  -> MaterialItem (katalog + sklad)
 *   companies/{companyId}/materialUsage/{id}      -> MaterialUsage (append-only log)
 *   companies/{companyId}/timeLogs/{id}           -> TimeLog (append-only log)
 *   companies/{companyId}/stats/{periodId}        -> PeriodStat (předagregace, píše jen Cloud Function)
 *   companies/{companyId}/photos/{photoId}        -> JobPhoto (metadata; soubor ve Storage na `storagePath`)
 *   companies/{companyId}/notes/{noteId}          -> JobNote (zprávy mezi kanceláří a partou)
 *   companies/{companyId}/dayReports/{uid_date}   -> DayReport (potvrzený denní výkaz dělníka)
 *   companies/{companyId}/vans/{vanId}            -> Van (auto jako pojízdný sklad)
 *   companies/{companyId}/stockMoves/{id}         -> StockMove (append-only kniha pohybů skladu)
 *   companies/{companyId}/orders/{orderId}        -> PurchaseOrder (objednávka u dodavatele)
 *   companies/{companyId}/templates/{id}          -> JobTemplate (šablona zakázky)
 *   companies/{companyId}/suppliers/{id}          -> Supplier
 *   companies/{companyId}/quotes/{quoteId}        -> Quote (cenová nabídka; po přijetí vznikne Job)
 *   companies/{companyId}/clients/{clientId}      -> Client (adresář zákazníků)
 *   companies/{companyId}/recurring/{id}          -> RecurringPlan (pravidelný servis)
 *   companies/{companyId}/certificates/{id}       -> Certificate (oprávnění a školení lidí)
 *   companies/{companyId}/audit/{id}              -> AuditEntry (historie změn + stavební deník)
 *   companies/{companyId}  (pole settings)        -> CompanySettings
 */

export type Role = 'owner' | 'manager' | 'worker';

export type JobStatus =
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'awaiting_approval'
  | 'approved'
  | 'invoiced';

export type Trade = 'electro' | 'plumbing' | 'windows' | 'construction' | 'hvac';

export type Unit = 'ks' | 'm' | 'kg' | 'bal' | 'l';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface UserProfile {
  uid: string;
  companyId: string;
  role: Role; // zrcadlí custom claim; zdroj pravdy pro rules je token
  displayName: string;
  email: string;
}

export interface Company {
  id: string;
  name: string;
  ico: string;
  plan: 'trial' | 'standard' | 'pro';
  settings: {
    currency: 'CZK';
    overheadPct: number; // režie připočítávaná k nákladům, např. 0.12
    defaultHourlyRate: number; // fakturační sazba Kč/h
  };
  createdAt: Date;
}

export interface ActiveTimer {
  logId: string;
  jobId: string;
  startedAt: Date;
  /** Kdy začala právě běžící přestávka (null = pracuje se). */
  pausedAt?: Date | null;
  /** Součet už ukončených přestávek v ms. */
  pausedMs?: number;
  /** Etapa zakázky, na které se právě pracuje. */
  stageId?: string | null;
}

export interface Member {
  uid: string;
  displayName: string;
  initials: string;
  role: Role;
  phone: string;
  hourlyCost: number; // náklad firmy Kč/h (mzda + odvody)
  active: boolean;
  activeTimer: ActiveTimer | null; // dělník má max. 1 běžící měření
}

/** Řádek plánu materiálu – denormalizovaný v Job pro okamžité čtení detailu. */
export interface MaterialPlanLine {
  materialId: string;
  name: string; // snapshot názvu
  unit: Unit;
  unitCost: number; // snapshot ceny v době plánování
  plannedQty: number;
  usedQty: number; // inkrementuje Cloud Function z materialUsage
}

export interface Job {
  id: string;
  code: string; // lidsky čitelné ID, např. Z-2026-0142
  title: string;
  trade: Trade;
  status: JobStatus;
  client: {
    name: string;
    phone: string;
    address: string;
    geo: GeoPoint | null;
  };
  assignedWorkerIds: string[];
  schedule: { start: Date; due: Date };
  budget: {
    revenue: number; // cena pro zákazníka bez DPH
    laborHours: number;
    laborCost: number;
    materialCost: number;
  };
  actuals: {
    laborHours: number;
    laborCost: number;
    materialCost: number;
    updatedAt: Date;
  };
  progressPct: number; // 0–100, hlásí parťák z mobilu
  materialPlan: MaterialPlanLine[];
  approval: { approvedBy: string; approvedAt: Date } | null;
  /** Práce navíc nahlášená z terénu; schválená navyšuje cenu i rozpočet. */
  extraWork?: ExtraWork[];
  /** Kontrolní seznam; povinné body musí být hotové před předáním. */
  checklist?: ChecklistItem[];
  /** Předávací protokol s podpisem zákazníka. */
  handover?: Handover | null;
  /** Režim DPH zakázky (oprava bytu 12 %, novostavba 21 %, přenesená povinnost mezi plátci…). */
  vatMode?: VatMode;
  /** Zálohy a platby od zákazníka. */
  payments?: Payment[];
  /** Vystavený podklad k fakturaci. */
  invoice?: InvoiceInfo | null;
  /** Z jaké nabídky zakázka vznikla. */
  quoteId?: string | null;
  /** Etapy (např. hrubá instalace → kompletace → revize). Když existují, dokončenost zakázky se počítá z nich. */
  stages?: Stage[];
  /** Revizní zprávy a zkoušky. */
  revisions?: RevisionReport[];
  /** Poučení BOZP pro stavbu a kdo ho potvrdil. */
  safety?: SafetyBriefing;
  /** Odkaz do adresáře zákazníků. */
  clientId?: string | null;
  /** Vznikla z pravidelného servisu. */
  recurringId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtraWork {
  id: string;
  description: string;
  hours: number;
  materialCost: number;
  /** Cena pro zákazníka – navrhne aplikace, potvrdí kancelář při schválení. */
  price: number | null;
  status: 'pending' | 'approved' | 'rejected';
  createdBy: string;
  createdAt: Date;
  decidedAt: Date | null;
}

export interface ChecklistItem {
  id: string;
  text: string;
  required: boolean;
  doneBy: string | null;
  doneAt: Date | null;
}

export interface Handover {
  clientName: string;
  /** Podpis jako PNG data URL (v produkci soubor ve Storage). Null = zákazník nebyl na místě. */
  signature: string | null;
  signedAt: Date;
  workerId: string;
}

export interface JobNote {
  id: string;
  jobId: string;
  authorId: string;
  text: string;
  createdAt: Date;
}

export interface DayReport {
  uid: string;
  date: string; // YYYY-MM-DD
  confirmedAt: Date;
}

export interface MaterialItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: Unit;
  unitCost: number;
  stockQty: number;
  reorderPoint: number;
  supplier: string;
  /** EAN / čárový kód pro skenování v mobilu. */
  barcode?: string;
}

/** Auto party – pojízdný sklad. Dělník vydává materiál přednostně z „svého“ auta. */
export interface Van {
  id: string;
  name: string;
  plate: string;
  driverIds: string[];
}

/** Místo, kde leží materiál: hlavní sklad nebo konkrétní auto. */
export type StockLocation = 'warehouse' | `van:${string}`;

/**
 * Pohyb skladu. Stav skladu = počáteční stav + součet `delta` po místech.
 * Převod mezi místy = dva pohyby (minus a plus) se stejným `ref`.
 */
export interface StockMove {
  id: string;
  materialId: string;
  location: StockLocation;
  delta: number;
  kind: 'receive' | 'transfer' | 'issue' | 'return' | 'adjust';
  at: Date;
  by: string;
  ref?: string; // jobId, orderId nebo id převodu
  note?: string;
}

export interface OrderLine {
  materialId: string;
  name: string;
  unit: Unit;
  qty: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  number: string; // OBJ-2026-0001
  supplier: string;
  lines: OrderLine[];
  status: 'draft' | 'sent' | 'received';
  jobId: string | null;
  note: string;
  createdAt: Date;
  sentAt: Date | null;
  receivedAt: Date | null;
}

export interface Supplier {
  name: string;
  email: string;
}

/** Šablona zakázky: předvyplní název, hodiny, cenu, plán materiálu a kontrolní seznam. */
export interface JobTemplate {
  id: string;
  name: string;
  trade: Trade;
  title: string;
  revenue: number;
  laborHours: number;
  materialLines: Array<{ materialId: string; qty: number }>;
  checklist: Array<{ text: string; required: boolean }>;
}

export interface MaterialUsage {
  id: string;
  jobId: string;
  materialId: string;
  qty: number;
  unitCostSnapshot: number;
  workerId: string;
  usedAt: Date;
  source: 'mobile' | 'office';
}

export interface TimeLog {
  id: string;
  jobId: string;
  workerId: string;
  startedAt: Date;
  endedAt: Date | null; // null = běží
  durationMin: number | null; // dopočítá Cloud Function po ukončení
  costSnapshot: number | null; // durationMin/60 * hourlyCost v daný okamžik
  geoStart: GeoPoint | null;
  breakMin?: number;
  stageId?: string | null;
}

/** stats/{periodId}: periodId = "w-2026-43" (týden) nebo "d-2026-10-28" (den). */
export interface PeriodStat {
  id: string;
  granularity: 'day' | 'week';
  periodStart: Date;
  label: string; // předformátovaný popisek osy, např. "43. t."
  revenue: number;
  laborCost: number;
  materialCost: number;
  hours: number;
  jobsCompleted: number;
}

/**
 * Fotka z terénu. Soubor leží ve Firebase Storage:
 *   companies/{companyId}/jobs/{jobId}/photos/{photoId}.jpg
 * Telefon ji před nahráním zmenší (delší strana max. 1600 px, JPEG), aby šetřil data.
 */
export interface JobPhoto {
  id: string;
  jobId: string;
  workerId: string;
  takenAt: Date;
  storagePath: string;
  width: number;
  height: number;
  sizeBytes: number;
  tag?: PhotoTag | null;
}

export type PhotoTag = 'before' | 'during' | 'after' | 'defect';

/* ---------- peníze ---------- */

export type VatMode = 'standard21' | 'reduced12' | 'reverse' | 'none';

/** Platba od zákazníka. Částka je VČETNĚ DPH – tak ji zákazník posílá. */
export interface Payment {
  id: string;
  label: string;
  amount: number;
  dueDate: Date;
  issuedAt: Date;
  paidAt: Date | null;
}

export interface InvoiceInfo {
  number: string; // PF-2026-0001
  issuedAt: Date;
  taxDate: Date;
  dueDate: Date;
}

export interface QuoteItem {
  id: string;
  kind: 'labor' | 'material' | 'other';
  text: string;
  qty: number;
  unit: string;
  /** Prodejní cena za jednotku bez DPH. */
  unitPrice: number;
  /** Vazba na katalog – po přijetí se z ní stane plán materiálu. */
  materialId?: string;
}

export interface Quote {
  id: string;
  number: string; // NAB-2026-0001
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  title: string;
  trade: Trade;
  vatMode: VatMode;
  client: { name: string; phone: string; email: string; address: string; ico: string };
  items: QuoteItem[];
  note: string;
  validUntil: Date;
  templateId: string | null;
  createdAt: Date;
  sentAt: Date | null;
  decidedAt: Date | null;
  jobId: string | null;
}

export interface OverheadItem {
  id: string;
  label: string;
  monthly: number;
}

export interface CompanySettings {
  name: string;
  ico: string;
  dic: string;
  address: string;
  phone: string;
  email: string;
  bankAccount: string;
  /** Logo jako data URL (PNG, max. 400 px). V produkci soubor ve Storage. */
  logo: string | null;
  vatPayer: boolean;
  defaultVatMode: VatMode;
  /** Fakturační sazba práce Kč/h bez DPH. */
  billRate: number;
  /** Přirážka na materiál v nabídkách a vícepracích (1.15 = +15 %). */
  materialMarkup: number;
  paymentDueDays: number;
  quoteValidityDays: number;
  overheadItems: OverheadItem[];
  /** Kolik hodin firma za měsíc reálně odpracuje na zakázkách – podle toho se rozpočítá režie. */
  capacityHours: number;
  /** Stav účtu zadaný majitelem jako start odhadu cash-flow. */
  cashBalance?: number;
}

/* ---------- fáze 5: provoz ---------- */

export interface Stage {
  id: string;
  name: string;
  plannedHours: number;
  progressPct: number;
  doneAt: Date | null;
}

export interface RevisionReport {
  id: string;
  kind: string; // „Výchozí revize elektro“, „Tlaková zkouška“…
  number: string;
  date: Date;
  technician: string;
  result: 'ok' | 'defects';
  note: string;
  /** Kdy je potřeba další revize (opakované revize). */
  nextDue: Date | null;
}

export interface SafetyBriefing {
  text: string;
  /** uid → kdy potvrdil, že byl poučen. */
  confirmations: Record<string, Date>;
}

export interface Client {
  id: string;
  name: string;
  ico: string;
  phone: string;
  email: string;
  address: string;
  note: string;
}

export interface RecurringPlan {
  id: string;
  title: string;
  trade: Trade;
  clientName: string;
  clientPhone: string;
  address: string;
  intervalMonths: number;
  nextDate: Date;
  revenue: number;
  laborHours: number;
  assignedWorkerIds: string[];
  templateId: string | null;
  active: boolean;
  lastJobId: string | null;
}

export type CertKind = 'vyhl50' | 'fgas' | 'welding' | 'heights' | 'bozp' | 'driving' | 'other';

export interface Certificate {
  id: string;
  uid: string;
  kind: CertKind;
  label: string; // „§ 6 vyhl. 50/1978“, „Svářečský průkaz ZK 135“…
  number: string;
  validUntil: Date | null;
}

export type AuditKind =
  | 'created' | 'status' | 'progress' | 'stage' | 'material' | 'extra' | 'checklist'
  | 'handover' | 'photo' | 'note' | 'edit' | 'invoice' | 'payment' | 'revision' | 'safety' | 'diary';

/** Záznam historie změn. Ze záznamů zakázky se skládá stavební deník. */
export interface AuditEntry {
  id: string;
  jobId: string | null;
  at: Date;
  by: string;
  kind: AuditKind;
  text: string;
}
