/**
 * Barvy grafů jako CSS proměnné – Recharts je předá do SVG, takže grafy se samy
 * přebarví v tmavém režimu. Kategorické sloty 1–2 jsou ověřené validátorem palety
 * pro světlý i tmavý povrch (sousední CVD ΔE ≥ 24). Stavové barvy patří jen stavům.
 */
export const chart = {
  revenue: 'var(--color-series-1)', // slot 1 – tržby, příjmy
  cost: 'var(--color-series-2)', // slot 2 – náklady, výdaje
  budget: 'var(--color-mark-neutral)', // neutrální reference (rozpočet)
  spent: 'var(--color-series-1)',
  grid: 'var(--color-line)',
  axis: 'var(--color-ink-3)',
  label: 'var(--color-ink-2)',
  surface: 'var(--color-surface)',
  warn: 'var(--color-warn)',
  crit: 'var(--color-crit)',
  font: 12,
  motion: { duration: 900, easing: 'ease-out' as const },
};
