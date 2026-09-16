import { normalizePersonName } from './dependants-pactilis-compare';
import type { Dependant } from './dependants-types';
import { findBestNameMatch } from './village-name-match';
import type {
  SanteChartItem,
  SanteDashboard,
  SantePersonHistory,
  SanteVisit,
  SanteVisitInput,
} from './sante-types';
import type { Employee } from './types';

export const SANTE_MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

export function formatSanteMonthLabel(year: number, month: number): string {
  const name = SANTE_MONTH_NAMES[month - 1] ?? String(month);
  return `${year}-${String(month).padStart(2, '0')} ${name}`;
}

/** Libellé MOIS du fichier Excel source (sans accents, comme les segments du TCD). */
const SANTE_EXCEL_MONTH_NAMES = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre',
] as const;

export function formatSanteExcelMonthLabel(year: number, month: number): string {
  const name = SANTE_EXCEL_MONTH_NAMES[month - 1] ?? String(month);
  return `${year}-${String(month).padStart(2, '0')} ${name}`;
}

export function formatSanteDateFr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return iso || '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function isSanteReference(value: string): boolean {
  const v = (value || '').trim();
  if (!v) return false;
  return v.toUpperCase() !== 'NON';
}

export function normalizeSanteType(raw: string): string {
  const v = (raw || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!v) return 'AGENT';
  if (v.startsWith('ENFANT')) return 'ENFANT';
  if (v.startsWith('EPOUSE') || v.startsWith('ÉPOUSE') || v.startsWith('CONJOINT')) return 'EPOUSE';
  if (v.includes('CONTRACT') || v.includes('CONTACTANT')) return v.includes('AGENT') ? 'AGENT' : 'CONTRACTANT';
  if (v.startsWith('AGENT')) return 'AGENT';
  return v;
}

export function isFamilyPatientType(type: string): boolean {
  const t = normalizeSanteType(type);
  return t === 'ENFANT' || t === 'EPOUSE';
}

export function santeDisplayName(visit: Pick<SanteVisit, 'nom' | 'postnom'>): string {
  return `${visit.nom || ''} ${visit.postnom || ''}`.replace(/\s+/g, ' ').trim();
}

export function santePersonKey(visit: Pick<SanteVisit, 'typeMalade' | 'employeeMatricule' | 'dependantId' | 'nom' | 'postnom' | 'sexe'>): string {
  const type = normalizeSanteType(visit.typeMalade);
  if (visit.dependantId) return `dep:${visit.dependantId}`;
  if (visit.employeeMatricule && !isFamilyPatientType(type)) return `emp:${visit.employeeMatricule}`;
  const name = normalizePersonName(`${visit.nom} ${visit.postnom}`);
  if (visit.employeeMatricule) return `fam:${visit.employeeMatricule}:${name}`;
  return `name:${name}:${(visit.sexe || '').toUpperCase()}`;
}

export function santePersonLabel(visit: SanteVisit): string {
  const name = santeDisplayName(visit) || 'Sans nom';
  if (isFamilyPatientType(visit.typeMalade) && visit.employeeNom) {
    return `${name} · ${visit.employeeNom} (${visit.employeeMatricule || '—'})`;
  }
  if (visit.employeeMatricule) {
    return `${name} · ${visit.employeeMatricule}`;
  }
  return name;
}

function countBy(list: SanteVisit[], pick: (v: SanteVisit) => string, limit = 12): SanteChartItem[] {
  const map = new Map<string, number>();
  for (const visit of list) {
    const label = pick(visit).trim() || 'Non renseigné';
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'fr'))
    .slice(0, limit);
}

