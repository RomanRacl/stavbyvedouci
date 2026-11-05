import type { AuditKind, Job, Member } from '@/types/firestore';
import { checklistOf, extraWorkOf } from './jobDefaults';

const STATUS: Record<Job['status'], string> = {
  draft: 'Koncept',
  scheduled: 'Naplánováno',
  in_progress: 'Probíhá',
  awaiting_approval: 'Ke schválení',
  approved: 'Schváleno',
  invoiced: 'Fakturováno',
};

const czk = (n: number) => n.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
const d = (x: Date) => x.toLocaleDateString('cs-CZ');

/**
 * Porovná zakázku před a po změně a popíše rozdíly lidsky.
 * Díky tomu se historie zapisuje sama u každé operace – nic se nezapomene.
 */
export function describeChanges(before: Job, after: Job, members: Member[]): Array<{ kind: AuditKind; text: string }> {
  const out: Array<{ kind: AuditKind; text: string }> = [];
  const name = (uid: string) => members.find((m) => m.uid === uid)?.displayName ?? uid;

  if (before.status !== after.status) out.push({ kind: 'status', text: `Stav: ${STATUS[before.status]} → ${STATUS[after.status]}` });
  if (before.progressPct !== after.progressPct && !(after.stages?.length)) out.push({ kind: 'progress', text: `Dokončenost ${before.progressPct} % → ${after.progressPct} %` });

  // Etapy
  for (const st of after.stages ?? []) {
    const old = before.stages?.find((x) => x.id === st.id);
    if (!old) out.push({ kind: 'edit', text: `Přidána etapa „${st.name}“ (${num(st.plannedHours)} h)` });
    else if (old.progressPct !== st.progressPct) out.push({ kind: 'stage', text: `Etapa „${st.name}“: ${old.progressPct} % → ${st.progressPct} %${st.doneAt && !old.doneAt ? ', hotovo' : ''}` });
  }
  for (const st of before.stages ?? []) if (!after.stages?.some((x) => x.id === st.id)) out.push({ kind: 'edit', text: `Odebrána etapa „${st.name}“` });

  // Materiál – výdeje a vratky
  for (const l of after.materialPlan) {
    const old = before.materialPlan.find((x) => x.materialId === l.materialId);
    const delta = l.usedQty - (old?.usedQty ?? 0);
    if (delta > 0) out.push({ kind: 'material', text: `Vydáno ${num(delta)} ${l.unit} ${l.name}` });
    if (delta < 0) out.push({ kind: 'material', text: `Vráceno ${num(-delta)} ${l.unit} ${l.name}` });
    if (old && old.plannedQty !== l.plannedQty) out.push({ kind: 'edit', text: `Plán ${l.name}: ${num(old.plannedQty)} → ${num(l.plannedQty)} ${l.unit}` });
    if (!old && l.plannedQty > 0) out.push({ kind: 'edit', text: `Do plánu přidáno ${num(l.plannedQty)} ${l.unit} ${l.name}` });
  }

  // Kontrolní seznam
  const ckBefore = checklistOf(before);
  for (const i of checklistOf(after)) {
    const old = ckBefore.find((x) => x.id === i.id);
    if (i.doneAt && !old?.doneAt) out.push({ kind: 'checklist', text: `Splněno: ${i.text}` });
    if (!i.doneAt && old?.doneAt) out.push({ kind: 'checklist', text: `Vráceno jako nesplněné: ${i.text}` });
  }

  // Vícepráce
  for (const e of extraWorkOf(after)) {
    const old = extraWorkOf(before).find((x) => x.id === e.id);
    if (!old) out.push({ kind: 'extra', text: `Nahlášena vícepráce: ${e.description} (${num(e.hours)} h)` });
    else if (old.status !== e.status)
      out.push({ kind: 'extra', text: e.status === 'approved' ? `Vícepráce schválena za ${czk(e.price ?? 0)}: ${e.description}` : `Vícepráce zamítnuta: ${e.description}` });
  }

  if (after.handover && !before.handover)
    out.push({ kind: 'handover', text: after.handover.signature ? `Předáno zákazníkovi, převzal(a) ${after.handover.clientName} s podpisem` : 'Předáno bez podpisu zákazníka' });
  if (after.invoice && !before.invoice) out.push({ kind: 'invoice', text: `Vystaven podklad k fakturaci ${after.invoice.number}` });
  if (!after.invoice && before.invoice) out.push({ kind: 'invoice', text: `Zrušen podklad ${before.invoice.number}` });

  for (const p of after.payments ?? []) {
    const old = before.payments?.find((x) => x.id === p.id);
    if (!old) out.push({ kind: 'payment', text: `Vyžádána platba ${p.label}, ${czk(p.amount)}` });
    else if (p.paidAt && !old.paidAt) out.push({ kind: 'payment', text: `Zaplaceno: ${p.label}, ${czk(p.amount)}` });
    else if (!p.paidAt && old.paidAt) out.push({ kind: 'payment', text: `Platba vrácena mezi nezaplacené: ${p.label}` });
  }

  for (const r of after.revisions ?? []) {
    if (!before.revisions?.some((x) => x.id === r.id)) out.push({ kind: 'revision', text: `${r.kind} č. ${r.number || 'bez čísla'}: ${r.result === 'ok' ? 'bez závad' : 'se závadami'} (${r.technician})` });
  }

  const conf = after.safety?.confirmations ?? {};
  for (const uid of Object.keys(conf)) if (!before.safety?.confirmations?.[uid]) out.push({ kind: 'safety', text: `${name(uid)} potvrdil(a) poučení BOZP` });
  if (after.safety && before.safety && after.safety.text !== before.safety.text) out.push({ kind: 'edit', text: 'Upraveno poučení BOZP' });

  // Úpravy zakázky z kanceláře
  if (before.title !== after.title) out.push({ kind: 'edit', text: `Název: ${before.title} → ${after.title}` });
  if (before.budget.revenue !== after.budget.revenue && !out.some((o) => o.kind === 'extra'))
    out.push({ kind: 'edit', text: `Cena ${czk(before.budget.revenue)} → ${czk(after.budget.revenue)}` });
  if (before.schedule.start.getTime() !== after.schedule.start.getTime() || before.schedule.due.getTime() !== after.schedule.due.getTime())
    out.push({ kind: 'edit', text: `Termín ${d(after.schedule.start)} až ${d(after.schedule.due)}` });
  const added = after.assignedWorkerIds.filter((u) => !before.assignedWorkerIds.includes(u));
  const removed = before.assignedWorkerIds.filter((u) => !after.assignedWorkerIds.includes(u));
  if (added.length) out.push({ kind: 'edit', text: `Do party přidán(a): ${added.map(name).join(', ')}` });
  if (removed.length) out.push({ kind: 'edit', text: `Z party odebrán(a): ${removed.map(name).join(', ')}` });
  if ((before.vatMode ?? null) !== (after.vatMode ?? null) && before.vatMode) out.push({ kind: 'edit', text: 'Změněn režim DPH' });

  return out;
}

export const AUDIT_LABEL: Record<AuditKind, string> = {
  created: 'Založení',
  status: 'Stav',
  progress: 'Postup',
  stage: 'Etapa',
  material: 'Materiál',
  extra: 'Vícepráce',
  checklist: 'Kontrola',
  handover: 'Předání',
  photo: 'Fotky',
  note: 'Zpráva',
  edit: 'Úprava',
  invoice: 'Fakturace',
  payment: 'Platba',
  revision: 'Revize',
  safety: 'BOZP',
  diary: 'Zápis',
};
