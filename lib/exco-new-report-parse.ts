/**
 * Parseur du classeur « New report.xlsx » — source unique des données EXCO.
 * Feuilles : Params, BASE, Headacount, IN OUT, Staff_Cost_KPI, OVT,
 * overtime_base, leavebalances_base.
 */
import * as XLSX from 'xlsx';
import { compareExcoDepartments } from './exco-department-map';
import type { ExcoLeaveMonthImport, ExcoOtMonthImport } from './exco-ot-import';
import { mapExcoOtDepartment } from './exco-ot-import';
import type {
  ExcoCountRow,
  ExcoHireListRow,
  ExcoManualKpis,
  ExcoOtDeptRow,
  ExcoOtEmployeeRow,
} from './exco-types';

export interface ExcoWorkbookEmployee {
  matricule: string;
  nom: string;
  gender: string;
  nationality: string;
  position: string;
  grade: string;
  age: number | null;
  ageCat: string;
  emplDate: string;
  lengthOfService: number | null;
  lengthOfServiceCat: string;
  department: string;
  locationSite: string;
  leaveBalance: number | null;
}

export interface ExcoWorkbookParams {
  fxRateFcPerUsd: number;
  reportDate: string;
  year: number;
  month: number;
}

export interface ExcoWorkbookHeadcount {
  headcount: number;
  male: number;
  female: number;
  malePct: number;
  femalePct: number;
  genderByLocation: Array<{
    location: string;
    male: number;
    female: number;
    total: number;
  }>;
  ageBands: ExcoCountRow[];
  seniorityBands: ExcoCountRow[];
  averageAge: number | null;
  averageAgeMale: number | null;
  averageAgeFemale: number | null;
  averageLengthOfService: number | null;
  retirement: number;
  preRetirement: number;
}

export interface ExcoWorkbookInOutMonth {
  monthKey: string;
  calendarMonth: number | null;
  in: number | null;
  out: number | null;
  attritionRate: number | null;
  turnover: number | null;
  headcount: number | null;
}

export interface ExcoWorkbookStaffCostMonth {
  calendarMonth: number;
  actualHeadcount: number | null;
  salariesActualYtd: number | null;
  volumesActualYtd: number | null;
  revenueActualYtd: number | null;
  salariesBudgetYtd: number | null;
  volumesBudgetYtd: number | null;
  revenueBudgetYtd: number | null;
  staffCostMonth: number | null;
  volumeMonth: number | null;
  revenueMonth: number | null;
  tonPerEmployee: number | null;
  tonPerEmployeeYtd: number | null;
  revenuePerEmployee: number | null;
  revenuePerEmployeeYtd: number | null;
}

export interface ExcoWorkbookOtTrendRow {
  department: string;
  hoursByMonth: Array<number | null>;
  hoursYtd: number | null;
  costByMonth: Array<number | null>;
  costYtd: number | null;
  hoursShare: number | null;
  costShare: number | null;
}

/** Actual vs Budget (feuille OVT) — mois APR→MAR. */
export interface ExcoWorkbookOtActualVsBudget {
  /** Libellés APR…MAR (12). */
  monthLabels: string[];
  actualByMonth: Array<number | null>;
  budgetByMonth: Array<number | null>;
  actualYtd: number | null;
  budgetYtd: number | null;
}

export interface ExcoWorkbookSnapshot {
  sourceFile: string;
  importedAt: string;
  params: ExcoWorkbookParams;
  employees: ExcoWorkbookEmployee[];
  headcount: ExcoWorkbookHeadcount;
  inOut: {
    months: ExcoWorkbookInOutMonth[];
    ytdIn: number | null;
    ytdOut: number | null;
    ytdAttrition: number | null;
    ytdTurnover: number | null;
    ytdHeadcount: number | null;
    exitsByReason: ExcoCountRow[];
    inList: ExcoHireListRow[];
    outList: ExcoHireListRow[];
  };
  staffCost: ExcoWorkbookStaffCostMonth[];
  ot: {
    byDeptCurrent: ExcoOtDeptRow[];
    topEmployees: ExcoOtEmployeeRow[];
    trendRows: ExcoWorkbookOtTrendRow[];
    actualVsBudget: ExcoWorkbookOtActualVsBudget | null;
    totalHoursCurrent: number;
    totalCostUsdCurrent: number;
    employeesWithOt: number;
    employeesWithOtPct: number | null;
    averageHours: number | null;
    averageCostPerEmployee: number | null;
    /** Moyenne Closing Balance Annual (Leave Balances, toutes feuilles). */
    averageLeaveDays: number | null;
  };
  leave: ExcoLeaveMonthImport;
  overtimeImport: ExcoOtMonthImport;
  manualKpis: ExcoManualKpis;
  financeByMonth: Record<string, ExcoManualKpis>;
}

