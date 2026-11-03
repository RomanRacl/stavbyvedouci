'use client';

import { DocumentShell } from '@/components/print/DocumentShell';
import { QrCode } from '@/components/ui/QrCode';
import { useSnapshot } from '@/lib/mock/useSnapshot';

/** Arch QR štítků na nářadí (3 × N na A4). Štítek naskenuje parta v mobilu při výdeji a vrácení. */
export default function ToolLabelsPrint({ kind }: { kind: string }) {
  const snap = useSnapshot();
  if (!snap) return null;
  const tools = snap.tools.filter((t) => t.active && (kind === 'all' || t.kind === kind));
  return (
    <DocumentShell settings={snap.settings} kind="QR štítky" number={kind === 'equipment' ? 'Technika' : 'Nářadí'} date={new Date()}>
      <ul className="mt-6 grid grid-cols-3 gap-3">
        {tools.map((t) => (
          <li key={t.id} className="flex break-inside-avoid items-center gap-2 rounded-md border border-dashed border-ink-3 p-2">
            <QrCode value={t.code} size={72} label={`QR kód ${t.code}`} />
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold tabular-nums">{t.code}</span>
              <span className="block text-[11px] leading-tight">{t.name}</span>
              <span className="block text-[10px] text-ink-3">{snap.settings.name}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-ink-3">Vytiskněte na samolepicí papír nebo přelepte průhlednou páskou, ať štítek vydrží na stavbě.</p>
    </DocumentShell>
  );
}
