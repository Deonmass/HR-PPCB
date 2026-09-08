/**
 * BASE EXCO unique par mois :
 * — New report du mois (workbookSnapshot ou data/exco/sources/YYYY-MM/) = source de vérité effectif
 * — noms / départements enrichis depuis le système (sans ajouter d’effectifs hors BASE)
 * — sans snapshot : roll-forward depuis le mois précédent + engagements
 */
import 'server-only';

import { computeSeniorityYears, parseDisplayDateParts } from './employee-columns';
import { isFemaleGender, isMaleGender } from './employees-hr-dashboard';
import { readEmployeesBundle } from './employees-json-store';
import {
  displayEngagementName,
  splitEngagementsForPeriod,
  type ExcoEngagementRow,
} from './exco-engagements-parse';
import { resolveExcoBaseWorkbook } from './exco-base-source';
import { parseExcoNewReport, type ExcoWorkbookEmployee } from './exco-new-report-parse';
import { resolveExcoDepartment } from './exco-department-map';
import { getExcoOverlays } from './exco-store';
import { fcToUsd, type ExcoLeaveMonthImport, type ExcoOtMonthImport } from './exco-ot-import';
import type { ExcoSheetTable } from './exco-workbook-types';
import type { Employee } from './types';
import type { ExcoComputedBlock, ExcoHireListRow } from './exco-types';
import { ratioToRate } from './format-rate';
import fs from 'fs/promises';
import path from 'path';

export type ExcoUniqueBaseSource = 'workbook' | 'seed' | 'engagement' | 'leave-exit';

export interface ExcoUniqueBaseRow {
  matricule: string;
  nom: string;
  gender: string;
  nationality: string;
  position: string;
  grade: string;
  birth: string;
  age: number | null;
  ageCat: string;
  emplDate: string;
  lengthOfService: number | null;
  lengthOfServiceCat: string;
  department: string;
  locationSite: string;
  leaveBalance: number | null;
  /** Value Annual (fichier Leave, col. AD) en FC — colonne BASE Allowance Amount. */
  allowanceAmount: number | null;
  ovtHours: number | null;
  ovtCost: number | null;
  source: ExcoUniqueBaseSource;
}

export interface ExcoUniqueBaseResult {
  year: number;
  month: number;
  seedYear: number;
  seedMonth: number;
  employees: ExcoUniqueBaseRow[];
  headcount: number;
  /** Sorties du mois encore présentes dans Leave Balances (hors effectif). */
  leaveExitCount: number;
  hiresInMonth: Array<ExcoEngagementRow & { displayName: string }>;
  exitsInMonth: Array<ExcoEngagementRow & { displayName: string }>;
  sheet: ExcoSheetTable;
  /** True si la BASE vient d’un New report officiel du mois. */
  fromWorkbook: boolean;
  employeesWithOt: number;
  leaveAvgDays: number | null;
}

const BASE_HEADERS = [
  'Emp Number',
  'Names',
  'Gender',
  'Nationality',
  'Position',
  'Grade',
  'Birth',
  'Age',
  'AGE_CAT',
  'Empl_Date',
  'Length of Service',
  'Length of Service_CAT',
  'Departments',
  'Location_Site',
  'Leave_Balance',
  'Allowance Amount',
  'OVT_Hours',
  'OVT_Cost',
] as const;

function asOfEndOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59);
}

function datePartsToKey(parts: { y: number; m: number; d: number }): number {
  return parts.y * 10000 + parts.m * 100 + parts.d;
}

function dateStrOnOrBefore(dateStr: string, asOf: Date): boolean {
  const parts = parseDisplayDateParts(dateStr);
  if (!parts) return false;
  const asOfKey =
    asOf.getFullYear() * 10000 + (asOf.getMonth() + 1) * 100 + asOf.getDate();
  return datePartsToKey(parts) <= asOfKey;
}

function ageCatFromAge(age: number | null): string {
  if (age == null) return '';
  if (age < 25) return '<25';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
}

function seniorityCat(years: number | null): string {
  if (years == null) return '';
  if (years < 1) return '<1 yr';
  if (years < 2) return '1-2 yrs';
  if (years < 5) return '2-5 yrs';
  if (years < 10) return '5-10 yrs';
  return '10+ yrs';
}