const FY_MONTH_KEYS = [
  'APR',
  'MAY',
  'JUN',
  'JULY',
  'JUL',
  'AUG',
  'SEPT',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
  'JAN',
  'FEB',
  'MAR',
  'MARCH',
  'APRIL',
  'JUNE',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
  'JANUARY',
  'FEBRUARY',
] as const;

function sheetToMatrix(wb: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];
}

function cell(row: unknown[] | undefined, col: number): unknown {
  if (!row || col < 0 || col >= row.length) return null;
  return row[col] ?? null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/\s/g, '').replace(',', '.');
    if (!cleaned || cleaned === '#DIV/0!' || cleaned === '#N/A') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (value instanceof Date) return null;
  return null;
}

function asString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${d}/${m}/${y}`;
  }
  return String(value).trim();
}

function excelDateToParts(value: unknown): { year: number; month: number; day: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // cellDates Excel → souvent veille 22:59 UTC ; +12h ramène au jour calendaire.
    const shifted = new Date(value.getTime() + 12 * 60 * 60 * 1000);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return { year: parsed.y, month: parsed.m, day: parsed.d };
  }
  const s = asString(value);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (iso) {
    if (s.includes('T')) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        const shifted = new Date(d.getTime() + 12 * 60 * 60 * 1000);
        return {
          year: shifted.getUTCFullYear(),
          month: shifted.getUTCMonth() + 1,
          day: shifted.getUTCDate(),
        };
      }
    }
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    return { year: Number(m[3]), month: Number(m[2]), day: Number(m[1]) };
  }
  return null;
}

function monthKeyToCalendar(key: string): number | null {
  const k = key.trim().toUpperCase().replace(/\./g, '');
  const map: Record<string, number> = {
    JAN: 1,
    JANUARY: 1,
    FEB: 2,
    FEBRUARY: 2,
    MAR: 3,
    MARCH: 3,
    APR: 4,
    APRIL: 4,
    MAY: 5,
    JUN: 6,
    JUNE: 6,
    JUL: 7,
    JULY: 7,
    AUG: 8,
    AUGUST: 8,
    SEP: 9,
    SEPT: 9,
    SEPTEMBER: 9,
    OCT: 10,
    OCTOBER: 10,
    NOV: 11,
    NOVEMBER: 11,
    DEC: 12,
    DECEMBER: 12,
  };
  return map[k] ?? null;
}

function siteBucketFromLocation(location: string): 'Plant' | 'HQ and Regions' | 'Lubudi' | 'Graduates' {
  const loc = location.trim().toLowerCase();
  if (loc.includes('lubudi')) return 'Lubudi';
  if (loc.includes('graduate')) return 'Graduates';
  if (loc.includes('plant') || loc.includes('zamba') || loc.includes('malanga')) return 'Plant';
  return 'HQ and Regions';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return round2(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function findSheetName(wb: XLSX.WorkBook, candidates: string[]): string | null {
  const names = wb.SheetNames;
  for (const c of candidates) {
    const hit = names.find((n) => n.trim().toLowerCase() === c.toLowerCase());
    if (hit) return hit;
  }
  for (const c of candidates) {
    const hit = names.find((n) => n.trim().toLowerCase().includes(c.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

function parseParams(wb: XLSX.WorkBook): ExcoWorkbookParams {
  const name = findSheetName(wb, ['Params']) || 'Params';
  const rows = sheetToMatrix(wb, name);
  let fx: number | null = null;
  let reportDateRaw: unknown = null;
  for (const row of rows) {
    const label = asString(cell(row, 0)).toLowerCase();
    if (label.includes('taux')) fx = asNumber(cell(row, 1));
    if (label.includes('mois')) reportDateRaw = cell(row, 1);
  }
  if (!(fx != null && fx > 0)) {
    throw new Error('Params : « Taux du jour » manquant ou invalide');
  }
  const parts = excelDateToParts(reportDateRaw);
  if (!parts) {
    throw new Error('Params : « Mois du rapport » manquant ou invalide');
  }
  return {
    fxRateFcPerUsd: fx,
    reportDate: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    year: parts.year,
    month: parts.month,
  };
}

function parseBase(wb: XLSX.WorkBook): ExcoWorkbookEmployee[] {
  const name = findSheetName(wb, ['BASE']) || 'BASE';
  const rows = sheetToMatrix(wb, name);
  if (rows.length < 2) return [];
  const out: ExcoWorkbookEmployee[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const matricule = asString(cell(row, 0));
    if (!matricule) continue;
    out.push({
      matricule,
      nom: asString(cell(row, 1)),
      gender: asString(cell(row, 2)),
      nationality: asString(cell(row, 3)),
      position: asString(cell(row, 4)),
      grade: asString(cell(row, 5)),
      age: asNumber(cell(row, 7)),
      ageCat: asString(cell(row, 8)),
      emplDate: asString(cell(row, 9)),
      lengthOfService: asNumber(cell(row, 10)),
      lengthOfServiceCat: asString(cell(row, 11)),
      department: asString(cell(row, 12)),
      locationSite: asString(cell(row, 13)),
      leaveBalance: asNumber(cell(row, 14)),
    });
  }
  return out;
}

function parseHeadcount(wb: XLSX.WorkBook): ExcoWorkbookHeadcount {
  const name = findSheetName(wb, ['Headacount', 'Headcount']) || 'Headacount';
  const rows = sheetToMatrix(wb, name);
  /**
   * xlsx omet la colonne A vide : l’index 0 = colonne B Excel.
   * B=label, C=valeur, D=%, F=location, G/H/I=M/F/Total, K/L=avg labels/values.
   */
  const col = {
    label: 0,
    value: 1,
    pct: 2,
    location: 4,
    male: 5,
    female: 6,
    total: 7,
    avgLabel: 9,
    avgValue: 10,
  };

  const headcount = asNumber(cell(rows[1], col.value)) ?? 0;
  const male = asNumber(cell(rows[2], col.value)) ?? 0;
  const female = asNumber(cell(rows[3], col.value)) ?? 0;
  const malePct = asNumber(cell(rows[2], col.pct));
  const femalePct = asNumber(cell(rows[3], col.pct));

  const genderByLocation: ExcoWorkbookHeadcount['genderByLocation'] = [];
  for (let r = 1; r <= 4; r += 1) {
    const location = asString(cell(rows[r], col.location));
    if (!location || location.toLowerCase() === 'total') continue;
    const m = asNumber(cell(rows[r], col.male)) ?? 0;
    const f = asNumber(cell(rows[r], col.female)) ?? 0;
    const total = asNumber(cell(rows[r], col.total)) ?? m + f;
    genderByLocation.push({ location, male: m, female: f, total });
  }

  const ageBands: ExcoCountRow[] = [];
  for (let r = 7; r <= 14; r += 1) {
    const label = asString(cell(rows[r], col.label));
    const value = asNumber(cell(rows[r], col.value));
    if (!label || label.toLowerCase() === 'total' || value == null) continue;
    ageBands.push({ label: label.trim(), value });
  }

  const seniorityBands: ExcoCountRow[] = [];
  for (let r = 19; r <= 23; r += 1) {
    const label = asString(cell(rows[r], col.label));
    const value = asNumber(cell(rows[r], col.value));
    if (!label || label.toLowerCase() === 'total' || value == null) continue;
    seniorityBands.push({ label: label.trim(), value });
  }

  const avgByLabel = (needle: string): number | null => {
    for (const row of rows) {
      if (asString(cell(row, col.avgLabel)).toLowerCase().includes(needle.toLowerCase())) {
        return asNumber(cell(row, col.avgValue));
      }
    }
    return null;
  };

  return {
    headcount,
    male,
    female,
    malePct:
      malePct != null
        ? Math.round(malePct * (malePct <= 1 ? 100 : 1))
        : headcount
          ? Math.round((male / headcount) * 100)
          : 0,
    femalePct:
      femalePct != null
        ? Math.round(femalePct * (femalePct <= 1 ? 100 : 1))
        : headcount
          ? Math.round((female / headcount) * 100)
          : 0,
    genderByLocation,
    ageBands,
    seniorityBands,
    averageAge: avgByLabel('Average Age') ?? asNumber(cell(rows[7], col.avgValue)),
    averageAgeMale: avgByLabel('Male Average') ?? asNumber(cell(rows[8], col.avgValue)),
    averageAgeFemale: avgByLabel('Female Average') ?? asNumber(cell(rows[9], col.avgValue)),
    averageLengthOfService: avgByLabel('Average Length') ?? asNumber(cell(rows[20], col.avgValue)),
    retirement: avgByLabel('Retirement') ?? 0,
    preRetirement: avgByLabel('Pre-retirement') ?? 0,
  };
}

function parseInOut(wb: XLSX.WorkBook): ExcoWorkbookSnapshot['inOut'] {
  const name = findSheetName(wb, ['IN OUT', 'IN OUT']) || 'IN OUT';
  const rows = sheetToMatrix(wb, name);
  const header = rows[2] || [];
  const months: ExcoWorkbookInOutMonth[] = [];
  for (let c = 1; c < header.length; c += 1) {
    const key = asString(header[c]);
    if (!key || key.toUpperCase().includes('YTD')) continue;
    const cal = monthKeyToCalendar(key);
    months.push({
      monthKey: key,
      calendarMonth: cal,
      in: asNumber(cell(rows[3], c)),
      out: asNumber(cell(rows[4], c)),
      attritionRate: asNumber(cell(rows[5], c)),
      turnover: asNumber(cell(rows[6], c)),
      headcount: asNumber(cell(rows[7], c)),
    });
  }

  const ytdCol = header.findIndex((h) => asString(h).toUpperCase().includes('YTD'));
  const exitsByReason: ExcoCountRow[] = [];
  for (let r = 11; r <= 15; r += 1) {
    const label = asString(cell(rows[r], 0));
    const value = asNumber(cell(rows[r], 1));
    if (!label || value == null) continue;
    exitsByReason.push({ label, value });
  }

  const inList: ExcoHireListRow[] = [];
  const outList: ExcoHireListRow[] = [];
  for (let r = 20; r < rows.length; r += 1) {
    const row = rows[r];
    const inMat = asString(cell(row, 0));
    if (inMat) {
      inList.push({
        matricule: inMat,
        nom: `${asString(cell(row, 2))} ${asString(cell(row, 1))}`.trim(),
        localisation: '',
        departement: asString(cell(row, 6)),
        grade: asString(cell(row, 4)),
        genre: asString(cell(row, 3)),
        company: '',
        appointmentDate: asString(cell(row, 7)),
        site: 'Plant',
        reason: 'Embauche',
      });
    }
    const outMat = asString(cell(row, 9));
    if (outMat) {
      outList.push({
        matricule: outMat,
        nom: `${asString(cell(row, 11))} ${asString(cell(row, 10))}`.trim(),
        localisation: '',
        departement: asString(cell(row, 15)),
        grade: asString(cell(row, 13)),
        genre: asString(cell(row, 12)),
        company: '',
        appointmentDate: asString(cell(row, 17)),
        site: 'Plant',
        reason: asString(cell(row, 18)) || 'Sortie',
      });
    }
  }

  return {
    months,
    ytdIn: ytdCol >= 0 ? asNumber(cell(rows[3], ytdCol)) : null,
    ytdOut: ytdCol >= 0 ? asNumber(cell(rows[4], ytdCol)) : null,
    ytdAttrition: ytdCol >= 0 ? asNumber(cell(rows[5], ytdCol)) : null,
    ytdTurnover: ytdCol >= 0 ? asNumber(cell(rows[6], ytdCol)) : null,
    ytdHeadcount: ytdCol >= 0 ? asNumber(cell(rows[7], ytdCol)) : null,
    exitsByReason,
    inList,
    outList,
  };
}

function parseStaffCost(wb: XLSX.WorkBook): ExcoWorkbookStaffCostMonth[] {
  const name = findSheetName(wb, ['Staff_Cost_KPI', 'Staff Cost']) || 'Staff_Cost_KPI';
  const rows = sheetToMatrix(wb, name);
  const header = rows[2] || [];
  const out: ExcoWorkbookStaffCostMonth[] = [];
  for (let c = 1; c < header.length; c += 1) {
    const key = asString(header[c]);
    const cal = monthKeyToCalendar(key);
    if (!cal) continue;
    out.push({
      calendarMonth: cal,
      actualHeadcount: asNumber(cell(rows[3], c)),
      salariesActualYtd: asNumber(cell(rows[4], c)),
      volumesActualYtd: asNumber(cell(rows[5], c)),
      revenueActualYtd: asNumber(cell(rows[6], c)),
      salariesBudgetYtd: asNumber(cell(rows[9], c)),
      volumesBudgetYtd: asNumber(cell(rows[10], c)),
      revenueBudgetYtd: asNumber(cell(rows[11], c)),
      staffCostMonth: asNumber(cell(rows[19], c)),
      volumeMonth: asNumber(cell(rows[21], c)),
      revenueMonth: asNumber(cell(rows[23], c)),
      tonPerEmployee: asNumber(cell(rows[27], c)),
      tonPerEmployeeYtd: asNumber(cell(rows[26], c)),
      revenuePerEmployee: asNumber(cell(rows[29], c)),
      revenuePerEmployeeYtd: asNumber(cell(rows[28], c)),
    });
  }
  return out;
}

/**
 * Colonnes OVT affichées : FY APR→MAR (12), alignées avec Actual vs Budget.
 * Excel HOURS/Value a encore une 1ère col MAR (précédent) — on la saute (cols 2..13).
 */
const OVT_TREND_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3] as const;
export const OVT_TREND_MONTH_LABELS = [
  'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR',
] as const;
export const OVT_AVB_MONTH_LABELS = [
  'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR',
] as const;

function parseOvt(
  wb: XLSX.WorkBook,
  fx: number,
  leaveByMatricule: Record<string, number>,
  leaveOpeningByMatricule: Record<string, number>,
  year: number,
  month: number,
  sourceFile: string,
): Omit<ExcoWorkbookSnapshot['ot'], 'averageLeaveDays'> & { overtimeImport: ExcoOtMonthImport } {
  const name = findSheetName(wb, ['OVT', 'OVERTIME']) || 'OVT';
  const rows = sheetToMatrix(wb, name);

  const byDeptCurrentMap = new Map<string, ExcoOtDeptRow>();
  for (let r = 2; r < 20; r += 1) {
    const department = asString(cell(rows[r], 0));
    if (!department || department.toUpperCase() === 'HOURS') break;
    const hours = asNumber(cell(rows[r], 1)) ?? 0;
    const cost = asNumber(cell(rows[r], 2)) ?? 0;
    const dept = mapExcoOtDepartment(department);
    const prev = byDeptCurrentMap.get(dept);
    if (prev) {
      prev.hours = round2(prev.hours + hours);
      prev.cost = round2((prev.cost ?? 0) + cost);
    } else {
      byDeptCurrentMap.set(dept, {
        department: dept,
        hours: round2(hours),
        cost: round2(cost),
        costSource: 'computed',
      });
    }
  }
  const byDeptCurrent = [...byDeptCurrentMap.values()].sort((a, b) =>
    compareExcoDepartments(a.department, b.department),
  );

  const topEmployees: ExcoOtEmployeeRow[] = [];
  for (let r = 2; r < rows.length; r += 1) {
    const matricule = asString(cell(rows[r], 17));
    const nom = asString(cell(rows[r], 18));
    const hours = asNumber(cell(rows[r], 19));
    if (!matricule || hours == null) continue;
    const costUsd = asNumber(cell(rows[r], 20));
    const dept = asString(cell(rows[r], 22));
    // Closing Balance Annual (leavebalances) — Leave Type = Annual uniquement
    const leaveBal =
      leaveByMatricule[matricule]
      ?? asNumber(cell(rows[r], 21));
    topEmployees.push({
      matricule,
      nom,
      department: dept ? mapExcoOtDepartment(dept) : '',
      hours: round2(hours),
      costUsd: costUsd != null ? round2(costUsd) : null,
      costFc: costUsd != null && fx > 0 ? round2(costUsd * fx) : null,
      leaveBalance: leaveBal ?? null,
    });
  }

  // Enrich department + cost from overtime_base
  const otBaseName = findSheetName(wb, ['overtime_base']) || 'overtime_base';
  const otBase = sheetToMatrix(wb, otBaseName);
  const agg = new Map<string, { nom: string; department: string; hours: number; costFc: number }>();
  for (let r = 1; r < otBase.length; r += 1) {
    const row = otBase[r];
    const matricule = asString(cell(row, 2));
    if (!matricule) continue;
    const last = asString(cell(row, 0));
    const init = asString(cell(row, 1));
    const deptRaw = asString(cell(row, 3));
    const hours = asNumber(cell(row, 5)) ?? 0;
    const costFc = asNumber(cell(row, 6)) ?? 0;
    const prev = agg.get(matricule) || {
      nom: `${init} ${last}`.trim(),
      department: mapExcoOtDepartment(deptRaw),
      hours: 0,
      costFc: 0,
    };
    prev.hours += hours;
    prev.costFc += costFc;
    if (deptRaw) prev.department = mapExcoOtDepartment(deptRaw);
    if (last) prev.nom = `${init} ${last}`.trim();
    agg.set(matricule, prev);
  }

  for (const e of topEmployees) {
    const a = agg.get(e.matricule);
    if (a) {
      e.nom = a.nom || e.nom;
      e.department = a.department;
      e.hours = round2(a.hours);
      e.costFc = round2(a.costFc);
      e.costUsd = fx > 0 ? round2(a.costFc / fx) : null;
    }
    const annualClose = leaveByMatricule[e.matricule];
    if (annualClose != null) e.leaveBalance = annualClose;
  }
  topEmployees.sort((a, b) => b.hours - a.hours);

  // Trend HOURS block starts at row with A='HOURS'
  let hoursHeaderRow = -1;
  let valueHeaderRow = -1;
  for (let r = 0; r < rows.length; r += 1) {
    const a = asString(cell(rows[r], 0)).toUpperCase();
    if (a === 'HOURS') hoursHeaderRow = r;
    if (a === 'VALUE') valueHeaderRow = r;
  }

  const trendByDept = new Map<string, ExcoWorkbookOtTrendRow>();
  if (hoursHeaderRow >= 0) {
    for (let r = hoursHeaderRow + 1; r < rows.length; r += 1) {
      const department = asString(cell(rows[r], 0));
      if (!department) {
        // totals row without label — stop after collecting named depts
        if (trendByDept.size) break;
        continue;
      }
      if (department.toUpperCase() === 'VALUE') break;
      // Excel: col1=MAR (hors FY) → cols 2..13 = APR→MAR (aligné Actual vs Budget)
      const hoursByMonth: Array<number | null> = [];
      for (let c = 2; c <= 13; c += 1) {
        hoursByMonth.push(asNumber(cell(rows[r], c)));
      }
      const hoursYtd = asNumber(cell(rows[r], 15));
      const hoursShare = asNumber(cell(rows[r], 14));
      let costByMonth: Array<number | null> = hoursByMonth.map(() => null);
      let costYtd: number | null = null;
      let costShare: number | null = null;
      if (valueHeaderRow >= 0) {
        const vr = valueHeaderRow + (r - hoursHeaderRow);
        costByMonth = [];
        for (let c = 2; c <= 13; c += 1) {
          costByMonth.push(asNumber(cell(rows[vr], c)));
        }
        costYtd = asNumber(cell(rows[vr], 15));
        costShare = asNumber(cell(rows[vr], 14));
      }
      const dept = mapExcoOtDepartment(department);
      const prev = trendByDept.get(dept);
      if (prev) {
        prev.hoursByMonth = prev.hoursByMonth.map((v, i) =>
          v == null && hoursByMonth[i] == null ? null : round2((v || 0) + (hoursByMonth[i] || 0)),
        );
        prev.costByMonth = prev.costByMonth.map((v, i) =>
          v == null && costByMonth[i] == null ? null : round2((v || 0) + (costByMonth[i] || 0)),
        );
        prev.hoursYtd = round2((prev.hoursYtd || 0) + (hoursYtd || 0));
        prev.costYtd = round2((prev.costYtd || 0) + (costYtd || 0));
        prev.hoursShare = (prev.hoursShare || 0) + (hoursShare || 0);
        prev.costShare = (prev.costShare || 0) + (costShare || 0);
      } else {
        trendByDept.set(dept, {
          department: dept,
          hoursByMonth,
          hoursYtd,
          costByMonth,
          costYtd,
          hoursShare,
          costShare,
        });
      }
    }
  }
  const trendRows = [...trendByDept.values()].sort((a, b) =>
    compareExcoDepartments(a.department, b.department),
  );

  const totalHoursCurrent = round2(byDeptCurrent.reduce((s, d) => s + d.hours, 0));
  const totalCostUsdCurrent = round2(byDeptCurrent.reduce((s, d) => s + (d.cost ?? 0), 0));
  const employeesWithOt = topEmployees.length;
  const averageHours = employeesWithOt ? round2(totalHoursCurrent / employeesWithOt) : null;
  const averageCostPerEmployee = employeesWithOt ? round2(totalCostUsdCurrent / employeesWithOt) : null;
  void leaveOpeningByMatricule;

  // KPIs from overtime_base right panel if present
  let employeesWithOtPct: number | null = null;
  const metaN = asNumber(cell(otBase[1], 14));
  const metaPct = asNumber(cell(otBase[2], 14));
  const metaTotal = asNumber(cell(otBase[3], 14));
  const metaAvgH = asNumber(cell(otBase[4], 14));
  const metaCost = asNumber(cell(otBase[5], 14));
  const metaAvgC = asNumber(cell(otBase[6], 14));
  if (metaPct != null) employeesWithOtPct = round2(metaPct * (metaPct <= 1 ? 100 : 1));

  const overtimeImport: ExcoOtMonthImport = {
    year,
    month,
    fxRateFcPerUsd: fx,
    employees: [...agg.entries()].map(([matricule, a]) => ({
      matricule,
      nom: a.nom,
      department: a.department,
      departmentRaw: a.department,
      hours: round2(a.hours),
      costFc: round2(a.costFc),
      leaveBalance: leaveByMatricule[matricule] ?? null,
    })),
    byDept: byDeptCurrent.map((d) => ({
      department: d.department,
      hours: d.hours,
      costFc: fx > 0 && d.cost != null ? round2(d.cost * fx) : 0,
    })),
    sourceFiles: [sourceFile],
    importedAt: new Date().toISOString(),
  };

  // Prefer panel totals when available
  void metaN;
  void metaTotal;
  void metaAvgH;
  void metaCost;
  void metaAvgC;

  // Actual vs Budget (APR→MAR) — lignes « Actual » / « Budget »
  let actualVsBudget: ExcoWorkbookOtActualVsBudget | null = null;
  let actualRow = -1;
  let budgetRow = -1;
  for (let r = 0; r < rows.length; r += 1) {
    const a = asString(cell(rows[r], 0)).toUpperCase();
    if (a === 'ACTUAL') actualRow = r;
    if (a === 'BUDGET') budgetRow = r;
  }
  if (actualRow >= 0) {
    const actualByMonth: Array<number | null> = [];
    const budgetByMonth: Array<number | null> = [];
    for (let c = 2; c <= 13; c += 1) {
      actualByMonth.push(asNumber(cell(rows[actualRow], c)));
      budgetByMonth.push(
        budgetRow >= 0 ? asNumber(cell(rows[budgetRow], c)) : null,
      );
    }
    const actualYtd =
      asNumber(cell(rows[actualRow], 14))
      ?? round2(actualByMonth.reduce<number>((s, v) => s + (v || 0), 0));
    const budgetYtd =
      budgetRow >= 0
        ? (asNumber(cell(rows[budgetRow], 14))
          ?? round2(budgetByMonth.reduce<number>((s, v) => s + (v || 0), 0)))
        : null;
    actualVsBudget = {
      monthLabels: [...OVT_AVB_MONTH_LABELS],
      actualByMonth,
      budgetByMonth,
      actualYtd,
      budgetYtd,
    };
  }

  return {
    byDeptCurrent,
    topEmployees,
    trendRows,
    actualVsBudget,
    totalHoursCurrent: metaTotal ?? totalHoursCurrent,
    totalCostUsdCurrent: metaCost ?? totalCostUsdCurrent,
    employeesWithOt: metaN ?? employeesWithOt,
    employeesWithOtPct,
    averageHours: metaAvgH ?? averageHours,
    averageCostPerEmployee: metaAvgC ?? averageCostPerEmployee,
    overtimeImport,
  };
}

function parseLeave(
  wb: XLSX.WorkBook,
  employees: ExcoWorkbookEmployee[],
  fx: number,
  year: number,
  month: number,
  sourceFile: string,
): ExcoLeaveMonthImport {
  const siteByMat: Record<string, string> = {};
  for (const e of employees) {
    siteByMat[e.matricule] = e.locationSite;
  }

  const name = findSheetName(wb, ['leavebalances_base', 'Leave']) || 'leavebalances_base';
  const rows = sheetToMatrix(wb, name);
  const byMatricule: Record<string, number> = {};
  const openingByMatricule: Record<string, number> = {};
  let valueFcTotal = 0;
  const plant: number[] = [];
  const hq: number[] = [];
  const lubudi: number[] = [];
  const all: number[] = [];

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const leaveType = asString(cell(row, 19));
    // Leave Type = Annual uniquement (pas Sick / Special)
    if (!/^annual$/i.test(leaveType)) continue;
    const matricule = asString(cell(row, 4) ?? cell(row, 3));
    const opening = asNumber(cell(row, 24));
    const closing = asNumber(cell(row, 28));
    const value = asNumber(cell(row, 29)) ?? 0;
    if (!matricule || closing == null) continue;
    byMatricule[matricule] = closing;
    if (opening != null) openingByMatricule[matricule] = opening;
    valueFcTotal += value;
    all.push(closing);
    const site = siteBucketFromLocation(siteByMat[matricule] || '');
    if (site === 'Plant') plant.push(closing);
    else if (site === 'Lubudi') lubudi.push(closing);
    else hq.push(closing);
  }

  // Align BASE leave_balance with Annual Closing when present (affichage employés)
  for (const e of employees) {
    const annual = byMatricule[e.matricule];
    if (annual != null) e.leaveBalance = annual;
  }

  const leaveCostUsd = fx > 0 ? round2(valueFcTotal / fx) : null;

  return {
    year,
    month,
    fxRateFcPerUsd: fx,
    plantAvgDays: avg(plant),
    hqAvgDays: avg(hq),
    lubudiAvgDays: avg(lubudi),
    allAvgDays: avg(all),
    valueFcTotal: round2(valueFcTotal),
    valueFcBySheet: [round2(valueFcTotal)],
    leaveCostUsd,
    provisionUsd000: leaveCostUsd != null ? round2(leaveCostUsd / 1000) : null,
    counts: {
      plant: plant.length,
      hq: hq.length,
      lubudi: lubudi.length,
      all: all.length,
    },
    byMatricule,
    openingByMatricule,
    sourceFiles: [sourceFile],
    importedAt: new Date().toISOString(),
  };
}

function buildManualAndFinance(
  staffCost: ExcoWorkbookStaffCostMonth[],
  leave: ExcoLeaveMonthImport,
  otCostUsd: number,
  reportMonth: number,
): { manualKpis: ExcoManualKpis; financeByMonth: Record<string, ExcoManualKpis> } {
  const financeByMonth: Record<string, ExcoManualKpis> = {};
  for (const sc of staffCost) {
    if (sc.staffCostMonth == null && sc.tonPerEmployee == null && sc.revenuePerEmployee == null) {
      continue;
    }
    // Skip negative "balancing" months in the source (Aug row with negated YTD)
    if (sc.staffCostMonth != null && sc.staffCostMonth < 0) continue;
    financeByMonth[String(sc.calendarMonth)] = {
      staffCost: sc.staffCostMonth != null ? round2(sc.staffCostMonth) : null,
      volumePerEmp: sc.tonPerEmployee != null ? round2(sc.tonPerEmployee) : null,
      revenuePerEmp: sc.revenuePerEmployee != null ? round2(sc.revenuePerEmployee) : null,
      staffCostBudgetYtd: sc.salariesBudgetYtd != null ? round2(sc.salariesBudgetYtd) : null,
      volumeBudgetYtd: sc.volumesBudgetYtd != null ? round2(sc.volumesBudgetYtd) : null,
      revenueBudgetYtd: sc.revenueBudgetYtd != null ? round2(sc.revenueBudgetYtd) : null,
    };
  }

  const current = staffCost.find((s) => s.calendarMonth === reportMonth);
  const manualKpis: ExcoManualKpis = {
    ...(financeByMonth[String(reportMonth)] || {}),
    staffCost: current?.staffCostMonth != null ? round2(current.staffCostMonth) : null,
    volumePerEmp: current?.tonPerEmployee != null ? round2(current.tonPerEmployee) : null,
    revenuePerEmp: current?.revenuePerEmployee != null ? round2(current.revenuePerEmployee) : null,
    overtimeCost: round2(otCostUsd),
    leaveBalanceAvgDays: leave.allAvgDays,
    leaveCost: leave.leaveCostUsd ?? null,
  };

  financeByMonth[String(reportMonth)] = {
    ...(financeByMonth[String(reportMonth)] || {}),
    ...manualKpis,
  };

  return { manualKpis, financeByMonth };
}

export function parseExcoNewReport(
  buffer: ArrayBuffer,
  sourceFile = 'New report.xlsx',
): ExcoWorkbookSnapshot {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const params = parseParams(wb);
  const employees = parseBase(wb);
  const headcount = parseHeadcount(wb);
  const inOut = parseInOut(wb);
  const staffCost = parseStaffCost(wb);
  const leave = parseLeave(wb, employees, params.fxRateFcPerUsd, params.year, params.month, sourceFile);
  const ot = parseOvt(
    wb,
    params.fxRateFcPerUsd,
    leave.byMatricule,
    leave.openingByMatricule || {},
    params.year,
    params.month,
    sourceFile,
  );
  const { manualKpis, financeByMonth } = buildManualAndFinance(
    staffCost,
    leave,
    ot.totalCostUsdCurrent,
    params.month,
  );

  return {
    sourceFile,
    importedAt: new Date().toISOString(),
    params,
    employees,
    headcount,
    inOut,
    staffCost,
    ot: {
      byDeptCurrent: ot.byDeptCurrent,
      topEmployees: ot.topEmployees,
      trendRows: ot.trendRows,
      actualVsBudget: ot.actualVsBudget,
      totalHoursCurrent: ot.totalHoursCurrent,
      totalCostUsdCurrent: ot.totalCostUsdCurrent,
      employeesWithOt: ot.employeesWithOt,
      employeesWithOtPct: ot.employeesWithOtPct,
      averageHours: ot.averageHours,
      averageCostPerEmployee: ot.averageCostPerEmployee,
      // Moyenne Closing Balance Annual (toutes feuilles Leave) — pas OT-only
      averageLeaveDays: leave.allAvgDays,
    },
    leave,
    overtimeImport: ot.overtimeImport,
    manualKpis,
    financeByMonth,
  };
}

export function workbookEmployeesToHireList(employees: ExcoWorkbookEmployee[]): ExcoHireListRow[] {
  return employees.map((e) => ({
    matricule: e.matricule,
    nom: e.nom,
    localisation: e.locationSite,
    departement: e.department,
    grade: e.grade,
    genre: e.gender,
    company: '',
    appointmentDate: e.emplDate,
    site: siteBucketFromLocation(e.locationSite),
    reason: 'Présent',
  }));
}

export { OVT_TREND_MONTHS, siteBucketFromLocation, FY_MONTH_KEYS };
