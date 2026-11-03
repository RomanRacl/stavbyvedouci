import type { Unit } from '@/types/firestore';

/**
 * Import ceníku dodavatele z CSV nebo Excelu (.xlsx) bez externích knihoven.
 * XLSX je ZIP s XML soubory – rozbalíme ho přes vestavěný DecompressionStream
 * a přečteme první list. Stačí to na běžné ceníky; vzorce se čtou jako uložené hodnoty.
 */

export type Table = string[][];

/* ---------- CSV ---------- */

export function parseCSV(text: string): Table {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  // Český Excel ukládá CSV se středníky, mezinárodní s čárkami.
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') ? '\t' : ',';
  const rows: Table = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/* ---------- XLSX ---------- */

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Minimální čtečka ZIP: centrální adresář → soubory podle jména. */
async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Record<string, string>> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Soubor není platný Excel (.xlsx).');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: Record<string, string> = {};
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    out[name] = dec.decode(method === 8 ? await inflateRaw(raw) : raw);
  }
  return out;
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

const textOf = (xml: string) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');

function colIndex(ref: string) {
  const letters = ref.replace(/\d+/g, '');
  return [...letters].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

export async function parseXLSX(buf: ArrayBuffer): Promise<Table> {
  const files = await unzip(buf, (n) => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const sheetName = Object.keys(files)
    .filter((n) => n.startsWith('xl/worksheets/'))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))[0];
  if (!sheetName) throw new Error('V souboru chybí list s daty.');
  const shared = files['xl/sharedStrings.xml'] ? [...files['xl/sharedStrings.xml'].matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];

  const rows: Table = [];
  for (const r of files[sheetName].matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const value = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? textOf(body) : decodeXml(v ?? '');
      row[ref ? colIndex(ref) : row.length] = value;
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export async function readTable(file: File): Promise<Table> {
  if (/\.xlsx$/i.test(file.name)) return parseXLSX(await file.arrayBuffer());
  if (/\.xls$/i.test(file.name)) throw new Error('Starý formát .xls neumíme. V Excelu uložte jako .xlsx nebo CSV.');
  return parseCSV(await file.text());
}

/* ---------- mapování sloupců ---------- */

export type Field = 'sku' | 'name' | 'unit' | 'unitCost' | 'barcode' | 'category';

export const FIELD_LABEL: Record<Field, string> = {
  sku: 'Kód',
  name: 'Název',
  unit: 'Jednotka',
  unitCost: 'Cena',
  barcode: 'EAN',
  category: 'Kategorie',
};

const PATTERNS: Record<Field, RegExp> = {
  sku: /^(k[óo]d|sku|katalog|obj(edn)?\.?\s*č|č[íi]slo|article|item\s*no)/i,
  name: /^(n[áa]zev|popis|name|zbo[žz][íi]|polo[žz]ka|description)/i,
  unit: /^(mj|m\.j\.|jednotka|jedn|unit)/i,
  unitCost: /(cena|price|nc|n[áa]kup)/i,
  barcode: /^(ean|[čc][áa]rov|barcode|gtin)/i,
  category: /^(kategorie|skupina|category|group)/i,
};

/** Najde řádek s hlavičkou (do 10. řádku) a přiřadí sloupce k polím podle názvů. */
export function detectColumns(table: Table): { headerRow: number; map: Partial<Record<Field, number>> } {
  let best = { headerRow: 0, map: {} as Partial<Record<Field, number>>, score: -1 };
  for (let r = 0; r < Math.min(10, table.length); r++) {
    const map: Partial<Record<Field, number>> = {};
    table[r].forEach((h, i) => {
      const head = h.trim();
      for (const f of Object.keys(PATTERNS) as Field[]) {
        if (map[f] === undefined && PATTERNS[f].test(head)) {
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

const UNIT_ALIASES: Record<string, Unit> = {
  ks: 'ks', kus: 'ks', kusy: 'ks', pc: 'ks', pcs: 'ks',
  m: 'm', bm: 'm', metr: 'm', 'm.': 'm',
  kg: 'kg',
  bal: 'bal', 'bal.': 'bal', balení: 'bal', pack: 'bal',
  l: 'l', litr: 'l',
};

export const parseUnit = (s: string): Unit => UNIT_ALIASES[s.trim().toLowerCase()] ?? 'ks';

/** „1 234,50 Kč“ → 1234.5 */
export function parsePrice(s: string): number {
  if (!/\d/.test(s)) return NaN; // prázdná buňka není cena 0
  const n = Number(
    s
      .replace(/\s| |kč|czk|,-/gi, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.'),
  );
  return Number.isFinite(n) ? n : NaN;
}

export interface ImportRow {
  sku: string;
  name: string;
  unit: Unit;
  unitCost: number;
  barcode: string;
  category: string;
}

export function toImportRows(table: Table, headerRow: number, map: Partial<Record<Field, number>>): ImportRow[] {
  const get = (r: string[], f: Field) => (map[f] === undefined ? '' : (r[map[f]!] ?? '').trim());
  return table
    .slice(headerRow + 1)
    .map((r) => ({
      sku: get(r, 'sku'),
      name: get(r, 'name'),
      unit: parseUnit(get(r, 'unit')),
      unitCost: Math.round(parsePrice(get(r, 'unitCost'))),
      barcode: get(r, 'barcode').replace(/\D/g, ''),
      category: get(r, 'category'),
    }))
    .filter((r) => (r.sku || r.name) && Number.isFinite(r.unitCost) && r.unitCost >= 0);
}
