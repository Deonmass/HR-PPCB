/** Sites / localisations RH partagés employés ↔ dépendants. */
export const DEFAULT_LOCALISATIONS = [
  'Zamba',
  'Kinshasa',
  'Lubudi',
  'Lubumbashi',
  'MOANDA',
  'Kisangani',
  'Idiofa',
  'Bumba',
  'Bena Dibele',
  'Kikwit',
  'Kananga',
] as const;

export type LocalisationName = (typeof DEFAULT_LOCALISATIONS)[number] | string;

const LOCALISATION_BY_KEY = new Map(
  DEFAULT_LOCALISATIONS.map((site) => [site.toLowerCase(), site] as const),
);

function localisationKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sites locaux du complexe Zamba (Kimpese, Malanga, …) — filtrés sous « Zamba ».
 */
export function isZambaAreaLocalisation(raw: string | null | undefined): boolean {
  const key = localisationKey(String(raw ?? ''));
  if (!key) return false;
  const compact = key.replace(/\s+/g, '');
  return (
    key === 'zamba'
    || key.includes('zamba')
    || compact === 'kimpese'
    || key.includes('kimpese')
    || compact === 'malanga'
    || key.includes('malanga')
  );
}

/**
 * True si la valeur est un libellé de lieu (pas une fonction métier).
 * Sert à éviter MALANGA / KIMPESE dans la colonne fonction.
 */
export function isLocalisationLabel(raw: string | null | undefined): boolean {
  const value = String(raw ?? '').trim();
  if (!value) return false;
  const key = localisationKey(value);
  const compact = key.replace(/\s+/g, '');
  if (LOCALISATION_BY_KEY.has(value.toLowerCase()) || LOCALISATION_BY_KEY.has(key) || LOCALISATION_BY_KEY.has(compact)) {
    return true;
  }
  if (isZambaAreaLocalisation(value)) return true;
  if (key === 'moanda' || key === 'muanda') return true;
  if (key.includes('kinshasa') || key === 'kin') return true;
  if (key.includes('lubumbashi') || key === 'lshi') return true;
  if (key.includes('lubudi')) return true;
  if (key.includes('kisangani')) return true;
  if (key.includes('idiofa')) return true;
  if (key.includes('bumba')) return true;
  if (key.includes('bena') && key.includes('dibele')) return true;
  if (key.includes('kikwit')) return true;
  if (key.includes('kananga')) return true;
  return false;
}

/**
 * Normalise un lieu d’affectation vers une localisation habituelle (ville / site).
 * Kimpese / Malanga / emplacements locaux → Zamba.
 */
export function normalizeLocalisation(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return 'Zamba';
  const key = localisationKey(value);
  const compact = key.replace(/\s+/g, '');
  const exact = LOCALISATION_BY_KEY.get(value.toLowerCase())
    || LOCALISATION_BY_KEY.get(key)
    || LOCALISATION_BY_KEY.get(compact);
  if (exact) return exact;
  // Alias / variantes courantes
  if (key === 'moanda' || key === 'muanda') return 'MOANDA';
  if (key.includes('kinshasa') || key === 'kin') return 'Kinshasa';
  if (key.includes('lubumbashi') || key === 'lshi') return 'Lubumbashi';
  if (key.includes('lubudi')) return 'Lubudi';
  if (key.includes('kisangani')) return 'Kisangani';
  if (key.includes('idiofa')) return 'Idiofa';
  if (key.includes('bumba')) return 'Bumba';
  if (key.includes('bena') && key.includes('dibele')) return 'Bena Dibele';
  if (key.includes('kikwit')) return 'Kikwit';
  if (key.includes('kananga')) return 'Kananga';
  // Complexe Zamba (usine / camps locaux)
  if (isZambaAreaLocalisation(value)) return 'Zamba';
  // Pas une localisation habituelle → site par défaut
  return 'Zamba';
}

/** True si la valeur est déjà une localisation habituelle (ville / site). */
export function isHabitualLocalisation(raw: string | null | undefined): boolean {
  const value = String(raw ?? '').trim();
  if (!value) return false;
  return LOCALISATION_BY_KEY.has(value.toLowerCase());
}

/** Fusionne la liste canonique avec des valeurs déjà présentes dans les données. */
export function mergeLocalisationOptions(...groups: Array<Iterable<string> | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const value = normalizeLocalisation(raw);
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  };
  for (const site of DEFAULT_LOCALISATIONS) push(site);
  for (const group of groups) {
    if (!group) continue;
    for (const site of group) push(String(site ?? ''));
  }
  return out;
}
