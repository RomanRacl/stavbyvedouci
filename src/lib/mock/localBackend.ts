import type {
  AuditEntry,
  AuditKind,
  Certificate,
  Client,
  RecurringPlan,
  RevisionReport,
  Stage,
  CompanySettings,
  Payment,
  Quote,
  ChecklistItem,
  ExtraWork,
  Handover,
  Job,
  JobNote,
  JobPhoto,
  MaterialItem,
  MaterialPlanLine,
  Member,
  MaterialUsage,
  OrderLine,
  PhotoTag,
  JobTemplate,
  PurchaseOrder,
  StockLocation,
  StockMove,
  Supplier,
  TimeLog,
  Van,
} from '@/types/firestore';
import type { ImportRow } from '@/lib/import/priceList';
import { stockAt, vanOf } from '@/lib/stock';
import { checklistOf, DEFAULT_HOURLY_COST, extraWorkOf, workedMs } from '@/lib/jobDefaults';
import { compressImage } from '@/lib/photos/compress';
import { deletePhotoBlob, forgetPhotoUrl, putPhotoBlob } from '@/lib/photos/photoBlobs';
import {
  mockJobs,
  mockMaterials,
  mockMaterialUsage,
  mockMembers,
  mockNotes,
  mockStockMoves,
  mockSuppliers,
  mockTemplates,
  mockVans,
  mockSettings,
  mockQuotes,
  mockTimeLogs,
  mockDayReports,
  mockHistoryJobs,
  mockCertificates,
  mockRecurring,
  mockAudit,
} from './dashboard.mock';
import { describeChanges } from '@/lib/audit';
import { progressFromStages, safetyOf } from '@/lib/operations';
import { quoteHours, quoteTotals } from '@/lib/money';
import { readStore, updateStore, type Stored } from './localStore';

/**
 * „Server“ pro režim bez Firebase. Každá funkce odpovídá budoucí operaci ve Firestore
 * (zápis dokumentu + přepočet, který v produkci udělá Cloud Function).
 * UI volá jen tyto funkce, takže výměna za Firestore nezmění komponenty.
 */

export interface Snapshot {
  jobs: Job[];
  members: Member[];
  usage: MaterialUsage[];
  catalog: MaterialItem[];
  photos: JobPhoto[];
  notes: JobNote[];
  timeLogs: TimeLog[];
  dayReports: Record<string, Date>;
  vans: Van[];
  stockMoves: StockMove[];
  orders: PurchaseOrder[];
  templates: JobTemplate[];
  suppliers: Supplier[];
  settings: CompanySettings;
  quotes: Quote[];
  audit: AuditEntry[];
  clients: Client[];
  recurring: RecurringPlan[];
  certificates: Certificate[];
}

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function build(s: Stored): Snapshot {
  const jobs = [...s.created, ...mockJobs, ...mockHistoryJobs]
    .filter((j) => !s.deleted.includes(j.id))
    .map((j) => (s.patches[j.id] ? { ...j, ...s.patches[j.id] } : j));
  const members = mockMembers.map((m) => (m.uid in s.timers ? { ...m, activeTimer: s.timers[m.uid] } : m));
  return {
    jobs,
    members,
    usage: [...s.usage, ...mockMaterialUsage],
    catalog: s.catalog ?? mockMaterials,
    photos: s.photos.filter((p) => !s.deleted.includes(p.jobId)),
    notes: [...mockNotes, ...s.notes].filter((n) => !s.deleted.includes(n.jobId)),
    timeLogs: [...s.timeLogs, ...mockTimeLogs],
    dayReports: { ...mockDayReports, ...s.dayReports },
    vans: mockVans,
    stockMoves: [...mockStockMoves, ...s.stockMoves],
    orders: s.orders,
    templates: s.templates ?? mockTemplates,
    suppliers: s.suppliers ?? mockSuppliers,
    settings: s.settings ?? mockSettings,
    quotes: s.quotes ?? mockQuotes,
    audit: [...mockAudit, ...s.audit].filter((a) => !a.jobId || !s.deleted.includes(a.jobId)),
    clients: s.clients,
    recurring: s.recurring ?? mockRecurring,
    certificates: s.certificates ?? mockCertificates,
  };
}

/* ---------- historie změn ---------- */

/** Kdo právě mění data. Operace z mobilu ho nastaví na dělníka, jinak je to kancelář. */
const OFFICE_UID = 'u_owner';
let actor = OFFICE_UID;
function as<T>(uid: string, fn: () => T): T {
  const prev = actor;
  actor = uid;
  try {
    return fn();
  } finally {
    actor = prev;
  }
}

function logIn(s: Stored, jobId: string | null, kind: AuditKind, text: string, by = actor): Stored {
  const entry: AuditEntry = { id: newId('au'), jobId, at: new Date(), by, kind, text };
  return { ...s, audit: [...s.audit, entry] };
}

export const getSnapshot = (): Snapshot => build(readStore());

/** Úprava zakázky – nové zakázky se mění na místě, ukázkové přes patch. */
function patchIn(s: Stored, jobId: string, patch: Partial<Job>): Stored {
  const before = build(s).jobs.find((j) => j.id === jobId);
  // Etapy určují dokončenost zakázky, pokud existují.
  const stages = patch.stages ?? before?.stages;
  const withProgress = stages?.length && patch.progressPct === undefined && patch.stages ? { ...patch, progressPct: progressFromStages(stages) } : patch;
  const stamped = { ...withProgress, updatedAt: new Date() };
  let next: Stored = s.created.some((j) => j.id === jobId)
    ? { ...s, created: s.created.map((j) => (j.id === jobId ? { ...j, ...stamped } : j)) }
    : { ...s, patches: { ...s.patches, [jobId]: { ...s.patches[jobId], ...stamped } } };
  if (before) {
    const after = { ...before, ...stamped } as Job;
    for (const c of describeChanges(before, after, mockMembers)) next = logIn(next, jobId, c.kind, c.text);
  }
  return next;
}

