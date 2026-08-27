/**
 * Modèle Staff Cost KPI — mêmes formules que la feuille Staff_Cost_KPI (New report.xlsx).
 * Grille FY : April → March.
 */

import type { ExcoWorkbookStaffCostMonth } from '@/lib/exco-new-report-parse';
import type { ExcoStaffCostYtdInput } from '@/lib/exco-types';

export type { ExcoStaffCostYtdInput };

/** Ordre des colonnes FY (comme Excel). */
export const STAFF_COST_FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3] as const;
export const STAFF_COST_FY_LABELS = [
  'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR',
] as const;

/** Source visible d’une formule (réf. + valeur). */
export interface StaffCostFormulaSource {
  /** Libellé métier. */
  label: string;
  /** Origine / référence Excel visible (ex. E5 — Salaries Actual YTD). */
  origin: string;
  /** Valeur courante de la source. */
  value: number | null;
}

export interface StaffCostSheetCell {
  value: number | null;
  /** Titre court (métrique · mois). */
  title: string;
  /** Expression / référence Excel. */
  formula: string;
  /** Explication : comment le chiffre a été obtenu. */
  explanation: string;
  /** Déroulement numérique avec valeurs (ex. 6 029 219 − 5 200 000 = …). */
  calc: string | null;
  /** Sources avec références visibles. */
  sources: StaffCostFormulaSource[];
}

export interface StaffCostSheetMonth {
  calendarMonth: number;
  label: string;
  fyIndex: number;
  actualHeadcount: StaffCostSheetCell;
  salariesActualYtd: StaffCostSheetCell;
  volumesActualYtd: StaffCostSheetCell;
  revenueActualYtd: StaffCostSheetCell;
  budgetHeadcount: StaffCostSheetCell;
  salariesBudgetYtd: StaffCostSheetCell;
  volumesBudgetYtd: StaffCostSheetCell;
  revenueBudgetYtd: StaffCostSheetCell;
  pctSalaries: StaffCostSheetCell;
  pctVolumes: StaffCostSheetCell;
  pctRevenue: StaffCostSheetCell;
  staffCostMonth: StaffCostSheetCell;
  staffCumul: StaffCostSheetCell;
  volumeMonth: StaffCostSheetCell;
  volumeCumul: StaffCostSheetCell;
  revenueMonth: StaffCostSheetCell;
  revenueCumul: StaffCostSheetCell;
  tonPerEmpYtd: StaffCostSheetCell;
  tonPerEmp: StaffCostSheetCell;
  revenuePerEmpYtd: StaffCostSheetCell;
  revenuePerEmp: StaffCostSheetCell;
  budgetStaffCostMonth: StaffCostSheetCell;
  budgetStaffCumul: StaffCostSheetCell;
  budgetVolumeMonth: StaffCostSheetCell;
  budgetVolumeCumul: StaffCostSheetCell;
  budgetRevenueMonth: StaffCostSheetCell;
  budgetRevenueCumul: StaffCostSheetCell;
  budgetTonPerEmp: StaffCostSheetCell;
  budgetRevenuePerEmp: StaffCostSheetCell;
}

