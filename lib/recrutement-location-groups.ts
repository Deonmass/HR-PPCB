import type { RecrutementRowEnriched } from './recrutement-types';

export type RecrutementLocationZone = 'all' | 'plant' | 'hq' | 'region';

/** Ordre d’affichage préféré des sites (le reste en alpha). */
const LOCATION_ORDER = [
  'plant',
  'hq',
  'kisangani',
  'kindu',
  'zamba',
  'lubudi',
  'lubudi – grand katanga',
  'lubudi - grand katanga',
];

export function recrutementLocationKey(row: { location?: string }): string {
  const raw = String(row.location || '').trim();
  return raw || '—';
}

function normalizeLocation(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Plant / HQ / Région (tout le reste). */
export function recrutementLocationZone(
  row: { location?: string },
): Exclude<RecrutementLocationZone, 'all'> {
  const key = normalizeLocation(recrutementLocationKey(row));
  if (key === 'plant') return 'plant';
  if (key === 'hq') return 'hq';
  return 'region';
}

export function filterRecrutementByZone(
  rows: RecrutementRowEnriched[],
  zone: RecrutementLocationZone,
): RecrutementRowEnriched[] {
  if (zone === 'all') return rows;
  return rows.filter((r) => recrutementLocationZone(r) === zone);
}

function locationSortRank(label: string): number {
  const key = normalizeLocation(label);
  const idx = LOCATION_ORDER.indexOf(key);
  if (idx >= 0) return idx;
  if (key === '—' || !key) return 999;
  return 100 + key.charCodeAt(0);
}

export function compareRecrutementLocations(a: string, b: string): number {
  const ra = locationSortRank(a);
  const rb = locationSortRank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b, 'fr', { sensitivity: 'base' });
}

/** Regroupe les lignes par localisation (Site), triées. */
export function groupRecrutementByLocation(
  rows: RecrutementRowEnriched[],
): Array<{ location: string; rows: RecrutementRowEnriched[] }> {
  const map = new Map<string, RecrutementRowEnriched[]>();
  for (const row of rows) {
    const key = recrutementLocationKey(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()]
    .map(([location, groupRows]) => ({ location, rows: groupRows }))
    .sort((a, b) => compareRecrutementLocations(a.location, b.location));
}

/** Aplatit en gardant l’ordre localisation (utile pour Excel / tris stables). */
export function sortRecrutementByLocation(rows: RecrutementRowEnriched[]): RecrutementRowEnriched[] {
  return groupRecrutementByLocation(rows).flatMap((g) => g.rows);
}

export function countRecrutementByZone(rows: RecrutementRowEnriched[]): Record<
  Exclude<RecrutementLocationZone, 'all'>,
  number
> {
  const out = { plant: 0, hq: 0, region: 0 };
  for (const row of rows) {
    out[recrutementLocationZone(row)] += 1;
  }
  return out;
}
