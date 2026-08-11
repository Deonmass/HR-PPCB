/** Sites / localisations RH partagés employés ↔ dépendants. */
export const DEFAULT_LOCALISATIONS = [
  'Zamba',
  'Kinshasa',
  'Lubudi',
  'Lubumbashi',
  'MOANDA',
  'Kisangani',
] as const;

export type LocalisationName = (typeof DEFAULT_LOCALISATIONS)[number] | string;

/** Fusionne la liste canonique avec des valeurs déjà présentes dans les données. */
export function mergeLocalisationOptions(...groups: Array<Iterable<string> | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
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
