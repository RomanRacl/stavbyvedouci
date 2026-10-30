import type { ActiveTimer, ChecklistItem, Job, PhotoTag, Trade } from '@/types/firestore';

/** Fakturační sazba pro odhad ceny víceprací (Kč/h bez DPH). Později z nastavení firmy. */
export const DEFAULT_BILL_RATE = 650;
/** Přirážka na materiál ve vícepracích. */
export const MATERIAL_MARKUP = 1.15;
/** Průměrný náklad hodiny práce, pokud parta není známá. */
export const DEFAULT_HOURLY_COST = 380;

const COMMON = ['Uklidit pracoviště a odvézt odpad', 'Vyfotit hotové dílo'];

const BY_TRADE: Record<Trade, Array<[string, boolean]>> = {
  electro: [
    ['Změřit izolační odpor a zapsat hodnoty', true],
    ['Vyfotit rozvaděč s popisky jističů', true],
    ['Otestovat proudové chrániče', true],
  ],
  plumbing: [
    ['Tlaková zkouška potrubí', true],
    ['Zkontrolovat těsnost spojů po napuštění', true],
    ['Vyfotit rozvody před zakrytím', true],
  ],
  windows: [
    ['Seřídit kování všech oken', true],
    ['Zkontrolovat připojovací spáru a pásky', true],
    ['Předat zákazníkovi návod k údržbě', false],
  ],
  construction: [
    ['Vyfotit hydroizolaci před obkladem', true],
    ['Zkontrolovat rovinnost a spárování', true],
  ],
  hvac: [
    ['Tlaková a vakuová zkouška chladiva', true],
    ['Zapsat uvedení do provozu', true],
    ['Zaškolit zákazníka v ovládání', false],
  ],
};

/** Výchozí kontrolní seznam podle oboru. Použije se, dokud kancelář seznam neupraví. */
export function defaultChecklist(trade: Trade): ChecklistItem[] {
  return [...BY_TRADE[trade], ...COMMON.map((t) => [t, false] as [string, boolean])].map(([text, required], i) => ({
    id: `ck_${trade}_${i}`,
    text,
    required,
    doneBy: null,
    doneAt: null,
  }));
}

export const checklistOf = (job: Job) => job.checklist ?? defaultChecklist(job.trade);
export const extraWorkOf = (job: Job) => job.extraWork ?? [];

/** Navržená cena víceprací pro zákazníka. */
export const suggestExtraPrice = (hours: number, materialCost: number, rate = DEFAULT_BILL_RATE, markup = MATERIAL_MARKUP) =>
  Math.round((hours * rate + materialCost * markup) / 10) * 10;

/** Odpracované milisekundy běžícího měření bez přestávek. */
export function workedMs(timer: ActiveTimer, at = Date.now()) {
  const pausedNow = timer.pausedAt ? Math.max(0, at - timer.pausedAt.getTime()) : 0;
  return Math.max(0, at - timer.startedAt.getTime() - (timer.pausedMs ?? 0) - pausedNow);
}

export const PHOTO_TAGS: Array<{ id: PhotoTag; label: string }> = [
  { id: 'before', label: 'Před' },
  { id: 'during', label: 'Během' },
  { id: 'after', label: 'Po' },
  { id: 'defect', label: 'Závada' },
];

/** YYYY-MM-DD v místním čase (pro denní výkazy). */
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
