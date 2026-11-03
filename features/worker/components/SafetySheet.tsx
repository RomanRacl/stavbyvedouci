'use client';

import { ShieldCheck } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { safetyOf } from '@/lib/operations';
import type { Job } from '@/types/firestore';

/** Poučení BOZP pro stavbu – potvrzuje se jednou, před prvním začátkem práce na zakázce. */
export function SafetySheet({ job, open, onClose, onConfirm }: { job: Job | null; open: boolean; onClose: () => void; onConfirm: () => void }) {
  if (!job) return null;
  const sf = safetyOf(job);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Než začnete: bezpečnost na stavbě"
      footer={
        <button type="button" onClick={onConfirm} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-ink text-base font-semibold text-white transition active:scale-[0.98]">
          <ShieldCheck className="size-5" /> Byl(a) jsem poučen(a), začít práci
        </button>
      }
    >
      <p className="text-sm text-ink-2">
        {job.code} {job.title}, {job.client.address}
      </p>
      <p className="mt-3 pb-4 text-base leading-relaxed whitespace-pre-line text-ink">{sf.text}</p>
      <p className="pb-4 text-sm text-ink-3">Potvrzení se uloží s datem a časem. Na této zakázce se už nebude opakovat, dokud mistr poučení nezmění.</p>
    </BottomSheet>
  );
}
