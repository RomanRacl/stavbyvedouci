'use client';

import { AlertTriangle, Check, ClipboardCheck, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fmt } from '@/features/analytics/lib/metrics';
import { addRevision, deleteRevision, setSafetyText, setStages } from '@/lib/mock/localBackend';
import { progressFromStages, safetyOf, STAGE_PRESETS } from '@/lib/operations';
import type { Job, Member, Stage, TimeLog } from '@/types/firestore';

const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sid = () => `st_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/* ---------- Etapy ---------- */

export function StagesSection({ job, timeLogs, onToast }: { job: Job; timeLogs: TimeLog[]; onToast: (t: string) => void }) {
  const stages = job.stages ?? [];
  const [draft, setDraft] = useState<Stage[] | null>(null);
  const list = draft ?? stages;
  const hoursOf = (id: string) => timeLogs.filter((l) => l.jobId === job.id && l.stageId === id).reduce((a, l) => a + (l.durationMin ?? 0) / 60, 0);
  const plannedSum = list.reduce((a, s) => a + s.plannedHours, 0);

  const startFromPreset = () => {
    const names = STAGE_PRESETS[job.trade];
    const each = Math.round((job.budget.laborHours / names.length) * 10) / 10;
    setDraft(names.map((name) => ({ id: sid(), name, plannedHours: each, progressPct: 0, doneAt: null })));
  };

  return (
    <section aria-labelledby={`stages-${job.id}`}>
      <div className="mb-2 flex items-center gap-2">
        <h3 id={`stages-${job.id}`} className="mr-auto text-sm font-semibold text-ink">
          Etapy
        </h3>
        {stages.length > 0 && !draft && (
          <button type="button" onClick={() => setDraft(structuredClone(stages))} className="h-8 rounded-md px-2.5 text-sm text-ink-2 hover:bg-concrete hover:text-ink">
            Upravit
          </button>
        )}
      </div>

      {!draft && stages.length === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-2">
          <span className="flex-1">Bez etap se postup hlásí jen jedním číslem. Etapy ukážou, kde přesně zakázka je a kolik hodin která část zabrala.</span>
          <button type="button" onClick={startFromPreset} className="h-9 rounded-md border border-ink px-3 font-medium text-ink hover:bg-ink hover:text-white">
            Rozdělit na etapy
          </button>
        </div>
      )}

      {!draft && stages.length > 0 && (
        <ol className="space-y-2">
          {stages.map((s, i) => {
            const actual = hoursOf(s.id);
            const over = s.plannedHours > 0 && actual > s.plannedHours * (s.progressPct / 100 || 1) * 1.1;
            return (
              <li key={s.id} className="rounded-lg border border-line px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${s.doneAt ? 'bg-good text-white' : 'bg-concrete text-ink-2'}`}>
                    {s.doneAt ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="flex-1 font-medium text-ink">{s.name}</span>
                  <span className={`text-xs tabular-nums ${over ? 'font-medium text-warn-ink' : 'text-ink-3'}`}>
                    {fmt.num(actual)} z {fmt.num(s.plannedHours)} h
                  </span>
                  <span className="w-12 text-right font-semibold tabular-nums">{s.progressPct} %</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                  <div className={`h-full rounded-full ${s.doneAt ? 'bg-good' : 'bg-ink-2'}`} style={{ width: `${s.progressPct}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {draft && (
        <div className="space-y-2">
          {draft.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <input
                aria-label={`Název etapy ${i + 1}`}
                value={s.name}
                onChange={(e) => setDraft(draft.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
                className="h-9 flex-1 rounded-md border border-line bg-surface px-2 text-sm text-ink focus:border-series-1 focus:outline-none"
              />
              <input
                aria-label="Plánované hodiny"
                inputMode="decimal"
                value={s.plannedHours}
                onChange={(e) => setDraft(draft.map((x) => (x.id === s.id ? { ...x, plannedHours: Number(e.target.value.replace(',', '.')) || 0 } : x)))}
                className="h-9 w-20 rounded-md border border-line bg-surface px-2 text-right text-sm tabular-nums focus:border-series-1 focus:outline-none"
              />
              <span className="text-xs text-ink-3">h</span>
              <button type="button" aria-label="Odebrat etapu" onClick={() => setDraft(draft.filter((x) => x.id !== s.id))} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-crit/10 hover:text-crit-ink">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={() => setDraft([...draft, { id: sid(), name: '', plannedHours: 0, progressPct: 0, doneAt: null }])} className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-sm text-ink-2 hover:text-ink">
              <Plus className="size-3.5" /> Etapa
            </button>
            <span className={`text-xs tabular-nums ${Math.abs(plannedSum - job.budget.laborHours) > 0.5 ? 'text-warn-ink' : 'text-ink-3'}`}>
              součet {fmt.num(plannedSum)} h z rozpočtu {fmt.num(job.budget.laborHours)} h
            </span>
            <span className="flex-1" />
            <button type="button" onClick={() => setDraft(null)} className="h-8 rounded-md px-3 text-sm text-ink-2 hover:bg-concrete">
              Zrušit
            </button>
            <button
              type="button"
              disabled={draft.some((s) => !s.name.trim())}
              onClick={() => {
                setStages(job.id, draft.map((s) => ({ ...s, name: s.name.trim() })));
                setDraft(null);
                onToast(draft.length ? `Etapy uloženy, zakázka je hotová z ${progressFromStages(draft)} %.` : 'Etapy odebrány.');
              }}
              className="h-8 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:bg-line disabled:text-ink-3"
            >
              Uložit etapy
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Revize a zkoušky ---------- */

const REVISION_KINDS: Record<Job['trade'], string[]> = {
  electro: ['Výchozí revize elektroinstalace', 'Pravidelná revize elektroinstalace', 'Revize hromosvodu'],
  plumbing: ['Tlaková zkouška vody', 'Revize plynového zařízení', 'Zkouška těsnosti kanalizace'],
  windows: ['Kontrola montáže oken'],
  construction: ['Zkouška hydroizolace', 'Kontrola rovinnosti'],
  hvac: ['Kontrola těsnosti chladiva', 'Uvedení TČ do provozu'],
};

export function RevisionsSection({ job, onToast }: { job: Job; onToast: (t: string) => void }) {
  const [form, setForm] = useState<null | { kind: string; number: string; date: string; technician: string; result: 'ok' | 'defects'; months: string; note: string }>(null);
  const list = job.revisions ?? [];
  const open = () =>
    setForm({ kind: REVISION_KINDS[job.trade][0], number: '', date: toInputDate(new Date()), technician: '', result: 'ok', months: job.trade === 'electro' ? '60' : '12', note: '' });

  return (
    <section aria-labelledby={`rev-${job.id}`}>
      <div className="mb-2 flex items-center">
        <h3 id={`rev-${job.id}`} className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-ink">
          <ClipboardCheck className="size-4" /> Revize a zkoušky
        </h3>
        {!form && (
          <button type="button" onClick={open} className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-sm text-ink-2 hover:text-ink">
            <Plus className="size-3.5" /> Zapsat
          </button>
        )}
      </div>
      {list.length === 0 && !form && <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-2">Zatím žádná revizní zpráva ani zkouška.</p>}
      {list.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {list.map((r) => (
            <li key={r.id} className="group flex items-start gap-3 px-3 py-2">
              {r.result === 'ok' ? <Check className="mt-0.5 size-4 text-good-ink" aria-label="Bez závad" /> : <AlertTriangle className="mt-0.5 size-4 text-warn-ink" aria-label="Se závadami" />}
              <span className="min-w-0 flex-1">
                <span className="block text-ink">
                  {r.kind} {r.number && <span className="text-ink-3">č. {r.number}</span>}
                </span>
                <span className="block text-xs text-ink-3">
                  {r.date.toLocaleDateString('cs-CZ')}, {r.technician || 'technik neuveden'}
                  {r.nextDue && `, další do ${r.nextDue.toLocaleDateString('cs-CZ')}`}
                  {r.note && `. ${r.note}`}
                </span>
              </span>
              <button type="button" aria-label="Smazat zápis" onClick={() => deleteRevision(job.id, r.id)} className="grid size-7 place-items-center rounded text-ink-3 opacity-0 group-hover:opacity-100 hover:text-crit-ink focus-visible:opacity-100">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {form && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-concrete/60 p-3 text-sm">
          <input list={`rk-${job.id}`} aria-label="Druh" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="col-span-2 h-9 rounded-md border border-line bg-surface px-2" />
          <datalist id={`rk-${job.id}`}>
            {REVISION_KINDS[job.trade].map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <input aria-label="Číslo zprávy" placeholder="Číslo zprávy" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="h-9 rounded-md border border-line bg-surface px-2" />
          <input aria-label="Datum" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-9 rounded-md border border-line bg-surface px-2" />
          <input aria-label="Revizní technik" placeholder="Revizní technik" value={form.technician} onChange={(e) => setForm({ ...form, technician: e.target.value })} className="h-9 rounded-md border border-line bg-surface px-2" />
          <select aria-label="Výsledek" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value as 'ok' | 'defects' })} className="h-9 rounded-md border border-line bg-surface px-2">
            <option value="ok">Bez závad</option>
            <option value="defects">Se závadami</option>
          </select>
          <label className="flex items-center gap-2 text-ink-2">
            Další za
            <input aria-label="Měsíců do další revize" inputMode="numeric" value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value.replace(/\D/g, '') })} className="h-9 w-16 rounded-md border border-line bg-surface px-2 text-right" />
            měs.
          </label>
          <input aria-label="Poznámka" placeholder="Poznámka (závady…)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="col-span-2 h-9 rounded-md border border-line bg-surface px-2" />
          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="h-9 rounded-md px-3 text-ink-2 hover:bg-surface">
              Zrušit
            </button>
            <button
              type="button"
              disabled={!form.kind.trim() || !form.date}
              onClick={() => {
                const date = new Date(form.date);
                const months = Number(form.months);
                const nextDue = months ? new Date(date.getFullYear(), date.getMonth() + months, date.getDate()) : null;
                addRevision(job.id, { kind: form.kind.trim(), number: form.number.trim(), date, technician: form.technician.trim(), result: form.result, note: form.note.trim(), nextDue });
                setForm(null);
                onToast('Revize zapsána. Termín další najdete v Zákazníci → Revize.');
              }}
              className="h-9 rounded-md bg-ink px-3 font-semibold text-white disabled:bg-line"
            >
              Uložit
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- BOZP ---------- */

export function SafetySection({ job, members, onToast }: { job: Job; members: Member[]; onToast: (t: string) => void }) {
  const sf = safetyOf(job);
  const [text, setText] = useState(sf.text);
  const [editing, setEditing] = useState(false);
  useEffect(() => setText(sf.text), [sf.text]);
  const crew = members.filter((m) => job.assignedWorkerIds.includes(m.uid));

  return (
    <section aria-labelledby={`bozp-${job.id}`}>
      <div className="mb-2 flex items-center">
        <h3 id={`bozp-${job.id}`} className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-ink">
          <ShieldCheck className="size-4" /> Poučení BOZP pro tuto stavbu
        </h3>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="h-8 rounded-md px-2.5 text-sm text-ink-2 hover:bg-concrete hover:text-ink">
            Upravit
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-series-1 focus:outline-none" />
          <div className="mt-2 flex items-center justify-end gap-2">
            <span className="mr-auto text-xs text-ink-3">Po změně musí parta poučení potvrdit znovu.</span>
            <button type="button" onClick={() => { setText(sf.text); setEditing(false); }} className="h-8 rounded-md px-3 text-sm text-ink-2 hover:bg-concrete">
              Zrušit
            </button>
            <button
              type="button"
              onClick={() => {
                setSafetyText(job.id, text.trim());
                setEditing(false);
                onToast('Poučení upraveno, parta ho potvrdí v mobilu.');
              }}
              className="h-8 rounded-md bg-ink px-3 text-sm font-semibold text-white"
            >
              Uložit
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-lg bg-concrete/60 px-3 py-2 text-sm whitespace-pre-line text-ink-2">{sf.text}</p>
      )}
      <ul className="mt-2 flex flex-wrap gap-2 text-xs">
        {crew.map((m) => {
          const at = sf.confirmations[m.uid];
          return (
            <li key={m.uid} className={`rounded-full px-2.5 py-1 ${at ? 'bg-good/12 text-good-ink' : 'bg-warn/12 text-warn-ink'}`}>
              {m.displayName}: {at ? `potvrdil(a) ${at.toLocaleDateString('cs-CZ')}` : 'zatím nepotvrdil(a)'}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
