import type { AirtimeGrilleRow, AirtimePhoneRenewalRow } from './airtime-types';

const HOD_TITLE_KEYS = ['HEAD', 'DIRECTOR', 'PLANT MANAGER', 'SITE MANAGER'] as const;
const LOGISTIC_TITLE_KEYS = [
  'LOGISTIC',
  'WAREHOUSE',
  'TRANSIT',
  'SHIPPING',
  'SUPPLY CHAIN',
  'PORT OPERATOR',
  'PORTS',
] as const;

const PHONE_RENEWAL_POLICY: { id: string; label: string; unitPriceUsd: number }[] = [
  { id: 'exco', label: 'Membres du Comité exécutif', unitPriceUsd: 600 },
  { id: 'd', label: 'Grade D1-D4', unitPriceUsd: 350 },
  { id: 'c', label: 'Grade C1-C5', unitPriceUsd: 250 },
  { id: 'b', label: 'Grade B1-B5', unitPriceUsd: 175 },
  { id: 'ot', label: 'Overtime', unitPriceUsd: 150 },
];

function titleContains(titleUpper: string, keys: readonly string[]): boolean {
  return keys.some((key) => titleUpper.includes(key));
}

/** Catégorie grille Airtime (formule LET / IFS de la feuille Airtime). */
export function resolveAirtimeCategory(gradeRaw: string, titleRaw: string): string {
  const grade = String(gradeRaw || '').trim().toUpperCase();
  const title = String(titleRaw || '').trim().toUpperCase();
  const letter = grade.charAt(0);
  const digit = Number(grade.slice(1));
  const isC2Plus = letter === 'C' && Number.isFinite(digit) && digit >= 2;

  if (grade === 'D5' || letter === 'E') return 'Exco Members';
  if (grade === 'D2' && titleContains(title, ['REGIONAL SALES MANAGER'])) {
    return 'Regional Sales Managers';
  }
  if (letter === 'D' && titleContains(title, HOD_TITLE_KEYS)) return 'HOD';
  if (letter === 'D') return 'Managers';
  if (isC2Plus && titleContains(title, ['SALES'])) return 'Senior Regional Sales and Sales';
  if (isC2Plus && titleContains(title, LOGISTIC_TITLE_KEYS)) return 'Logistic & Warehouse';
  if (letter === 'C') return 'Other employees';
  if (letter === 'B') return 'Other Employees';
  return 'Overtime application users';
}

function normKey(value: string): string {
  return String(value || '').trim().toLowerCase();
}

/** Quota USD depuis Grille Airtime (colonnes A–C), même logique XLOOKUP Excel. */
export function lookupAirtimeQuota(
  grille: AirtimeGrilleRow[],
  category: string,
  gradeRaw: string,
): number | null {
  const grade = String(gradeRaw || '').trim().toUpperCase();
  if (!grade && !category) return null;

  const exact = grille.find(
    (row) => normKey(row.description) === normKey(category) && row.grade.trim().toUpperCase() === grade,
  );
  if (exact) return exact.allowanceUsd;

  const byGrade = grille.find((row) => row.grade.trim().toUpperCase() === grade);
  if (byGrade) return byGrade.allowanceUsd;

  return null;
}

export function formatMsisdn(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return String(value).trim().replace(/\.0$/, '');
}

export const AIRTIME_POLICY_GRILLE: { description: string; grades: string; allowanceUsd: number }[] = [
  { description: 'Exco Members', grades: 'D5-E4', allowanceUsd: 200 },
  { description: 'HOD', grades: 'D1-D4', allowanceUsd: 120 },
  { description: 'Managers', grades: 'D1-D4', allowanceUsd: 70 },
  { description: 'Regional Sales Managers', grades: 'D2', allowanceUsd: 150 },
  { description: 'Senior Regional sales and Sales', grades: 'C2-C5', allowanceUsd: 115 },
  { description: 'Logistic & Warehouse', grades: 'C2-C5', allowanceUsd: 100 },
  { description: 'Other employees', grades: 'C1-C5', allowanceUsd: 30 },
  { description: 'Other Employees', grades: 'B1-B5', allowanceUsd: 30 },
  { description: 'Overtime application users', grades: '-', allowanceUsd: 20 },
];