export function filterSanteVisits(
  visits: SanteVisit[],
  filters: {
    year?: number | '';
    month?: number | '';
    typeMalade?: string;
    reference?: string;
    pathologie?: string;
    q?: string;
  },
): SanteVisit[] {
  const q = (filters.q || '').trim().toLowerCase();
  return visits.filter((visit) => {
    if (filters.year && visit.year !== filters.year) return false;
    if (filters.month && visit.month !== filters.month) return false;
    if (filters.typeMalade && normalizeSanteType(visit.typeMalade) !== normalizeSanteType(filters.typeMalade)) {
      return false;
    }
    if (filters.pathologie && visit.pathologie.trim() !== filters.pathologie.trim()) return false;
    if (filters.reference === '__ref__' && !isSanteReference(visit.reference)) return false;
    if (filters.reference === '__none__' && isSanteReference(visit.reference)) return false;
    if (
      filters.reference
      && filters.reference !== '__ref__'
      && filters.reference !== '__none__'
      && visit.reference.trim() !== filters.reference.trim()
    ) {
      return false;
    }
    if (!q) return true;
    const hay = [
      visit.nom,
      visit.postnom,
      visit.employeeNom,
      visit.employeeMatricule,
      visit.pathologie,
      visit.traitement,
      visit.reference,
      visit.typeMalade,
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function buildSanteDashboard(visits: SanteVisit[]): SanteDashboard {
  const hommes = visits.filter((v) => v.sexe === 'M').length;
  const femmes = visits.filter((v) => v.sexe === 'F').length;
  const references = visits.filter((v) => isSanteReference(v.reference)).length;
  const byType = countBy(visits, (v) => normalizeSanteType(v.typeMalade), 8);
  return {
    total: visits.length,
    hommes,
    femmes,
    references,
    sansReference: visits.length - references,
    kpis: [
      { label: 'Total de cas', value: visits.length },
      { label: 'Hommes', value: hommes },
      { label: 'Femmes', value: femmes },
      { label: 'Référés', value: references },
      { label: 'Agents', value: visits.filter((v) => normalizeSanteType(v.typeMalade) === 'AGENT').length },
      { label: 'Enfants', value: visits.filter((v) => normalizeSanteType(v.typeMalade) === 'ENFANT').length },
      { label: 'Épouses', value: visits.filter((v) => normalizeSanteType(v.typeMalade) === 'EPOUSE').length },
      { label: 'Contractants', value: visits.filter((v) => normalizeSanteType(v.typeMalade) === 'CONTRACTANT').length },
    ],
    byType,
    byPathologie: countBy(visits, (v) => v.pathologie, 12),
    byTraitement: countBy(visits, (v) => v.traitement, 12),
    byReference: countBy(
      visits.filter((v) => isSanteReference(v.reference)),
      (v) => v.reference,
      8,
    ),
    byMonth: countBy(visits, (v) => formatSanteMonthLabel(v.year, v.month), 18).sort((a, b) =>
      a.label.localeCompare(b.label, 'fr'),
    ),
  };
}

export function buildSanteHistory(visits: SanteVisit[], key: string): SantePersonHistory | null {
  const list = visits
    .filter((visit) => santePersonKey(visit) === key)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const first = list[0];
  if (!first) return null;
  return {
    key,
    label: santePersonLabel(first),
    employeeMatricule: first.employeeMatricule,
    employeeNom: first.employeeNom,
    typeMalade: normalizeSanteType(first.typeMalade),
    sexe: first.sexe,
    visits: list,
  };
}

export function santeUniqueValues(visits: SanteVisit[], field: keyof SanteVisit): string[] {
  const set = new Set<string>();
  for (const visit of visits) {
    const value = String(visit[field] ?? '').trim();
    if (value) set.add(value);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function matchEmployeeForSante(
  employees: Employee[],
  nom: string,
  postnom: string,
): Employee | null {
  const target = normalizePersonName(`${nom} ${postnom}`);
  if (!target) return null;
  const exact = employees.find((e) => normalizePersonName(e.nom) === target);
  if (exact) return exact;
  const reversed = normalizePersonName(`${postnom} ${nom}`);
  const rev = employees.find((e) => normalizePersonName(e.nom) === reversed);
  if (rev) return rev;
  const fuzzy = findBestNameMatch(
    `${nom} ${postnom}`,
    employees.map((e) => ({ matricule: e.matricule, nom: e.nom })),
    72,
  );
  if (fuzzy) {
    return employees.find((e) => e.matricule === fuzzy.candidate.matricule) ?? null;
  }
  const partial = employees.filter((e) => {
    const n = normalizePersonName(e.nom);
    return n.includes(target) || target.includes(n);
  });
  return partial.length === 1 ? partial[0] : null;
}

export function matchDependantForSante(
  dependants: Dependant[],
  nom: string,
  postnom: string,
  typeMalade: string,
): Dependant | null {
  const target = normalizePersonName(`${nom} ${postnom}`);
  if (!target) return null;
  const type = normalizeSanteType(typeMalade);
  const pool = dependants.filter((d) => {
    if (type === 'ENFANT') return /enfant/i.test(d.statut);
    if (type === 'EPOUSE') return /conjoint/i.test(d.statut);
    return !/employ/i.test(d.statut) || /conjoint/i.test(d.statut);
  });
  const exact = pool.find((d) => normalizePersonName(d.nom) === target);
  if (exact) return exact;
  return (
    pool.find((d) => {
      const n = normalizePersonName(d.nom);
      return n.includes(target) || target.includes(n);
    }) ?? null
  );
}

export function emptySanteVisitInput(today = new Date()): SanteVisitInput {
  return {
    date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
    nom: '',
    postnom: '',
    sexe: '',
    age: null,
    typeMalade: 'AGENT',
    pathologie: '',
    traitement: '',
    reference: 'NON',
    employeeMatricule: '',
    employeeNom: '',
    dependantId: null,
  };
}

export function visitToInput(visit: SanteVisit): SanteVisitInput {
  return {
    date: visit.date,
    nom: visit.nom,
    postnom: visit.postnom,
    sexe: visit.sexe,
    age: visit.age,
    typeMalade: visit.typeMalade,
    pathologie: visit.pathologie,
    traitement: visit.traitement,
    reference: visit.reference,
    employeeMatricule: visit.employeeMatricule,
    employeeNom: visit.employeeNom,
    dependantId: visit.dependantId,
  };
}

export function splitEmployeeNom(nom: string): { nom: string; postnom: string } {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nom: '', postnom: '' };
  if (parts.length === 1) return { nom: parts[0], postnom: '' };
  return { nom: parts[0], postnom: parts.slice(1).join(' ') };
}

/** Palette stable pour badges pathologie (une teinte par libellé). */
const SANTE_PATHOLOGIE_PALETTE = [
  { bg: 'rgba(59, 130, 246, 0.18)', color: '#1d4ed8' },
  { bg: 'rgba(16, 185, 129, 0.18)', color: '#047857' },
  { bg: 'rgba(245, 158, 11, 0.2)', color: '#b45309' },
  { bg: 'rgba(236, 72, 153, 0.18)', color: '#be185d' },
  { bg: 'rgba(139, 92, 246, 0.18)', color: '#6d28d9' },
  { bg: 'rgba(6, 182, 212, 0.18)', color: '#0e7490' },
  { bg: 'rgba(239, 68, 68, 0.16)', color: '#b91c1c' },
  { bg: 'rgba(132, 204, 22, 0.2)', color: '#4d7c0f' },
  { bg: 'rgba(249, 115, 22, 0.18)', color: '#c2410c' },
  { bg: 'rgba(99, 102, 241, 0.18)', color: '#4338ca' },
  { bg: 'rgba(20, 184, 166, 0.18)', color: '#0f766e' },
  { bg: 'rgba(217, 70, 239, 0.16)', color: '#a21caf' },
] as const;

function hashSanteLabel(value: string): number {
  const key = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toUpperCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function santePathologieBadgeStyle(pathologie: string): {
  background: string;
  color: string;
} | null {
  const label = pathologie.trim();
  if (!label || label === '—') return null;
  const tone = SANTE_PATHOLOGIE_PALETTE[hashSanteLabel(label) % SANTE_PATHOLOGIE_PALETTE.length];
  return { background: tone.bg, color: tone.color };
}
