/**
 * Baseline figée du fichier EXCO de juin (FY Mar→Mar).
 * Ne pas recalculer / écraser Mar–Jun : reproduire tel quel.
 */

export const EXCO_FY_START_YEAR = 2026;
/** Dernier mois calendaire verrouillé dans le template juin. */
export const EXCO_TEMPLATE_LOCKED_THROUGH_MONTH = 6;

/** 13 colonnes FY : MAR … DEC, JAN, FEV, MAR */
export const EXCO_FY_MONTH_LABELS = [
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
  'JAN',
  'FEB',
  'MAR',
] as const;

/** Index colonne FY (0..12) pour un mois calendaire, ou null hors grille. */
export function excoFyColIndex(
  year: number,
  month: number,
  fyStartYear = EXCO_FY_START_YEAR,
): number | null {
  if (year === fyStartYear && month >= 3 && month <= 12) return month - 3;
  if (year === fyStartYear + 1 && month >= 1 && month <= 2) return 9 + month;
  if (year === fyStartYear + 1 && month === 3) return 12;
  return null;
}

export function excoFyColToYearMonth(
  col: number,
  fyStartYear = EXCO_FY_START_YEAR,
): { year: number; month: number } {
  if (col >= 0 && col <= 9) return { year: fyStartYear, month: col + 3 };
  if (col === 10) return { year: fyStartYear + 1, month: 1 };
  if (col === 11) return { year: fyStartYear + 1, month: 2 };
  return { year: fyStartYear + 1, month: 3 };
}

/** Mois système à écrire dans le PPTX (après le verrouillage template). */
export function excoShouldWriteSystemMonth(
  year: number,
  month: number,
  throughMonth: number,
): boolean {
  if (month < 1 || month > 12 || month > throughMonth) return false;
  if (year === EXCO_FY_START_YEAR && month <= EXCO_TEMPLATE_LOCKED_THROUGH_MONTH) {
    return false;
  }
  return true;
}

export interface ExcoTemplateTrendMonth {
  month: number;
  staffCost: number;
  volumePerEmp: number;
  revenuePerEmp: number;
  plant: number;
  hq: number;
  lubudi: number;
  graduates: number;
  headcount: number;
  genderMalePct: number;
  genderFemalePct: number;
  averageAge: number;
  averageAgeMale: number;
  averageAgeFemale: number;
  hires: number;
  exits: number;
  attritionPct: number;
  turnoverPct: number;
  leavePlantAvgDays: number;
  leaveHqAvgDays: number;
  leaveLubudiAvgDays: number;
  leaveBalanceAvgDays: number;
  leaveProvisionUsd000: number;
  promotions: number;
}

/** Valeurs Mar–Jun 2026 extraites du PPTX juin — ne pas modifier. */
export const TEMPLATE_TREND_BASELINE_2026: Record<number, ExcoTemplateTrendMonth> = {
  3: {
    month: 3,
    staffCost: 804_780,
    volumePerEmp: 271.36,
    revenuePerEmp: 47_011.6,
    plant: 100,
    hq: 66,
    lubudi: 8,
    graduates: 0,
    headcount: 174,
    genderMalePct: 84,
    genderFemalePct: 16,
    averageAge: 39.8,
    averageAgeMale: 40.4,
    averageAgeFemale: 36.3,
    hires: 0,
    exits: 1,
    attritionPct: 0.6,
    turnoverPct: 0.3,
    leavePlantAvgDays: 16,
    leaveHqAvgDays: 22,
    leaveLubudiAvgDays: 6,
    leaveBalanceAvgDays: 18,
    leaveProvisionUsd000: 377.88,
    promotions: 1,
  },
  4: {
    month: 4,
    staffCost: 898_100,
    volumePerEmp: 187.3,
    revenuePerEmp: 31_530.7,
    plant: 100,
    hq: 66,
    lubudi: 7,
    graduates: 0,
    headcount: 173,
    genderMalePct: 84,
    genderFemalePct: 16,
    averageAge: 39.9,
    averageAgeMale: 40.5,
    averageAgeFemale: 36.4,
    hires: 0,
    exits: 1,
    attritionPct: 0.6,
    turnoverPct: 0.3,
    leavePlantAvgDays: 17,
    leaveHqAvgDays: 21,
    leaveLubudiAvgDays: 7,
    leaveBalanceAvgDays: 18,
    leaveProvisionUsd000: 391.7,
    promotions: 1,
  },
  5: {
    month: 5,
    staffCost: 798_140,
    volumePerEmp: 362.68,
    revenuePerEmp: 59_536.15,
    plant: 101,
    hq: 65,
    lubudi: 7,
    graduates: 0,
    headcount: 173,
    genderMalePct: 84,
    genderFemalePct: 16,
    averageAge: 40.0,
    averageAgeMale: 40.6,
    averageAgeFemale: 36.5,
    hires: 1,
    exits: 1,
    attritionPct: 0.6,
    turnoverPct: 0.6,
    leavePlantAvgDays: 17,
    leaveHqAvgDays: 22,
    leaveLubudiAvgDays: 9,
    leaveBalanceAvgDays: 18,
    leaveProvisionUsd000: 390.47,
    promotions: 0,
  },
  6: {
    month: 6,
    staffCost: 941_260,
    volumePerEmp: 327.53,
    revenuePerEmp: 51_800.29,
    plant: 103,
    hq: 66,
    lubudi: 7,
    graduates: 0,
    headcount: 176,
    genderMalePct: 85,
    genderFemalePct: 15,
    averageAge: 39.9,
    averageAgeMale: 40.5,
    averageAgeFemale: 36.7,
    hires: 3,
    exits: 0,
    attritionPct: 0,
    turnoverPct: 0.9,
    leavePlantAvgDays: 17,
    leaveHqAvgDays: 23,
    leaveLubudiAvgDays: 7,
    leaveBalanceAvgDays: 19,
    leaveProvisionUsd000: 435.85,
    promotions: 0,
  },
};

/** YTD affichés dans le template juin (ne pas recalculer Mar–Jun). */
export const TEMPLATE_YTD_JUNE_2026 = {
  staffCost000: 2637.49,
  volumePerEmp: 868.14,
  revenuePerEmp: 141_314.85,
  hires: 4,
  exits: 2,
  attritionPct: 1.14,
  turnoverPct: 1.73,
  promotions: 1,
  overtimeHours: 2828.66,
};
