export type SortDir = 'asc' | 'desc';

/** Compare des numéros de maison du type « 26 A », « 9 », « 29 B ». */
export function compareMaisonNumero(a: string, b: string): number {
  const parse = (raw: string) => {
    const m = String(raw ?? '')
      .trim()
      .match(/^(\d+)\s*([A-Za-z]*)$/);
    if (!m) {
      return { n: Number.POSITIVE_INFINITY, suffix: String(raw ?? '').trim().toLowerCase() };
    }
    return { n: Number(m[1]), suffix: (m[2] || '').toLowerCase() };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.n !== pb.n) return pa.n - pb.n;
  return pa.suffix.localeCompare(pb.suffix, 'fr');
}

export function toggleSortDir(
  currentKey: string | null,
  currentDir: SortDir,
  nextKey: string,
): { key: string; dir: SortDir } {
  if (currentKey === nextKey) {
    return { key: nextKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: nextKey, dir: 'asc' };
}

export function compareText(a: string, b: string): number {
  return String(a ?? '').localeCompare(String(b ?? ''), 'fr', { sensitivity: 'base' });
}

export function compareNumber(a: number, b: number): number {
  return a - b;
}
