/** Hledání bez ohledu na diakritiku a velikost písmen: „zdar“ najde „Žďár“. */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Skóre shody: všechna slova dotazu musí být v textu. Shoda na začátku textu nebo slova má přednost.
 * 0 = neodpovídá.
 */
export function matchScore(query: string, haystack: string): number {
  const q = fold(query).trim();
  if (!q) return 1;
  const h = fold(haystack);
  let score = 0;
  for (const w of q.split(/\s+/)) {
    const i = h.indexOf(w);
    if (i < 0) return 0;
    score += i === 0 ? 3 : /[\s,.\-/(]/.test(h[i - 1]) ? 2 : 1;
  }
  return score;
}
