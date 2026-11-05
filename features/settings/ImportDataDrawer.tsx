'use client';

import { FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { btnPrimary, btnSecondary } from '@/components/shell/PageHeader';
import { Drawer } from '@/components/ui/Drawer';
import { fmt } from '@/features/analytics/lib/metrics';
import { CLIENT_FIELDS, detectFields, JOB_FIELDS, jobFromRow, toClients, toJobRows, type ColumnMap, type ImportKind } from '@/lib/import/dataImport';
import { readTable, type Table } from '@/lib/import/priceList';
import { DEFAULT_HOURLY_COST } from '@/lib/jobDefaults';
import { importClients, importJobs, newJobId, type Snapshot } from '@/lib/mock/localBackend';
import { TRADE_LABEL } from '@/lib/trades';

/** Import zakázek nebo zákazníků z Excelu/CSV: rozpozná sloupce, ukáže náhled a založí záznamy. */
export function ImportDataDrawer({ kind, snap, onClose, onDone }: { kind: ImportKind | null; snap: Snapshot; onClose: () => void; onDone: (t: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [header, setHeader] = useState(0);
  const [map, setMap] = useState<ColumnMap>({});
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const fields = kind === 'clients' ? CLIENT_FIELDS : JOB_FIELDS;

  const load = async (file: File) => {
    setError('');
    try {
      const t = await readTable(file);
      if (!t.length) throw new Error('empty');
      const det = detectFields(t, kind ?? 'jobs');
      setTable(t);
      setHeader(det.headerRow);
      setMap(det.map);
      setName(file.name);
    } catch {
      setError('Soubor se nepodařilo přečíst. Uložte ho z Excelu jako .xlsx nebo .csv.');
    }
  };

  const reset = () => {
    setTable(null);
    setMap({});
    setName('');
  };

  const jobRows = table && kind === 'jobs' ? toJobRows(table, header, map) : [];
  const clientRows = table && kind === 'clients' ? toClients(table, header, map) : [];
  const count = kind === 'jobs' ? jobRows.length : clientRows.length;
  const required = kind === 'jobs' ? ['title', 'client'] : ['name'];
  const missing = required.filter((f) => map[f] === undefined);
  const headers = table?.[header] ?? [];

  const run = () => {
    if (kind === 'clients') {
      const added = importClients(clientRows);
      onDone(`Naimportováno ${clientRows.length} zákazníků (${added} nových).`);
    } else {
      const workers = snap.members.filter((m) => m.role !== 'owner');
      const rate = workers.length ? Math.round(workers.reduce((a, m) => a + m.hourlyCost, 0) / workers.length) : DEFAULT_HOURLY_COST;
      let max = snap.jobs.reduce((m, j) => Math.max(m, Number(j.code.split('-')[2]) || 0), 0);
      const year = new Date().getFullYear();
      const jobs = jobRows.map((r) => jobFromRow(r, newJobId(), `Z-${year}-${String(++max).padStart(4, '0')}`, rate));
      importJobs(jobs);
      onDone(`Naimportováno ${jobs.length} zakázek.`);
    }
    reset();
  };

  return (
    <Drawer
      open={Boolean(kind)}
      onClose={() => {
        reset();
        onClose();
      }}
      title={kind === 'clients' ? 'Import zákazníků z Excelu' : 'Import zakázek z Excelu'}
      subtitle={name || 'Soubor .xlsx nebo .csv s hlavičkou v prvních řádcích'}
      width={720}
      footer={
        table ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={reset} className={btnSecondary}>
              Jiný soubor
            </button>
            <span className="flex-1 text-sm text-ink-2">{missing.length ? `Chybí sloupec: ${missing.map((f) => (fields as Record<string, { label: string }>)[f].label).join(', ')}` : `${count} řádků k importu`}</span>
            <button type="button" disabled={Boolean(missing.length) || !count} onClick={run} className={btnPrimary}>
              Importovat {count}
            </button>
          </div>
        ) : undefined
      }
    >
      {!table ? (
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) load(f);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-6 py-12 text-center hover:border-ink-3"
          >
            <Upload className="size-6 text-ink-3" />
            <span className="font-medium text-ink">Přetáhněte sem soubor nebo klepněte</span>
            <span className="text-sm text-ink-2">Sloupce se rozpoznají podle názvů: {Object.values(fields).map((f) => f.label).join(', ')}.</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) load(f);
            }}
          />
          {error && <p className="mt-3 text-sm text-crit-ink">{error}</p>}
          <p className="mt-4 flex items-start gap-2 text-sm text-ink-2">
            <FileSpreadsheet className="mt-0.5 size-4 shrink-0" />
            {kind === 'jobs'
              ? 'Hotové zakázky (stav „hotovo“ nebo „fakturováno“) se založí jako dokončené, takže se hned započítají do analytiky a odhadů.'
              : 'Zákazníky se stejným jménem aplikace spojí, doplní jen prázdné údaje.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Sloupce</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(fields).map(([f, def]) => (
                <label key={f} className="text-xs text-ink-2">
                  {def.label}
                  {required.includes(f) && ' *'}
                  <select
                    value={map[f] ?? ''}
                    onChange={(e) => setMap({ ...map, [f]: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-sm"
                  >
                    <option value="">nepoužít</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `sloupec ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Náhled (prvních 8)</h3>
            <div className="overflow-x-auto rounded-lg border border-line">
              {kind === 'jobs' ? (
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-concrete/60 text-left text-xs text-ink-2">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Zakázka</th>
                      <th className="px-2 py-1.5 font-medium">Zákazník</th>
                      <th className="px-2 py-1.5 font-medium">Obor</th>
                      <th className="px-2 py-1.5 text-right font-medium">Cena</th>
                      <th className="px-2 py-1.5 font-medium">Termín</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {jobRows.slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">{r.title}</td>
                        <td className="px-2 py-1.5">{r.client}</td>
                        <td className="px-2 py-1.5">{TRADE_LABEL[r.trade]}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt.czk(r.revenue)}</td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {r.start.toLocaleDateString('cs-CZ')}–{r.due.toLocaleDateString('cs-CZ')}
                          {r.warnings.length > 0 && <span className="block text-xs text-warn-ink">{r.warnings.join(', ')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-concrete/60 text-left text-xs text-ink-2">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Jméno</th>
                      <th className="px-2 py-1.5 font-medium">IČO</th>
                      <th className="px-2 py-1.5 font-medium">Telefon</th>
                      <th className="px-2 py-1.5 font-medium">Adresa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {clientRows.slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">{r.name}</td>
                        <td className="px-2 py-1.5 tabular-nums">{r.ico}</td>
                        <td className="px-2 py-1.5">{r.phone}</td>
                        <td className="px-2 py-1.5">{r.address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}
    </Drawer>
  );
}