/**
 * Zastaví běžící měření, zapíše časový záznam a připíše hodiny a náklad na zakázku.
 * `endAt` umožní opravit zapomenutý časovač („skončil jsem v 16:30“).
 */
function stopIn(s: Stored, uid: string, endAt = new Date()): { s: Stored; minutes: number; job: Job | null } {
  const snap = build(s);
  const member = snap.members.find((m) => m.uid === uid);
  const timer = member?.activeTimer;
  if (!member || !timer) return { s, minutes: 0, job: null };

  const end = new Date(Math.max(timer.startedAt.getTime() + 60_000, Math.min(endAt.getTime(), Date.now())));
  // Běží-li přestávka, končí nejpozději s koncem práce.
  const effective = timer.pausedAt && timer.pausedAt > end ? { ...timer, pausedAt: end } : timer;
  const minutes = Math.max(1, Math.round(workedMs(effective, end.getTime()) / 60000));
  const totalMin = Math.round((end.getTime() - timer.startedAt.getTime()) / 60000);
  const hours = minutes / 60;
  const job = snap.jobs.find((j) => j.id === timer.jobId) ?? null;

  const log: TimeLog = {
    id: timer.logId,
    jobId: timer.jobId,
    workerId: uid,
    startedAt: timer.startedAt,
    endedAt: end,
    durationMin: minutes,
    costSnapshot: Math.round(hours * member.hourlyCost),
    geoStart: null,
    breakMin: Math.max(0, totalMin - minutes),
    stageId: timer.stageId ?? null,
  };
  let next: Stored = { ...s, timers: { ...s.timers, [uid]: null }, timeLogs: [log, ...s.timeLogs] };
  if (job) {
    next = patchIn(next, job.id, {
      actuals: {
        ...job.actuals,
        laborHours: +(job.actuals.laborHours + hours).toFixed(2),
        laborCost: job.actuals.laborCost + Math.round(hours * member.hourlyCost),
        updatedAt: new Date(),
      },
    });
  }
  return { s: next, minutes, job };
}

export function createJob(job: Job) {
  updateStore((s) => logIn({ ...s, created: [job, ...s.created] }, job.id, 'created', `Zakázka založena: ${job.title}`));
}

export function patchJob(jobId: string, patch: Partial<Job>) {
  updateStore((s) => patchIn(s, jobId, patch));
}

/** Začít práci. Běží-li měření na jiné zakázce, nejdřív se ukončí. Naplánovaná zakázka přejde do „Probíhá“. */
export function startWork(uid: string, jobId: string, stageId: string | null = null): { stoppedJob: Job | null; stoppedMinutes: number } {
  let result = { stoppedJob: null as Job | null, stoppedMinutes: 0 };
  as(uid, () => updateStore((s) => {
    const stopped = stopIn(s, uid);
    result = { stoppedJob: stopped.job, stoppedMinutes: stopped.minutes };
    let next: Stored = {
      ...stopped.s,
      timers: { ...stopped.s.timers, [uid]: { logId: newId('tl'), jobId, startedAt: new Date(), pausedAt: null, pausedMs: 0, stageId } },
    };
    const job = build(next).jobs.find((j) => j.id === jobId);
    if (job?.status === 'scheduled') next = patchIn(next, jobId, { status: 'in_progress' });
    return next;
  }));
  return result;
}

export function stopWork(uid: string, endAt?: Date): { minutes: number; job: Job | null } {
  let result = { minutes: 0, job: null as Job | null };
  updateStore((s) => {
    const stopped = stopIn(s, uid, endAt);
    result = { minutes: stopped.minutes, job: stopped.job };
    return stopped.s;
  });
  return result;
}

/**
 * Výdej ze skladu: nejdřív z auta, ve kterém dělník jezdí, zbytek z hlavního skladu.
 * Když nikde nic není, jde výdej do minusu v autě – sklad pak ukáže, že je potřeba
 * dorovnat inventuru (materiál se třeba koupil po cestě).
 */
function issueMoves(s: Stored, uid: string, jobId: string, entries: MaterialUsage[]): StockMove[] {
  const snap = build(s);
  const van = vanOf(snap.vans, uid);
  const moves: StockMove[] = [];
  for (const e of entries) {
    const item = snap.catalog.find((c) => c.id === e.materialId);
    let left = e.qty;
    const take = (location: StockLocation, max: number) => {
      const qty = Math.min(left, Math.max(0, max));
      if (qty <= 0) return;
      moves.push({ id: newId('sm'), materialId: e.materialId, location, delta: -qty, kind: 'issue', at: e.usedAt, by: uid, ref: jobId });
      left -= qty;
    };
    if (van) take(`van:${van.id}`, item ? stockAt(item, snap.stockMoves, `van:${van.id}`) : 0);
    take('warehouse', item ? stockAt(item, snap.stockMoves, 'warehouse') : 0);
    if (left > 0) {
      moves.push({ id: newId('sm'), materialId: e.materialId, location: van ? `van:${van.id}` : 'warehouse', delta: -left, kind: 'issue', at: e.usedAt, by: uid, ref: jobId, note: 'nad stav skladu' });
    }
  }
  return moves;
}

/** Položka výdeje. U materiálu mimo plán se posílá i `line`, aby se dal do plánu doplnit. */
export interface IssueItem {
  materialId: string;
  qty: number;
  line?: Omit<MaterialPlanLine, 'plannedQty' | 'usedQty'>;
}