function n(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

function round2(v: number | null): number | null {
  if (v == null) return null;
  return Math.round(v * 100) / 100;
}

function fmt(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function src(label: string, origin: string, value: number | null): StaffCostFormulaSource {
  return { label, origin, value: round2(value) };
}

function cell(args: {
  value: number | null;
  title: string;
  formula: string;
  explanation: string;
  calc?: string | null;
  sources?: StaffCostFormulaSource[];
}): StaffCostSheetCell {
  return {
    value: round2(args.value),
    title: args.title,
    formula: args.formula,
    explanation: args.explanation,
    calc: args.calc ?? null,
    sources: args.sources ?? [],
  };
}

function colLetter(fyIndex: number): string {
  // B=0 … M=11
  return String.fromCharCode(66 + fyIndex);
}

function emptyInput(): ExcoStaffCostYtdInput {
  return {
    actualHeadcount: null,
    salariesActualYtd: null,
    volumesActualYtd: null,
    revenueActualYtd: null,
    budgetHeadcount: null,
    salariesBudgetYtd: null,
    volumesBudgetYtd: null,
    revenueBudgetYtd: null,
  };
}

/** Convertit une ligne workbook → saisie YTD. */
export function workbookMonthToYtdInput(
  row: ExcoWorkbookStaffCostMonth | undefined | null,
): ExcoStaffCostYtdInput {
  if (!row) return emptyInput();
  return {
    actualHeadcount: n(row.actualHeadcount),
    salariesActualYtd: n(row.salariesActualYtd),
    volumesActualYtd: n(row.volumesActualYtd),
    revenueActualYtd: n(row.revenueActualYtd),
    budgetHeadcount: null,
    salariesBudgetYtd: n(row.salariesBudgetYtd),
    volumesBudgetYtd: n(row.volumesBudgetYtd),
    revenueBudgetYtd: n(row.revenueBudgetYtd),
  };
}

/**
 * Construit le tableau Staff Cost (Tableau 1 + dérivés Actual/Budget)
 * à partir des YTD saisis / importés, mois par mois FY.
 */
export function buildStaffCostSheet(args: {
  /** Saisie YTD par mois calendaire (1–12). */
  ytdByCalendarMonth: Record<number, ExcoStaffCostYtdInput>;
  /** Headcount budget par défaut (Excel = 192). */
  defaultBudgetHeadcount?: number | null;
}): StaffCostSheetMonth[] {
  const defaultBudgetHc = args.defaultBudgetHeadcount ?? 192;
  const months: StaffCostSheetMonth[] = [];
  /** Après le 1er mois YTD budget vide : conserver Volume/Revenue_Cum (Excel IF). */
  let budgetVolumeCarry = false;
  let budgetRevenueCarry = false;

  for (let i = 0; i < STAFF_COST_FY_MONTHS.length; i += 1) {
    const calendarMonth = STAFF_COST_FY_MONTHS[i];
    const label = STAFF_COST_FY_LABELS[i];
    const col = colLetter(i);
    const prev = i > 0 ? months[i - 1] : null;
    const prevLabel = i > 0 ? STAFF_COST_FY_LABELS[i - 1] : null;
    const prevCol = i > 0 ? colLetter(i - 1) : null;
    const input = args.ytdByCalendarMonth[calendarMonth] || emptyInput();

    const actualHc = n(input.actualHeadcount);
    const salYtd = n(input.salariesActualYtd);
    const volYtd = n(input.volumesActualYtd);
    const revYtd = n(input.revenueActualYtd);
    /** Excel : Plan Budget HC renseigné tous les mois (défaut 192). */
    const budHc = n(input.budgetHeadcount) ?? defaultBudgetHc;
    const salBud = n(input.salariesBudgetYtd);
    const volBud = n(input.volumesBudgetYtd);
    const revBud = n(input.revenueBudgetYtd);

    /**
     * Mois / cumul Actual — comme Excel :
     * - cellule YTD vide = 0 dans l’arithmétique une fois la série démarrée
     * - → 1er mois vide après saisie : mois négatif (annule le cumul), cumul = 0
     * - mois suivants : 0 (affichés « - »)
     */
    const actualStarted =
      salYtd != null
      || volYtd != null
      || revYtd != null
      || (prev?.staffCumul.value != null)
      || (prev?.volumeCumul.value != null)
      || (prev?.revenueCumul.value != null);

    const staffCostMonth = (() => {
      if (salYtd != null) {
        return prev?.staffCumul.value != null ? salYtd - prev.staffCumul.value : salYtd;
      }
      if (!actualStarted && prev?.staffCumul.value == null) return null;
      if (prev?.staffCumul.value != null) return 0 - prev.staffCumul.value;
      return 0;
    })();
    const staffCumul = (() => {
      if (staffCostMonth == null) return null;
      if (prev?.staffCumul.value != null) return prev.staffCumul.value + staffCostMonth;
      return staffCostMonth;
    })();

    const volumeMonth = (() => {
      if (volYtd != null) {
        return prev?.volumeCumul.value != null ? volYtd - prev.volumeCumul.value : volYtd;
      }
      if (!actualStarted && prev?.volumeCumul.value == null) return null;
      if (prev?.volumeCumul.value != null) return 0 - prev.volumeCumul.value;
      return 0;
    })();
    const volumeCumul = (() => {
      if (volumeMonth == null) return null;
      if (prev?.volumeCumul.value != null) return prev.volumeCumul.value + volumeMonth;
      return volumeMonth;
    })();

    const revenueMonth = (() => {
      if (revYtd != null) {
        return prev?.revenueCumul.value != null ? revYtd - prev.revenueCumul.value : revYtd;
      }
      if (!actualStarted && prev?.revenueCumul.value == null) return null;
      if (prev?.revenueCumul.value != null) return 0 - prev.revenueCumul.value;
      return 0;
    })();
    const revenueCumul = (() => {
      if (revenueMonth == null) return null;
      if (prev?.revenueCumul.value != null) return prev.revenueCumul.value + revenueMonth;
      return revenueMonth;
    })();

    const budgetStarted =
      salBud != null
      || volBud != null
      || revBud != null
      || (prev?.budgetStaffCumul.value != null)
      || (prev?.budgetVolumeCumul.value != null)
      || (prev?.budgetRevenueCumul.value != null);

    const budgetStaffCostMonth = (() => {
      if (salBud != null) {
        return prev?.budgetStaffCumul.value != null ? salBud - prev.budgetStaffCumul.value : salBud;
      }
      if (!budgetStarted && prev?.budgetStaffCumul.value == null) return null;
      if (prev?.budgetStaffCumul.value != null) return 0 - prev.budgetStaffCumul.value;
      return 0;
    })();
    const budgetStaffCumul = (() => {
      if (budgetStaffCostMonth == null) return null;
      if (prev?.budgetStaffCumul.value != null) {
        return prev.budgetStaffCumul.value + budgetStaffCostMonth;
      }
      return budgetStaffCostMonth;
    })();

    /**
     * Volume / Revenue Budget — Excel IF(prev+mois=0, prev, prev+mois)
     * 1er mois YTD vide : mois négatif + cumul conservé ; mois suivants : 0 + cumul porté.
     */
    let budgetVolumeMonth: number | null;
    let budgetVolumeCumul: number | null;
    if (volBud != null) {
      budgetVolumeCarry = false;
      budgetVolumeMonth =
        prev?.budgetVolumeCumul.value != null ? volBud - prev.budgetVolumeCumul.value : volBud;
      budgetVolumeCumul =
        prev?.budgetVolumeCumul.value != null
          ? prev.budgetVolumeCumul.value + budgetVolumeMonth
          : budgetVolumeMonth;
    } else if (!budgetStarted && prev?.budgetVolumeCumul.value == null) {
      budgetVolumeMonth = null;
      budgetVolumeCumul = null;
    } else if (budgetVolumeCarry && prev?.budgetVolumeCumul.value != null) {
      budgetVolumeMonth = 0;
      budgetVolumeCumul = prev.budgetVolumeCumul.value;
    } else if (prev?.budgetVolumeCumul.value != null) {
      budgetVolumeMonth = 0 - prev.budgetVolumeCumul.value;
      budgetVolumeCumul = prev.budgetVolumeCumul.value; // carry
      budgetVolumeCarry = true;
    } else {
      budgetVolumeMonth = 0;
      budgetVolumeCumul = 0;
    }

    let budgetRevenueMonth: number | null;
    let budgetRevenueCumul: number | null;
    if (revBud != null) {
      budgetRevenueCarry = false;
      budgetRevenueMonth =
        prev?.budgetRevenueCumul.value != null ? revBud - prev.budgetRevenueCumul.value : revBud;
      budgetRevenueCumul =
        prev?.budgetRevenueCumul.value != null
          ? prev.budgetRevenueCumul.value + budgetRevenueMonth
          : budgetRevenueMonth;
    } else if (!budgetStarted && prev?.budgetRevenueCumul.value == null) {
      budgetRevenueMonth = null;
      budgetRevenueCumul = null;
    } else if (budgetRevenueCarry && prev?.budgetRevenueCumul.value != null) {
      budgetRevenueMonth = 0;
      budgetRevenueCumul = prev.budgetRevenueCumul.value;
    } else if (prev?.budgetRevenueCumul.value != null) {
      budgetRevenueMonth = 0 - prev.budgetRevenueCumul.value;
      budgetRevenueCumul = prev.budgetRevenueCumul.value;
      budgetRevenueCarry = true;
    } else {
      budgetRevenueMonth = 0;
      budgetRevenueCumul = 0;
    }

    // Après annulation Actual (cumul 0), les mois suivants restent à 0 — ratios sans HC → null
    const tonPerEmpYtd =
      volumeCumul != null && actualHc ? volumeCumul / actualHc : null;
    const tonPerEmp =
      volumeMonth != null && actualHc ? volumeMonth / actualHc : null;
    const revenuePerEmpYtd =
      revenueCumul != null && actualHc ? revenueCumul / actualHc : null;
    const revenuePerEmp =
      revenueMonth != null && actualHc ? revenueMonth / actualHc : null;

    const budgetTonPerEmp =
      budgetVolumeCumul != null && budHc ? budgetVolumeCumul / budHc : null;
    const budgetRevenuePerEmp =
      budgetRevenueCumul != null && budHc ? budgetRevenueCumul / budHc : null;

    const pctSalaries =
      staffCumul != null && budgetStaffCumul
        ? staffCumul / budgetStaffCumul
        : null;
    const pctVolumes =
      tonPerEmpYtd != null && budgetTonPerEmp
        ? tonPerEmpYtd / budgetTonPerEmp
        : null;
    const pctRevenue =
      revenuePerEmpYtd != null && budgetRevenuePerEmp
        ? revenuePerEmpYtd / budgetRevenuePerEmp
        : null;

    const budHcIsDefault = n(input.budgetHeadcount) == null && budHc != null;
    const t = (metric: string) => `${metric} · ${label}`;

    months.push({
      calendarMonth,
      label,
      fyIndex: i,
      actualHeadcount: cell({
        value: actualHc,
        title: t('Actual YTD Headcount'),
        formula: `${col}4 — saisie`,
        explanation: `Valeur saisie manuellement pour le headcount Actual YTD (${label}). Pas de calcul dérivé.`,
        calc: actualHc != null ? `Saisie = ${fmt(actualHc)}` : null,
        sources: [],
      }),
      salariesActualYtd: cell({
        value: salYtd,
        title: t('Salaries Actual YTD'),
        formula: `${col}5 — saisie`,
        explanation: `Valeur saisie manuellement : cumuls salaires Actual YTD pour ${label}.`,
        calc: salYtd != null ? `Saisie = ${fmt(salYtd)}` : null,
      }),
      volumesActualYtd: cell({
        value: volYtd,
        title: t('Volumes Actual YTD'),
        formula: `${col}6 — saisie`,
        explanation: `Valeur saisie manuellement : volumes Actual YTD pour ${label}.`,
        calc: volYtd != null ? `Saisie = ${fmt(volYtd)}` : null,
      }),
      revenueActualYtd: cell({
        value: revYtd,
        title: t('Revenue Actual YTD'),
        formula: `${col}7 — saisie`,
        explanation: `Valeur saisie manuellement : revenue Actual YTD pour ${label}.`,
        calc: revYtd != null ? `Saisie = ${fmt(revYtd)}` : null,
      }),
      budgetHeadcount: cell({
        value: budHc,
        title: t('Plan Budget YTD Headcount'),
        formula: `${col}9 — saisie / défaut`,
        explanation: budHcIsDefault
          ? `Headcount budget : saisie absente, valeur par défaut Excel (${defaultBudgetHc}) car des YTD Actual sont présents.`
          : `Valeur saisie (ou importée) pour le headcount Plan Budget YTD (${label}).`,
        calc: budHc != null
          ? (budHcIsDefault ? `Défaut Excel = ${fmt(budHc)}` : `Saisie = ${fmt(budHc)}`)
          : null,
        sources: budHcIsDefault
          ? [src('Headcount budget Excel', 'valeur par défaut', defaultBudgetHc)]
          : [],
      }),
      salariesBudgetYtd: cell({
        value: salBud,
        title: t('Salaries Plan Budget YTD'),
        formula: `${col}10 — saisie`,
        explanation: `Valeur saisie manuellement : salaires Plan Budget YTD pour ${label}.`,
        calc: salBud != null ? `Saisie = ${fmt(salBud)}` : null,
      }),
      volumesBudgetYtd: cell({
        value: volBud,
        title: t('Volumes Plan Budget YTD'),
        formula: `${col}11 — saisie`,
        explanation: `Valeur saisie manuellement : volumes Plan Budget YTD pour ${label}.`,
        calc: volBud != null ? `Saisie = ${fmt(volBud)}` : null,
      }),
      revenueBudgetYtd: cell({
        value: revBud,
        title: t('Revenue Plan Budget YTD'),
        formula: `${col}12 — saisie`,
        explanation: `Valeur saisie manuellement : revenue Plan Budget YTD pour ${label}.`,
        calc: revBud != null ? `Saisie = ${fmt(revBud)}` : null,
      }),
      pctSalaries: cell({
        value: pctSalaries != null ? pctSalaries * 100 : null,
        title: t('Salaries %'),
        formula: `${col}14 = ${col}21/${col}36`,
        explanation: `Salaries % = Staff_Cumul (${col}21) ÷ Budget Staff_Cumul (${col}36), puis × 100 pour l’affichage.`,
        calc:
          staffCumul != null && budgetStaffCumul
            ? `${fmt(staffCumul)} ÷ ${fmt(budgetStaffCumul)} × 100 = ${fmt(pctSalaries! * 100, 1)} %`
            : null,
        sources: [
          src('Staff_Cumul (Actual)', `${col}21`, staffCumul),
          src('Budget Staff_Cumul', `${col}36`, budgetStaffCumul),
        ],
      }),
      pctVolumes: cell({
        value: pctVolumes != null ? pctVolumes * 100 : null,
        title: t('Volumes %'),
        formula: `${col}15 = ${col}27/${col}42`,
        explanation: `Volumes % = T/employee YTD (${col}27) ÷ Budget T/employee (${col}42), puis × 100.`,
        calc:
          tonPerEmpYtd != null && budgetTonPerEmp
            ? `${fmt(tonPerEmpYtd, 2)} ÷ ${fmt(budgetTonPerEmp, 2)} × 100 = ${fmt(pctVolumes! * 100, 1)} %`
            : null,
        sources: [
          src('T/employee YTD', `${col}27`, tonPerEmpYtd),
          src('Budget T/employee', `${col}42`, budgetTonPerEmp),
        ],
      }),
      pctRevenue: cell({
        value: pctRevenue != null ? pctRevenue * 100 : null,
        title: t('Revenue %'),
        formula: `${col}16 = ${col}29/${col}43`,
        explanation: `Revenue % = Revenue/Employee YTD (${col}29) ÷ Budget Revenue/Employee (${col}43), puis × 100.`,
        calc:
          revenuePerEmpYtd != null && budgetRevenuePerEmp
            ? `${fmt(revenuePerEmpYtd, 2)} ÷ ${fmt(budgetRevenuePerEmp, 2)} × 100 = ${fmt(pctRevenue! * 100, 1)} %`
            : null,
        sources: [
          src('Revenue/Employee YTD', `${col}29`, revenuePerEmpYtd),
          src('Budget Revenue/Employee', `${col}43`, budgetRevenuePerEmp),
        ],
      }),
      staffCostMonth: cell({
        value: staffCostMonth,
        title: t('Staff_Cost'),
        formula: i === 0 ? `${col}20 = ${col}5` : `${col}20 = ${col}5-${prevCol}21`,
        explanation: i === 0
          ? `1er mois FY : Staff_Cost = Salaries Actual YTD (${col}5) — pas encore de cumul précédent.`
          : `Staff_Cost du mois = Salaries Actual YTD (${col}5) − Staff_Cumul de ${prevLabel} (${prevCol}21).`,
        calc: i === 0
          ? (salYtd != null ? `${fmt(salYtd)} (= ${col}5)` : null)
          : (salYtd != null
            ? `${fmt(salYtd)} − ${fmt(prev?.staffCumul.value ?? null)} = ${fmt(staffCostMonth)}`
            : null),
        sources: i === 0
          ? [src('Salaries Actual YTD', `${col}5`, salYtd)]
          : [
              src('Salaries Actual YTD', `${col}5`, salYtd),
              src(`Staff_Cumul ${prevLabel}`, `${prevCol!}21`, prev?.staffCumul.value ?? null),
            ],
      }),
      staffCumul: cell({
        value: staffCumul,
        title: t('Staff_Cumul'),
        formula: i === 0 ? `${col}21 = ${col}20` : `${col}21 = ${prevCol}21+${col}20`,
        explanation: i === 0
          ? `Staff_Cumul = Staff_Cost du mois (${col}20).`
          : `Staff_Cumul = cumul ${prevLabel} (${prevCol}21) + Staff_Cost ${label} (${col}20).`,
        calc: i === 0
          ? (staffCostMonth != null ? `${fmt(staffCostMonth)} (= ${col}20)` : null)
          : `${fmt(prev?.staffCumul.value ?? null)} + ${fmt(staffCostMonth)} = ${fmt(staffCumul)}`,
        sources: i === 0
          ? [src('Staff_Cost', `${col}20`, staffCostMonth)]
          : [
              src(`Staff_Cumul ${prevLabel}`, `${prevCol!}21`, prev?.staffCumul.value ?? null),
              src('Staff_Cost', `${col}20`, staffCostMonth),
            ],
      }),
      volumeMonth: cell({
        value: volumeMonth,
        title: t('Volume'),
        formula: i === 0 ? `${col}22 = ${col}6` : `${col}22 = ${col}6-${prevCol}23`,
        explanation: i === 0
          ? `1er mois FY : Volume = Volumes Actual YTD (${col}6).`
          : `Volume du mois = Volumes Actual YTD (${col}6) − Volume_Cum de ${prevLabel} (${prevCol}23).`,
        calc: i === 0
          ? (volYtd != null ? `${fmt(volYtd)} (= ${col}6)` : null)
          : (volYtd != null
            ? `${fmt(volYtd)} − ${fmt(prev?.volumeCumul.value ?? null)} = ${fmt(volumeMonth)}`
            : null),
        sources: i === 0
          ? [src('Volumes Actual YTD', `${col}6`, volYtd)]
          : [
              src('Volumes Actual YTD', `${col}6`, volYtd),
              src(`Volume_Cum ${prevLabel}`, `${prevCol!}23`, prev?.volumeCumul.value ?? null),
            ],
      }),
      volumeCumul: cell({
        value: volumeCumul,
        title: t('Volume_Cum'),
        formula: i === 0 ? `${col}23 = ${col}22` : `${col}23 = ${prevCol}23+${col}22`,
        explanation: i === 0
          ? `Volume_Cum = Volume du mois (${col}22).`
          : `Volume_Cum = cumul ${prevLabel} (${prevCol}23) + Volume ${label} (${col}22).`,
        calc: i === 0
          ? (volumeMonth != null ? `${fmt(volumeMonth)} (= ${col}22)` : null)
          : `${fmt(prev?.volumeCumul.value ?? null)} + ${fmt(volumeMonth)} = ${fmt(volumeCumul)}`,
        sources: i === 0
          ? [src('Volume', `${col}22`, volumeMonth)]
          : [
              src(`Volume_Cum ${prevLabel}`, `${prevCol!}23`, prev?.volumeCumul.value ?? null),
              src('Volume', `${col}22`, volumeMonth),
            ],
      }),
      revenueMonth: cell({
        value: revenueMonth,
        title: t('Revenue mois'),
        formula: i === 0 ? `${col}24 = ${col}7` : `${col}24 = ${col}7-${prevCol}25`,
        explanation: i === 0
          ? `1er mois FY : Revenue mois = Revenue Actual YTD (${col}7).`
          : `Revenue mois = Revenue Actual YTD (${col}7) − Revenue_Cum de ${prevLabel} (${prevCol}25).`,
        calc: i === 0
          ? (revYtd != null ? `${fmt(revYtd)} (= ${col}7)` : null)
          : (revYtd != null
            ? `${fmt(revYtd)} − ${fmt(prev?.revenueCumul.value ?? null)} = ${fmt(revenueMonth)}`
            : null),
        sources: i === 0
          ? [src('Revenue Actual YTD', `${col}7`, revYtd)]
          : [
              src('Revenue Actual YTD', `${col}7`, revYtd),
              src(`Revenue_Cum ${prevLabel}`, `${prevCol!}25`, prev?.revenueCumul.value ?? null),
            ],
      }),
      revenueCumul: cell({
        value: revenueCumul,
        title: t('Revenue_Cum'),
        formula: i === 0 ? `${col}25 = ${col}24` : `${col}25 = ${prevCol}25+${col}24`,
        explanation: i === 0
          ? `Revenue_Cum = Revenue du mois (${col}24).`
          : `Revenue_Cum = cumul ${prevLabel} (${prevCol}25) + Revenue ${label} (${col}24).`,
        calc: i === 0
          ? (revenueMonth != null ? `${fmt(revenueMonth)} (= ${col}24)` : null)
          : `${fmt(prev?.revenueCumul.value ?? null)} + ${fmt(revenueMonth)} = ${fmt(revenueCumul)}`,
        sources: i === 0
          ? [src('Revenue mois', `${col}24`, revenueMonth)]
          : [
              src(`Revenue_Cum ${prevLabel}`, `${prevCol!}25`, prev?.revenueCumul.value ?? null),
              src('Revenue mois', `${col}24`, revenueMonth),
            ],
      }),
      tonPerEmpYtd: cell({
        value: tonPerEmpYtd,
        title: t('T/employee YTD'),
        formula: `${col}27 = IFERROR(${col}23/${col}$4,0)`,
        explanation: `T/employee YTD = Volume_Cum (${col}23) ÷ Headcount Actual (${col}4). Si headcount = 0 → 0.`,
        calc:
          volumeCumul != null && actualHc
            ? `${fmt(volumeCumul)} ÷ ${fmt(actualHc)} = ${fmt(tonPerEmpYtd, 2)}`
            : null,
        sources: [
          src('Volume_Cum', `${col}23`, volumeCumul),
          src('Actual Headcount', `${col}4`, actualHc),
        ],
      }),
      tonPerEmp: cell({
        value: tonPerEmp,
        title: t('T/employee'),
        formula: `${col}28 = IFERROR(${col}22/${col}$4,0)`,
        explanation: `T/employee = Volume du mois (${col}22) ÷ Headcount Actual (${col}4).`,
        calc:
          volumeMonth != null && actualHc
            ? `${fmt(volumeMonth)} ÷ ${fmt(actualHc)} = ${fmt(tonPerEmp, 2)}`
            : null,
        sources: [
          src('Volume', `${col}22`, volumeMonth),
          src('Actual Headcount', `${col}4`, actualHc),
        ],
      }),
      revenuePerEmpYtd: cell({
        value: revenuePerEmpYtd,
        title: t('Revenue/Employee YTD'),
        formula: `${col}29 = IFERROR(${col}25/${col}$4,0)`,
        explanation: `Revenue/Employee YTD = Revenue_Cum (${col}25) ÷ Headcount Actual (${col}4).`,
        calc:
          revenueCumul != null && actualHc
            ? `${fmt(revenueCumul)} ÷ ${fmt(actualHc)} = ${fmt(revenuePerEmpYtd, 2)}`
            : null,
        sources: [
          src('Revenue_Cum', `${col}25`, revenueCumul),
          src('Actual Headcount', `${col}4`, actualHc),
        ],
      }),
      revenuePerEmp: cell({
        value: revenuePerEmp,
        title: t('Revenue/Employee'),
        formula: `${col}30 = IFERROR(${col}24/${col}$4,0)`,
        explanation: `Revenue/Employee = Revenue du mois (${col}24) ÷ Headcount Actual (${col}4).`,
        calc:
          revenueMonth != null && actualHc
            ? `${fmt(revenueMonth)} ÷ ${fmt(actualHc)} = ${fmt(revenuePerEmp, 2)}`
            : null,
        sources: [
          src('Revenue mois', `${col}24`, revenueMonth),
          src('Actual Headcount', `${col}4`, actualHc),
        ],
      }),
      budgetStaffCostMonth: cell({
        value: budgetStaffCostMonth,
        title: t('Budget Staff_Cost'),
        formula: i === 0 ? `${col}35 = ${col}10` : `${col}35 = ${col}10-${prevCol}36`,
        explanation: i === 0
          ? `1er mois FY : Budget Staff_Cost = Salaries Budget YTD (${col}10).`
          : `Budget Staff_Cost = Salaries Budget YTD (${col}10) − Budget Staff_Cumul ${prevLabel} (${prevCol}36).`,
        calc: i === 0
          ? (salBud != null ? `${fmt(salBud)} (= ${col}10)` : null)
          : (salBud != null
            ? `${fmt(salBud)} − ${fmt(prev?.budgetStaffCumul.value ?? null)} = ${fmt(budgetStaffCostMonth)}`
            : null),
        sources: i === 0
          ? [src('Salaries Budget YTD', `${col}10`, salBud)]
          : [
              src('Salaries Budget YTD', `${col}10`, salBud),
              src(`Budget Staff_Cumul ${prevLabel}`, `${prevCol!}36`, prev?.budgetStaffCumul.value ?? null),
            ],
      }),
      budgetStaffCumul: cell({
        value: budgetStaffCumul,
        title: t('Budget Staff_Cumul'),
        formula: i === 0 ? `${col}36 = ${col}35` : `${col}36 = ${prevCol}36+${col}35`,
        explanation: i === 0
          ? `Budget Staff_Cumul = Budget Staff_Cost (${col}35).`
          : `Budget Staff_Cumul = cumul ${prevLabel} (${prevCol}36) + Budget Staff_Cost ${label} (${col}35).`,
        calc: i === 0
          ? (budgetStaffCostMonth != null ? `${fmt(budgetStaffCostMonth)} (= ${col}35)` : null)
          : `${fmt(prev?.budgetStaffCumul.value ?? null)} + ${fmt(budgetStaffCostMonth)} = ${fmt(budgetStaffCumul)}`,
        sources: i === 0
          ? [src('Budget Staff_Cost', `${col}35`, budgetStaffCostMonth)]
          : [
              src(`Budget Staff_Cumul ${prevLabel}`, `${prevCol!}36`, prev?.budgetStaffCumul.value ?? null),
              src('Budget Staff_Cost', `${col}35`, budgetStaffCostMonth),
            ],
      }),
      budgetVolumeMonth: cell({
        value: budgetVolumeMonth,
        title: t('Budget Volume'),
        formula: i === 0 ? `${col}37 = ${col}11` : `${col}37 = ${col}11-${prevCol}38`,
        explanation: i === 0
          ? `1er mois FY : Budget Volume = Volumes Budget YTD (${col}11).`
          : `Budget Volume = Volumes Budget YTD (${col}11) − Budget Volume_Cum ${prevLabel} (${prevCol}38).`,
        calc: i === 0
          ? (volBud != null ? `${fmt(volBud)} (= ${col}11)` : null)
          : (volBud != null
            ? `${fmt(volBud)} − ${fmt(prev?.budgetVolumeCumul.value ?? null)} = ${fmt(budgetVolumeMonth)}`
            : null),
        sources: i === 0
          ? [src('Volumes Budget YTD', `${col}11`, volBud)]
          : [
              src('Volumes Budget YTD', `${col}11`, volBud),
              src(`Budget Volume_Cum ${prevLabel}`, `${prevCol!}38`, prev?.budgetVolumeCumul.value ?? null),
            ],
      }),
      budgetVolumeCumul: cell({
        value: budgetVolumeCumul,
        title: t('Budget Volume_Cum'),
        formula: i === 0 ? `${col}38 = ${col}37` : `${col}38 = ${prevCol}38+${col}37`,
        explanation: i === 0
          ? `Budget Volume_Cum = Budget Volume (${col}37).`
          : `Budget Volume_Cum = cumul ${prevLabel} (${prevCol}38) + Budget Volume ${label} (${col}37).`,
        calc: i === 0
          ? (budgetVolumeMonth != null ? `${fmt(budgetVolumeMonth)} (= ${col}37)` : null)
          : `${fmt(prev?.budgetVolumeCumul.value ?? null)} + ${fmt(budgetVolumeMonth)} = ${fmt(budgetVolumeCumul)}`,
        sources: i === 0
          ? [src('Budget Volume', `${col}37`, budgetVolumeMonth)]
          : [
              src(`Budget Volume_Cum ${prevLabel}`, `${prevCol!}38`, prev?.budgetVolumeCumul.value ?? null),
              src('Budget Volume', `${col}37`, budgetVolumeMonth),
            ],
      }),
      budgetRevenueMonth: cell({
        value: budgetRevenueMonth,
        title: t('Budget Revenue'),
        formula: i === 0 ? `${col}39 = ${col}12` : `${col}39 = ${col}12-${prevCol}40`,
        explanation: i === 0
          ? `1er mois FY : Budget Revenue = Revenue Budget YTD (${col}12).`
          : `Budget Revenue = Revenue Budget YTD (${col}12) − Budget Revenue_Cum ${prevLabel} (${prevCol}40).`,
        calc: i === 0
          ? (revBud != null ? `${fmt(revBud)} (= ${col}12)` : null)
          : (revBud != null
            ? `${fmt(revBud)} − ${fmt(prev?.budgetRevenueCumul.value ?? null)} = ${fmt(budgetRevenueMonth)}`
            : null),
        sources: i === 0
          ? [src('Revenue Budget YTD', `${col}12`, revBud)]
          : [
              src('Revenue Budget YTD', `${col}12`, revBud),
              src(`Budget Revenue_Cum ${prevLabel}`, `${prevCol!}40`, prev?.budgetRevenueCumul.value ?? null),
            ],
      }),
      budgetRevenueCumul: cell({
        value: budgetRevenueCumul,
        title: t('Budget Revenue_Cum'),
        formula: i === 0 ? `${col}40 = ${col}39` : `${col}40 = ${prevCol}40+${col}39`,
        explanation: i === 0
          ? `Budget Revenue_Cum = Budget Revenue (${col}39).`
          : `Budget Revenue_Cum = cumul ${prevLabel} (${prevCol}40) + Budget Revenue ${label} (${col}39).`,
        calc: i === 0
          ? (budgetRevenueMonth != null ? `${fmt(budgetRevenueMonth)} (= ${col}39)` : null)
          : `${fmt(prev?.budgetRevenueCumul.value ?? null)} + ${fmt(budgetRevenueMonth)} = ${fmt(budgetRevenueCumul)}`,
        sources: i === 0
          ? [src('Budget Revenue', `${col}39`, budgetRevenueMonth)]
          : [
              src(`Budget Revenue_Cum ${prevLabel}`, `${prevCol!}40`, prev?.budgetRevenueCumul.value ?? null),
              src('Budget Revenue', `${col}39`, budgetRevenueMonth),
            ],
      }),
      budgetTonPerEmp: cell({
        value: budgetTonPerEmp,
        title: t('Budget T/employee'),
        formula: `${col}42 = IFERROR(${col}38/${col}$9,0)`,
        explanation: `Budget T/employee = Budget Volume_Cum (${col}38) ÷ Budget Headcount (${col}9).`,
        calc:
          budgetVolumeCumul != null && budHc
            ? `${fmt(budgetVolumeCumul)} ÷ ${fmt(budHc)} = ${fmt(budgetTonPerEmp, 2)}`
            : null,
        sources: [
          src('Budget Volume_Cum', `${col}38`, budgetVolumeCumul),
          src('Budget Headcount', `${col}9`, budHc),
        ],
      }),
      budgetRevenuePerEmp: cell({
        value: budgetRevenuePerEmp,
        title: t('Budget Revenue/Employee'),
        formula: `${col}43 = IFERROR(${col}40/${col}$9,0)`,
        explanation: `Budget Revenue/Employee = Budget Revenue_Cum (${col}40) ÷ Budget Headcount (${col}9).`,
        calc:
          budgetRevenueCumul != null && budHc
            ? `${fmt(budgetRevenueCumul)} ÷ ${fmt(budHc)} = ${fmt(budgetRevenuePerEmp, 2)}`
            : null,
        sources: [
          src('Budget Revenue_Cum', `${col}40`, budgetRevenueCumul),
          src('Budget Headcount', `${col}9`, budHc),
        ],
      }),
    });
  }

  return months;
}

export function staffCostInputFromPartial(
  partial: Partial<ExcoStaffCostYtdInput> | null | undefined,
): ExcoStaffCostYtdInput {
  const base = emptyInput();
  if (!partial) return base;
  return {
    actualHeadcount: n(partial.actualHeadcount),
    salariesActualYtd: n(partial.salariesActualYtd),
    volumesActualYtd: n(partial.volumesActualYtd),
    revenueActualYtd: n(partial.revenueActualYtd),
    budgetHeadcount: n(partial.budgetHeadcount),
    salariesBudgetYtd: n(partial.salariesBudgetYtd),
    volumesBudgetYtd: n(partial.volumesBudgetYtd),
    revenueBudgetYtd: n(partial.revenueBudgetYtd),
  };
}
