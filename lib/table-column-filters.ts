/** Helpers pour filtres de colonne façon Excel (valeurs uniques + cases à cocher). */

/** Valeurs uniques d’une colonne, triées en français. Chaînes vides → "—". */
export function uniqueSortedValues<T>(
  rows: T[],
  getValue: (row: T) => string | null | undefined,
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const raw = getValue(row);
    const value = raw == null || String(raw).trim() === '' ? '—' : String(raw);
    set.add(value);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

/**
 * `selected.length === 0` = aucun filtre (tout passe).
 * Sinon la cellule doit être dans `selected`.
 */
export function matchesColumnFilter(
  selected: string[],
  cellValue: string | null | undefined,
): boolean {
  if (selected.length === 0) return true;
  const value = cellValue == null || String(cellValue).trim() === '' ? '—' : String(cellValue);
  return selected.includes(value);
}

/** Construit les listes de valeurs uniques pour plusieurs colonnes. */
export function buildColumnFilterValues<T, K extends string>(
  rows: T[],
  getters: Record<K, (row: T) => string | null | undefined>,
): Record<K, string[]> {
  const result = {} as Record<K, string[]>;
  for (const key of Object.keys(getters) as K[]) {
    result[key] = uniqueSortedValues(rows, getters[key]);
  }
  return result;
}

/** Compte combien de colonnes ont un filtre actif. */
export function countActiveColumnFilters(filters: Record<string, string[]>): number {
  return Object.values(filters).filter((v) => v.length > 0).length;
}

/** Normalise une valeur cellule pour comparaison avec les filtres. */
export function normalizeFilterCell(value: string | null | undefined): string {
  return value == null || String(value).trim() === '' ? '—' : String(value);
}
