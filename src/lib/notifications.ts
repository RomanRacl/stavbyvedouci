import { allAlerts } from '@/lib/analytics';
import { receivables } from '@/lib/finance';
import type { Snapshot } from '@/lib/mock/localBackend';
import { certStatus } from '@/lib/operations';
import { absenceConflicts, toolStates } from '@/lib/people';
import { leadView, serviceReminders } from '@/lib/sales';
import { stockRows } from '@/lib/stock';

/**
 * Centrum upozornění: všechno, co čeká na majitele, na jednom místě.
 * Čistá funkce nad snímkem dat – stejná pravidla jako oranžové tečky v menu.
 */
export type NoticeLevel = 'critical' | 'warning' | 'info';
export type NoticeGroup = 'Zakázky' | 'Peníze' | 'Materiál' | 'Lidé' | 'Obchod' | 'Data';

export interface Notice {
  /** Stabilní klíč: podle něj se pamatuje, co už majitel viděl. */
  id: string;
  level: NoticeLevel;
  group: NoticeGroup;
  title: string;
  detail: string;
  href: string;
}

const DAY = 86_400_000;
const czk = (n: number) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
const dateCs = (d: Date) => d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });

export function notificationsOf(snap: Snapshot, opts: { now?: number; lastBackup?: Date | null; ownData?: boolean } = {}): Notice[] {
  const now = opts.now ?? Date.now();
  const out: Notice[] = [];
  const name = (uid: string) => snap.members.find((m) => m.uid === uid)?.displayName ?? 'Neznámý';

  // Zakázky: co hoří (ztráta, termín, rozpočet) – jedna položka na zakázku, ta nejvážnější.
  const seen = new Set<string>();
  for (const a of allAlerts(snap.jobs).sort((x, y) => (x.level === 'critical' ? 0 : 1) - (y.level === 'critical' ? 0 : 1))) {
    if (seen.has(a.job.id)) continue;
    seen.add(a.job.id);
    out.push({ id: `alert:${a.job.id}:${a.code}`, level: a.level === 'critical' ? 'critical' : 'warning', group: 'Zakázky', title: `${a.job.code} ${a.job.title}`, detail: a.text, href: `/dashboard?job=${a.job.id}` });
  }
  for (const j of snap.jobs.filter((x) => x.status === 'awaiting_approval')) {
    out.push({ id: `approve:${j.id}`, level: 'info', group: 'Zakázky', title: `Ke schválení: ${j.code}`, detail: `${j.title} – parta ji předala jako hotovou.`, href: `/dashboard?job=${j.id}` });
  }

  // Peníze: pohledávky, na které je čas poslat upomínku, a hotové zakázky k vyfakturování.
  for (const r of receivables(snap.jobs, snap.settings, new Date(now)).filter((x) => x.nextLevel)) {
    out.push({
      id: `recv:${r.key}:${r.nextLevel}`,
      level: r.daysOverdue > 14 ? 'critical' : 'warning',
      group: 'Peníze',
      title: `${r.number}: ${czk(r.amount)} po splatnosti`,
      detail: `${r.job.client.name}, ${r.daysOverdue} dní po splatnosti – čas na ${r.nextLevel}. upomínku.`,
      href: '/penize?tab=receivables',
    });
  }
  const toInvoice = snap.jobs.filter((j) => j.status === 'approved');
  if (toInvoice.length) {
    out.push({
      id: `invoice:${toInvoice.map((j) => j.id).sort().join(',')}`,
      level: 'info',
      group: 'Peníze',
      title: `K vyfakturování: ${toInvoice.length}`,
      detail: toInvoice.slice(0, 3).map((j) => j.code).join(', ') + (toInvoice.length > 3 ? '…' : ''),
      href: '/penize?tab=invoice',
    });
  }

  // Materiál: pod minimem a objednávky čekající na odeslání.
  const low = stockRows(snap.catalog, snap.stockMoves, snap.vans).filter((r) => r.low);
  if (low.length) {
    out.push({
      id: `stock:${low.map((r) => r.item.id).sort().join(',')}`,
      level: 'warning',
      group: 'Materiál',
      title: `Dochází materiál: ${low.length} ${low.length === 1 ? 'položka' : low.length < 5 ? 'položky' : 'položek'}`,
      detail: low.slice(0, 3).map((r) => r.item.name).join(', ') + (low.length > 3 ? '…' : ''),
      href: '/sklad',
    });
  }
  const drafts = snap.orders.filter((o) => o.status === 'draft');
  if (drafts.length) out.push({ id: `orders:${drafts.map((o) => o.id).sort().join(',')}`, level: 'info', group: 'Materiál', title: `Neodeslané objednávky: ${drafts.length}`, detail: drafts.map((o) => o.supplier).join(', '), href: '/objednavky' });

  // Lidé: oprávnění, volno, kolize, revize nářadí.
  for (const c of snap.certificates) {
    const st = certStatus(c);
    if (st !== 'expired' && st !== 'expiring') continue;
    out.push({
      id: `cert:${c.id}:${st}`,
      level: st === 'expired' ? 'critical' : 'warning',
      group: 'Lidé',
      title: `${name(c.uid)}: ${c.label}`,
      detail: st === 'expired' ? `Prošlo ${c.validUntil?.toLocaleDateString('cs-CZ')}.` : `Platí do ${c.validUntil?.toLocaleDateString('cs-CZ')}.`,
      href: '/tym',
    });
  }
  for (const a of snap.absences.filter((x) => x.status === 'pending')) {
    out.push({ id: `absence:${a.id}`, level: 'info', group: 'Lidé', title: `${name(a.uid)} žádá o volno`, detail: `${dateCs(a.from)} – ${dateCs(a.to)}${a.note ? `, ${a.note}` : ''}`, href: '/provoz?tab=absence' });
  }
  for (const c of absenceConflicts(snap.absences, snap.jobs)) {
    out.push({ id: `conflict:${c.absence.id}:${c.job.id}`, level: 'warning', group: 'Lidé', title: `${name(c.absence.uid)} má volno, ale je na zakázce`, detail: `${c.job.code} ${c.job.title}`, href: '/provoz?tab=absence' });
  }
  for (const t of toolStates(snap.tools, snap.toolEvents, now).filter((x) => x.revision === 'overdue')) {
    out.push({ id: `tool:${t.tool.id}`, level: 'warning', group: 'Lidé', title: `Revize po termínu: ${t.tool.name}`, detail: t.tool.code ? `Evidenční číslo ${t.tool.code}` : 'Nářadí nesmí na stavbu bez platné revize.', href: '/provoz?tab=tools' });
  }

  // Obchod: dnešní kroky u poptávek, servis a pravidelné zakázky.
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  for (const l of snap.leads.map((x) => leadView(x, snap.quotes))) {
    if (l.stage === 'won' || l.stage === 'lost' || !l.nextStep || l.nextStep > endOfToday) continue;
    const late = l.nextStep.getTime() < now - DAY;
    out.push({ id: `lead:${l.id}:${l.nextStep.toISOString().slice(0, 10)}`, level: late ? 'warning' : 'info', group: 'Obchod', title: `${l.clientName}: ${l.title}`, detail: late ? `Další krok měl být ${dateCs(l.nextStep)}.` : 'Dnes je na řadě další krok.', href: '/obchod' });
  }
  for (const r of serviceReminders({ jobs: snap.jobs, recurring: snap.recurring, settings: snap.settings }, 7, new Date(now)).filter((x) => !snap.serviceDone[x.key])) {
    out.push({ id: `service:${r.key}`, level: 'info', group: 'Obchod', title: `Zavolat: ${r.clientName}`, detail: `${r.title}, ${r.daysLeft < 0 ? `${-r.daysLeft} dní po termínu` : r.daysLeft === 0 ? 'dnes' : `za ${r.daysLeft} dní`}.`, href: '/obchod?tab=service' });
  }

  // Data: připomínka zálohy, dokud data žijí jen v prohlížeči a jsou v nich vlastní záznamy.
  const ownData = snap.fresh || !!opts.ownData;
  const lb = opts.lastBackup ?? null;
  if (ownData && (!lb || now - lb.getTime() > 7 * DAY)) {
    out.push({
      id: `backup:${lb ? lb.toISOString().slice(0, 10) : 'never'}:${Math.floor(now / (7 * DAY))}`,
      level: lb ? 'info' : 'warning',
      group: 'Data',
      title: lb ? 'Čas na zálohu' : 'Data zatím nemáte zálohovaná',
      detail: lb ? `Poslední záloha je z ${lb.toLocaleDateString('cs-CZ')}.` : 'Jsou jen v tomto prohlížeči. Stáhněte si zálohu v Nastavení.',
      href: '/nastaveni#zaloha',
    });
  }

  const rank: Record<NoticeLevel, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
