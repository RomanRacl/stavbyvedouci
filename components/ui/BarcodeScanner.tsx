'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorLike;
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Vrací true, když kód patří známé položce (scanner se zavře), jinak false (ukáže chybu a skenuje dál). */
  onCode: (code: string) => boolean;
}

/**
 * Skener EAN přes fotoaparát. Používá vestavěné BarcodeDetector API (Chrome na Androidu).
 * Kde ho prohlížeč nemá (iPhone/Safari), nabídne ruční zadání kódu – stejný výsledek.
 */
export function BarcodeScanner({ open, onClose, onCode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    if (!open) return;
    setMessage('');
    setCode('');
    setManual(!supported);
    if (!supported) return;

    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let lastMiss = '';
    const detector = new window.BarcodeDetector!({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a'] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(v);
            const value = found[0]?.rawValue;
            if (value && value !== lastMiss) {
              if (onCode(value)) return;
              lastMiss = value;
              setMessage(`Kód ${value} není v katalogu. Požádejte kancelář o doplnění.`);
            }
          } catch {
            /* snímek ještě není připravený */
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setManual(true);
        setMessage('Fotoaparát není dostupný. Zadejte kód ručně.');
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // onCode se mění s každým renderem rodiče – skener by se restartoval
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supported]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = code.replace(/\D/g, '');
    if (!c) return;
    if (!onCode(c)) setMessage(`Kód ${c} není v katalogu.`);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex flex-col bg-black text-[#fff]"
          role="dialog"
          aria-modal="true"
          aria-label="Skenování čárového kódu"
        >
          <header className="flex items-center gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
            <p className="flex-1 text-lg font-semibold">Naskenujte čárový kód</p>
            <button type="button" onClick={onClose} aria-label="Zavřít" className="grid size-12 place-items-center rounded-xl bg-[#fff]/10">
              <X className="size-6" />
            </button>
          </header>

          {!manual ? (
            <div className="relative flex-1 overflow-hidden">
              <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
              {/* Rámeček pro zaměření kódu */}
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="relative h-36 w-[78%] max-w-sm rounded-2xl border-4 border-safety/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]">
                  <motion.span
                    className="absolute inset-x-3 h-0.5 bg-safety"
                    animate={{ top: ['12%', '88%', '12%'] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-1 flex-col justify-center gap-3 px-6">
              <label className="text-base text-[#fff]/80">
                Kód pod čárami (EAN)
                <input
                  autoFocus
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-2 block h-14 w-full rounded-xl bg-[#fff] px-4 font-display text-2xl tracking-wider text-[#16202a] tabular-nums"
                />
              </label>
              <button type="submit" className="h-14 rounded-xl bg-safety text-lg font-bold text-[#16202a]">
                Najít položku
              </button>
            </form>
          )}

          <footer className="px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
            {message && <p className="mb-3 rounded-xl bg-[#fff]/10 px-4 py-3 text-base">{message}</p>}
            {supported && (
              <button
                type="button"
                onClick={() => setManual((m) => !m)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#fff]/10 text-base font-medium"
              >
                <Keyboard className="size-5" /> {manual ? 'Zpět na fotoaparát' : 'Zadat kód ručně'}
              </button>
            )}
          </footer>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