function ageFromBirth(birth: string, asOf: Date): number | null {
  const parts = parseDisplayDateParts(birth);
  if (!parts) return null;
  let age = asOf.getFullYear() - parts.y;
  const m = asOf.getMonth() + 1 - parts.m;
  if (m < 0 || (m === 0 && asOf.getDate() < parts.d)) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

function employeeMap(employees: Employee[]): Map<string, Employee> {
  const map = new Map<string, Employee>();
  for (const e of employees) {
    const m = (e.matricule || '').trim();
    if (m) map.set(m, e);
  }
  return map;
}

function prevPeriod(year: number, month: number): { year: number; month: number } {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

async function monthSourceExists(year: number, month: number): Promise<boolean> {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  try {
    await fs.access(
      path.join(process.cwd(), 'data', 'exco', 'sources', monthKey, 'New report.xlsx'),
    );
    return true;
  } catch {
    return false;
  }
}

async function loadMonthWorkbookEmployees(
  year: number,
  month: number,
): Promise<{ employees: ExcoWorkbookEmployee[]; seedYear: number; seedMonth: number } | null> {
  const { overlays } = await getExcoOverlays(year, month);
  const snap = overlays.workbookSnapshot;
  const file = await resolveExcoBaseWorkbook(year, month);
  const parsed = file ? parseExcoNewReport(file.buffer, file.originalName) : null;
  const parsedOk =
    parsed
    && (
      (parsed.params.year === year && parsed.params.month === month)
      || (await monthSourceExists(year, month))
    );

  if (
    snap
    && snap.params.year === year
    && snap.params.month === month
    && Array.isArray(snap.employees)
    && snap.employees.length > 0
  ) {
    const fromFile = parsedOk ? parsed!.employees : [];
    const byMat = new Map(fromFile.map((e) => [e.matricule, e]));
    return {
      employees: snap.employees.map((e) => {
        const p = byMat.get(e.matricule);
        return {
          ...e,
          allowanceAmount: p?.allowanceAmount ?? e.allowanceAmount ?? null,
          ovtHours: p?.ovtHours ?? e.ovtHours ?? null,
          ovtCost: e.ovtCost ?? p?.ovtCost ?? null,
          leaveBalance: p?.leaveBalance ?? e.leaveBalance ?? null,
        };
      }),
      seedYear: snap.params.year,
      seedMonth: snap.params.month,
    };
  }

  if (parsedOk && parsed) {
    return {
      employees: parsed.employees,
      seedYear: parsed.params.year === year ? parsed.params.year : year,
      seedMonth: parsed.params.month === month ? parsed.params.month : month,
    };
  }
  return null;
}

function rowFromWorkbook(
  e: ExcoWorkbookEmployee,
  sys: Employee | undefined,
  asOf: Date,
  source: ExcoUniqueBaseSource = 'workbook',
): ExcoUniqueBaseRow {
  const dept =
    (sys?.departement || sys?.departmentHr || '').trim()
    || resolveExcoDepartment(e.department).department
    || e.department;
  const birth = sys?.dateOfBirth || '';
  const age = ageFromBirth(birth, asOf) ?? e.age;
  const emplDate = e.emplDate || sys?.appointmentDate || '';
  const los = e.lengthOfService ?? computeSeniorityYears(emplDate, asOf);
  return {
    matricule: e.matricule,
    nom: (sys?.nom || e.nom || '').trim(),
    gender: e.gender || sys?.gender || '',
    nationality: e.nationality || sys?.nationality || '',
    position: e.position || sys?.position || sys?.jobTitle || '',
    grade: e.grade || sys?.grade || '',
    birth,
    age,
    ageCat: e.ageCat || ageCatFromAge(age),
    emplDate,
    lengthOfService: los,
    lengthOfServiceCat: e.lengthOfServiceCat || seniorityCat(los),
    department: dept,
    locationSite: e.locationSite || sys?.localisation || '',
    leaveBalance: e.leaveBalance,
    allowanceAmount: e.allowanceAmount ?? null,
    ovtHours: e.ovtHours ?? null,
    ovtCost: e.ovtCost ?? null,
    source,
  };
}

function rowFromEngagement(
  row: ExcoEngagementRow,
  sys: Employee | undefined,
  asOf: Date,
): ExcoUniqueBaseRow {
  const birth = sys?.dateOfBirth || row.birthDate || '';
  const age = ageFromBirth(birth, asOf);
  const emplDate = row.employmentDate || sys?.appointmentDate || '';
  const los = computeSeniorityYears(emplDate, asOf);
  const dept =
    (sys?.departement || sys?.departmentHr || '').trim()
    || resolveExcoDepartment(row.orgUnit).department
    || row.orgUnit;
  return {
    matricule: row.matricule,
    nom: (sys?.nom || displayEngagementName(row) || '').trim(),
    gender: row.gender || sys?.gender || '',
    nationality: row.nationality || sys?.nationality || '',
    position: row.position || sys?.position || sys?.jobTitle || '',
    grade: row.grade || sys?.grade || '',
    birth,
    age,
    ageCat: ageCatFromAge(age),
    emplDate,
    lengthOfService: los,
    lengthOfServiceCat: seniorityCat(los),
    department: dept,
    locationSite: sys?.localisation || '',
    leaveBalance: null,
    allowanceAmount: null,
    ovtHours: null,
    ovtCost: null,
    source: 'engagement',
  };
}

function rowFromLeaveExit(
  matricule: string,
  sys: Employee | undefined,
  exit: ExcoEngagementRow | undefined,
  asOf: Date,
): ExcoUniqueBaseRow {
  if (exit) {
    return { ...rowFromEngagement(exit, sys, asOf), source: 'leave-exit' };
  }
  const birth = sys?.dateOfBirth || '';
  const age = ageFromBirth(birth, asOf);
  const emplDate = sys?.appointmentDate || '';
  const los = computeSeniorityYears(emplDate, asOf);
  const dept = (sys?.departement || sys?.departmentHr || '').trim();
  return {
    matricule,
    nom: (sys?.nom || '').trim(),
    gender: sys?.gender || '',
    nationality: sys?.nationality || '',
    position: sys?.position || sys?.jobTitle || '',
    grade: sys?.grade || '',
    birth,
    age,
    ageCat: ageCatFromAge(age),
    emplDate,
    lengthOfService: los,
    lengthOfServiceCat: seniorityCat(los),
    department: dept,
    locationSite: sys?.localisation || '',
    leaveBalance: null,
    allowanceAmount: null,
    ovtHours: null,
    ovtCost: null,
    source: 'leave-exit',
  };
}

/**
 * Sorties (et toute personne du fichier Leave absente de la BASE) :
 * l’effectif ne les compte pas, mais Leave_Balance / Value doivent entrer dans Leave COST.
 */
function leaveRowsAbsentFromBase(
  present: ExcoUniqueBaseRow[],
  leaveSnap: ExcoLeaveMonthImport | undefined,
  exitsInMonth: ExcoEngagementRow[],
  allSystem: Map<string, Employee>,
  asOf: Date,
): ExcoUniqueBaseRow[] {
  if (!leaveSnap) return [];
  const presentMats = new Set(present.map((e) => e.matricule));
  const exitByMat = new Map(exitsInMonth.map((r) => [r.matricule, r]));
  const leaveDays = leaveSnap.byMatricule || {};
  const leaveValueFc = leaveSnap.valueFcByMatricule || {};
  const mats = new Set([...Object.keys(leaveDays), ...Object.keys(leaveValueFc)]);

  const extras: ExcoUniqueBaseRow[] = [];
  for (const mat of mats) {
    if (presentMats.has(mat)) continue;
    const days = leaveDays[mat];
    const valueFc = leaveValueFc[mat];
    if (
      (days == null || !Number.isFinite(days))
      && (valueFc == null || !Number.isFinite(valueFc))
    ) {
      continue;
    }
    extras.push(
      rowFromLeaveExit(mat, allSystem.get(mat), exitByMat.get(mat), asOf),
    );
  }
  return extras;
}

function applyLeaveAndOtImports(
  employees: ExcoUniqueBaseRow[],
  leaveSnap: ExcoLeaveMonthImport | undefined,
  otSnap: ExcoOtMonthImport | undefined,
  fxRateFcPerUsd: number | null,
): ExcoUniqueBaseRow[] {
  const fx =
    fxRateFcPerUsd != null && Number.isFinite(fxRateFcPerUsd) && fxRateFcPerUsd > 0
      ? fxRateFcPerUsd
      : leaveSnap?.fxRateFcPerUsd != null && leaveSnap.fxRateFcPerUsd > 0
        ? leaveSnap.fxRateFcPerUsd
        : otSnap?.fxRateFcPerUsd != null && otSnap.fxRateFcPerUsd > 0
          ? otSnap.fxRateFcPerUsd
          : null;

  const leaveDays = leaveSnap?.byMatricule || {};
  const leaveValueFc = leaveSnap?.valueFcByMatricule || {};
  const hasLeave = Object.keys(leaveDays).length > 0 || Object.keys(leaveValueFc).length > 0;
  const otByMat = new Map((otSnap?.employees || []).map((e) => [e.matricule, e]));

  if (!hasLeave && otByMat.size === 0) return employees;

  return employees.map((e) => {
    const mat = e.matricule;
    const next = { ...e };
    if (hasLeave) {
      // Unique Base Excel fait foi si déjà renseigné (moyenne Leave_Balance = 18.31).
      if (
        next.leaveBalance == null
        && Object.prototype.hasOwnProperty.call(leaveDays, mat)
        && Number.isFinite(leaveDays[mat])
      ) {
        next.leaveBalance = leaveDays[mat];
      }
      if (
        next.allowanceAmount == null
        && Object.prototype.hasOwnProperty.call(leaveValueFc, mat)
        && Number.isFinite(leaveValueFc[mat])
      ) {
        next.allowanceAmount = Math.round(leaveValueFc[mat] * 100) / 100;
      }
    }
    const ot = otByMat.get(mat);
    if (ot && next.ovtHours == null) {
      next.ovtHours = ot.hours;
      next.ovtCost = fcToUsd(ot.costFc, fx) ?? ot.costFc;
    }
    return next;
  });
}

function uniqueBaseOverviewKpis(present: ExcoUniqueBaseRow[]): {
  employeesWithOt: number;
  leaveAvgDays: number | null;
} {
  const employeesWithOt = present.filter((e) => (e.ovtHours || 0) > 0).length;
  const leaves = present
    .map((e) => e.leaveBalance)
    .filter((n): n is number => n != null && Number.isFinite(n));
  const leaveAvgDays = leaves.length
    ? Math.round((leaves.reduce((s, n) => s + n, 0) / leaves.length) * 100) / 100
    : null;
  return { employeesWithOt, leaveAvgDays };
}

function finishBase(
  present: ExcoUniqueBaseRow[],
  leaveSnap: ExcoLeaveMonthImport | undefined,
  otSnap: ExcoOtMonthImport | undefined,
  monthFx: number | null,
  exitsInMonth: ExcoEngagementRow[],
  allSystem: Map<string, Employee>,
  asOf: Date,
): {
  employees: ExcoUniqueBaseRow[];
  headcount: number;
  leaveExitCount: number;
  sheet: ExcoSheetTable;
  employeesWithOt: number;
  leaveAvgDays: number | null;
} {
  const extras = applyLeaveAndOtImports(
    leaveRowsAbsentFromBase(present, leaveSnap, exitsInMonth, allSystem, asOf),
    leaveSnap,
    otSnap,
    monthFx,
  );
  const sheetRows = [...present, ...extras].sort((a, b) =>
    a.matricule.localeCompare(b.matricule, 'fr', { numeric: true }),
  );
  return {
    employees: present,
    headcount: present.length,
    leaveExitCount: extras.length,
    sheet: toSheet(sheetRows),
    ...uniqueBaseOverviewKpis(present),
  };
}

function toSheet(employees: ExcoUniqueBaseRow[]): ExcoSheetTable {
  const headerRow: Array<string | number | null> = [...BASE_HEADERS];
  const dataRows = employees.map((e) => [
    e.matricule,
    e.nom,
    e.gender,
    e.nationality,
    e.position,
    e.grade,
    e.birth || null,
    e.age,
    e.ageCat || null,
    e.emplDate || null,
    e.lengthOfService,
    e.lengthOfServiceCat || null,
    e.department || null,
    e.locationSite || null,
    e.leaveBalance,
    e.allowanceAmount,
    e.ovtHours,
    e.ovtCost,
  ]);
  return {
    id: 'base',
    name: 'BASE',
    label: 'BASE',
    rows: [headerRow, ...dataRows],
    rowCount: dataRows.length + 1,
    colCount: BASE_HEADERS.length,
  };
}

/**
 * BASE officielle du mois = New report du mois (175 pour Jul/Août).
 * Sans fichier : roll-forward mois précédent + engagements du mois.
 */
export async function buildExcoUniqueBase(
  year: number,
  month: number,
): Promise<ExcoUniqueBaseResult> {
  const asOf = asOfEndOfMonth(year, month);
  const bundle = await readEmployeesBundle();
  const allSystem = employeeMap([...(bundle.employees || []), ...(bundle.exits || [])]);

  const { overlays: monthOverlays } = await getExcoOverlays(year, month);
  const monthEngRows = monthOverlays.engagementsImportsByMonth?.[String(month)] || [];
  const split = splitEngagementsForPeriod(monthEngRows, year, month);
  const leaveSnap = monthOverlays.leaveImportsByMonth?.[String(month)];
  const otSnap = monthOverlays.overtimeImportsByMonth?.[String(month)];
  const monthFx = monthOverlays.generationMeta?.fxRateFcPerUsd ?? null;

  const withName = (rows: ExcoEngagementRow[]) =>
    rows.map((r) => ({
      ...r,
      displayName: allSystem.get(r.matricule)?.nom || displayEngagementName(r),
    }));

  const workbook = await loadMonthWorkbookEmployees(year, month);
  if (workbook && workbook.employees.length > 0) {
    const present = applyLeaveAndOtImports(
      workbook.employees
        .map((e) => rowFromWorkbook(e, allSystem.get(e.matricule), asOf, 'workbook'))
        .sort((a, b) => a.matricule.localeCompare(b.matricule, 'fr', { numeric: true })),
      leaveSnap,
      otSnap,
      monthFx,
    );
    const finished = finishBase(
      present,
      leaveSnap,
      otSnap,
      monthFx,
      split.terminationsInMonth,
      allSystem,
      asOf,
    );
    return {
      year,
      month,
      seedYear: workbook.seedYear,
      seedMonth: workbook.seedMonth,
      ...finished,
      hiresInMonth: withName(split.engagementsInMonth),
      exitsInMonth: withName(split.terminationsInMonth),
      fromWorkbook: true,
    };
  }

  // Roll-forward : BASE mois précédent + entrées − sorties du mois
  const prev = prevPeriod(year, month);
  const prevBase = await loadMonthWorkbookEmployees(prev.year, prev.month);
  const roster = new Map<string, ExcoUniqueBaseRow>();
  for (const e of prevBase?.employees || []) {
    roster.set(e.matricule, rowFromWorkbook(e, allSystem.get(e.matricule), asOf, 'seed'));
  }

  for (const row of split.terminationsInMonth) {
    roster.delete(row.matricule);
  }
  for (const row of split.engagementsInMonth) {
    if (!roster.has(row.matricule)) {
      roster.set(row.matricule, rowFromEngagement(row, allSystem.get(row.matricule), asOf));
    }
  }

  for (const row of monthEngRows) {
    if (row.terminationDate && dateStrOnOrBefore(row.terminationDate, asOf)) {
      roster.delete(row.matricule);
    }
  }

  const present = applyLeaveAndOtImports(
    [...roster.values()].sort((a, b) =>
      a.matricule.localeCompare(b.matricule, 'fr', { numeric: true }),
    ),
    leaveSnap,
    otSnap,
    monthFx,
  );
  const finished = finishBase(
    present,
    leaveSnap,
    otSnap,
    monthFx,
    split.terminationsInMonth,
    allSystem,
    asOf,
  );

  return {
    year,
    month,
    seedYear: prevBase?.seedYear ?? prev.year,
    seedMonth: prevBase?.seedMonth ?? prev.month,
    ...finished,
    hiresInMonth: withName(split.engagementsInMonth),
    exitsInMonth: withName(split.terminationsInMonth),
    fromWorkbook: false,
  };
}

/** Convertit une ligne BASE unique en ligne liste IN/OUT. */
export function uniqueBaseRowToHireList(
  row: ExcoUniqueBaseRow,
  reason: string,
): ExcoHireListRow {
  return {
    matricule: row.matricule,
    nom: row.nom,
    localisation: row.locationSite,
    departement: row.department,
    grade: row.grade,
    genre: row.gender,
    company: '',
    appointmentDate: row.emplDate,
    site: row.locationSite || 'Non renseigné',
    reason,
  };
}

function engagementToHireList(
  row: ExcoEngagementRow & { displayName?: string },
  reason: string,
): ExcoHireListRow {
  return {
    matricule: row.matricule,
    nom: row.displayName || displayEngagementName(row),
    localisation: '',
    departement: resolveExcoDepartment(row.orgUnit).department || row.orgUnit,
    grade: row.grade,
    genre: row.gender,
    company: row.company === 'quarico' ? 'Quarico' : row.company === 'manico' ? 'Manico' : '',
    appointmentDate:
      reason === 'Sortie' || reason.toLowerCase().includes('sortie')
        ? row.terminationDate
        : row.employmentDate,
    site: 'Non renseigné',
    reason,
  };
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

/**
 * Aligne headcount / démographie sur la BASE unique.
 * IN/OUT : engagements si importés, sinon conserve les valeurs déjà calculées (workbook).
 */
export function applyUniqueBaseToComputed(
  computed: ExcoComputedBlock,
  current: ExcoUniqueBaseResult,
  previous: ExcoUniqueBaseResult,
  opts?: { useEngagementsCurrent?: boolean; useEngagementsPrev?: boolean },
): ExcoComputedBlock {
  const headcount = current.headcount;
  const prevHeadcount = previous.headcount > 0 ? previous.headcount : computed.prevHeadcount;
  const hasEngCurrent = Boolean(opts?.useEngagementsCurrent);
  const hasEngPrev = Boolean(opts?.useEngagementsPrev);

  const hires = hasEngCurrent ? current.hiresInMonth.length : computed.hires;
  const exitsCount = hasEngCurrent ? current.exitsInMonth.length : computed.exits;
  const prevHires = hasEngPrev ? previous.hiresInMonth.length : computed.prevHires;
  const prevExits = hasEngPrev ? previous.exitsInMonth.length : computed.prevExits;

  const hiresList = hasEngCurrent
    ? current.hiresInMonth.map((r) => engagementToHireList(r, 'Embauche'))
    : computed.hiresList;
  const exitsList = hasEngCurrent
    ? current.exitsInMonth.map((r) =>
        engagementToHireList(r, (r.terminationReason || '').trim() || 'Sortie'),
      )
    : computed.exitsList;

  const presentList = current.employees.map((e) => uniqueBaseRowToHireList(e, 'Présent'));
  const prevKeys = new Set(previous.employees.map((e) => e.matricule));
  const currKeys = new Set(current.employees.map((e) => e.matricule));
  const joinersList = current.employees
    .filter((e) => !prevKeys.has(e.matricule))
    .map((e) => uniqueBaseRowToHireList(e, 'Arrivée'));
  const leaversList = previous.employees
    .filter((e) => !currKeys.has(e.matricule))
    .map((e) => uniqueBaseRowToHireList(e, 'Sortie'));

  const turnoverPct =
    headcount > 0 ? ratioToRate((hires + exitsCount) / 2, headcount) : null;
  const prevTurnoverPct =
    prevHeadcount != null && prevHeadcount > 0 && prevHires != null && prevExits != null
      ? ratioToRate((prevHires + prevExits) / 2, prevHeadcount)
      : computed.prevTurnoverPct;
  const attritionPct = headcount > 0 ? ratioToRate(exitsCount, headcount) : null;
  const prevAttritionPct =
    prevHeadcount != null && prevHeadcount > 0 && prevExits != null
      ? ratioToRate(prevExits, prevHeadcount)
      : computed.prevAttritionPct;

  const males = current.employees.filter((e) => isMaleGender(e.gender));
  const females = current.employees.filter((e) => isFemaleGender(e.gender));
  const genderMale = males.length;
  const genderFemale = females.length;
  const genderMalePct = headcount > 0 ? ratioToRate(genderMale, headcount) : null;
  const genderFemalePct = headcount > 0 ? ratioToRate(genderFemale, headcount) : null;

  const prevMales = previous.employees.filter((e) => isMaleGender(e.gender));
  const prevFemales = previous.employees.filter((e) => isFemaleGender(e.gender));
  const prevGenderMalePct =
    prevHeadcount != null && prevHeadcount > 0
      ? ratioToRate(prevMales.length, prevHeadcount)
      : null;
  const prevGenderFemalePct =
    prevHeadcount != null && prevHeadcount > 0
      ? ratioToRate(prevFemales.length, prevHeadcount)
      : null;

  const ages = current.employees
    .map((e) => e.age)
    .filter((n): n is number => n != null);
  const agesMale = males.map((e) => e.age).filter((n): n is number => n != null);
  const agesFemale = females.map((e) => e.age).filter((n): n is number => n != null);
  const prevAges = previous.employees
    .map((e) => e.age)
    .filter((n): n is number => n != null);
  const seniorities = current.employees
    .map((e) => e.lengthOfService)
    .filter((n): n is number => n != null);
  const prevSeniorities = previous.employees
    .map((e) => e.lengthOfService)
    .filter((n): n is number => n != null);

  const ageBands = [
    { label: '<25', value: ages.filter((a) => a < 25).length },
    { label: '25-34', value: ages.filter((a) => a >= 25 && a < 35).length },
    { label: '35-44', value: ages.filter((a) => a >= 35 && a < 45).length },
    { label: '45-54', value: ages.filter((a) => a >= 45 && a < 55).length },
    { label: '55+', value: ages.filter((a) => a >= 55).length },
  ];
  const seniorityBands = [
    { label: '<1 yr', value: seniorities.filter((y) => y < 1).length },
    { label: '1-2 yrs', value: seniorities.filter((y) => y >= 1 && y < 2).length },
    { label: '2-5 yrs', value: seniorities.filter((y) => y >= 2 && y < 5).length },
    { label: '5-10 yrs', value: seniorities.filter((y) => y >= 5 && y < 10).length },
    { label: '10+ yrs', value: seniorities.filter((y) => y >= 10).length },
  ];

  const hiresByMonth = { ...computed.hiresByMonth };
  const exitsByMonth = { ...computed.exitsByMonth };
  if (hasEngCurrent) {
    hiresByMonth[current.month] = hiresList;
    exitsByMonth[current.month] = exitsList;
  }
  if (hasEngPrev) {
    hiresByMonth[previous.month] = previous.hiresInMonth.map((r) =>
      engagementToHireList(r, 'Embauche'),
    );
    exitsByMonth[previous.month] = previous.exitsInMonth.map((r) =>
      engagementToHireList(r, (r.terminationReason || '').trim() || 'Sortie'),
    );
  }

  const exitsByReasonMap = new Map<string, number>();
  for (const e of exitsList) {
    const label = (e.reason || '').trim() || 'Non renseigné';
    exitsByReasonMap.set(label, (exitsByReasonMap.get(label) ?? 0) + 1);
  }
  const exitsByReason = [...exitsByReasonMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  return {
    ...computed,
    headcount,
    prevHeadcount,
    hires,
    prevHires: prevHires ?? null,
    exits: exitsCount,
    prevExits: prevExits ?? null,
    hiresList,
    exitsList,
    presentList,
    joinersList,
    leaversList,
    turnoverPct,
    prevTurnoverPct,
    attritionPct,
    prevAttritionPct,
    genderMale,
    genderFemale,
    genderMalePct,
    genderFemalePct,
    prevGenderMalePct,
    prevGenderFemalePct,
    averageAge: avg(ages),
    prevAverageAge: avg(prevAges),
    averageAgeMale: avg(agesMale),
    averageAgeFemale: avg(agesFemale),
    averageSeniorityYears: avg(seniorities),
    prevAverageSeniorityYears: avg(prevSeniorities),
    ageBands,
    seniorityBands,
    hiresByMonth,
    exitsByMonth,
    exitsByReason: hasEngCurrent ? exitsByReason : computed.exitsByReason,
  };
}
