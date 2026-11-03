import type { Trade } from '@/types/firestore';

export const TRADES: Array<{ id: Trade; label: string }> = [
  { id: 'electro', label: 'Elektro' },
  { id: 'plumbing', label: 'Voda a topení' },
  { id: 'windows', label: 'Okna a dveře' },
  { id: 'construction', label: 'Stavba' },
  { id: 'hvac', label: 'Vzduchotechnika a TČ' },
];

export const TRADE_LABEL = Object.fromEntries(TRADES.map((t) => [t.id, t.label])) as Record<Trade, string>;
