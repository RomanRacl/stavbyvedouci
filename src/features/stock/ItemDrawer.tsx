'use client';

import { ArrowRightLeft, ClipboardCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { btnPrimary, btnSecondary, inputCls } from '@/components/shell/PageHeader';
import { fmt } from '@/features/analytics/lib/metrics';
import type { Snapshot } from '@/lib/mock/localBackend';
import { adjustStock, deleteCatalogItem, newMaterialId, saveCatalogItem, transferStock } from '@/lib/mock/localBackend';
import { locationLabel, stockAt } from '@/lib/stock';
import type { MaterialItem, StockLocation, StockMove, Unit } from '@/types/firestore';

const UNITS: Unit[] = ['ks', 'm', 'kg', 'bal', 'l'];

const KIND_LABEL: Record<StockMove['kind'], string> = {
  receive: 'Příjem',
  transfer: 'Převod',
  issue: 'Výdej',
  return: 'Vratka',
  adjust: 'Inventura',
};

interface Props {
  open: boolean;
  item: MaterialItem | null; // null = nová položka
  snap: Snapshot;
  userId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}

function emptyItem(): MaterialItem {
  return { id: '', sku: '', name: '', category: '', unit: 'ks', unitCost: 0, stockQty: 0, reorderPoint: 0, supplier: '', barcode: '' };
}

/** Detail položky skladu: úprava v katalogu, stav po místech, převod do auta, inventura a historie pohybů. */
export function ItemDrawer({ open, item, snap, userId, onClose, onDone }: Props) {
  const [form, setForm] = useState<MaterialItem>(emptyItem);
  const [error, setError] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const locations: StockLocation[] = ['warehouse', ...snap.vans.map((v) => `van:${v.id}` as const)];
  const [tr, setTr] = useState({ from: 'warehouse' as StockLocation, to: locations[1] ?? 'warehouse', qty: '' });
  const [inv, setInv] = useState({ location: 'warehouse' as StockLocation, qty: '' });

  useEffect(() => {
    if (!open) return;
    setForm(item ? { ...item, barcode: item.barcode ?? '' } : emptyItem());
    setError('');
    setConfirmDel(false);
    setTr({ from: 'warehouse', to: locations[1] ?? 'warehouse', qty: '' });
    setInv({ location: 'warehouse', qty: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- formulář se plní jen při otevření
  }, [open, item?.id]);

  const live = item ? snap.catalog.find((c) => c.id === item.id) ?? item : null;
  const categories = useMemo(() => [...new Set(snap.catalog.map((c) => c.category))].sort(), [snap.catalog]);
  const moves = useMemo(
    () => (live ? snap.stockMoves.filter((m) => m.materialId === live.id).sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 20) : []),
    [live, snap.stockMoves],
  );

  const set = <K extends keyof MaterialItem>(k: K, v: MaterialItem[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Vyplňte název položky.');
    if (!form.sku.trim()) return setError('Vyplňte kód (např. katalogové číslo dodavatele).');
    const dup = snap.catalog.find((c) => c.id !== form.id && c.sku.toLowerCase() === form.sku.trim().toLowerCase());
    if (dup) return setError(`Kód ${form.sku} už má položka „${dup.name}“.`);
    saveCatalogItem({
      ...form,
      id: form.id || newMaterialId(),
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category.trim() || 'Ostatní',
      supplier: form.supplier.trim(),
      barcode: form.barcode?.replace(/\D/g, '') || undefined,
    });
    onDone(item ? 'Položka uložena.' : 'Položka přidána do katalogu.');
  };

  const refLabel = (m: StockMove) => {
    if (!m.ref) return m.note ?? '';
    const job = snap.jobs.find((j) => j.id === m.ref);
    if (job) return job.code;
    const order = snap.orders.find((o) => o.id === m.ref);
    if (order) return order.number;
    return m.note ?? '';
  };
  const nameOf = (uid: string) => snap.members.find((x) => x.uid === uid)?.displayName ?? '';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={item ? item.name : 'Nová položka'}
      subtitle={item ? `${item.sku}${item.barcode ? `, EAN ${item.barcode}` : ''}` : 'Přidání do katalogu materiálu'}
      width={560}
      footer={
        <div className="flex items-center gap-2">
          {item &&
            (confirmDel ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    deleteCatalogItem(item.id);
                    onDone('Položka odebrána z katalogu.');
                  }}
                  className="h-10 rounded-lg bg-crit px-3 text-sm font-semibold text-white"
                >
                  Opravdu odebrat
                </button>
                <button type="button" onClick={() => setConfirmDel(false)} className="h-10 px-2 text-sm text-ink-2">
                  Ne
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDel(true)} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-2 hover:bg-crit/10 hover:text-crit-ink">
                <Trash2 className="size-4" /> Odebrat
              </button>
            ))}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={btnSecondary}>
            Zavřít
          </button>
          <button type="submit" form="item-form" className={btnPrimary}>
            {item ? 'Uložit' : 'Přidat položku'}
          </button>
        </div>
      }
    >
      <form id="item-form" onSubmit={save} className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-sm font-medium text-ink">
          Název
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-sm font-medium text-ink">
          Kód
          <input value={form.sku} onChange={(e) => set('sku', e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-sm font-medium text-ink">
          EAN (čárový kód)
          <input inputMode="numeric" value={form.barcode ?? ''} onChange={(e) => set('barcode', e.target.value)} className={`${inputCls} mt-1 tabular-nums`} />
        </label>
        <label className="text-sm font-medium text-ink">
          Kategorie
          <input list="categories" value={form.category} onChange={(e) => set('category', e.target.value)} className={`${inputCls} mt-1`} />
          <datalist id="categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="text-sm font-medium text-ink">
          Dodavatel
          <input list="suppliers" value={form.supplier} onChange={(e) => set('supplier', e.target.value)} className={`${inputCls} mt-1`} />
          <datalist id="suppliers">
            {snap.suppliers.map((s) => (
              <option key={s.name} value={s.name} />
            ))}
          </datalist>
        </label>
        <label className="text-sm font-medium text-ink">
          Jednotka
          <select value={form.unit} onChange={(e) => set('unit', e.target.value as Unit)} className={`${inputCls} mt-1`}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">
          Nákupní cena (Kč/{form.unit})
          <input
            inputMode="numeric"
            value={form.unitCost}
            onChange={(e) => set('unitCost', Math.max(0, Math.round(Number(e.target.value.replace(/\s/g, '')) || 0)))}
            className={`${inputCls} mt-1 text-right tabular-nums`}
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Minimum celkem ({form.unit})
          <input
            inputMode="numeric"
            value={form.reorderPoint}
            onChange={(e) => set('reorderPoint', Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))}
            className={`${inputCls} mt-1 text-right tabular-nums`}
          />
        </label>
        {!item && (
          <label className="text-sm font-medium text-ink">
            Počáteční stav ve skladu
            <input
              inputMode="numeric"
              value={form.stockQty}
              onChange={(e) => set('stockQty', Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))}
              className={`${inputCls} mt-1 text-right tabular-nums`}
            />
          </label>
        )}
        {error && <p className="col-span-2 text-sm text-crit-ink">{error}</p>}
        <p className="col-span-2 text-xs text-ink-3">Pod minimem (sklad + auta dohromady) se položka objeví v návrhu objednávky. Minimum 0 = nehlídat.</p>
      </form>

      {live && (
        <>
          <section className="mt-7" aria-labelledby="loc-h">
            <h3 id="loc-h" className="mb-2 text-sm font-semibold text-ink">
              Stav po místech
            </h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {locations.map((loc) => {
                const q = stockAt(live, snap.stockMoves, loc);
                return (
                  <li key={loc} className="flex items-center px-3 py-2 text-sm">
                    <span className="flex-1 text-ink">{locationLabel(loc, snap.vans)}</span>
                    <span className={`font-semibold tabular-nums ${q < 0 ? 'text-crit-ink' : 'text-ink'}`}>
                      {fmt.num(q)} {live.unit}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-concrete/60 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <ArrowRightLeft className="size-4" /> Převést
              </p>
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="Odkud" value={tr.from} onChange={(e) => setTr({ ...tr, from: e.target.value as StockLocation })} className={inputCls}>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      z: {locationLabel(l, snap.vans)}
                    </option>
                  ))}
                </select>
                <select aria-label="Kam" value={tr.to} onChange={(e) => setTr({ ...tr, to: e.target.value as StockLocation })} className={inputCls}>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      do: {locationLabel(l, snap.vans)}
                    </option>
                  ))}
                </select>
                <input
                  inputMode="numeric"
                  placeholder={`Množství (${live.unit})`}
                  value={tr.qty}
                  onChange={(e) => setTr({ ...tr, qty: e.target.value.replace(/\D/g, '') })}
                  className={`${inputCls} text-right tabular-nums`}
                />
                <button
                  type="button"
                  disabled={!Number(tr.qty) || tr.from === tr.to}
                  onClick={() => {
                    transferStock(userId, live.id, Number(tr.qty), tr.from, tr.to);
                    setTr({ ...tr, qty: '' });
                    onDone(`Převedeno ${tr.qty} ${live.unit} do: ${locationLabel(tr.to, snap.vans)}.`);
                  }}
                  className={`${btnPrimary} justify-center`}
                >
                  Převést
                </button>
              </div>
            </div>
            <div className="rounded-lg bg-concrete/60 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <ClipboardCheck className="size-4" /> Inventura
              </p>
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="Místo" value={inv.location} onChange={(e) => setInv({ ...inv, location: e.target.value as StockLocation })} className={`${inputCls} col-span-2`}>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {locationLabel(l, snap.vans)}
                    </option>
                  ))}
                </select>
                <input
                  inputMode="numeric"
                  placeholder="Napočítáno"
                  value={inv.qty}
                  onChange={(e) => setInv({ ...inv, qty: e.target.value.replace(/\D/g, '') })}
                  className={`${inputCls} text-right tabular-nums`}
                />
                <button
                  type="button"
                  disabled={inv.qty === ''}
                  onClick={() => {
                    adjustStock(userId, live.id, inv.location, Number(inv.qty));
                    setInv({ ...inv, qty: '' });
                    onDone('Inventura zapsána.');
                  }}
                  className={`${btnSecondary} justify-center`}
                >
                  Zapsat
                </button>
              </div>
            </div>
          </section>

          <section className="mt-7" aria-labelledby="hist-h">
            <h3 id="hist-h" className="mb-2 text-sm font-semibold text-ink">
              Poslední pohyby
            </h3>
            {moves.length === 0 ? (
              <p className="text-sm text-ink-2">Zatím žádné pohyby.</p>
            ) : (
              <ol className="divide-y divide-line text-sm">
                {moves.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2">
                    <span className="w-20 shrink-0 text-ink-2">{KIND_LABEL[m.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">
                        {locationLabel(m.location, snap.vans)}
                        {refLabel(m) && <span className="text-ink-3">, {refLabel(m)}</span>}
                      </span>
                      <span className="block text-xs text-ink-3">
                        {nameOf(m.by)}, {fmt.dateTime(m.at)}
                      </span>
                    </span>
                    <span className={`font-semibold tabular-nums ${m.delta < 0 ? 'text-ink-2' : 'text-good-ink'}`}>
                      {m.delta > 0 ? '+' : ''}
                      {fmt.num(m.delta)} {live.unit}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </Drawer>
  );
}
