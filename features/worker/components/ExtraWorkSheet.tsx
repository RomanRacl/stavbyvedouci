'use client';

import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { DictateButton } from '@/components/ui/DictateButton';
import { buzz } from '../hooks/useWorkerData';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { description: string; hours: number; materialCost: number }) => void;
}

/**
 * Nahlášení víceprací z terénu. Dělník popíše, co zákazník chce navíc, a odhadne čas
 * a materiál. Cenu pro zákazníka určí kancelář při schválení.
 */
export function ExtraWorkSheet({ open, onClose, onSubmit }: Props) {
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState(1);
  const [material, setMaterial] = useState('');

  useEffect(() => {
    if (open) {
      setDescription('');
      setHours(1);
      setMaterial('');
    }
  }, [open]);

  const step = (d: number) => {
    buzz();
    setHours((h) => Math.max(0, Math.round((h + d) * 2) / 2));
  };

  const valid = description.trim().length >= 3;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Nahlásit vícepráci"
      footer={
        <button
          type="button"
          disabled={!valid}
          onClick={() => onSubmit({ description: description.trim(), hours, materialCost: Math.round(Number(material) || 0) })}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-ink text-base font-semibold text-white transition active:scale-[0.98] disabled:bg-line disabled:text-ink-3"
        >
          Poslat ke schválení do kanceláře
        </button>
      }
    >
      <div className="space-y-5 pb-4">
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-base font-medium text-ink">
            Co zákazník chce navíc?
            <DictateButton onText={(t) => setDescription((cur) => (cur ? `${cur} ${t}` : t))} />
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="např. 2 zásuvky navíc v kuchyni nad linkou"
            className="block w-full rounded-xl border border-line bg-surface px-3 py-3 text-base text-ink placeholder:text-ink-3 focus:border-series-1 focus:outline-none"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-base font-medium text-ink">Odhad práce</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Ubrat půl hodiny" onClick={() => step(-0.5)} className="grid size-14 place-items-center rounded-xl border border-line active:bg-concrete">
              <Minus className="size-5" />
            </button>
            <span className="flex-1 text-center font-display text-3xl font-semibold text-ink tabular-nums">
              {hours.toLocaleString('cs-CZ')} h
            </span>
            <button type="button" aria-label="Přidat půl hodiny" onClick={() => step(0.5)} className="grid size-14 place-items-center rounded-xl bg-ink text-white active:scale-95">
              <Plus className="size-5" />
            </button>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-base font-medium text-ink">Materiál navíc (Kč, odhad)</span>
          <input
            inputMode="numeric"
            value={material}
            onChange={(e) => setMaterial(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className="block h-14 w-full rounded-xl border border-line bg-surface px-3 text-xl text-ink tabular-nums focus:border-series-1 focus:outline-none"
          />
        </label>

        <p className="text-sm text-ink-2">Práci navíc začněte až po schválení kanceláří, jinak ji nemusí zákazník zaplatit.</p>
      </div>
    </BottomSheet>
  );
}
