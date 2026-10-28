/**
 * Barvy pro SVG grafy (Recharts bere hex do atributů spolehlivěji než CSS proměnné).
 * Kategorické sloty 1–2 z validované palety (sousední CVD ΔE ≥ 9). Stavové barvy
 * se pro série nepoužívají – patří jen stavům (OK / pozor / kritické).
 */
export const chart = {
  revenue: '#2a78d6', // slot 1 – tržby
  cost: '#eb6834', // slot 2 – náklady
  budget: '#b9c0c8', // neutrální reference (rozpočet)
  spent: '#2a78d6',
  grid: '#e6e9ec',
  axis: '#7b8591',
  surface: '#ffffff',
  font: 12,
  motion: { duration: 900, easing: 'ease-out' as const },
};
