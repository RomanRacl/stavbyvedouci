'use client';

import { Copy, Mail, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { btnPrimary, btnSecondary } from '@/components/shell/PageHeader';
import { Drawer } from '@/components/ui/Drawer';
import { invoiceBasis } from '@/lib/money';
import { fillTemplate, jobContext, templatesOf } from '@/lib/people';
import type { CompanySettings, Job, Member } from '@/types/firestore';

/** Zpráva zákazníkovi ze šablony: vyplní jméno, adresu, termín a cenu zakázky. */
export function MessageDrawer({ job, settings, members, open, onClose, onCopied }: { job: Job; settings: CompanySettings; members: Member[]; open: boolean; onClose: () => void; onCopied: (t: string) => void }) {
  const templates = templatesOf(settings);
  const [tplId, setTplId] = useState(templates[0]?.id ?? '');
  const tpl = templates.find((t) => t.id === tplId) ?? templates[0];
  const [text, setText] = useState('');
  useEffect(() => {
    if (open && tpl) setText(fillTemplate(tpl.text, jobContext(job, settings, members, invoiceBasis(job, settings).gross)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- přepočet jen při otevření nebo změně šablony
  }, [open, tplId, job.id]);
  const phone = job.client.phone.replace(/\s/g, '');

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Zpráva zákazníkovi"
      subtitle={`${job.client.name}${job.client.phone ? `, ${job.client.phone}` : ''}`}
      width={520}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                onCopied('Text zkopírován.');
              } catch {
                onCopied('Text se nepodařilo zkopírovat, označte ho ručně.');
              }
            }}
            className={btnSecondary}
          >
            <Copy className="size-4" /> Kopírovat
          </button>
          <span className="flex-1" />
          {tpl?.channel === 'email' ? (
            <a href={`mailto:?subject=${encodeURIComponent(job.title)}&body=${encodeURIComponent(text)}`} className={btnPrimary}>
              <Mail className="size-4" /> Otevřít v poště
            </a>
          ) : (
            <a href={phone ? `sms:${phone}?body=${encodeURIComponent(text)}` : undefined} aria-disabled={!phone} className={`${btnPrimary} ${phone ? '' : 'pointer-events-none opacity-50'}`}>
              <MessageSquareText className="size-4" /> Poslat SMS
            </a>
          )}
        </div>
      }
    >
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Šablona">
        {templates.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={t.id === tpl?.id} onClick={() => setTplId(t.id)} className={`h-9 rounded-lg border px-3 text-sm ${t.id === tpl?.id ? 'border-ink bg-ink text-white' : 'border-line text-ink-2 hover:text-ink'}`}>
            {t.name}
            <span className="ml-1.5 text-xs opacity-70">{t.channel === 'sms' ? 'SMS' : 'e-mail'}</span>
          </button>
        ))}
      </div>
      <textarea aria-label="Text zprávy" value={text} onChange={(e) => setText(e.target.value)} rows={9} className="mt-4 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-series-1 focus:outline-none" />
      {tpl?.channel === 'sms' && <p className="mt-1 text-xs text-ink-3 tabular-nums">{text.length} znaků{text.length > 160 ? `, ${Math.ceil(text.length / 153)} SMS` : ''}</p>}
      <p className="mt-4 text-xs text-ink-3">
        SMS se otevře v telefonu nebo v aplikaci pro zprávy. Šablony upravíte v{' '}
        <Link href="/sablony" className="font-medium text-series-1-ink underline underline-offset-2">
          Šablonách
        </Link>
        .
      </p>
    </Drawer>
  );
}
