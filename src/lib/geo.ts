import type { CompanySettings, GeoPoint, Job } from '@/types/firestore';

/**
 * Poloha v terénu: vzdálenost od stavby, odkazy do navigací a zjištění polohy telefonu.
 * Poloha se bere jen jednou při začátku práce (žádné sledování během dne).
 */

export const DEFAULT_SITE_RADIUS_M = 300;

/** Vzdálenost dvou bodů na Zemi v metrech (haversine). */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** „80 m“, „1,4 km“, „23 km“. */
export function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  if (m < 10_000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(m / 1000)} km`;
}

export type GeoVerdict =
  | { kind: 'onsite'; distance: number }
  | { kind: 'away'; distance: number }
  | { kind: 'nosite' } // stavba nemá uložené souřadnice
  | { kind: 'unknown' }; // telefon polohu neposlal

/**
 * Byl dělník při začátku práce na stavbě? Nepřesnost GPS (accuracy) se započítá ve prospěch
 * dělníka, aby slabý signál ve sklepě nedělal z poctivých lidí podezřelé.
 */
export function geoVerdict(at: GeoPoint | null | undefined, site: GeoPoint | null | undefined, accuracy = 0, radius = DEFAULT_SITE_RADIUS_M): GeoVerdict {
  if (!at) return { kind: 'unknown' };
  if (!site) return { kind: 'nosite' };
  const distance = distanceM(at, site);
  return distance <= radius + Math.min(accuracy, 500) ? { kind: 'onsite', distance } : { kind: 'away', distance };
}

export const siteRadius = (s: Pick<CompanySettings, 'siteRadiusM'> | null | undefined) => s?.siteRadiusM ?? DEFAULT_SITE_RADIUS_M;
export const geoCheckOn = (s: Pick<CompanySettings, 'geoCheckIn'> | null | undefined) => s?.geoCheckIn !== false;
export const photoStampOn = (s: Pick<CompanySettings, 'photoStamp'> | null | undefined) => s?.photoStamp !== false;

/** Odkazy do tří navigací, které čeští řemeslníci používají nejčastěji. */
export function navUrls(job: Pick<Job, 'client'>): { google: string; waze: string } {
  const { geo, address } = job.client;
  const google = geo
    ? `https://www.google.com/maps/dir/?api=1&destination=${geo.lat},${geo.lng}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
  const waze = geo ? `https://waze.com/ul?ll=${geo.lat},${geo.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
  return { google, waze };
}

/** Bod na mapě (kancelář: kde dělník začal práci). */
export const mapPointUrl = (g: GeoPoint) => `https://mapy.com/fnc/v1/showmap?${new URLSearchParams({ center: `${g.lng},${g.lat}`, zoom: '17', marker: 'true' })}`;

export const fmtGeo = (g: GeoPoint) => `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`;

/**
 * Jednorázové zjištění polohy telefonu. Nikdy nevyhodí chybu – když uživatel nepovolí polohu,
 * není signál nebo vyprší čas, vrátí null a práce se zapíše i tak.
 */
export function getPosition(timeoutMs = 10_000): Promise<{ geo: GeoPoint; accuracy: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(done);
        resolve({ geo: { lat: p.coords.latitude, lng: p.coords.longitude }, accuracy: Math.round(p.coords.accuracy) });
      },
      () => {
        clearTimeout(done);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