/** Výdej materiálu: záznam do logu + navýšení čerpání a nákladů na zakázce. Neplánovaný materiál se přidá s plánem 0. */
export function issueMaterial(uid: string, jobId: string, items: IssueItem[]) {
  as(uid, () => updateStore((s) => {
    const job = build(s).jobs.find((j) => j.id === jobId);
    if (!job) return s;
    const now = new Date();
    const extras: MaterialPlanLine[] = items
      .filter((i) => i.line && !job.materialPlan.some((l) => l.materialId === i.materialId))
      .map((i) => ({ ...i.line!, plannedQty: 0, usedQty: 0 }));
    const entries: MaterialUsage[] = [];
    let addedCost = 0;
    const plan = [...job.materialPlan, ...extras].map((line) => {
      const item = items.find((i) => i.materialId === line.materialId);
      if (!item || item.qty <= 0) return line;
      addedCost += item.qty * line.unitCost;
      entries.push({
        id: `mu_${now.getTime().toString(36)}_${line.materialId}`,
        jobId,
        materialId: line.materialId,
        qty: item.qty,
        unitCostSnapshot: line.unitCost,
        workerId: uid,
        usedAt: now,
        source: 'mobile',
      });
      return { ...line, usedQty: line.usedQty + item.qty };
    });
    const next = patchIn(s, jobId, {
      materialPlan: plan,
      actuals: { ...job.actuals, materialCost: job.actuals.materialCost + addedCost, updatedAt: now },
    });
    return { ...next, usage: [...entries, ...next.usage], stockMoves: [...issueMoves(s, uid, jobId, entries), ...next.stockMoves] };
  }));
}

/**
 * Plán materiálu z kanceláře. Rozpočet materiálu se přepočte ze součtu plánu,
 * aby prognóza a marže v dashboardu odpovídaly tomu, co se skutečně plánuje.
 */
export function setMaterialPlan(jobId: string, plan: MaterialPlanLine[]) {
  updateStore((s) => {
    const job = build(s).jobs.find((j) => j.id === jobId);
    if (!job) return s;
    const materialCost = plan.reduce((a, l) => a + l.plannedQty * l.unitCost, 0);
    return patchIn(s, jobId, { materialPlan: plan, budget: { ...job.budget, materialCost } });
  });
}

export function setProgress(jobId: string, progressPct: number, uid = OFFICE_UID) {
  as(uid, () => patchJob(jobId, { progressPct }));
}

/**
 * Předání ke schválení: 100 % hotovo, stav „Ke schválení“, předávací protokol,
 * vlastní běžící měření na zakázce se ukončí.
 */
export function submitForApproval(uid: string, jobId: string, handover: Omit<Handover, 'signedAt' | 'workerId'>) {
  as(uid, () => updateStore((s) => {
    const member = build(s).members.find((m) => m.uid === uid);
    const base = member?.activeTimer?.jobId === jobId ? stopIn(s, uid).s : s;
    return patchIn(base, jobId, {
      progressPct: 100,
      status: 'awaiting_approval',
      handover: { ...handover, signedAt: new Date(), workerId: uid },
    });
  }));
}

/* ---------- fotky ---------- */

/**
 * Přidá fotky k zakázce: zmenší je, soubory uloží do IndexedDB a metadata do úložiště.
 * Vrací počet úspěšně uložených. V produkci: uploadBytes do Storage + addDoc do `photos`.
 */
