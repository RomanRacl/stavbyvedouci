'use client';

import { motion } from 'framer-motion';
import { Download, Table2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { downloadFile, toCSV } from '@/lib/money';

interface Props {
  title: string;
  help?: string;
  /** Data pro export do Excelu: první řádek = hlavička. */
  csv?: { name: string; rows: Array<Array<string | number>> };
  /** Přepínač graf/tabulka – rodič drží stav. */
  table?: { on: boolean; toggle: () => void };
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}

/** Karta analytiky: nadpis s nápovědou, legenda, export do CSV a přepnutí na tabulku. */
export function ChartCard({ title, help, csv, table, legend, children, className = '', delay = 0 }: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-xl border border-line bg-surface p-5 break-inside-avoid ${className}`}
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="flex items-center gap-1 text-base font-semibold text-ink">
          {title}
          {help && <InfoTip>{help}</InfoTip>}
        </h2>
        {legend}
        <span className="flex-1" />
        <div className="flex items-center gap-1 print:hidden">
          {table && (
            <button
              type="button"
              onClick={table.toggle}
              aria-pressed={table.on}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition ${table.on ? 'bg-concrete text-ink' : 'text-ink-2 hover:text-ink'}`}
            >
              <Table2 className="size-4" /> Tabulka
            </button>
          )}
          {csv && (
            <button
              type="button"
              onClick={() => downloadFile(`${csv.name}.csv`, toCSV(csv.rows), 'text/csv;charset=utf-8')}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-ink-2 transition hover:text-ink"
              title="Stáhnout pro Excel"
            >
              <Download className="size-4" /> CSV
            </button>
          )}
        </div>
      </header>
      {children}
    </motion.section>
  );
}

export function LegendDot({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <li className="flex items-center gap-1.5 text-sm text-ink-2">
      <span className={line ? 'h-0.5 w-4 rounded-full' : 'size-2.5 rounded-sm'} style={{ background: color }} />
      {label}
    </li>
  );
}

/** Jednotný tooltip grafů: řádky s barevnou značkou, hodnoty v inkoustu. */
export function ChartTip({ title, rows }: { title: string; rows: Array<{ color?: string; label: string; value: string; strong?: boolean }> }) {
  return (
    <div className="min-w-48 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm shadow-xl shadow-ink/10">
      <p className="mb-1.5 font-medium text-ink">{title}</p>
      <dl className="space-y-1 tabular-nums">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: r.color ?? 'transparent' }} />
            <dt className="text-ink-2">{r.label}</dt>
            <dd className={`ml-auto pl-4 text-ink ${r.strong ? 'font-semibold' : 'font-medium'}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