const SIM_LINE_NAMES = new Set([
  'ccr',
  'packing plant team',
  'labo',
  'weighbridge',
  'syndicat ppcb',
  'cec pool',
  'modem',
]);

/** Ligne sans personne : matériel ou pool qui utilise une SIM. */
export function isAirtimeSimLine(name: string): boolean {
  const key = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return SIM_LINE_NAMES.has(key);
}

const NAME_STOP = new Set(['wa', 'de', 'du', 'di', 'et', 'la', 'le', 'da', 'van']);

/** Jetons d’un nom, sans accents, pour rapprocher un libellé Airtime d’un contractant. */
export function personNameTokens(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length >= 3 && !NAME_STOP.has(token));
}

function tokenDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const rows = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = rows[0];
    rows[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = rows[j];
      rows[j] = a[i - 1] === b[j - 1]
        ? previous
        : 1 + Math.min(previous, rows[j], rows[j - 1]);
      previous = current;
    }
  }
  return rows[b.length];
}

function tokenMatches(query: string, candidate: string): boolean {
  if (query === candidate) return true;
  if (
    query.length >= 5
    && candidate.length >= 5
    && query.slice(0, 3) === candidate.slice(0, 3)
    && tokenDistance(query, candidate) <= 1
  ) {
    return true;
  }
  const [short, long] = query.length <= candidate.length ? [query, candidate] : [candidate, query];
  return short.length >= 5 && long.startsWith(short);
}

/**
 * Index des noms qui contiennent tous les jetons de `query`.
 * Un seul jeton court n’est retenu que s’il est unique.
 */
export function matchPersonIndexes(query: string, names: string[]): number[] {
  const queryTokens = personNameTokens(query);
  if (!queryTokens.length) return [];
  const scored = names
    .map((name, index) => {
      const tokens = personNameTokens(name);
      const hits = queryTokens.filter((token) => tokens.some((candidate) => tokenMatches(token, candidate))).length;
      return { index, hits, size: tokens.length };
    })
    .filter((item) => item.hits === queryTokens.length);
  if (!scored.length) return [];
  if (queryTokens.length === 1 && queryTokens[0].length < 4 && scored.length !== 1) return [];
  if (scored.length === 1) return [scored[0].index];
  scored.sort((a, b) => a.size - b.size);
  if (scored[0].size < scored[1].size) return [scored[0].index];
  return scored.map((item) => item.index);
}

export function normalizeMatricule(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return String(value).trim();
}

/** Renouvellement téléphone — formules COUNTIF colonne C (Achat Telephone). */
export function buildPhoneRenewalRows(grades: string[]): AirtimePhoneRenewalRow[] {
  const list = grades.map((g) => String(g || '').trim().toUpperCase());
  const count = (predicate: (grade: string) => boolean) => list.filter(predicate).length;

  const quantities = [
    count((g) => g === 'D5' || g === 'E1' || g === 'E2' || g === 'E3' || g === 'E4'),
    count((g) => g === 'D1' || g === 'D2' || g === 'D3' || g === 'D4'),
    count((g) => g.startsWith('C')),
    count((g) => g.startsWith('B')),
    count((g) => g === '–' || g === '-' || g === '—'),
  ];

  return PHONE_RENEWAL_POLICY.map((policy, index) => {
    const quantity = quantities[index] ?? 0;
    return {
      id: policy.id,
      label: policy.label,
      quantity,
      unitPriceUsd: policy.unitPriceUsd,
      totalUsd: quantity * policy.unitPriceUsd,
    };
  });
}

export function phoneRenewalTotal(rows: AirtimePhoneRenewalRow[]): number {
  return rows.reduce((sum, row) => sum + row.totalUsd, 0);
}