export async function addPhotos(uid: string, jobId: string, files: File[]): Promise<number> {
  const saved: JobPhoto[] = [];
  for (const file of files) {
    try {
      const { blob, width, height } = await compressImage(file);
      const id = `ph_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await putPhotoBlob(id, blob);
      saved.push({
        id,
        jobId,
        workerId: uid,
        takenAt: new Date(file.lastModified || Date.now()),
        storagePath: `jobs/${jobId}/photos/${id}.jpg`,
        width,
        height,
        sizeBytes: blob.size,
      });
    } catch {
      /* poškozený nebo nepodporovaný soubor přeskočíme, ostatní uložíme */
    }
  }
  if (saved.length) updateStore((s) => logIn({ ...s, photos: [...saved, ...s.photos] }, jobId, 'photo', `Přidáno fotek: ${saved.length}`, uid));
  return saved.length;
}

export async function deletePhoto(photoId: string) {
  updateStore((s) => ({ ...s, photos: s.photos.filter((p) => p.id !== photoId) }));
  forgetPhotoUrl(photoId);
  await deletePhotoBlob(photoId).catch(() => undefined);
}

export function setPhotoTag(photoId: string, tag: PhotoTag | null) {
  updateStore((s) => ({ ...s, photos: s.photos.map((p) => (p.id === photoId ? { ...p, tag } : p)) }));
}

/* ---------- přestávky ---------- */

export function pauseWork(uid: string) {
  updateStore((s) => {
    const t = s.timers[uid] ?? build(s).members.find((m) => m.uid === uid)?.activeTimer;
    if (!t || t.pausedAt) return s;
    return { ...s, timers: { ...s.timers, [uid]: { ...t, pausedAt: new Date() } } };
  });
}

export function resumeWork(uid: string) {
  updateStore((s) => {
    const t = s.timers[uid] ?? build(s).members.find((m) => m.uid === uid)?.activeTimer;
    if (!t?.pausedAt) return s;
    const pausedMs = (t.pausedMs ?? 0) + (Date.now() - t.pausedAt.getTime());
    return { ...s, timers: { ...s.timers, [uid]: { ...t, pausedAt: null, pausedMs } } };
  });
}

/* ---------- úprava a mazání zakázek ---------- */

export function updateJob(jobId: string, patch: Partial<Job>) {
  patchJob(jobId, patch);
}

/** Smaže zakázku. Kdo na ní měří čas, tomu se měření ukončí a zapíše. */
export function deleteJob(jobId: string) {
  updateStore((s) => {
    let next = s;
    for (const m of build(s).members) {
      if (m.activeTimer?.jobId === jobId) next = stopIn(next, m.uid).s;
    }
    const job = build(s).jobs.find((j) => j.id === jobId);
    return logIn({ ...next, deleted: [...next.deleted, jobId] }, null, 'edit', `Smazána zakázka ${job?.code ?? ''} ${job?.title ?? ''}`);
  });
}

/* ---------- kontrolní seznam ---------- */

export function setChecklist(jobId: string, checklist: ChecklistItem[]) {
  patchJob(jobId, { checklist });
}

export function toggleChecklistItem(uid: string, jobId: string, itemId: string) {
  as(uid, () => updateStore((s) => {
    const job = build(s).jobs.find((j) => j.id === jobId);
    if (!job) return s;
    const checklist = checklistOf(job).map((i) =>
      i.id !== itemId ? i : i.doneAt ? { ...i, doneAt: null, doneBy: null } : { ...i, doneAt: new Date(), doneBy: uid },
    );
    return patchIn(s, jobId, { checklist });
  }));
}

/* ---------- vícepráce ---------- */

export function addExtraWork(uid: string, jobId: string, input: { description: string; hours: number; materialCost: number }) {
  as(uid, () => updateStore((s) => {
    const job = build(s).jobs.find((j) => j.id === jobId);
    if (!job) return s;
    const item: ExtraWork = {
      id: newId('ew'),
      ...input,
      price: null,
      status: 'pending',
      createdBy: uid,
      createdAt: new Date(),
      decidedAt: null,
    };
    return patchIn(s, jobId, { extraWork: [item, ...extraWorkOf(job)] });
  }));
}

/** Schválení víceprací navýší cenu zakázky i rozpočet, aby marže zůstala pravdivá. */
export function decideExtraWork(jobId: string, extraId: string, decision: { approve: true; price: number } | { approve: false }) {
  updateStore((s) => {
    const job = build(s).jobs.find((j) => j.id === jobId);
    const item = job && extraWorkOf(job).find((e) => e.id === extraId);
    if (!job || !item || item.status !== 'pending') return s;
    const decided: ExtraWork = decision.approve
      ? { ...item, status: 'approved', price: decision.price, decidedAt: new Date() }
      : { ...item, status: 'rejected', decidedAt: new Date() };
    const extraWork = extraWorkOf(job).map((e) => (e.id === extraId ? decided : e));
    if (!decision.approve) return patchIn(s, jobId, { extraWork });

    const crew = build(s).members.filter((m) => job.assignedWorkerIds.includes(m.uid));
    const rate = crew.length ? crew.reduce((a, m) => a + m.hourlyCost, 0) / crew.length : DEFAULT_HOURLY_COST;
    return patchIn(s, jobId, {
      extraWork,
      budget: {
        revenue: job.budget.revenue + decision.price,
        laborHours: job.budget.laborHours + item.hours,
        laborCost: job.budget.laborCost + Math.round(item.hours * rate),
        materialCost: job.budget.materialCost + item.materialCost,
      },
    });
  });
}

/* ---------- zprávy ---------- */

export function addNote(uid: string, jobId: string, text: string) {
  const note: JobNote = { id: newId('nt'), jobId, authorId: uid, text: text.trim(), createdAt: new Date() };
  if (!note.text) return;
  updateStore((s) => logIn({ ...s, notes: [...s.notes, note] }, jobId, 'note', note.text.length > 120 ? `${note.text.slice(0, 117)}…` : note.text, uid));
}

/* ---------- denní výkaz ---------- */

export function confirmDay(uid: string, date: string) {
  updateStore((s) => ({ ...s, dayReports: { ...s.dayReports, [`${uid}_${date}`]: new Date() } }));
}

/* ---------- vratky ---------- */

/**
 * Vrácení nespotřebovaného materiálu ze zakázky: sníží vydané množství a náklady
 * zakázky a vrátí materiál do auta dělníka (nebo do hlavního skladu).
 */
export function returnMaterial(uid: string, jobId: string, items: Array<{ materialId: string; qty: number }>) {
  as(uid, () => updateStore((s) => {
    const snap = build(s);
    const job = snap.jobs.find((j) => j.id === jobId);
    if (!job) return s;
    const van = vanOf(snap.vans, uid);
    const location: StockLocation = van ? `van:${van.id}` : 'warehouse';
    const now = new Date();
    let saved = 0;
    const entries: MaterialUsage[] = [];
    const moves: StockMove[] = [];
    const plan = job.materialPlan.map((l) => {
      const item = items.find((i) => i.materialId === l.materialId);
      const qty = Math.min(item?.qty ?? 0, l.usedQty);
      if (qty <= 0) return l;
      saved += qty * l.unitCost;
      entries.push({ id: newId('mu'), jobId, materialId: l.materialId, qty: -qty, unitCostSnapshot: l.unitCost, workerId: uid, usedAt: now, source: 'mobile' });
      moves.push({ id: newId('sm'), materialId: l.materialId, location, delta: qty, kind: 'return', at: now, by: uid, ref: jobId });
      return { ...l, usedQty: l.usedQty - qty };
    });
    if (!entries.length) return s;
    const next = patchIn(s, jobId, {
      materialPlan: plan,
      actuals: { ...job.actuals, materialCost: Math.max(0, job.actuals.materialCost - saved), updatedAt: now },
    });
    return { ...next, usage: [...entries, ...next.usage], stockMoves: [...moves, ...next.stockMoves] };
  }));
}

/* ---------- katalog ---------- */

const catalogOf = (s: Stored) => s.catalog ?? mockMaterials;

export function saveCatalogItem(item: MaterialItem) {
  updateStore((s) => {
    const cat = catalogOf(s);
    const exists = cat.some((c) => c.id === item.id);
    return { ...s, catalog: exists ? cat.map((c) => (c.id === item.id ? item : c)) : [item, ...cat] };
  });
}

export function deleteCatalogItem(id: string) {
  updateStore((s) => ({ ...s, catalog: catalogOf(s).filter((c) => c.id !== id) }));
}

export const newMaterialId = () => newId('mat');

/**
 * Import ceníku: položky se párují podle kódu (nebo EAN, nebo přesného názvu).
 * Existujícím se aktualizuje cena (a doplní EAN), nové se přidají s nulovým stavem.
 */
export function importPriceList(rows: ImportRow[], supplier: string): { added: number; updated: number } {
  let added = 0;
  let updated = 0;
  updateStore((s) => {
    const cat = [...catalogOf(s)];
    for (const r of rows) {
      const i = cat.findIndex(
        (c) =>
          (r.sku && c.sku.toLowerCase() === r.sku.toLowerCase()) ||
          (r.barcode && c.barcode === r.barcode) ||
          (!r.sku && c.name.toLowerCase() === r.name.toLowerCase()),
      );
      if (i >= 0) {
        const c = cat[i];
        cat[i] = { ...c, unitCost: r.unitCost, barcode: r.barcode || c.barcode, supplier: supplier || c.supplier };
        if (c.unitCost !== r.unitCost) updated++;
      } else if (r.name) {
        cat.push({
          id: newId('mat'),
          sku: r.sku || r.barcode || r.name.slice(0, 12).toUpperCase(),
          name: r.name,
          category: r.category || 'Ostatní',
          unit: r.unit,
          unitCost: r.unitCost,
          stockQty: 0,
          reorderPoint: 0,
          supplier,
          barcode: r.barcode || undefined,
        });
        added++;
      }
    }
    const suppliers = s.suppliers ?? mockSuppliers;
    return {
      ...s,
      catalog: cat,
      suppliers: supplier && !suppliers.some((x) => x.name === supplier) ? [...suppliers, { name: supplier, email: '' }] : s.suppliers,
    };
  });
  return { added, updated };
}

export function setSupplierEmail(name: string, email: string) {
  updateStore((s) => {
    const list = s.suppliers ?? mockSuppliers;
    const exists = list.some((x) => x.name === name);
    return { ...s, suppliers: exists ? list.map((x) => (x.name === name ? { ...x, email } : x)) : [...list, { name, email }] };
  });
}

/* ---------- sklad a auta ---------- */

/** Převod mezi hlavním skladem a autem (naložení / vyložení). */
export function transferStock(by: string, materialId: string, qty: number, from: StockLocation, to: StockLocation) {
  if (qty <= 0 || from === to) return;
  const ref = newId('tr');
  const at = new Date();
  updateStore((s) => ({
    ...s,
    stockMoves: [
      { id: newId('sm'), materialId, location: to, delta: qty, kind: 'transfer', at, by, ref },
      { id: newId('sm'), materialId, location: from, delta: -qty, kind: 'transfer', at, by, ref },
      ...s.stockMoves,
    ],
  }));
}

/** Inventura: zapíše rozdíl mezi evidovaným a skutečně napočítaným stavem. */
export function adjustStock(by: string, materialId: string, location: StockLocation, countedQty: number) {
  updateStore((s) => {
    const snap = build(s);
    const item = snap.catalog.find((c) => c.id === materialId);
    if (!item) return s;
    const delta = countedQty - stockAt(item, snap.stockMoves, location);
    if (!delta) return s;
    return {
      ...s,
      stockMoves: [{ id: newId('sm'), materialId, location, delta, kind: 'adjust', at: new Date(), by, note: 'inventura' }, ...s.stockMoves],
    };
  });
}

/* ---------- objednávky ---------- */

export function createOrder(supplier: string, lines: OrderLine[], jobId: string | null = null): PurchaseOrder {
  const year = new Date().getFullYear();
  let order!: PurchaseOrder;
  updateStore((s) => {
    const max = s.orders.reduce((m, o) => Math.max(m, Number(o.number.split('-')[2]) || 0), 0);
    order = {
      id: newId('po'),
      number: `OBJ-${year}-${String(max + 1).padStart(4, '0')}`,
      supplier,
      lines: lines.filter((l) => l.qty > 0),
      status: 'draft',
      jobId,
      note: '',
      createdAt: new Date(),
      sentAt: null,
      receivedAt: null,
    };
    return { ...s, orders: [order, ...s.orders] };
  });
  return order;
}

export function updateOrder(id: string, patch: Partial<Pick<PurchaseOrder, 'lines' | 'note'>>) {
  updateStore((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id && o.status === 'draft' ? { ...o, ...patch } : o)) }));
}

export function markOrderSent(id: string) {
  updateStore((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id && o.status === 'draft' ? { ...o, status: 'sent', sentAt: new Date() } : o)) }));
}

/** Příjem objednávky: celé množství naskladní do hlavního skladu. */
export function receiveOrder(by: string, id: string) {
  updateStore((s) => {
    const order = s.orders.find((o) => o.id === id);
    if (!order || order.status === 'received') return s;
    const at = new Date();
    const moves: StockMove[] = order.lines.map((l) => ({
      id: newId('sm'),
      materialId: l.materialId,
      location: 'warehouse',
      delta: l.qty,
      kind: 'receive',
      at,
      by,
      ref: order.id,
    }));
    return {
      ...s,
      orders: s.orders.map((o) => (o.id === id ? { ...o, status: 'received', receivedAt: at } : o)),
      stockMoves: [...moves, ...s.stockMoves],
    };
  });
}

export function deleteOrder(id: string) {
  updateStore((s) => ({ ...s, orders: s.orders.filter((o) => !(o.id === id && o.status === 'draft')) }));
}

/* ---------- šablony ---------- */

const templatesOf = (s: Stored) => s.templates ?? mockTemplates;

export function saveTemplate(t: JobTemplate) {
  updateStore((s) => {
    const list = templatesOf(s);
    return { ...s, templates: list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [t, ...list] };
  });
}

export function deleteTemplate(id: string) {
  updateStore((s) => ({ ...s, templates: templatesOf(s).filter((t) => t.id !== id) }));
}

/** Šablona z existující zakázky – vezme plánované množství, hodiny, cenu a kontrolní seznam. */
export function templateFromJob(job: Job, name: string): JobTemplate {
  const t: JobTemplate = {
    id: newId('tpl'),
    name,
    trade: job.trade,
    title: job.title,
    revenue: job.budget.revenue,
    laborHours: job.budget.laborHours,
    materialLines: job.materialPlan.filter((l) => l.plannedQty > 0).map((l) => ({ materialId: l.materialId, qty: l.plannedQty })),
    checklist: checklistOf(job).map((i) => ({ text: i.text, required: i.required })),
  };
  saveTemplate(t);
  return t;
}

/* ---------- nastavení firmy ---------- */

export function saveSettings(patch: Partial<CompanySettings>) {
  updateStore((s) => ({ ...s, settings: { ...(s.settings ?? mockSettings), ...patch } }));
}

/* ---------- nabídky ---------- */

const quotesOf = (s: Stored) => s.quotes ?? mockQuotes;
const nextNumber = (prefix: string, numbers: string[]) => {
  const year = new Date().getFullYear();
  const max = numbers.filter((n) => n.startsWith(`${prefix}-${year}-`)).reduce((m, n) => Math.max(m, Number(n.split('-')[2]) || 0), 0);
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
};

export function createQuote(input: Omit<Quote, 'id' | 'number' | 'status' | 'createdAt' | 'sentAt' | 'decidedAt' | 'jobId'>): Quote {
  let quote!: Quote;
  updateStore((s) => {
    const list = quotesOf(s);
    quote = {
      ...input,
      id: newId('q'),
      number: nextNumber('NAB', list.map((q) => q.number)),
      status: 'draft',
      createdAt: new Date(),
      sentAt: null,
      decidedAt: null,
      jobId: null,
    };
    return { ...s, quotes: [quote, ...list] };
  });
  return quote;
}

export function updateQuote(id: string, patch: Partial<Quote>) {
  updateStore((s) => ({ ...s, quotes: quotesOf(s).map((q) => (q.id === id && q.status !== 'accepted' ? { ...q, ...patch } : q)) }));
}

export function setQuoteStatus(id: string, status: 'sent' | 'rejected' | 'draft') {
  updateStore((s) => ({
    ...s,
    quotes: quotesOf(s).map((q) =>
      q.id !== id || q.status === 'accepted'
        ? q
        : { ...q, status, sentAt: status === 'sent' ? q.sentAt ?? new Date() : q.sentAt, decidedAt: status === 'rejected' ? new Date() : null },
    ),
  }));
}

export function deleteQuote(id: string) {
  updateStore((s) => ({ ...s, quotes: quotesOf(s).filter((q) => !(q.id === id && q.status === 'draft')) }));
}

/**
 * Zákazník nabídku přijal → vznikne zakázka. Cena = součet nabídky bez DPH,
 * hodiny z řádků práce, plán materiálu z řádků navázaných na katalog (s nákupní cenou),
 * kontrolní seznam ze šablony nabídky nebo výchozí podle oboru.
 */
export function acceptQuote(id: string, plan: { start: Date; due: Date; workerIds: string[] }): Job | null {
  let created: Job | null = null;
  updateStore((s) => {
    const snap = build(s);
    const q = snap.quotes.find((x) => x.id === id);
    if (!q || q.status === 'accepted') return s;
    const now = new Date();
    const totals = quoteTotals(q);
    const hours = quoteHours(q);
    const crew = snap.members.filter((m) => plan.workerIds.includes(m.uid));
    const rate = crew.length ? crew.reduce((a, m) => a + m.hourlyCost, 0) / crew.length : DEFAULT_HOURLY_COST;
    const materialPlan: MaterialPlanLine[] = q.items.flatMap((i) => {
      const c = i.kind === 'material' && i.materialId ? snap.catalog.find((x) => x.id === i.materialId) : null;
      return c ? [{ materialId: c.id, name: c.name, unit: c.unit, unitCost: c.unitCost, plannedQty: i.qty, usedQty: 0 }] : [];
    });
    // Materiál mimo katalog: náklad odhadneme z prodejní ceny bez přirážky.
    const settings = snap.settings;
    const looseMaterial = q.items.filter((i) => i.kind === 'material' && !materialPlan.some((m) => m.materialId === i.materialId)).reduce((a, i) => a + (i.qty * i.unitPrice) / settings.materialMarkup, 0);
    const tpl = q.templateId ? snap.templates.find((t) => t.id === q.templateId) : null;
    const max = snap.jobs.reduce((m, j) => Math.max(m, Number(j.code.split('-')[2]) || 0), 0);
    const job: Job = {
      id: newId('job'),
      code: `Z-${now.getFullYear()}-${String(max + 1).padStart(4, '0')}`,
      title: q.title,
      trade: q.trade,
      status: 'scheduled',
      client: { name: q.client.name, phone: q.client.phone, address: q.client.address, geo: null },
      assignedWorkerIds: plan.workerIds,
      schedule: { start: plan.start, due: plan.due },
      budget: {
        revenue: Math.round(totals.net),
        laborHours: hours,
        laborCost: Math.round(hours * rate),
        materialCost: Math.round(materialPlan.reduce((a, l) => a + l.plannedQty * l.unitCost, 0) + looseMaterial),
      },
      actuals: { laborHours: 0, laborCost: 0, materialCost: 0, updatedAt: now },
      progressPct: 0,
      materialPlan,
      checklist: tpl
        ? tpl.checklist.map((c, i) => ({ id: `ck_${now.getTime().toString(36)}_${i}`, text: c.text, required: c.required, doneBy: null, doneAt: null }))
        : undefined,
      extraWork: [],
      handover: null,
      vatMode: q.vatMode,
      payments: [],
      invoice: null,
      quoteId: q.id,
      approval: null,
      createdAt: now,
      updatedAt: now,
    };
    created = job;
    return {
      ...s,
      created: [job, ...s.created],
      quotes: quotesOf(s).map((x) => (x.id === id ? { ...x, status: 'accepted', decidedAt: now, jobId: job.id } : x)),
    };
  });
  return created;
}

/* ---------- zálohy a fakturace ---------- */

export function addPayment(jobId: string, input: { label: string; amount: number; dueDate: Date }) {
  updateStore((s) => {
    const job = build(s).jobs.find((j) => j.id === jobId);
    if (!job) return s;
    const p: Payment = { id: newId('pay'), ...input, issuedAt: new Date(), paidAt: null };
    return patchIn(s, jobId, { payments: [...(job.payments ?? []), p] });
  });
}

export function setPaymentPaid(jobId: string, paymentId: string, paid: boolean) {
  updateStore((s) => {
    const job = build(s).jobs.find((j) => j.id === jobId);
    if (!job) return s;
    return patchIn(s, jobId, { payments: (job.payments ?? []).map((p) => (p.id === paymentId ? { ...p, paidAt: paid ? new Date() : null } : p)) });
  });
}

export function deletePayment(jobId: string, paymentId: string) {
  updateStore((s) => {
    const job = build(s).jobs.find((j) => j.id === jobId);
    if (!job) return s;
    return patchIn(s, jobId, { payments: (job.payments ?? []).filter((p) => !(p.id === paymentId && !p.paidAt)) });
  });
}

/** Vystaví podklad k fakturaci (číslo z řady PF) a označí zakázku jako fakturovanou. */
export function issueInvoice(jobId: string, opts: { taxDate: Date; dueDays: number }) {
  updateStore((s) => {
    const snap = build(s);
    const job = snap.jobs.find((j) => j.id === jobId);
    if (!job || job.invoice) return s;
    const issuedAt = new Date();
    const dueDate = new Date(issuedAt.getTime() + opts.dueDays * 86_400_000);
    const number = nextNumber('PF', snap.jobs.flatMap((j) => (j.invoice ? [j.invoice.number] : [])));
    return patchIn(s, jobId, { status: 'invoiced', invoice: { number, issuedAt, taxDate: opts.taxDate, dueDate } });
  });
}

/** Zrušení podkladu (např. chyba) – zakázka se vrátí do stavu Schváleno. */
export function cancelInvoice(jobId: string) {
  patchJob(jobId, { status: 'approved', invoice: null });
}

/* ---------- fáze 5: etapy ---------- */

export function setStages(jobId: string, stages: Stage[]) {
  patchJob(jobId, { stages });
}

export function setStageProgress(uid: string, jobId: string, stageId: string, progressPct: number) {
  as(uid, () =>
    updateStore((s) => {
      const job = build(s).jobs.find((j) => j.id === jobId);
      if (!job?.stages) return s;
      const stages = job.stages.map((st) => (st.id === stageId ? { ...st, progressPct, doneAt: progressPct >= 100 ? st.doneAt ?? new Date() : null } : st));
      return patchIn(s, jobId, { stages });
    }),
  );
}

/** Přepne etapu běžícího měření: dosavadní čas se zapíše k původní etapě, měří se dál. */
export function switchStage(uid: string, stageId: string | null) {
  as(uid, () =>
    updateStore((s) => {
      const t = build(s).members.find((m) => m.uid === uid)?.activeTimer;
      if (!t || (t.stageId ?? null) === stageId) return s;
      const stopped = stopIn(s, uid);
      return { ...stopped.s, timers: { ...stopped.s.timers, [uid]: { logId: newId('tl'), jobId: t.jobId, startedAt: new Date(), pausedAt: null, pausedMs: 0, stageId } } };
    }),
  );
}

/* ---------- revize ---------- */

export function addRevision(jobId: string, r: Omit<RevisionReport, 'id'>) {
  updateStore((s) => {
    const job = build(s).jobs.find((j) => j.id === jobId);
    if (!job) return s;
    return patchIn(s, jobId, { revisions: [...(job.revisions ?? []), { ...r, id: newId('rv') }] });
  });
}

export function deleteRevision(jobId: string, id: string) {
  updateStore((s) => {
    const job = build(s).jobs.find((j) => j.id === jobId);
    if (!job) return s;
    return patchIn(s, jobId, { revisions: (job.revisions ?? []).filter((r) => r.id !== id) });
  });
}

/* ---------- BOZP ---------- */

export function setSafetyText(jobId: string, text: string) {
  updateStore((s) => {
    const job = build(s).jobs.find((j) => j.id === jobId);
    if (!job) return s;
    // Změna textu ruší dosavadní potvrzení – lidé musí potvrdit novou verzi.
    return patchIn(s, jobId, { safety: { text, confirmations: {} } });
  });
}

export function confirmSafety(uid: string, jobId: string) {
  as(uid, () =>
    updateStore((s) => {
      const job = build(s).jobs.find((j) => j.id === jobId);
      if (!job) return s;
      const sf = safetyOf(job);
      return patchIn(s, jobId, { safety: { ...sf, confirmations: { ...sf.confirmations, [uid]: new Date() } } });
    }),
  );
}

/* ---------- stavební deník ---------- */

export function addDiaryEntry(uid: string, jobId: string, text: string) {
  if (!text.trim()) return;
  updateStore((s) => logIn(s, jobId, 'diary', text.trim(), uid));
}

/* ---------- zákazníci ---------- */

export function saveClient(c: Client) {
  updateStore((s) => ({ ...s, clients: s.clients.some((x) => x.id === c.id) ? s.clients.map((x) => (x.id === c.id ? c : x)) : [...s.clients, c] }));
}

/* ---------- pravidelný servis ---------- */

const recurringOf = (s: Stored) => s.recurring ?? mockRecurring;

export function saveRecurring(plan: RecurringPlan) {
  updateStore((s) => {
    const list = recurringOf(s);
    const p = plan.id ? plan : { ...plan, id: newId('rec') };
    return { ...s, recurring: list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p] };
  });
}

export function deleteRecurring(id: string) {
  updateStore((s) => ({ ...s, recurring: recurringOf(s).filter((x) => x.id !== id) }));
}

/** Vytvoří zakázku z pravidelného servisu a posune další termín o interval. */
export function createFromRecurring(id: string): Job | null {
  let created: Job | null = null;
  updateStore((s) => {
    const snap = build(s);
    const plan = recurringOf(s).find((x) => x.id === id);
    if (!plan) return s;
    const now = new Date();
    const start = plan.nextDate.getTime() < now.getTime() ? now : plan.nextDate;
    const due = new Date(start.getTime() + Math.max(1, Math.ceil(plan.laborHours / 8)) * 86_400_000);
    const tpl = plan.templateId ? snap.templates.find((t) => t.id === plan.templateId) : null;
    const max = snap.jobs.reduce((m, j) => Math.max(m, Number(j.code.split('-')[2]) || 0), 0);
    const crew = snap.members.filter((m) => plan.assignedWorkerIds.includes(m.uid));
    const rate = crew.length ? crew.reduce((a, m) => a + m.hourlyCost, 0) / crew.length : DEFAULT_HOURLY_COST;
    const job: Job = {
      id: newId('job'),
      code: `Z-${now.getFullYear()}-${String(max + 1).padStart(4, '0')}`,
      title: `${plan.title} (${start.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })})`,
      trade: plan.trade,
      status: 'scheduled',
      client: { name: plan.clientName, phone: plan.clientPhone, address: plan.address, geo: null },
      assignedWorkerIds: plan.assignedWorkerIds,
      schedule: { start, due },
      budget: { revenue: plan.revenue, laborHours: plan.laborHours, laborCost: Math.round(plan.laborHours * rate), materialCost: 0 },
      actuals: { laborHours: 0, laborCost: 0, materialCost: 0, updatedAt: now },
      progressPct: 0,
      materialPlan: [],
      checklist: tpl ? tpl.checklist.map((c, i) => ({ id: `ck_${now.getTime().toString(36)}_${i}`, text: c.text, required: c.required, doneBy: null, doneAt: null })) : undefined,
      extraWork: [],
      handover: null,
      payments: [],
      invoice: null,
      recurringId: plan.id,
      approval: null,
      createdAt: now,
      updatedAt: now,
    };
    created = job;
    const next = new Date(plan.nextDate);
    next.setMonth(next.getMonth() + plan.intervalMonths);
    while (next.getTime() < now.getTime()) next.setMonth(next.getMonth() + plan.intervalMonths);
    return logIn(
      { ...s, created: [job, ...s.created], recurring: recurringOf(s).map((x) => (x.id === id ? { ...x, nextDate: next, lastJobId: job.id } : x)) },
      job.id,
      'created',
      `Zakázka založena z pravidelného servisu: ${plan.title}`,
    );
  });
  return created;
}

/* ---------- certifikáty ---------- */

const certsOf = (s: Stored) => s.certificates ?? mockCertificates;

export function saveCertificate(c: Certificate) {
  updateStore((s) => {
    const list = certsOf(s);
    const cert = c.id ? c : { ...c, id: newId('cert') };
    return { ...s, certificates: list.some((x) => x.id === cert.id) ? list.map((x) => (x.id === cert.id ? cert : x)) : [...list, cert] };
  });
}

export function deleteCertificate(id: string) {
  updateStore((s) => ({ ...s, certificates: certsOf(s).filter((x) => x.id !== id) }));
}

/** Přeplánování z kalendáře: posun termínu a/nebo výměna pracovníka. */
export function rescheduleJob(jobId: string, opts: { shiftDays?: number; fromWorker?: string; toWorker?: string }) {
  updateStore((s) => {
    const job = build(s).jobs.find((j) => j.id === jobId);
    if (!job) return s;
    const shift = (opts.shiftDays ?? 0) * 86_400_000;
    let workers = job.assignedWorkerIds;
    if (opts.toWorker && opts.toWorker !== opts.fromWorker) {
      workers = workers.filter((w) => w !== opts.fromWorker);
      if (!workers.includes(opts.toWorker)) workers = [...workers, opts.toWorker];
    }
    return patchIn(s, jobId, {
      schedule: { start: new Date(job.schedule.start.getTime() + shift), due: new Date(job.schedule.due.getTime() + shift) },
      assignedWorkerIds: workers,
    });
  });
}
