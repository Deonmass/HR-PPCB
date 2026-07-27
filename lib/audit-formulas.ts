import type { DashboardData, Employee } from './types';
import type { CellAggregateStats } from './documents';
import {
  DOCUMENT_FIELDS,
  calcCellAggregateStats,
  calcGlobalStats,
  getConformiteRates,
} from './documents';

/** Formules feuille INSPECTIONS — lignes 23 à 25 (Annual review employees.xlsx) */
export function buildInspectionAggregateLines(agg: CellAggregateStats): string[] {
  return [
    'Feuille INSPECTIONS — formule actuelle :',
    `Ligne 23 — Σ : Total=${agg.totalCells} · N=${agg.sumN} · Y=${agg.sumY} · NA=${agg.sumNa}`,
    `Ligne 24 — %N = ${agg.sumN} ÷ ${agg.totalCells} × 100 = ${agg.nPct}%`,
    `         %Y = ${agg.sumY} ÷ ${agg.totalCells} × 100 = ${agg.yPct}%`,
    `         %NA = ${agg.sumNa} ÷ ${agg.totalCells} × 100 = ${agg.naPct}%`,
    `Ligne 25 — Taux conformité = %Y + %NA = ${agg.yPct}% + ${agg.naPct}% = ${agg.conformeRate}%`,
    `         Taux non conforme = %N = ${agg.nPct}%`,
  ];
}

export function buildInspectionCriterionConformeLines(
  y: number,
  na: number,
  total: number,
  pct: number,
): string[] {
  return [
    'Feuille INSPECTIONS — par critère :',
    `(Y + NA) ÷ Total × 100`,
    `= (${y} + ${na}) ÷ ${total} × 100 = ${pct}%`,
  ];
}

export function buildInspectionCriterionNonConformeLines(
  n: number,
  total: number,
  pct: number,
): string[] {
  return [
    'Feuille INSPECTIONS — par critère :',
    `N ÷ Total × 100`,
    `= ${n} ÷ ${total} × 100 = ${pct}%`,
  ];
}

export interface AuditRateInfo {
  conformeLabel: string;
  nonConformeLabel: string;
  conformeLines: string[];
  nonConformeLines: string[];
  liveAvgLines: string[];
}

export function buildAuditRateInfo(
  employees: Employee[],
  _dashboard: DashboardData | null,
  _filtered: boolean,
): AuditRateInfo {
  const rates = getConformiteRates(employees, null, false);
  const agg = rates.aggregate ?? calcCellAggregateStats(employees);
  const stats = calcGlobalStats(employees);
  const n = employees.length;

  const conformeLines = buildInspectionAggregateLines(agg);

  const nonConformeLines: string[] = [
    `Valeur affichée : ${rates.nonConformeLabel}`,
    'Feuille INSPECTIONS — ligne 24 :',
    `%N = Σ N ÷ Total × 100`,
    `= ${agg.sumN} ÷ ${agg.totalCells} × 100 = ${agg.nPct}%`,
  ];

  const liveAvgLines = [
    'Moyenne des taux individuels (colonne % conformité du grand tableau) :',
    `Par employé : (Y + NA) ÷ ${DOCUMENT_FIELDS.length} × 100`,
    `Moyenne : Σ(taux employé) ÷ ${n} = ${stats.conformeRate}%`,
    '(Indicateur distinct du taux global INSPECTIONS %Y + %NA)',
  ];

  return {
    conformeLabel: rates.conformeLabel,
    nonConformeLabel: rates.nonConformeLabel,
    conformeLines,
    nonConformeLines,
    liveAvgLines,
  };
}
