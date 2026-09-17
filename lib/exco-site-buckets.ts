/**
 * Regroupement sites EXCO — aligné sur les localisations du module Employés.
 *
 * - Plant/Zamba : Zamba, Plant, Malanga, Kimpese, usine (+ défaut comme normalizeLocalisation)
 * - Kinshasa (including Kisangani and Moanda) : Kinshasa, Kisangani, Moanda + autres régions HQ
 * - Lubudi and Lubumbashi : Lubudi, Lubumbashi
 */

export const EXCO_SITE = {
  plant: 'Plant/Zamba',
  kinshasa: 'Kinshasa (including Kisangani and Moanda)',
  lubudi: 'Lubudi and Lubumbashi',
  graduates: 'Graduates',
  unknown: 'Non renseigné',
} as const;

export type ExcoSiteBucket = (typeof EXCO_SITE)[keyof typeof EXCO_SITE];

export const EXCO_SITE_ORDER: ExcoSiteBucket[] = [
  EXCO_SITE.plant,
  EXCO_SITE.kinshasa,
  EXCO_SITE.lubudi,
  EXCO_SITE.graduates,
  EXCO_SITE.unknown,
];

function locKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Bucket site pour Gender per location / headcount by site. */
export function excoSiteBucket(localisation: string | null | undefined): ExcoSiteBucket {
  const loc = locKey(String(localisation ?? ''));
  if (!loc) return EXCO_SITE.unknown;

  if (loc.includes('graduate') || loc.includes('stagiaire')) return EXCO_SITE.graduates;

  if (
    loc.includes('lubudi')
    || loc.includes('lubumbashi')
    || loc === 'lshi'
  ) {
    return EXCO_SITE.lubudi;
  }

  if (
    loc.includes('plant')
    || loc.includes('zamba')
    || loc.includes('malanga')
    || loc.includes('kimpese')
    || loc.includes('usine')
  ) {
    return EXCO_SITE.plant;
  }

  if (
    loc.includes('kinshasa')
    || loc === 'kin'
    || loc.includes('kisangani')
    || loc.includes('moanda')
    || loc.includes('muanda')
    || loc.includes('idiofa')
    || loc.includes('bumba')
    || loc.includes('kikwit')
    || loc.includes('kananga')
    || (loc.includes('bena') && loc.includes('dibele'))
    || loc.includes('region')
    || loc.includes('hq')
    || loc.includes('head office')
  ) {
    return EXCO_SITE.kinshasa;
  }

  // Aligné sur normalizeLocalisation() : inconnu → Zamba / Plant
  return EXCO_SITE.plant;
}

export function isExcoHqSite(site: string): boolean {
  return site === EXCO_SITE.kinshasa;
}

/** Agrège H/F par bucket site. */
export function buildExcoGenderByLocation(
  rows: Array<{ localisation?: string | null; locationSite?: string | null; gender?: string | null }>,
  isMale: (g: string) => boolean,
  isFemale: (g: string) => boolean,
): Array<{ location: string; male: number; female: number; total: number }> {
  const map = new Map<string, { male: number; female: number }>();
  for (const row of rows) {
    const location = excoSiteBucket(row.localisation || row.locationSite || '');
    const cur = map.get(location) || { male: 0, female: 0 };
    const g = String(row.gender || '');
    if (isMale(g)) cur.male += 1;
    else if (isFemale(g)) cur.female += 1;
    map.set(location, cur);
  }

  const out: Array<{ location: string; male: number; female: number; total: number }> = [];
  for (const location of EXCO_SITE_ORDER) {
    const g = map.get(location);
    if (!g && location === EXCO_SITE.unknown) continue;
    const male = g?.male ?? 0;
    const female = g?.female ?? 0;
    if (location !== EXCO_SITE.unknown || male + female > 0) {
      out.push({ location, male, female, total: male + female });
    }
  }
  for (const [location, g] of map) {
    if (!EXCO_SITE_ORDER.includes(location as ExcoSiteBucket)) {
      out.push({
        location,
        male: g.male,
        female: g.female,
        total: g.male + g.female,
      });
    }
  }
  return out;
}
