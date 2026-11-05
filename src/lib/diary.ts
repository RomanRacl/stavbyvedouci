import type { AuditEntry, Job, JobNote, JobPhoto, Member, MaterialUsage, TimeLog } from '@/types/firestore';
import { dayKey } from './jobDefaults';
import { DEFAULT_SITE_RADIUS_M, fmtDistance, geoVerdict } from './geo';

export interface DiaryDay {
  date: string; // YYYY-MM-DD
  people: Array<{ uid: string; name: string; hours: number; from: Date; to: Date }>;
  entries: Array<{ at: Date; by: string; kind: string; text: string }>;
  photos: number;
}

interface Sources {
  timeLogs: TimeLog[];
  usage: MaterialUsage[];
  photos: JobPhoto[];
  notes: JobNote[];
  audit: AuditEntry[];
  members: Member[];
  catalog: Array<{ id: string; name: string; unit: string }>;
  /** Okruh stavby v metrech pro kontrolu polohy. */
  siteRadiusM?: number;
}

/**
 * Stavební deník zakázky složený automaticky po dnech: kdo byl na stavbě a kolik hodin,
 * co se vydalo, fotky, zprávy, změny stavu, kontroly, předání a ruční zápisy mistra.
 */
export function buildDiary(job: Job, src: Sources): DiaryDay[] {
  const days = new Map<string, DiaryDay>();
  const day = (d: Date) => {
    const k = dayKey(d);
    let v = days.get(k);
    if (!v) {
      v = { date: k, people: [], entries: [], photos: 0 };
      days.set(k, v);
    }
    return v;
  };
  const name = (uid: string) => src.members.find((m) => m.uid === uid)?.displayName ?? uid;

  for (const l of src.timeLogs.filter((x) => x.jobId === job.id && x.endedAt)) {
    const d = day(l.startedAt);
    const p = d.people.find((x) => x.uid === l.workerId);
    const hours = (l.durationMin ?? 0) / 60;
    if (p) {
      p.hours += hours;
      if (l.startedAt < p.from) p.from = l.startedAt;
      if (l.endedAt! > p.to) p.to = l.endedAt!;
    } else d.people.push({ uid: l.workerId, name: name(l.workerId), hours, from: l.startedAt, to: l.endedAt! });
    const v = geoVerdict(l.geoStart, job.client.geo, l.geoAccuracy ?? 0, src.siteRadiusM ?? DEFAULT_SITE_RADIUS_M);
    if (v.kind === 'away') d.entries.push({ at: l.startedAt, by: l.workerId, kind: 'geo', text: `Začátek práce ${fmtDistance(v.distance)} od stavby` });
  }
  for (const u of src.usage.filter((x) => x.jobId === job.id)) {
    const item = src.catalog.find((c) => c.id === u.materialId) ?? job.materialPlan.find((l) => l.materialId === u.materialId);
    const label = item ? ('name' in item ? item.name : '') : u.materialId;
    const unit = item && 'unit' in item ? item.unit : '';
    day(u.usedAt).entries.push({
      at: u.usedAt,
      by: u.workerId,
      kind: 'material',
      text: u.qty < 0 ? `Vráceno ${-u.qty} ${unit} ${label}` : `Vydáno ${u.qty} ${unit} ${label}`,
    });
  }
  for (const p of src.photos.filter((x) => x.jobId === job.id)) day(p.takenAt).photos++;
  for (const n of src.notes.filter((x) => x.jobId === job.id)) day(n.createdAt).entries.push({ at: n.createdAt, by: n.authorId, kind: 'note', text: n.text });
  // Materiál, fotky a zprávy bereme z jejich zdrojů výše, z historie jen ostatní události.
  for (const a of src.audit.filter((x) => x.jobId === job.id && !['material', 'photo', 'note'].includes(x.kind))) {
    day(a.at).entries.push({ at: a.at, by: a.by, kind: a.kind, text: a.text });
  }
  for (const d of days.values()) d.entries.sort((a, b) => a.at.getTime() - b.at.getTime());
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Návrh zápisu do stavebního deníku za jeden den, složený z toho, co se ten den na stavbě dělo:
 * kdo byl a kolik hodin, co se vydalo, kolik fotek, stav etap a dokončenost.
 * Mistr ho jen zkontroluje a doplní.
 */
export function suggestDiaryText(job: Job, days: DiaryDay[], date: string): string {
  const d = days.find((x) => x.date === date);
  const h = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
  const time = (x: Date) => x.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const lines: string[] = [];
  if (d?.people.length) {
    lines.push(`Na stavbě: ${d.people.map((p) => `${p.name} ${time(p.from)}–${time(p.to)} (${h(p.hours)} h)`).join(', ')}.`);
  } else lines.push('Na stavbě dnes nikdo nezapsal práci.');
  const material = d?.entries.filter((e) => e.kind === 'material' && e.text.startsWith('Vydáno')).map((e) => e.text.replace(/^Vydáno /, '')) ?? [];
  if (material.length) lines.push(`Zabudovaný materiál: ${material.join(', ')}.`);
  const events = d?.entries.filter((e) => ['stage', 'checklist', 'extra', 'revision', 'handover'].includes(e.kind)).map((e) => e.text) ?? [];
  if (events.length) lines.push(`${events.join('. ')}.`);
  const stages = (job.stages ?? []).filter((s) => s.progressPct > 0 && !s.doneAt).map((s) => `${s.name.toLowerCase()} ${s.progressPct} %`);
  lines.push(stages.length ? `Rozpracováno: ${stages.join(', ')}. Celkem hotovo ${job.progressPct} %.` : `Hotovo ${job.progressPct} %.`);
  if (d?.photos) lines.push(`Pořízeno ${d.photos} fotek (příloha deníku v aplikaci).`);
  lines.push('Počasí: ');
  return lines.join('\n');
}
