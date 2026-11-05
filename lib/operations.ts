import type { Certificate, CertKind, Client, Job, Stage, Trade } from '@/types/firestore';

/* ---------- etapy ---------- */

/** Dokončenost zakázky z etap vážená plánovanými hodinami. */
export function progressFromStages(stages: Stage[]): number {
  const total = stages.reduce((a, s) => a + Math.max(0, s.plannedHours), 0);
  if (!stages.length) return 0;
  if (!total) return Math.round(stages.reduce((a, s) => a + s.progressPct, 0) / stages.length);
  return Math.round(stages.reduce((a, s) => a + s.progressPct * Math.max(0, s.plannedHours), 0) / total);
}

export const STAGE_PRESETS: Record<Trade, string[]> = {
  electro: ['Hrubá instalace', 'Kompletace', 'Revize'],
  plumbing: ['Demontáž', 'Rozvody', 'Tlaková zkouška', 'Kompletace'],
  windows: ['Demontáž', 'Montáž', 'Zapravení'],
  construction: ['Bourací práce', 'Hrubá stavba', 'Obklady a dokončení'],
  hvac: ['Příprava a rozvody', 'Montáž jednotek', 'Uvedení do provozu'],
};

/* ---------- BOZP ---------- */

const SAFETY_BASE = [
  'Na stavbě vždy pracovní obuv S3, rukavice a ochranné brýle při řezání a vrtání.',
  'Před odchodem zajistit pracoviště a uklidit nářadí; zákazníkovy prostory nechat průchodné.',
  'Úraz nebo skoronehodu hned nahlásit mistrovi.',
];

const SAFETY_BY_TRADE: Record<Trade, string[]> = {
  electro: ['Před prací vypnout a zajistit jistič proti zapnutí, ověřit beznapěťový stav zkoušečkou.', 'Na živých částech pracuje jen osoba s oprávněním podle § 6 nebo § 7.'],
  plumbing: ['Před demontáží uzavřít a vypustit vodu, u plynu pracuje jen osoba s oprávněním.', 'Při svařování PPR pozor na popálení, svářečku odkládat na stojan.'],
  windows: ['Práce nad 1,5 m jen s jištěním nebo z lešení, okenní křídla nosit ve dvou.', 'Sklo přenášet v rukavicích odolných proti pořezání.'],
  construction: ['Při bourání respirátor FFP2 a chrániče sluchu, ověřit vedení v příčkách.', 'Suť vynášet průběžně, únikové cesty nechat volné.'],
  hvac: ['S chladivem pracuje jen osoba s certifikátem F-plyny.', 'Venkovní jednotky montovat z lešení nebo plošiny, ne ze žebříku.'],
};

export const defaultSafetyText = (trade: Trade) => [...SAFETY_BY_TRADE[trade], ...SAFETY_BASE].map((l) => `• ${l}`).join('\n');

export const safetyOf = (job: Job) => job.safety ?? { text: defaultSafetyText(job.trade), confirmations: {} };
export const needsSafety = (job: Job, uid: string) => !safetyOf(job).confirmations[uid];

/* ---------- certifikáty ---------- */

export const CERT_KINDS: Record<CertKind, { label: string; hint: string }> = {
  vyhl50: { label: 'Elektro – vyhl. 50/1978 (§ 6, § 7…)', hint: 'Odborná způsobilost v elektrotechnice' },
  fgas: { label: 'F-plyny (chladiva)', hint: 'Certifikát pro práci s fluorovanými plyny' },
  welding: { label: 'Svářečský průkaz', hint: 'Platnost podle ČSN 05 0705' },
  heights: { label: 'Práce ve výškách', hint: 'Školení a lékařská prohlídka' },
  bozp: { label: 'Školení BOZP', hint: 'Pravidelné školení zaměstnanců' },
  driving: { label: 'Řidičský průkaz / profesní', hint: '' },
  other: { label: 'Jiné', hint: '' },
};

/** Která oprávnění obor vyžaduje u přiřazených pracovníků. */
export const TRADE_REQUIRES: Partial<Record<Trade, CertKind>> = { electro: 'vyhl50', hvac: 'fgas' };

export type CertStatus = 'valid' | 'expiring' | 'expired' | 'none';

export function certStatus(c: Certificate | undefined, now = Date.now()): CertStatus {
  if (!c) return 'none';
  if (!c.validUntil) return 'valid';
  const days = (c.validUntil.getTime() - now) / 86_400_000;
  return days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'valid';
}

/** Nejlépe platný certifikát daného druhu pro člověka. */
export const bestCert = (certs: Certificate[], uid: string, kind: CertKind) =>
  certs
    .filter((c) => c.uid === uid && c.kind === kind)
    .sort((a, b) => (b.validUntil?.getTime() ?? Infinity) - (a.validUntil?.getTime() ?? Infinity))[0];

/** Problém s oprávněním pro práci v oboru – null, když je vše v pořádku. */
export function assignmentIssue(certs: Certificate[], uid: string, trade: Trade, now = Date.now()): string | null {
  const kind = TRADE_REQUIRES[trade];
  if (!kind) return null;
  const c = bestCert(certs, uid, kind);
  const st = certStatus(c, now);
  if (st === 'none') return `chybí ${CERT_KINDS[kind].label}`;
  if (st === 'expired') return `prošlé ${c!.label}`;
  return null;
}

/* ---------- zákazníci ---------- */

export const clientKey = (name: string) =>
  'c_' +
  name
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export interface ClientView extends Client {
  jobIds: string[];
  quoteIds: string[];
  revenue: number;
  lastActivity: Date | null;
}

/* ---------- adresář: zákazníci z ručních záznamů, zakázek a nabídek ---------- */

interface ClientSources {
  clients: Client[];
  jobs: Job[];
  quotes: Array<{ id: string; client: { name: string; phone: string; email: string; address: string; ico: string }; createdAt: Date }>;
}

/** Adresář se skládá sám: každý zákazník ze zakázek a nabídek + ručně upravené údaje. */
export function clientsView({ clients, jobs, quotes }: ClientSources): ClientView[] {
  const map = new Map<string, ClientView>();
  const touch = (name: string, patch: Partial<Client>, at: Date) => {
    if (!name.trim()) return null;
    const id = clientKey(name);
    const cur = map.get(id) ?? { id, name: name.trim(), ico: '', phone: '', email: '', address: '', note: '', jobIds: [], quoteIds: [], revenue: 0, lastActivity: null };
    for (const [k, v] of Object.entries(patch)) if (v && !(cur as unknown as Record<string, unknown>)[k]) (cur as unknown as Record<string, unknown>)[k] = v;
    if (!cur.lastActivity || at > cur.lastActivity) cur.lastActivity = at;
    map.set(id, cur);
    return cur;
  };
  for (const j of jobs) {
    const c = touch(j.client.name, { phone: j.client.phone, address: j.client.address }, j.updatedAt);
    if (c) {
      c.jobIds.push(j.id);
      c.revenue += j.budget.revenue;
    }
  }
  for (const q of quotes) {
    const c = touch(q.client.name, { phone: q.client.phone, email: q.client.email, address: q.client.address, ico: q.client.ico }, q.createdAt);
    if (c) c.quoteIds.push(q.id);
  }
  for (const manual of clients) {
    const cur = map.get(manual.id);
    map.set(manual.id, { ...(cur ?? { jobIds: [], quoteIds: [], revenue: 0, lastActivity: null }), ...manual });
  }
  return [...map.values()].sort((a, b) => (b.lastActivity?.getTime() ?? 0) - (a.lastActivity?.getTime() ?? 0));
}
