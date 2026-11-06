'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { speechLang, t } from '@/lib/i18n';
import { recognitionCtor, type RecognitionLike } from '@/lib/useDictation';
import { parseVoice, type VoiceCommand } from '@/lib/voiceCommands';

/** Je hlasové ovládání v tomto prohlížeči k dispozici? (Chrome na Androidu, Safari na iPhonu.) */
export function useVoiceSupported() {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(Boolean(recognitionCtor())), []);
  return ok;
}

/**
 * Hlasový povel: klepnutí, říct „začít“, „konec“, „přestávka“, „pokračovat“, „fotka“, „materiál“
 * nebo „poznámka …“. Mikrofon poslouchá jen po klepnutí, nikdy na pozadí.
 */
export function VoiceSheet({ open, onClose, onCommand }: { open: boolean; onClose: () => void; onCommand: (c: VoiceCommand) => void }) {
  const reduce = useReducedMotion();
  const [heard, setHeard] = useState('');
  const [state, setState] = useState<'listening' | 'idle' | 'error'>('idle');
  const [error, setError] = useState('');
  const rec = useRef<RecognitionLike | null>(null);
  const done = useRef(false);
  const cb = useRef(onCommand);
  cb.current = onCommand;

  const listen = () => {
    const C = recognitionCtor();
    if (!C) return;
    rec.current?.stop();
    done.current = false;
    setHeard('');
    setError('');
    const r = new C();
    r.lang = speechLang();
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      let text = '';
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      setHeard(text);
      if (final && !done.current) {
        done.current = true;
        const c = parseVoice(text);
        if (c.kind === 'unknown') {
          setState('error');
          setError(t('Nerozuměl jsem: „{t}“. Zkuste jedno ze slov níže.', { t: text }));
        } else cb.current(c);
      }
    };
    r.onerror = (e) => {
      setState('error');
      setError(e.error === 'not-allowed' ? t('Povolte mikrofon v nastavení prohlížeče.') : e.error === 'no-speech' ? t('Nic jsem neslyšel. Zkuste to znovu.') : t('Rozpoznávání se přerušilo, zkuste to znovu.'));
    };
    r.onend = () => setState((s) => (s === 'listening' ? 'idle' : s));
    rec.current = r;
    setState('listening');
    try {
      r.start();
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    if (open) listen();
    else rec.current?.stop();
    return () => rec.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spustit při otevření
  }, [open]);

  const hints = [t('začít'), t('konec'), t('přestávka'), t('pokračovat'), t('fotka'), t('materiál'), t('poznámka …')];

  return (
    <BottomSheet open={open} onClose={onClose} title={t('Hlasový povel')}>
      <div className="flex flex-col items-center py-2 text-center">
        <button
          type="button"
          onClick={listen}
          aria-label={state === 'listening' ? t('Poslouchám') : t('Mluvit znovu')}
          className={`relative grid size-24 place-items-center rounded-full ${state === 'listening' ? 'bg-crit text-white' : 'bg-ink text-white'} active:scale-95`}
        >
          {state === 'listening' && !reduce && (
            <motion.span className="absolute inset-0 rounded-full bg-crit" initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 1.2, repeat: Infinity }} />
          )}
          <Mic className="relative size-10" />
        </button>
        <p className="mt-4 min-h-7 text-lg font-semibold text-ink" aria-live="polite">
          {state === 'listening' ? heard || t('Poslouchám…') : heard || t('Klepněte a mluvte')}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-base text-crit-ink">
            {error}
          </p>
        )}
        <p className="mt-5 text-sm text-ink-2">{t('Řekněte například:')}</p>
        <ul className="mt-2 flex flex-wrap justify-center gap-2">
          {hints.map((h) => (
            <li key={h} className="rounded-full border border-line bg-surface px-3 py-1.5 text-base text-ink">
              {h}
            </li>
          ))}
        </ul>
      </div>
    </BottomSheet>
  );
}
