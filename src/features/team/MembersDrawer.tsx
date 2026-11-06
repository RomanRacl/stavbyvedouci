'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { btnPrimary, btnSecondary, inputCls } from '@/components/shell/PageHeader';
import { Drawer } from '@/components/ui/Drawer';
import { initialsOf } from '@/features/onboarding/FreshStartWizard';
import { saveMembers, type Snapshot } from '@/lib/mock/localBackend';
import type { Member, Role } from '@/types/firestore';

const newUid = () => `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * Lidé ve firmě: přidání, úprava, vyřazení. Kdo už má zapsanou práci, nejde smazat (zmizela by historie),
 * jen vyřadit – pak ho mobil nenabízí.
 */
export function MembersDrawer({ open, snap, onClose, onDone }: { open: boolean; snap: Snapshot; onClose: () => void; onDone: (text: string) => void }) {
  const [rows, setRows] = useState<Member[]>([]);
  useEffect(() => {
    if (open) setRows(snap.members.map((m) => ({ ...m })));
  }, [open, snap.members]);

  const hasHistory = (uid: string) => snap.timeLogs.some((l) => l.workerId === uid) || !!snap.members.find((m) => m.uid === uid)?.activeTimer;
  const patch = (uid: string, p: Partial<Member>) => setRows((xs) => xs.map((x) => (x.uid === uid ? { ...x, ...p } : x)));
  const valid = rows.every((r) => r.displayName.trim());

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Lidé ve firmě"
      subtitle="Mobil party nabízí jen aktivní lidi. Náklad na hodinu je mzda včetně odvodů."
      width={640}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Zrušit
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => {
              saveMembers(rows.map((r) => ({ ...r, displayName: r.displayName.trim(), initials: initialsOf(r.displayName) })));
              onDone('Lidé uloženi.');
            }}
            className={btnPrimary}
          >
            Uložit
          </button>
        </div>
      }
    >
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.uid} className={`grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1.3fr_1fr_1fr_0.7fr] ${r.active ? '' : 'opacity-60'}`}>
            <label className="text-sm font-medium text-ink">
              Jméno
              <input value={r.displayName} onChange={(e) => patch(r.uid, { displayName: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-sm font-medium text-ink">
              Telefon
              <input type="tel" value={r.phone} onChange={(e) => patch(r.uid, { phone: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-sm font-medium text-ink">
              Role
              {r.role === 'owner' ? (
                <input value="Majitel" readOnly className={`${inputCls} mt-1 text-ink-2`} />
              ) : (
                <select value={r.role} onChange={(e) => patch(r.uid, { role: e.target.value as Role })} className={`${inputCls} mt-1`}>
                  <option value="worker">Montér / dělník</option>
                  <option value="manager">Parťák / stavbyvedoucí</option>
                </select>
              )}
            </label>
            <label className="text-sm font-medium text-ink">
              Kč/h
              <input
                inputMode="numeric"
                value={r.hourlyCost}
                onChange={(e) => patch(r.uid, { hourlyCost: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                className={`${inputCls} mt-1 text-right tabular-nums`}
              />
            </label>
            {r.role !== 'owner' && (
              <div className="flex items-center gap-3 sm:col-span-4">
                <label className="flex items-center gap-2 text-sm text-ink-2">
                  <input type="checkbox" checked={r.active} onChange={(e) => patch(r.uid, { active: e.target.checked })} className="size-4" /> Aktivní
                </label>
                {!hasHistory(r.uid) && (
                  <button type="button" onClick={() => setRows((xs) => xs.filter((x) => x.uid !== r.uid))} className="ml-auto inline-flex items-center gap-1 text-sm text-ink-2 hover:text-crit">
                    <Trash2 className="size-4" /> Smazat
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setRows((xs) => [...xs, { uid: newUid(), displayName: '', initials: '', role: 'worker', phone: '', hourlyCost: 350, active: true, activeTimer: null }])}
        className={`${btnSecondary} mt-3`}
      >
        <Plus className="size-4" /> Přidat člověka
      </button>
    </Drawer>
  );
}
