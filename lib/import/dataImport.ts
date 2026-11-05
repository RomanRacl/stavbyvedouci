import type { Client, Job, JobStatus, Trade } from '@/types/firestore';
import { parsePrice, type Table } from './priceList';

/** Import zakázek a zákazníků z Excelu/CSV při přechodu firmy do aplikace. */

export type ImportKind = 'jobs' | 'clients';

type JobField = 'title' | 'client' | 'address' | 'phone' | 'trade' | 'revenue' | 'hours' | 'material' | 'start' | 'due' | 'status';
type ClientField = 'name' | 'ico' | 'phone' | 'email' | 'address' | 'note';

export const JOB_FIELDS: Record<JobField, { label: string; re: RegExp }> = {
  title: { label: 'Zakázka', re: /^(zak[áa]zka|n[áa]zev|p[řr]edm[ěe]t|popis|pr[áa]ce)/i },
  client: { label: 'Zákazník', re: /^(z[áa]kazn[íi]k|odb[ěe]ratel|klient|investor|objednatel|firma)/i },
  address: { label: 'Adresa', re: /^(adresa|m[íi]sto|stavba|lokalita)/i },
  phone: { label: 'Telefon', re: /^(tel|mobil|kontakt)/i },
  trade: { label: 'Obor', re: /^(obor|typ|druh|kategorie)/i },
  revenue: { label: 'Cena bez DPH', re: /(cena|[čc][áa]stka|rozpo[čc]et|bez dph|obrat)/i },
  hours: { label: 'Hodiny', re: /^(hodiny|hod|h\b|pr[áa]ce h)/i },
  material: { label: 'Materiál Kč', re: /^(materi[áa]l)/i },
  start: { label: 'Začátek', re: /^(za[čc][áa]tek|zah[áa]jen[íi]|od\b|start)/i },
  due: { label: 'Konec', re: /^(konec|dokon[čc]en[íi]|term[íi]n|do\b|deadline)/i },
  status: { label: 'Stav', re: /^(stav|status)/i },
};

export const CLIENT_FIELDS: Record<ClientField, { label: string; re: RegExp }> = {
  name: { label: 'Jméno / firma', re: /^(jm[ée]no|n[áa]zev|firma|z[áa]kazn[íi]k|odb[ěe]ratel|klient)/i },
  ico: { label: 'IČO', re: /^(i[čc]o?\b|i[čc]$)/i },
  phone: { label: 'Telefon', re: /^(tel|mobil)/i },
  email: { label: 'E-mail', re: /(e-?mail|mail)/i },
  address: { label: 'Adresa', re: /^(adresa|ulice|s[íi]dlo)/i },
  note: { label: 'Poznámka', re: /^(pozn|note)/i },
};

export type ColumnMap = Record<string, number | undefined>;

export function detectFields(table: Table, kind: ImportKind): { headerRow: number; map: ColumnMap } {
  const fields = kind === 'jobs' ? JOB_FIELDS : CLIENT_FIELDS;
  let best = { headerRow: 0, map: {} as ColumnMap, score: -1 };
  for (let r = 0; r < Math.min(10, table.length); r++) {
    const map: ColumnMap = {};
    table[r].forEach((h, i) => {
      for (const [f, def] of Object.entries(fields)) {
        if (map[f] === undefined && def.re.test(h.trim())) {
          map[f] = i;
          break;
        }
      }
    });
    const score = Object.keys(map).length;
    if (score > best.score) best = { headerRow: r, map, score };
  }
  return { headerRow: best.headerRow, map: best.map };
}

/** „12. 10. 2026“, „12.10.26“, „2026-10-12“ nebo sériové číslo data z Excelu. */
export function parseDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (n > 30000 && n < 80000) return new Date(Math.round((n - 25569) * 86_400_000) + new Date().getTimezoneOffset() * 60_000);
  }
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})/);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }
  return null;
}

