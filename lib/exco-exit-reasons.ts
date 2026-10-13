import type { ExcoCountRow } from '@/lib/exco-types';

/** Libellés anglais du slide « Departure and Termination ». */
export const EXCO_DEPARTURE_CATEGORIES = [
  'Amicable Separation',
  'Dismissal',
  'Resignation',
  'Death',
  'Contract Expired',
  'Retirement',
] as const;

export type ExcoDepartureCategory = (typeof EXCO_DEPARTURE_CATEGORIES)[number];

const DEPARTURE_LABEL_FR: Record<ExcoDepartureCategory, string> = {
  'Amicable Separation': "Séparation à l'amiable",
  Dismissal: 'Licenciement',
  Resignation: 'Démission',
  Death: 'Décès',
  'Contract Expired': 'Fin de contrat',
  Retirement: 'Retraite',
};

/** Libellé français. Décès n’est pas une démission. */
export function departureLabelFr(label: string): string {
  const canonical = canonicalDepartureLabel(label);
  if ((EXCO_DEPARTURE_CATEGORIES as readonly string[]).includes(canonical)) {
    return DEPARTURE_LABEL_FR[canonical as ExcoDepartureCategory];
  }
  return canonical;
}

/**
 * Décès reste une catégorie à part.
 * Démission → Resignation. Licenciement → Dismissal. Jamais l’inverse.
 */
export function canonicalDepartureLabel(raw: string): string {
  const n = String(raw || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (
    n.includes('deces')
    || n.includes('deced')
    || n.includes('death')
    || n.includes('deceased')
  ) {
    return 'Death';
  }
  if (n.includes('demission') || n.includes('resign')) return 'Resignation';
  if (n.includes('licenci') || n.includes('dismiss') || n.includes('dismis')) return 'Dismissal';
  if (
    (n.includes('fin') && n.includes('contrat'))
    || n.includes('contract expir')
    || n.includes('expired')
  ) {
    return 'Contract Expired';
  }
  if (n.includes('retrait') || n.includes('retir')) return 'Retirement';
  if (n.includes('amicable') || n.includes('amiable')) return 'Amicable Separation';
  const trimmed = String(raw || '').trim();
  return trimmed || 'Non renseigné';
}

/** Six motifs du slide, dans l’ordre affiché, puis les motifs non reconnus. */
export function bucketDepartureReasons(rows: ExcoCountRow[]): ExcoCountRow[] {
  const counts = new Map<string, number>(
    EXCO_DEPARTURE_CATEGORIES.map((label) => [label, 0]),
  );
  const extras = new Map<string, number>();
  for (const row of rows) {
    const label = canonicalDepartureLabel(row.label);
    const value = row.value || 0;
    if (counts.has(label)) {
      counts.set(label, (counts.get(label) ?? 0) + value);
    } else if (value > 0) {
      extras.set(label, (extras.get(label) ?? 0) + value);
    }
  }
  return [
    ...EXCO_DEPARTURE_CATEGORIES.map((label) => ({
      label,
      value: counts.get(label) ?? 0,
    })),
    ...[...extras.entries()].map(([label, value]) => ({ label, value })),
  ];
}
