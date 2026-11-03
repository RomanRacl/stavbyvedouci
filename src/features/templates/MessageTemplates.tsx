'use client';

import { MessageSquareText, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { btnPrimary, btnSecondary, inputCls } from '@/components/shell/PageHeader';
import { saveSettings, type Snapshot } from '@/lib/mock/localBackend';
import { fillTemplate, TEMPLATE_FIELDS, templatesOf } from '@/lib/people';
import type { MessageTemplate } from '@/types/firestore';

const SAMPLE: Record<string, string> = {
  zakaznik: 'Jana Svobodová',
  adresa: 'Okružní 8, Žďár nad Sázavou',
  zakazka: 'elektroinstalace bytu 3+1',
  zacatek: 'pondělí 16. 11.',
  konec: 'pátek 27. 11.',
  castka: '120 192 Kč',
  mistr: 'Jan Dvořák',
};

/** Šablony SMS a e-mailů zákazníkům se zástupnými poli. Použijí se v detailu zakázky. */
export function MessageTemplates({ snap, say }: { snap: Snapshot; say: (t: string) => void }) {
  const list = templatesOf(snap.settings);
  const [edit, setEdit] = useState<MessageTemplate | null>(null);
  const save = (next: MessageTemplate[]) => saveSettings({ messageTemplates: next });
  const ctx = { ...SAMPLE, firma: snap.settings.name, telefon: snap.settings.phone };

  return (
    <section className="mt-10" aria-labelledby="msg-h">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 id="msg-h" className="flex items-center gap-2 text-lg font-semibold text-ink">
            <MessageSquareText className="size-5" /> Zprávy zákazníkům
          </h2>
          <p className="text-sm text-ink-2">SMS a e-maily pro opakované situace. V detailu zakázky se doplní jméno, adresa, termín a cena.</p>
        </div>
        <button type="button" onClick={() => setEdit({ id: `mt_${Date.now().toString(36)}`, name: '', channel: 'sms', text: '' })} className={btnSecondary}>
          <Plus className="size-4" /> Nová zpráva
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {list.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setEdit(t)} className={`block w-full px-4 py-3 text-left hover:bg-concrete/60 ${edit?.id === t.id ? 'bg-concrete/60' : ''}`}>
                <span className="flex items-center gap-2 font-medium text-ink">
                  {t.name}
                  <span className="rounded bg-concrete px-1.5 text-xs font-normal text-ink-2">{t.channel === 'sms' ? 'SMS' : 'e-mail'}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-sm text-ink-3">{t.text}</span>
              </button>
            </li>
          ))}
        </ul>
        {edit ? (
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input aria-label="Název" placeholder="Název, např. Zítra přijedeme" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={inputCls} />
              <select aria-label="Kanál" value={edit.channel} onChange={(e) => setEdit({ ...edit, channel: e.target.value as 'sms' | 'email' })} className={inputCls}>
                <option value="sms">SMS</option>
                <option value="email">E-mail</option>
              </select>
            </div>
            <textarea id="tpl-text" aria-label="Text" value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} rows={6} className="mt-2 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-series-1 focus:outline-none" />
            <div className="mt-2 flex flex-wrap gap-1">
              {TEMPLATE_FIELDS.map((f) => (
                <button key={f.key} type="button" onClick={() => setEdit({ ...edit, text: `${edit.text}{${f.key}}` })} className="h-7 rounded-md border border-line px-2 text-xs text-ink-2 hover:text-ink">
                  + {f.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs font-medium text-ink-2">Náhled</p>
            <p className="mt-1 whitespace-pre-line rounded-lg bg-concrete/60 px-3 py-2 text-sm text-ink">{fillTemplate(edit.text, ctx) || '—'}</p>
            <div className="mt-3 flex gap-2">
              {list.some((t) => t.id === edit.id) && (
                <button
                  type="button"
                  onClick={() => {
                    save(list.filter((t) => t.id !== edit.id));
                    setEdit(null);
                    say('Šablona zprávy smazána.');
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-2 hover:bg-crit/10 hover:text-crit-ink"
                >
                  <Trash2 className="size-4" /> Smazat
                </button>
              )}
              <span className="flex-1" />
              <button type="button" onClick={() => setEdit(null)} className={btnSecondary}>
                Zavřít
              </button>
              <button
                type="button"
                disabled={!edit.name.trim() || !edit.text.trim()}
                onClick={() => {
                  save(list.some((t) => t.id === edit.id) ? list.map((t) => (t.id === edit.id ? edit : t)) : [...list, edit]);
                  say('Šablona zprávy uložena.');
                  setEdit(null);
                }}
                className={btnPrimary}
              >
                Uložit
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-2">Vyberte zprávu vlevo, nebo vytvořte novou.</p>
        )}
      </div>
    </section>
  );
}
