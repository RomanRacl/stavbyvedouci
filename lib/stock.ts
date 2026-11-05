import type { Job, MaterialItem, OrderLine, StockLocation, StockMove, Van } from '@/types/firestore';

/** Stav jedné položky na jednom místě: počáteční stav (jen hlavní sklad) + součet pohybů. */
export function stockAt(item: MaterialItem, moves: StockMove[], location: StockLocation) {
  const base = location === 'warehouse' ? item.stockQty : 0;
  return moves.reduce((a, m) => (m.materialId === item.id && m.location === location ? a + m.delta : a), base);
}

export interface StockRow {
  item: MaterialItem;
  warehouse: number;
  vans: Record<string, number>;
  total: number;
  /** Celkem (sklad + auta) pod minimem → objednat. */
  low: boolean;
}

export function stockRows(catalog: MaterialItem[], moves: StockMove[], vans: Van[]): StockRow[] {
  return catalog.map((item) => {
    const warehouse = stockAt(item, moves, 'warehouse');
    const vanQty = Object.fromEntries(vans.map((v) => [v.id, stockAt(item, moves, `van:${v.id}`)]));
    const total = warehouse + Object.values(vanQty).reduce((a, b) => a + b, 0);
    return { item, warehouse, vans: vanQty, total, low: item.reorderPoint > 0 && total < item.reorderPoint };
  });
}

export const vanOf = (vans: Van[], uid: string) => vans.find((v) => v.driverIds.includes(uid)) ?? null;

export const locationLabel = (loc: StockLocation, vans: Van[]) => {
  if (loc === 'warehouse') return 'Hlavní sklad';
  const v = vans.find((x) => `van:${x.id}` === loc);
  return v ? `${v.name} ${v.plate}` : 'Neznámé auto';
};

/** Rozumné balení pro objednávku: kabely a trubky po 50 m, ostatní po kusech. */
const roundOrder = (qty: number, unit: string) => (unit === 'm' ? Math.ceil(qty / 50) * 50 : Math.ceil(qty));

const line = (item: MaterialItem, qty: number): OrderLine => ({
  materialId: item.id,
  name: item.name,
  unit: item.unit,
  qty: roundOrder(qty, item.unit),
  unitCost: item.unitCost,
});

/** Návrh doobjednání: položky pod minimem doplnit na dvojnásobek minima. Seskupeno podle dodavatele. */
export function reorderSuggestions(rows: StockRow[]): Record<string, OrderLine[]> {
  const out: Record<string, OrderLine[]> = {};
  for (const r of rows.filter((x) => x.low)) {
    const qty = Math.max(1, r.item.reorderPoint * 2 - Math.max(0, r.total));
    (out[r.item.supplier] ??= []).push(line(r.item, qty));
  }
  return out;
}

/**
 * Co chybí na zakázku: zbývající plán (plán − vydáno) minus to, co je skladem
 * v hlavním skladu a v autech party. Seskupeno podle dodavatele.
 */
export function jobShortages(job: Job, rows: StockRow[], vans: Van[]): Record<string, OrderLine[]> {
  const crewVans = vans.filter((v) => v.driverIds.some((d) => job.assignedWorkerIds.includes(d)));
  const out: Record<string, OrderLine[]> = {};
  for (const l of job.materialPlan) {
    const remaining = l.plannedQty - l.usedQty;
    if (remaining <= 0) continue;
    const row = rows.find((r) => r.item.id === l.materialId);
    if (!row) continue;
    const available = Math.max(0, row.warehouse) + crewVans.reduce((a, v) => a + Math.max(0, row.vans[v.id] ?? 0), 0);
    const missing = remaining - available;
    if (missing > 0) (out[row.item.supplier] ??= []).push(line(row.item, missing));
  }
  return out;
}

export const orderTotal = (lines: OrderLine[]) => lines.reduce((a, l) => a + l.qty * l.unitCost, 0);
