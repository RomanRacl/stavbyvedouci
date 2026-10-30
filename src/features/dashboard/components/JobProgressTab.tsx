'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, FileSignature, Plus, Trash2, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import { fmt } from '@/features/analytics/lib/metrics';
import { checklistOf, extraWorkOf, suggestExtraPrice } from '@/lib/jobDefaults';
import type { ChecklistItem, CompanySettings, ExtraWork, Job, Member, TimeLog } from '@/types/firestore';
import { RevisionsSection, SafetySection, StagesSection } from './JobOpsSections';

export type ExtraDecision = { approve: true; price: number } | { approve: false };

interface Props {
  job: Job;
  members: Member[];
  settings: CompanySettings;
  timeLogs: TimeLog[];
  onToast: (t: string) => void;
  onDecideExtra: (extraId: string, decision: ExtraDecision) => void;
  onSetChecklist: (items: ChecklistItem[]) => void;
}

const nameOf = (members: Member[], uid: string | null) => members.find((m) => m.uid === uid)?.displayName ?? 'Neznámý';
const when = (d: Date) => d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ---------- vícepráce ---------- */

function ExtraRow({ item, members, settings, onDecide }: { item: ExtraWork; members: Member[]; settings: CompanySettings; onDecide: (d: ExtraDecision) => void }) {
  const [price, setPrice] = useState(String(suggestExtraPrice(item.hours, item.materialCost, settings.billRate, settings.materialMarkup)));
  const pending = item.status === 'pending';
  return (
    <motion.li layout className={`rounded-lg border px-4 py-3 ${pending ? 'border-warn/50 bg-warn/5' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        <Wrench className={`mt-0.5 size-4 shrink-0 ${pending ? 'text-warn-ink' : 'text-ink-3'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{item.description}</p>
          <p className="mt-0.5 text-xs text-ink-3">
            {nameOf(members, item.createdBy)}, {when(item.createdAt)}. Odhad {item.hours.toLocaleString('cs-CZ')} h
            {item.materialCost > 0 && ` a materiál ${fmt.czk(item.materialCost)}`}.
          </p>
        </div>
        {!pending && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${item.status === 'approved' ? 'bg-good/12 text-good-ink' : 'bg-concrete text-ink-3'}`}>
            {item.status === 'approved' ? `Schváleno za ${fmt.czk(item.price ?? 0)}` : 'Zamítnuto'}
          </span>
        )}
      </div>
      {pending && (
        <div className="mt-3 flex flex-wrap items-end gap-2 pl-7">
          <label className="text-xs text-ink-2">
            Cena pro zákazníka bez DPH
            <input
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
              className="mt-1 block h-9 w-36 rounded-md border border-line bg-surface px-2 text-right text-sm text-ink tabular-nums focus:border-series-1 focus:outline-none"
            />
          </label>
          <button
            type="button"
            disabled={!Number(price)}
            onClick={() => onDecide({ approve: true, price: Number(price) })}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3 text-sm font-semibold text-white transition hover:bg-ink/90 active:scale-[0.97] disabled:bg-line disabled:text-ink-3"
          >
            <Check className="size-4" /> Schválit
          </button>
          <button
            type="button"
            onClick={() => onDecide({ approve: false })}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-ink-2 transition hover:bg-concrete hover:text-ink"
          >
            <X className="size-4" /> Zamítnout
          </button>
          <span className="w-full text-xs text-ink-3">Návrh podle sazby {fmt.czk(settings.billRate)}/h a přirážky {Math.round((settings.materialMarkup - 1) * 100)} % na materiál. Schválením se navýší cena zakázky i rozpočet.</span>
        </div>
      )}
    </motion.li>
  );
}

/* ---------- kontrolní seznam ---------- */

function ChecklistEditor({ job, members, onSave }: { job: Job; members: Member[]; onSave: (items: ChecklistItem[]) => void }) {
  const items = checklistOf(job);
  const [text, setText] = useState('');
  const [required, setRequired] = useState(true);

  const add = () => {
    if (!text.trim()) return;
    onSave([...items, { id: `ck_${Date.now().toString(36)}`, text: text.trim(), required, doneBy: null, doneAt: null }]);
    setText('');
  };

  return (
    <div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        <AnimatePresence initial={false}>
          {items.map((i) => (
            <motion.li key={i.id} layout exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 px-3 py-2">
              <span className={`grid size-5 shrink-0 place-items-center rounded border ${i.doneAt ? 'border-good bg-good text-white' : 'border-line'}`} aria-hidden>
                {i.doneAt && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${i.doneAt ? 'text-ink-2' : 'text-ink'}`}>{i.text}</span>
                {i.doneAt && (
                  <span className="block text-xs text-ink-3">
                    {nameOf(members, i.doneBy)}, {when(i.doneAt)}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onSave(items.map((x) => (x.id === i.id ? { ...x, required: !x.required } : x)))}
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition ${i.required ? 'bg-crit/10 text-crit-ink' : 'bg-concrete text-ink-3 hover:text-ink-2'}`}
                title="Přepnout povinnost"
              >
                {i.required ? 'povinné' : 'volitelné'}
              </button>
              <button
                type="button"
                aria-label={`Odebrat ${i.text}`}
                onClick={() => onSave(items.filter((x) => x.id !== i.id))}
                className="grid size-7 shrink-0 place-items-center rounded text-ink-3 transition hover:bg-crit/10 hover:text-crit-ink"
              >
                <Trash2 className="size-3.5" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Nový bod, např. Předat revizní zprávu"
          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-ink focus:border-series-1 focus:outline-none"
        />
        <label className="flex items-center gap-1.5 text-sm text-ink-2">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="accent-ink" /> povinné
        </label>
        <button
          type="button"
          onClick={add}
          disabled={!text.trim()}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-ink px-3 text-sm font-medium text-ink transition hover:bg-ink hover:text-white disabled:border-line disabled:text-ink-3 disabled:hover:bg-transparent"
        >
          <Plus className="size-4" /> Přidat
        </button>
      </div>
      <p className="mt-1.5 text-xs text-ink-3">Povinné body musí parta odškrtnout, než zakázku předá ke schválení.</p>
    </div>
  );
}

/* ---------- záložka ---------- */

export function JobProgressTab({ job, members, settings, timeLogs, onToast, onDecideExtra, onSetChecklist }: Props) {
  const extras = extraWorkOf(job);
  const approvedSum = extras.filter((e) => e.status === 'approved').reduce((a, e) => a + (e.price ?? 0), 0);

  return (
    <div className="space-y-7">
      <StagesSection job={job} timeLogs={timeLogs} onToast={onToast} />

      <section aria-labelledby={`extra-${job.id}`}>
        <div className="mb-2 flex items-baseline gap-2">
          <h3 id={`extra-${job.id}`} className="text-sm font-semibold text-ink">
            Vícepráce
          </h3>
          {approvedSum > 0 && <span className="text-sm text-ink-3 tabular-nums">schváleno navíc {fmt.czk(approvedSum)}</span>}
        </div>
        {extras.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-2">
            Žádné vícepráce. Když zákazník na místě chce něco navíc, parta to nahlásí z mobilu a tady to schválíte.
          </p>
        ) : (
          <ul className="space-y-2">
            {extras.map((e) => (
              <ExtraRow key={e.id} item={e} members={members} settings={settings} onDecide={(d) => onDecideExtra(e.id, d)} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`check-${job.id}`}>
        <h3 id={`check-${job.id}`} className="mb-2 text-sm font-semibold text-ink">
          Kontrolní seznam
        </h3>
        <ChecklistEditor job={job} members={members} onSave={onSetChecklist} />
      </section>

      <RevisionsSection job={job} onToast={onToast} />

      <SafetySection job={job} members={members} onToast={onToast} />

      <section aria-labelledby={`handover-${job.id}`}>
        <h3 id={`handover-${job.id}`} className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <FileSignature className="size-4" /> Předávací protokol
        </h3>
        {job.handover ? (
          <div className="rounded-lg border border-line p-4">
            <p className="text-sm text-ink">
              {job.handover.signature ? (
                <>
                  Převzal(a) <strong>{job.handover.clientName}</strong>
                </>
              ) : (
                'Předáno bez podpisu, zákazník nebyl na místě'
              )}
              <span className="text-ink-2">
                , {when(job.handover.signedAt)}, předal {nameOf(members, job.handover.workerId)}.
              </span>
            </p>
            {job.handover.signature && (
              // eslint-disable-next-line @next/next/no-img-element -- data URL podpisu
              <img src={job.handover.signature} alt={`Podpis: ${job.handover.clientName}`} className="mt-3 h-28 w-auto rounded-md border border-line bg-[#fff]" />
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-2">
            Zatím nepředáno. Protokol s podpisem zákazníka vznikne, až parta v mobilu klepne na Hotovo.
          </p>
        )}
      </section>
    </div>
  );
}
