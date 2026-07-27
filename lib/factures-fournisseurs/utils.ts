import { formatExcelDateValue } from '@/lib/employee-columns';
import type {
  AssignStep,
  FactureDashboard,
  FactureGroupNode,
  FactureStage,
  FactureStageKpi,
  FactureSuivi,
  FactureSuiviInput,
} from '@/lib/factures-fournisseurs/types';
import {
  FACTURE_STAGE_COMMENTS,
  FACTURE_STAGE_LABELS,
  FACTURE_STAGES,
  FACTURE_TAB_LABELS,
} from '@/lib/factures-fournisseurs/types';

export function cellStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return String(value).trim();
}

export function formatDateCell(value: unknown): string {
  return formatExcelDateValue(value);
}

export function parseMontant(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pipeline :
 * - pas de PR → Facture reçue
 * - PR ou PO (sans GRN) → unpaid
 * - GRN (sans paiement) → Posted and unpaid
 * - payment → paid
 */
export function computeStatut(input: {
  pr: string;
  po: string;
  grn: string;
  payment: string;
}): FactureStage {
  if (!input.pr) return 'facture';
  if (!input.po) return 'pr';
  if (!input.grn) return 'po';
  if (!input.payment) return 'posted';
  return 'paid';
}

export function computeCommentaire(statut: FactureStage, override?: string): string {
  const custom = override?.trim();
  if (custom) return custom;
  return FACTURE_STAGE_COMMENTS[statut];
}

export function withComputedStatut<
  T extends Omit<FactureSuivi, 'statut' | 'statutLabel' | 'commentaire'> & {
    commentaire?: string;
  },
>(row: T): FactureSuivi {
  const statut = computeStatut(row);
  return {
    ...row,
    statut,
    statutLabel: FACTURE_STAGE_LABELS[statut],
    commentaire: computeCommentaire(statut, row.commentaire),
  };
}

export function emptyFactureInput(): FactureSuiviInput {
  return {
    date: '',
    societe: '',
    facture: '',
    montant: null,
    echeance: '',
    pr: '',
    datePr: '',
    po: '',
    datePo: '',
    grn: '',
    dateGrn: '',
    payment: '',
    datePym: '',
    commentaire: '',
  };
}

export function stepFields(step: AssignStep): {
  numeroKey: keyof FactureSuivi;
  dateKey: keyof FactureSuivi;
} {
  switch (step) {
    case 'pr':
      return { numeroKey: 'pr', dateKey: 'datePr' };
    case 'po':
      return { numeroKey: 'po', dateKey: 'datePo' };
    case 'grn':
      return { numeroKey: 'grn', dateKey: 'dateGrn' };
    case 'payment':
      return { numeroKey: 'payment', dateKey: 'datePym' };
  }
}

/** Factures visibles dans l’onglet d’une étape. */
export function filterByTab(factures: FactureSuivi[], stage: FactureStage): FactureSuivi[] {
  return factures.filter((f) => f.statut === stage);
}

function sumMontant(items: FactureSuivi[]): number {
  return items.reduce((s, f) => s + (f.montant ?? 0), 0);
}

/** Parse a display date (DD/MM/YYYY, ISO, Excel serial-ish) into a Date at local midnight. */
export function parseDisplayDate(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const date = new Date(y, mo, d);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isOverdue(facture: FactureSuivi, today = new Date()): boolean {
  if (facture.statut === 'paid') return false;
  const echeance = parseDisplayDate(facture.echeance);
  if (!echeance) return false;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return echeance.getTime() < t.getTime();
}

export type FactureDashboardKpiKind =
  | 'total'
  | 'enCours'
  | 'enRetard'
  | 'posted'
  | 'paid'
  | FactureStage;

/** Liste derrière un KPI / étape du dashboard suivi factures. */
export function facturesForDashboardKpi(
  factures: FactureSuivi[],
  kind: FactureDashboardKpiKind,
): FactureSuivi[] {
  const list = Array.isArray(factures) ? factures : [];
  switch (kind) {
    case 'total':
      return list;
    case 'enCours':
      return list.filter((f) => f.statut !== 'paid');
    case 'enRetard':
      return list.filter((f) => f.statut !== 'paid' && isOverdue(f));
    case 'posted':
    case 'paid':
    case 'facture':
    case 'pr':
    case 'po':
      return list.filter((f) => f.statut === kind);
    default:
      return [];
  }
}

export function buildFactureDashboard(factures: FactureSuivi[]): FactureDashboard {
  const enCours = factures.filter((f) => f.statut !== 'paid');
  const posted = factures.filter((f) => f.statut === 'posted');
  const paid = factures.filter((f) => f.statut === 'paid');
  const enRetard = enCours.filter((f) => isOverdue(f));

  const parEtape: FactureStageKpi[] = FACTURE_STAGES.map((stage) => {
    const items = factures.filter((f) => f.statut === stage);
    return {
      stage,
      label: FACTURE_TAB_LABELS[stage],
      count: items.length,
      montant: sumMontant(items),
    };
  });

  return {
    total: factures.length,
    montantTotal: sumMontant(factures),
    enCours: enCours.length,
    montantEnCours: sumMontant(enCours),
    posted: posted.length,
    montantPosted: sumMontant(posted),
    paid: paid.length,
    montantPaid: sumMontant(paid),
    enRetard: enRetard.length,
    montantRetard: sumMontant(enRetard),
    parEtape,
  };
}

function groupKey(ref: string, fallback: string): string {
  const r = ref.trim();
  return r || fallback;
}

function buildLeafGroups(
  factures: FactureSuivi[],
  getRef: (f: FactureSuivi) => string,
  getDate: (f: FactureSuivi) => string,
  labelPrefix: string,
): FactureGroupNode[] {
  const map = new Map<string, FactureSuivi[]>();
  for (const f of factures) {
    const key = groupKey(getRef(f), `(sans ${labelPrefix})`);
    const list = map.get(key) ?? [];
    list.push(f);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([ref, items]) => ({
      key: `${labelPrefix}:${ref}`,
      label: labelPrefix,
      ref,
      date: getDate(items[0]) || '',
      count: items.length,
      montant: sumMontant(items),
      factures: items.sort((a, b) => a.facture.localeCompare(b.facture, 'fr')),
    }))
    .sort((a, b) => a.ref.localeCompare(b.ref, 'fr'));
}

/** Groupes plats par numéro d’étape (PR / PO / GRN / payment). */
export function buildStageGroups(factures: FactureSuivi[], stage: FactureStage): FactureGroupNode[] {
  switch (stage) {
    case 'pr':
      return buildLeafGroups(factures, (f) => f.pr, (f) => f.datePr, 'PR');
    case 'po':
      return buildLeafGroups(factures, (f) => f.po, (f) => f.datePo, 'PO');
    case 'posted':
      return buildLeafGroups(factures, (f) => f.grn, (f) => f.dateGrn, 'GRN');
    case 'paid':
      return buildLeafGroups(factures, (f) => f.payment, (f) => f.datePym, 'Payment');
    default:
      return [];
  }
}

export function countStageGroups(factures: FactureSuivi[], stage: FactureStage): number {
  if (stage === 'facture') return 0;
  return buildStageGroups(filterByTab(factures, stage), stage).length;
}

export function stageColumnLabels(stage: Exclude<FactureStage, 'facture'>): {
  date: string;
  numero: string;
} {
  switch (stage) {
    case 'pr':
      return { date: 'Date PR', numero: 'Numéro PR' };
    case 'po':
      return { date: 'Date PO', numero: 'Numéro PO' };
    case 'posted':
      return { date: 'Date GRN', numero: 'Numéro GRN' };
    case 'paid':
      return { date: 'DATE PYM', numero: 'payment' };
  }
}

export function formatUsdLike(value: number): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function canAssignStep(facture: FactureSuivi, step: AssignStep): boolean {
  const prev: Record<AssignStep, FactureStage> = {
    pr: 'facture',
    po: 'pr',
    grn: 'po',
    payment: 'posted',
  };
  return facture.statut === prev[step];
}

/**
 * Validate PR / PO / GRN uniqueness rules across the dataset:
 * - Same PR may cover multiple invoices.
 * - Same PO may cover multiple PRs.
 * - A GRN may only be linked to a single PO.
 */
export function assertRefUniqueness(
  existing: FactureSuivi[],
  candidates: Array<Pick<FactureSuivi, 'id' | 'pr' | 'po' | 'grn'>>,
): void {
  const byPr = new Map<string, Set<string>>();
  const byPo = new Map<string, Set<string>>();
  const grnToPo = new Map<string, string>();

  const ingest = (row: Pick<FactureSuivi, 'id' | 'pr' | 'po' | 'grn'>) => {
    const pr = row.pr.trim();
    const po = row.po.trim();
    const grn = row.grn.trim();
    if (pr) {
      const set = byPr.get(pr) ?? new Set<string>();
      set.add(row.id || pr);
      byPr.set(pr, set);
    }
    if (po) {
      const set = byPo.get(po) ?? new Set<string>();
      if (pr) set.add(pr);
      byPo.set(po, set);
    }
    if (grn) {
      if (!po) {
        throw new Error(`Le GRN ${grn} doit être lié à un PO`);
      }
      const knownPo = grnToPo.get(grn);
      if (knownPo && knownPo !== po) {
        throw new Error(
          `Le GRN ${grn} est déjà lié au PO ${knownPo} — un GRN ne peut avoir qu'un seul PO`,
        );
      }
      grnToPo.set(grn, po);
    }
  };

  for (const row of existing) ingest(row);
  for (const row of candidates) ingest(row);
}

export const FACTURE_MONTH_LABELS = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Aoû',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
] as const;

export interface FactureMonthlyPoint {
  month: number;
  label: string;
  /** Factures reçues (date facture) — nombre. */
  recuCount: number;
  /** Factures reçues — montant. */
  recuMontant: number;
  /** Paiements enregistrés ce mois (datePym) — montant. */
  paidMontant: number;
  /** Reçues ce mois encore unpaid — montant. */
  unpaidMontant: number;
  paidCount: number;
  unpaidCount: number;
}

function yearFromDate(value: string): number | null {
  const d = parseDisplayDate(value);
  return d ? d.getFullYear() : null;
}

/** Années présentes dans les dates facture / paiement. */
export function listFactureYears(factures: FactureSuivi[]): number[] {
  const years = new Set<number>();
  for (const f of factures) {
    const y1 = yearFromDate(f.date);
    const y2 = yearFromDate(f.datePym);
    if (y1 != null) years.add(y1);
    if (y2 != null) years.add(y2);
  }
  if (!years.size) years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}

/**
 * Suivi mensuel Jan→Déc pour une année :
 * - reçu : date facture
 * - paid : date de paiement
 * - unpaid : reçues ce mois et non payées
 */
export function buildFacturesMonthlyTracking(
  factures: FactureSuivi[],
  year: number,
): FactureMonthlyPoint[] {
  const points: FactureMonthlyPoint[] = FACTURE_MONTH_LABELS.map((label, month) => ({
    month,
    label,
    recuCount: 0,
    recuMontant: 0,
    paidMontant: 0,
    unpaidMontant: 0,
    paidCount: 0,
    unpaidCount: 0,
  }));

  for (const f of factures) {
    const montant = f.montant ?? 0;
    const received = parseDisplayDate(f.date);
    if (received && received.getFullYear() === year) {
      const m = received.getMonth();
      const point = points[m]!;
      point.recuCount += 1;
      point.recuMontant += montant;
      if (f.statut !== 'paid') {
        point.unpaidCount += 1;
        point.unpaidMontant += montant;
      }
    }

    const paidAt = parseDisplayDate(f.datePym);
    if (f.statut === 'paid' && paidAt && paidAt.getFullYear() === year) {
      const m = paidAt.getMonth();
      const point = points[m]!;
      point.paidCount += 1;
      point.paidMontant += montant;
    }
  }

  return points;
}

export { isOverdue as isFactureOverdue };
