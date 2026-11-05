import type { Job } from '@/types/firestore';

/**
 * Odkaz do Mapy.com (dříve Mapy.cz). Na telefonu s nainstalovanou aplikací ji otevře,
 * jinak otevře webovou verzi. Dokumentace: developer.mapy.com → „Mapy.cz URL“.
 *
 * - Zná-li zakázka souřadnice, rovnou spustí navigaci (`/route` + `navigate=true`,
 *   start = aktuální poloha telefonu).
 * - Jinak vyhledá adresu (`/search`). Endpoint pro trasu přijímá jen souřadnice,
 *   takže z hledání se navigace spouští jedním klepnutím v aplikaci.
 *   Po zapojení geokódování (Mapy API) se souřadnice uloží k zakázce při založení.
 */
export function mapyNavigationUrl(job: Pick<Job, 'client'>): string {
  const { geo, address } = job.client;
  if (geo) {
    const params = new URLSearchParams({
      end: `${geo.lng},${geo.lat}`,
      routeType: 'car_fast_traffic',
      navigate: 'true',
    });
    return `https://mapy.com/fnc/v1/route?${params}`;
  }
  return `https://mapy.com/fnc/v1/search?${new URLSearchParams({ query: address })}`;
}
