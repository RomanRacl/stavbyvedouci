'use client';

import { FileSpreadsheet, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { btnPrimary, btnSecondary, inputCls } from '@/components/shell/PageHeader';
import { fmt } from '@/features/analytics/lib/metrics';
import { detectColumns, FIELD_LABEL, readTable, toImportRows, type Field, type Table } from '@/lib/import/priceList';
import { importPriceList, type Snapshot } from '@/lib/mock/localBackend';

interface Props {
  open: boolean;
  snap: Snapshot;
  onClose: () => void;
  onDone: (message: string) => void;
}

const FIELDS: Field[] = ['sku', 'name', 'unit', 'unitCost', 'barcode', 'category'];

/**
 * Import ceníku dodavatele z Excelu (.xlsx) nebo CSV. Sloupce se rozpoznají podle hlavičky,
 * lze je ručně přeřadit. Náhled ukáže nové položky a změny cen ještě před uložením.
 */
export function ImportDrawer({ open, snap, onClose, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<Table | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState<Partial<Record<Field, number>>>({});
  const [supplier, setSupplier] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (open) {
      setTable(null);
      setFileName('');
      setError('');
      setSupplier(snap.suppliers[0]?.name ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset jen při otevření
  }, [open]);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const t = await readTable(file);
      if (!t.length) throw new Error('Soubor je prázdný.');
      const det = detectColumns(t);
      setTable(t);
      setHeaderRow(det.headerRow);
      setMap(det.map);
      setFileName(file.name);
    } catch (e) {
      setTable(null);
      setError(e instanceof Error ? e.message : 'Soubor se nepodařilo přečíst.');
    }
  };

  const rows = useMemo(() => (table ? toImportRows(table, headerRow, map) : []), [table, headerRow, map]);
  const preview = useMemo(
    () =>
      rows.map((r) => {
        const match = snap.catalog.find(
          (c) => (r.sku && c.sku.toLowerCase() === r.sku.toLowerCase()) || (r.barcode && c.barcode === r.barcode) || (!r.sku && c.name.toLowerCase() === r.name.toLowerCase()),
        );
        return { r, match, change: match ? (r.unitCost - match.unitCost) / Math.max(1, match.unitCost) : null };
      }),
    [rows, snap.catalog],
  );
  const added = preview.filter((p) => !p.match && p.r.name).length;
  const changed = preview.filter((p) => p.match && p.match.unitCost !== p.r.unitCost).length;
  const headers = table?.[headerRow] ?? [];
  const canImport = rows.length > 0 && map.unitCost !== undefined && (map.sku !== undefined || map.name !== undefined) && supplier.trim();

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Import ceníku"
      subtitle="Excel (.xlsx) nebo CSV od dodavatele"
      width={720}
      footer={
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-ink-2">
            {table ? (
              <>
                <strong className="text-ink">{added}</strong> nových položek, <strong className="text-ink">{changed}</strong> změn cen
              </>
            ) : (
              'Vyberte soubor'
            )}
          </p>
          <button type="button" onClick={onClose} className={btnSecondary}>
            Zrušit
          </button>
          <button
            type="button"
            disabled={!canImport}
            onClick={() => {
              const res = importPriceList(rows, supplier.trim());
              onDone(`Ceník naimportován: ${res.added} nových položek, ${res.updated} změn cen.`);
            }}
            className={btnPrimary}
          >
            Importovat
          </button>
        </div>
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void load(e.dataTransfer.files[0]);
        }}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
          drag ? 'border-series-1 bg-series-1/5' : 'border-line'
        }`}
      >
        {fileName ? (
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <FileSpreadsheet className="size-5 text-good-ink" /> {fileName}, {rows.length} řádků s cenou
          </p>
        ) : (
          <>
            <Upload className="size-6 text-ink-3" />
            <p className="mt-2 text-sm text-ink">Přetáhněte sem soubor s ceníkem</p>
            <p className="text-xs text-ink-3">Excel .xlsx nebo CSV. Stačí sloupce s kódem nebo názvem a cenou.</p>
          </>
        )}
        <button type="button" onClick={() => fileRef.current?.click()} className={`${btnSecondary} mt-3`}>
          {fileName ? 'Vybrat jiný soubor' : 'Vybrat soubor'}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" hidden onChange={(e) => void load(e.target.files?.[0])} />
      </div>
      {error && <p className="mt-3 text-sm text-crit-ink">{error}</p>}

      {table && (
        <>
          <section className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-ink">Dodavatel</h3>
            <input list="import-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} className={`${inputCls} max-w-xs`} />
            <datalist id="import-suppliers">
              {snap.suppliers.map((s) => (
                <option key={s.name} value={s.name} />
              ))}
            </datalist>
          </section>

          <section className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-ink">Sloupce</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FIELDS.map((f) => (
                <label key={f} className="text-xs text-ink-2">
                  {FIELD_LABEL[f]}
                  <select
                    value={map[f] ?? ''}
                    onChange={(e) => setMap({ ...map, [f]: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className={`${inputCls} mt-1`}
                  >
                    <option value="">nepoužít</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Sloupec ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {map.unitCost === undefined && <p className="mt-2 text-sm text-crit-ink">Vyberte sloupec s cenou.</p>}
          </section>

          <section className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-ink">Náhled (prvních 50)</h3>
            <div className="max-h-80 overflow-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-concrete text-left text-xs text-ink-2">
                  <tr>
                    <th className="px-3 py-2 font-medium">Kód</th>
                    <th className="px-3 py-2 font-medium">Název</th>
                    <th className="px-3 py-2 text-right font-medium">Cena</th>
                    <th className="px-3 py-2 font-medium">Změna</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.slice(0, 50).map(({ r, match, change }, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-ink-2 tabular-nums">{r.sku}</td>
                      <td className="px-3 py-1.5 text-ink">{r.name || match?.name}</td>
                      <td className="px-3 py-1.5 text-right text-ink tabular-nums">
                        {fmt.czk(r.unitCost)}/{r.unit}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {!match ? (
                          <span className="rounded bg-series-1/10 px-1.5 py-0.5 text-xs font-medium text-series-1-ink">nová</span>
                        ) : change ? (
                          <span className={change > 0 ? 'text-crit-ink' : 'text-good-ink'}>
                            {fmt.signedPct(change)} (z {fmt.czk(match.unitCost)})
                          </span>
                        ) : (
                          <span className="text-ink-3">beze změny</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Drawer>
  );
}
