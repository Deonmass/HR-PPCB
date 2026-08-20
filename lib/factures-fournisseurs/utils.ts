import { formatExcelDateValue } from '@/lib/employee-columns';
import type {
  AssignStep,
  FactureDashboard,
  FactureGroupNode,
  FacturePipelineKpi,
  FacturePipelineStep,
  FactureStage,
  FactureStageKpi,
  FactureSuivi,
  FactureSuiviInput,
} from '@/lib/factures-fournisseurs/types';
import {
  FACTURE_PIPELINE_COMMENTS,
  FACTURE_PIPELINE_LABELS,
  FACTURE_PIPELINE_STEPS,
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
  const cleaned = String(value)
    .replace(/\s/g, '')
    .replace(/[$€£]/g, '')
    .replace(/usd|cdf|eur/gi, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizePaymentToken(payment: string): string {
  return payment
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function isUnpaidPaymentToken(payment: string): boolean {
  const token = normalizePaymentToken(payment);
  return (
    token === ''
    || token === 'unpaid'
    || token === 'nonpaye'
    || token === 'nonpayee'
    || token === 'impaye'
    || token === 'impayee'
    || token === 'notpaid'
    || token === 'open'
    || token === 'no'
    || token === 'non'
  );
}

function isPaidPaymentToken(payment: string): boolean {
  const token = normalizePaymentToken(payment);
  return (
    token === 'paid'
    || token === 'paye'
    || token === 'payee'
    || token === 'regle'
    || token === 'reglee'
    || token === 'settled'
    || token === 'yes'
    || token === 'oui'
  );
}

/**
 * PYTMT « Unpaid » / vide → non payée.
 * « PAID » ou toute autre référence de paiement → payée.
 */
export function isFacturePaid(payment: string): boolean {
  const value = payment.trim();
  if (!value || isUnpaidPaymentToken(value)) return false;
  return true;
}

/** Valeur stockée : vide si unpaid, « PAID » si libellé payé, sinon le texte d’origine. */
export function normalizePaymentValue(payment: string): string {
  const value = payment.trim();
  if (!value || isUnpaidPaymentToken(value)) return '';
  if (isPaidPaymentToken(value)) return 'PAID';
  return value;
}

export function paymentStatusLabel(payment: string): 'Paid' | 'Unpaid' {
  return isFacturePaid(payment) ? 'Paid' : 'Unpaid';
}

export function paymentValueFromStatus(status: 'paid' | 'unpaid'): string {
  return status === 'paid' ? 'PAID' : '';
}

/** Clé d’identité import : société + facture + PR + P.O (deux lignes au même n° mais PR/PO différents restent distinctes). */
export function factureImportIdentityKey(row: {
  societe?: string;
  facture?: string;
  pr?: string;
  po?: string;
}): string {
  return [
    String(row.societe ?? '').trim().toLowerCase(),
    String(row.facture ?? '').trim().toLowerCase(),
    String(row.pr ?? '').trim().toLowerCase(),
    String(row.po ?? '').trim().toLowerCase(),
  ].join('|');
}

export function computeStatut(input: {
  payment: string;
  pr?: string;
  po?: string;
  grn?: string;
}): FactureStage {
  return isFacturePaid(input.payment) ? 'paid' : 'unpaid';
}

/** Pipeline analytique : Reçus → PR → PO → Paid. */
export function computePipelineStep(input: {
  payment: string;
  pr: string;
  po: string;
}): FacturePipelineStep {
  if (isFacturePaid(input.payment)) return 'paid';
  if (input.po.trim()) return 'po';
  if (input.pr.trim()) return 'pr';
  return 'recu';
}

export function computeCommentaireFromRow(input: {
  payment: string;
  pr: string;
  po: string;
}): string {
  return FACTURE_PIPELINE_COMMENTS[computePipelineStep(input)];
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
  const payment = normalizePaymentValue(row.payment);
  const statut = computeStatut({ ...row, payment });
  return {
    ...row,
    payment,
    statut,
    statutLabel: FACTURE_STAGE_LABELS[statut],
    // Toujours dérivé de la position (Reçu / PR / PO / Paid).
    commentaire: computeCommentaireFromRow({ ...row, payment }),
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

export function filterByTab(factures: FactureSuivi[], stage: FactureStage): FactureSuivi[] {
  return factures.filter((f) => f.statut === stage);
}

function sumMontant(items: FactureSuivi[]): number {
  return items.reduce((s, f) => s + (f.montant ?? 0), 0);
}

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
  | 'pr'
  | 'po'
  | 'recu'
  | FactureStage;

export function facturesForDashboardKpi(
  factures: FactureSuivi[],
  kind: FactureDashboardKpiKind,
): FactureSuivi[] {
  const list = Array.isArray(factures) ? factures : [];
  switch (kind) {
    case 'total':
      return list;
    case 'enCours':
    case 'unpaid':
      return list.filter((f) => f.statut !== 'paid');
    case 'enRetard':
      return list.filter((f) => f.statut !== 'paid' && isOverdue(f));
    case 'posted':
      return list.filter((f) => f.statut === 'unpaid');
    case 'paid':
      return list.filter((f) => f.statut === 'paid');
    case 'pr':
      return list.filter((f) => computePipelineStep(f) === 'pr');
    case 'po':
      return list.filter((f) => computePipelineStep(f) === 'po');
    case 'recu':
      return list.filter((f) => computePipelineStep(f) === 'recu');
    default:
      return [];
  }
}

export function facturesForPipelineStep(
  factures: FactureSuivi[],
  step: FacturePipelineStep,
): FactureSuivi[] {
  return factures.filter((f) => computePipelineStep(f) === step);
}

export function buildFactureDashboard(factures: FactureSuivi[]): FactureDashboard {
  const unpaid = factures.filter((f) => f.statut !== 'paid');
  const paid = factures.filter((f) => f.statut === 'paid');
  const enRetard = unpaid.filter((f) => isOverdue(f));
  // Partitions exclusives unpaid : Reçu + PR + PO = Unpaid
  const withPr = factures.filter((f) => computePipelineStep(f) === 'pr');
  const withPo = factures.filter((f) => computePipelineStep(f) === 'po');
  const recu = factures.filter((f) => computePipelineStep(f) === 'recu');

  const parEtape: FactureStageKpi[] = FACTURE_STAGES.map((stage) => {
    const items = factures.filter((f) => f.statut === stage);
    return {
      stage,
      label: FACTURE_TAB_LABELS[stage],
      count: items.length,
      montant: sumMontant(items),
    };
  });

  const parPipeline: FacturePipelineKpi[] = FACTURE_PIPELINE_STEPS.map((step) => {
    const items = facturesForPipelineStep(factures, step);
    return {
      step,
      label: FACTURE_PIPELINE_LABELS[step],
      count: items.length,
      montant: sumMontant(items),
    };
  });

  return {
    total: factures.length,
    montantTotal: sumMontant(factures),
    enCours: unpaid.length,
    montantEnCours: sumMontant(unpaid),
    posted: 0,
    montantPosted: 0,
    paid: paid.length,
    montantPaid: sumMontant(paid),
    enRetard: enRetard.length,
    montantRetard: sumMontant(enRetard),
    pr: withPr.length,
    montantPr: sumMontant(withPr),
    po: withPo.length,
    montantPo: sumMontant(withPo),
    recu: recu.length,
    montantRecu: sumMontant(recu),
    parEtape,
    parPipeline,
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

export function buildStageGroups(factures: FactureSuivi[], stage: FactureStage): FactureGroupNode[] {
  switch (stage) {
    case 'unpaid':
      return buildLeafGroups(factures, (f) => f.pr || f.po || f.societe, (f) => f.date, 'Unpaid');
    case 'paid':
      return buildLeafGroups(factures, (f) => f.payment, (f) => f.datePym || f.date, 'Payment');
    default:
      return [];
  }
}

export function countStageGroups(factures: FactureSuivi[], stage: FactureStage): number {
  return buildStageGroups(filterByTab(factures, stage), stage).length;
}

export function stageColumnLabels(stage: FactureStage): {
  date: string;
  numero: string;
} {
  switch (stage) {
    case 'unpaid':
      return { date: 'Date facture', numero: 'Réf.' };
    case 'paid':
      return { date: 'DATE PYM', numero: 'Payment' };
  }
}

export function formatUsdLike(value: number): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function canAssignStep(facture: FactureSuivi, step: AssignStep): boolean {
  if (step === 'payment') return facture.statut === 'unpaid';
  return facture.statut === 'unpaid';
}

export function assertRefUniqueness(
  existing: FactureSuivi[],
  candidates: Array<Pick<FactureSuivi, 'id' | 'pr' | 'po' | 'grn'>>,
): void {
  const grnToPo = new Map<string, string>();

  const ingest = (row: Pick<FactureSuivi, 'id' | 'pr' | 'po' | 'grn'>) => {
    const po = row.po.trim();
    const grn = row.grn.trim();
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
  recuCount: number;
  recuMontant: number;
  paidMontant: number;
  unpaidMontant: number;
  paidCount: number;
  unpaidCount: number;
  /** % de factures payées parmi celles reçues ce mois (0–100). */
  paidPct: number;
  /** % du montant payé parmi le montant reçu ce mois (0–100). */
  paidPctMontant: number;
}

function yearFromDate(value: string): number | null {
  const d = parseDisplayDate(value);
  return d ? d.getFullYear() : null;
}

export function yearFromFactureDate(value: string): number | null {
  return yearFromDate(value);
}

/** 0 = toutes les années (totaux d’import, hors filtre annuel). */
export const FACTURE_YEAR_ALL = 0;

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

/** Factures dont la date de facture tombe dans l'année (0 = toutes). */
export function filterFacturesByYear(factures: FactureSuivi[], year: number): FactureSuivi[] {
  if (year === FACTURE_YEAR_ALL) return factures;
  return factures.filter((f) => {
    const d = parseDisplayDate(f.date);
    return d != null && d.getFullYear() === year;
  });
}

/**
 * Suivi mensuel par date de facture :
 * - Total reçu / Paid / Unpaid en nombre
 * - montants associés pour tooltips
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
    paidPct: 0,
    paidPctMontant: 0,
  }));

  for (const f of factures) {
    const montant = f.montant ?? 0;
    const received = parseDisplayDate(f.date);
    if (received && (year === FACTURE_YEAR_ALL || received.getFullYear() === year)) {
      const m = received.getMonth();
      const point = points[m]!;
      point.recuCount += 1;
      point.recuMontant += montant;
      if (f.statut !== 'paid') {
        point.unpaidCount += 1;
        point.unpaidMontant += montant;
      } else {
        point.paidCount += 1;
        point.paidMontant += montant;
      }
    }
  }

  for (const point of points) {
    point.paidPct =
      point.recuCount > 0
        ? Math.round((point.paidCount / point.recuCount) * 1000) / 10
        : 0;
    point.paidPctMontant =
      point.recuMontant > 0
        ? Math.round((point.paidMontant / point.recuMontant) * 1000) / 10
        : 0;
  }

  return points;
}

export { isOverdue as isFactureOverdue };
