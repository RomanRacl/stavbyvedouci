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
  createdAt: Date;
  updatedAt: Date;
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
