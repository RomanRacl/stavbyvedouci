'use client';

import { AlertTriangle, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { checklistOf } from '@/lib/jobDefaults';
import type { Job } from '@/types/firestore';

interface Props {
  job: Job;
  photoCount: number;
  open: boolean;
  onClose: () => void;
  onSubmit: (h: { clientName: string; signature: string | null }) => void;
}

/**
 * Předání hotové práce: kontrola povinných bodů, podpis zákazníka prstem.
 * Když zákazník není na místě, jde předat bez podpisu – kancelář to v protokolu uvidí.
 */
export function HandoverSheet({ job, photoCount, open, onClose, onSubmit }: Props) {
  const [clientName, setClientName] = useState(job.client.name);
  const [signature, setSignature] = useState<string | null>(null);
  const [absent, setAbsent] = useState(false);

  useEffect(() => {
    if (open) {
      setClientName(job.client.name);
      setSignature(null);
      setAbsent(false);
    }
  }, [open, job.client.name]);

  const missing = checklistOf(job).filter((i) => i.required && !i.doneAt);
  const ready = missing.length === 0 && (absent || (signature && clientName.trim()));

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Předat hotovou práci"
      footer={
        <button
          type="button"
          disabled={!ready}
          onClick={() => onSubmit({ clientName: absent ? '' : clientName.trim(), signature: absent ? null : signature })}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-good text-base font-semibold text-white transition active:scale-[0.98] disabled:bg-line disabled:text-ink-3"
        >
          <Check className="size-5" /> Předat ke schválení
        </button>
      }
    >
      <div className="space-y-5 pb-4">
        {missing.length > 0 ? (
          <div className="rounded-xl bg-crit/10 p-4 text-crit-ink">
            <p className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="size-5" /> Chybí povinné body
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-base">
              {missing.map((i) => (
                <li key={i.id}>{i.text}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm">Odškrtněte je v kontrolním seznamu zakázky a pak předejte.</p>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-good/10 p-3 text-base text-good-ink">
            <Check className="size-5" /> Kontrolní seznam je hotový{photoCount ? `, ${photoCount} fotek` : ''}.
          </p>
        )}

        {!absent && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-base font-medium text-ink">Kdo práci převzal</span>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="block h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink focus:border-series-1 focus:outline-none"
              />
            </label>
            <div>
              <span className="mb-1.5 block text-base font-medium text-ink">Podpis zákazníka</span>
              <SignaturePad onChange={setSignature} />
            </div>
          </>
        )}

        <label className="flex min-h-12 items-center gap-3 text-base text-ink">
          <input type="checkbox" checked={absent} onChange={(e) => setAbsent(e.target.checked)} className="size-6 accent-ink" />
          Zákazník není na místě, předat bez podpisu
        </label>
      </div>
    </BottomSheet>
  );
}
