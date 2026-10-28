import type { Job, MaterialItem, MaterialPlanLine, Member, MaterialUsage } from '@/types/firestore';
import { mockJobs, mockMaterials, mockMaterialUsage, mockMembers } from './dashboard.mock';
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
}

function build(s: Stored): Snapshot {
  const jobs = [...s.created, ...mockJobs].map((j) => (s.patches[j.id] ? { ...j, ...s.patches[j.id] } : j));
  const members = mockMembers.map((m) => (m.uid in s.timers ? { ...m, activeTimer: s.timers[m.uid] } : m));
  return { jobs, members, usage: [...s.usage, ...mockMaterialUsage], catalog: mockMaterials };
}

export const getSnapshot = (): Snapshot => build(readStore());

/** Úprava zakázky – nové zakázky se mění na místě, ukázkové přes patch. */
function patchIn(s: Stored, jobId: string, patch: Partial<Job>): Stored {
  const stamped = { ...patch, updatedAt: new Date() };
  if (s.created.some((j) => j.id === jobId)) {
    return { ...s, created: s.created.map((j) => (j.id === jobId ? { ...j, ...stamped } : j)) };
  }
  return { ...s, patches: { ...s.patches, [jobId]: { ...s.patches[jobId], ...stamped } } };
}

/** Zastaví běžící měření a připíše hodiny a náklad na zakázku. */
function stopIn(s: Stored, uid: string): { s: Stored; minutes: number; job: Job | null } {
  const snap = build(s);
  const member = snap.members.find((m) => m.uid === uid);
  const timer = member?.activeTimer;
  if (!member || !timer) return { s, minutes: 0, job: null };

  const minutes = Math.max(1, Math.round((Date.now() - timer.startedAt.getTime()) / 60000));
  const hours = minutes / 60;
  const job = snap.jobs.find((j) => j.id === timer.jobId) ?? null;
  let next: Stored = { ...s, timers: { ...s.timers, [uid]: null } };
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
  updateStore((s) => ({ ...s, created: [job, ...s.created] }));
}

export function patchJob(jobId: string, patch: Partial<Job>) {
  updateStore((s) => patchIn(s, jobId, patch));
}

/** Začít práci. Běží-li měření na jiné zakázce, nejdřív se ukončí. Naplánovaná zakázka přejde do „Probíhá“. */
export function startWork(uid: string, jobId: string): { stoppedJob: Job | null; stoppedMinutes: number } {
  let result = { stoppedJob: null as Job | null, stoppedMinutes: 0 };
  updateStore((s) => {
    const stopped = stopIn(s, uid);
    result = { stoppedJob: stopped.job, stoppedMinutes: stopped.minutes };
    let next: Stored = {
      ...stopped.s,
      timers: { ...stopped.s.timers, [uid]: { logId: `tl_${Date.now().toString(36)}`, jobId, startedAt: new Date() } },
    };
    const job = build(next).jobs.find((j) => j.id === jobId);
    if (job?.status === 'scheduled') next = patchIn(next, jobId, { status: 'in_progress' });
    return next;
  });
  return result;
}

export function stopWork(uid: string): { minutes: number; job: Job | null } {
  let result = { minutes: 0, job: null as Job | null };
  updateStore((s) => {
    const stopped = stopIn(s, uid);
    result = { minutes: stopped.minutes, job: stopped.job };
    return stopped.s;
  });
  return result;
}

/** Položka výdeje. U materiálu mimo plán se posílá i `line`, aby se dal do plánu doplnit. */
export interface IssueItem {
  materialId: string;
  qty: number;
  line?: Omit<MaterialPlanLine, 'plannedQty' | 'usedQty'>;
}

/** Výdej materiálu: záznam do logu + navýšení čerpání a nákladů na zakázce. Neplánovaný materiál se přidá s plánem 0. */
export function issueMaterial(uid: string, jobId: string, items: IssueItem[]) {
  updateStore((s) => {
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
    return { ...next, usage: [...entries, ...next.usage] };
  });
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

export function setProgress(jobId: string, progressPct: number) {
  patchJob(jobId, { progressPct });
}

/** Předání ke schválení: 100 % hotovo, stav „Ke schválení“, vlastní běžící měření na zakázce se ukončí. */
export function submitForApproval(uid: string, jobId: string) {
  updateStore((s) => {
    const member = build(s).members.find((m) => m.uid === uid);
    const base = member?.activeTimer?.jobId === jobId ? stopIn(s, uid).s : s;
    return patchIn(base, jobId, { progressPct: 100, status: 'awaiting_approval' });
  });
}