export function parseTrade(s: string): Trade {
  const t = s.toLowerCase();
  if (/elektr|hromosvod|revize el/.test(t)) return 'electro';
  if (/vod|topen|instal|kanal|plyn|stoupa/.test(t)) return 'plumbing';
  if (/okn|dve[řr]|st[íi]n[íi]c/.test(t)) return 'windows';
  if (/klim|t[čc]|tepeln|vzduchotech|rekuper/.test(t)) return 'hvac';
  return 'construction';
}

export function parseStatus(s: string): JobStatus {
  const t = s.toLowerCase();
  if (/fakt/.test(t)) return 'invoiced';
  if (/hotov|dokon|schv/.test(t)) return 'approved';
  if (/prob|rozprac|b[ěe][žz]/.test(t)) return 'in_progress';
  if (/koncept|popt/.test(t)) return 'draft';
  return 'scheduled';
}

const num = (s: string) => {
  const n = parsePrice(s);
  return Number.isFinite(n) ? n : 0;
};

export function toClients(table: Table, headerRow: number, map: ColumnMap): Array<Omit<Client, 'id'>> {
  const get = (r: string[], f: ClientField) => (map[f] === undefined ? '' : (r[map[f]!] ?? '').trim());
  return table
    .slice(headerRow + 1)
    .map((r) => ({ name: get(r, 'name'), ico: get(r, 'ico').replace(/\D/g, ''), phone: get(r, 'phone'), email: get(r, 'email'), address: get(r, 'address'), note: get(r, 'note') }))
    .filter((c) => c.name);
}

export interface JobImportRow {
  title: string;
  client: string;
  address: string;
  phone: string;
  trade: Trade;
  revenue: number;
  hours: number;
  material: number;
  start: Date;
  due: Date;
  status: JobStatus;
  /** Co se nepodařilo přečíst (zobrazí se v náhledu). */
  warnings: string[];
}

export function toJobRows(table: Table, headerRow: number, map: ColumnMap, now = new Date()): JobImportRow[] {
  const get = (r: string[], f: JobField) => (map[f] === undefined ? '' : (r[map[f]!] ?? '').trim());
  return table
    .slice(headerRow + 1)
    .map((r) => {
      const warnings: string[] = [];
      const title = get(r, 'title');
      const start = parseDate(get(r, 'start'));
      const due = parseDate(get(r, 'due'));
      if (!start) warnings.push('chybí začátek, dáno dnes');
      const s = start ?? now;
      const tradeText = get(r, 'trade') || title;
      return {
        title,
        client: get(r, 'client'),
        address: get(r, 'address'),
        phone: get(r, 'phone'),
        trade: parseTrade(tradeText),
        revenue: Math.round(num(get(r, 'revenue'))),
        hours: Math.round(num(get(r, 'hours'))),
        material: Math.round(num(get(r, 'material'))),
        start: s,
        due: due && due >= s ? due : new Date(s.getTime() + 7 * 86_400_000),
        status: get(r, 'status') ? parseStatus(get(r, 'status')) : 'scheduled',
        warnings,
      };
    })
    .filter((j) => j.title && j.client);
}

/** Z řádku importu sestaví zakázku. Náklad práce podle průměrné sazby firmy. */
export function jobFromRow(row: JobImportRow, id: string, code: string, hourlyCost: number, now = new Date()): Job {
  const done = row.status === 'approved' || row.status === 'invoiced';
  return {
    id,
    code,
    title: row.title,
    trade: row.trade,
    status: row.status,
    client: { name: row.client, phone: row.phone, address: row.address, geo: null },
    assignedWorkerIds: [],
    schedule: { start: row.start, due: row.due },
    budget: { revenue: row.revenue, laborHours: row.hours, laborCost: Math.round(row.hours * hourlyCost), materialCost: row.material },
    actuals: done
      ? { laborHours: row.hours, laborCost: Math.round(row.hours * hourlyCost), materialCost: row.material, updatedAt: now }
      : { laborHours: 0, laborCost: 0, materialCost: 0, updatedAt: now },
    progressPct: done ? 100 : 0,
    materialPlan: [],
    extraWork: [],
    handover: null,
    payments: [],
    invoice: null,
    approval: done ? { approvedBy: 'u_owner', approvedAt: row.due } : null,
    createdAt: now,
    updatedAt: now,
  };
}
