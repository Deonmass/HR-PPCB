import { parseDisplayDateParts } from './employee-columns';
import type {
  CongeEmployeeRecord,
  CongeEmployeeView,
  CongeGradeRow,
  CongeHrIdentity,
  CongeSeniorityBand,
  CongeStoredDayCode,
  LeaveCode,
} from './conge-types';
import {
  DEFAULT_CONGE_GRADES,
  DEFAULT_CONGE_SENIORITY_BANDS,
  isCongeStoredDayCode,
  isLeaveCode,
} from './conge-types';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function isoFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseIsoDateUtc(iso: string): Date | null {
  const m = ISO_DATE_RE.exec(String(iso || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, month - 1, d));
  if (
    dt.getUTCFullYear() !== y
    || dt.getUTCMonth() !== month - 1
    || dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

/** Convertit une date RH (`DD/MM/YYYY`) ou ISO vers `YYYY-MM-DD`. */
export function toCongeIsoDate(value: string): string {
  const s = String(value || '').trim();
  if (!s) return '';
  if (ISO_DATE_RE.test(s)) return s.slice(0, 10);
  const parts = parseDisplayDateParts(s);
  if (parts) return isoFromParts(parts.y, parts.m, parts.d);
  return '';
}

export function utcWeekday(iso: string): number | null {
  const dt = parseIsoDateUtc(iso);
  return dt ? dt.getUTCDay() : null;
}

/** Dimanche : cellule structurellement vide. */
export function isSundayIso(iso: string): boolean {
  return utcWeekday(iso) === 0;
}

/** Samedi ouvrable (IN par défaut après embauche). */
export function isSaturdayIso(iso: string): boolean {
  return utcWeekday(iso) === 6;
}

export function isWorkingDayIso(iso: string): boolean {
  const dow = utcWeekday(iso);
  return dow != null && dow !== 0;
}

export function compareIsoDates(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isOnOrAfterHire(iso: string, appointmentDate: string): boolean {
  const hire = toCongeIsoDate(appointmentDate);
  if (!hire) return true;
  return iso >= hire;
}

/**
 * YEARFRAC Excel basis 1 (actual/actual).
 * Même année : (end-start) / 365 ou 366 si bissextile.
 * Plusieurs années : (end-start) / moyenne des longueurs d’années civiles de startYear à endYear inclus.
 */
export function yearFracActualExcel(startIso: string, endIso: string): number {
  const start = parseIsoDateUtc(toCongeIsoDate(startIso));
  const end = parseIsoDateUtc(toCongeIsoDate(endIso));
  if (!start || !end) return 0;
  if (end.getTime() === start.getTime()) return 0;
  if (end.getTime() < start.getTime()) return -yearFracActualExcel(endIso, startIso);

  const msPerDay = 86400000;
  const days = Math.round((end.getTime() - start.getTime()) / msPerDay);
  const y1 = start.getUTCFullYear();
  const y2 = end.getUTCFullYear();

  if (y1 === y2) {
    const leap = isLeapYear(y1);
    return days / (leap ? 366 : 365);
  }

  const years = y2 - y1 + 1;
  const spanDays = Math.round(
    (Date.UTC(y2 + 1, 0, 1) - Date.UTC(y1, 0, 1)) / msPerDay,
  );
  return days / (spanDays / years);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Ancienneté au 01/01 de l’exercice : `MAX(0, YEARFRAC(embauche, DATE(year,1,1), 1))`. */
export function seniorityYearsAsOfJan1(appointmentDate: string, exerciseYear: number): number {
  const hire = toCongeIsoDate(appointmentDate);
  if (!hire) return 0;
  const asOf = isoFromParts(exerciseYear, 1, 1);
  return Math.max(0, yearFracActualExcel(hire, asOf));
}

export function normalizeGradeId(grade: string): string {
  return String(grade || '').trim().toUpperCase();
}

export function findGradeRow(
  grade: string,
  grades: CongeGradeRow[] = DEFAULT_CONGE_GRADES,
): CongeGradeRow | undefined {
  const id = normalizeGradeId(grade);
  if (!id) return undefined;
  return grades.find((row) => normalizeGradeId(row.grade) === id);
}

export function gradeDaysPerMonth(
  grade: string,
  grades: CongeGradeRow[] = DEFAULT_CONGE_GRADES,
): number {
  const row = findGradeRow(grade, grades);
  if (!row) return 0;
  if (Number.isFinite(row.joursParMois) && row.joursParMois !== 0) return row.joursParMois;
  return row.joursAnnuels / 12;
}

export function gradeYearLimit(
  grade: string,
  grades: CongeGradeRow[] = DEFAULT_CONGE_GRADES,
): number | null {
  const row = findGradeRow(grade, grades);
  if (!row) return null;
  return Number.isFinite(row.limiteAnnee) ? row.limiteAnnee : null;
}

/**
 * Extra mensuel d’ancienneté : VLOOKUP TRUE sur les tranches (plus grand minYears ≤ ancienneté).
 */
export function seniorityExtraPerMonth(
  seniorityYears: number,
  bands: CongeSeniorityBand[] = DEFAULT_CONGE_SENIORITY_BANDS,
): number {
  if (!Number.isFinite(seniorityYears) || seniorityYears < 0 || !bands.length) return 0;
  const sorted = [...bands].sort((a, b) => a.minYears - b.minYears);
  let match: CongeSeniorityBand | undefined;
  for (const band of sorted) {
    if (band.minYears <= seniorityYears) match = band;
    else break;
  }
  if (!match) return 0;
  if (Number.isFinite(match.extraPerMonth)) return match.extraPerMonth;
  return match.extraDaysPerYear / 12;
}

/** Augmentation = (jours/mois grade) + (extra tranche 3 ans)/12. */
export function monthlyAccrual(
  grade: string,
  seniorityYears: number,
  grades: CongeGradeRow[] = DEFAULT_CONGE_GRADES,
  bands: CongeSeniorityBand[] = DEFAULT_CONGE_SENIORITY_BANDS,
): number {
  return gradeDaysPerMonth(grade, grades) + seniorityExtraPerMonth(seniorityYears, bands);
}

/** Plafond de grade : `MIN(limite, raw)` — le solde peut rester négatif (pas de plancher à 0). */
export function capLeaveBalance(raw: number, grade: string, grades: CongeGradeRow[] = DEFAULT_CONGE_GRADES): number {
  if (!Number.isFinite(raw)) return 0;
  const limit = gradeYearLimit(grade, grades);
  if (limit == null) return raw;
  return Math.min(limit, raw);
}

export function excelSexeToGender(sexe: string): string {
  const v = String(sexe || '').trim().toUpperCase();
  if (v === 'H' || v === 'M' || v === 'MALE' || v.startsWith('HOM')) return 'Male';
  if (v === 'F' || v === 'FEMALE' || v.startsWith('FEM')) return 'Female';
  return String(sexe || '').trim();
}

export function overlayCongeIdentity(
  record: CongeEmployeeRecord,
  hr: CongeHrIdentity | undefined,
): CongeEmployeeView {
  if (!hr) {
    return {
      matricule: record.matricule,
      nom: record.nom,
      departement: record.departement,
      grade: record.grade,
      jobTitle: record.position,
      gender: excelSexeToGender(record.sexe),
      appointmentDate: record.appointmentDate,
      fromHr: false,
      sexe: record.sexe,
      position: record.position,
      openingBalance: record.openingBalance,
      days: record.days,
    };
  }
  const appointmentDate = toCongeIsoDate(hr.appointmentDate) || record.appointmentDate;
  return {
    matricule: record.matricule,
    nom: hr.nom.trim() || record.nom,
    departement: hr.departement.trim() || hr.departmentHr?.trim() || record.departement,
    grade: hr.grade.trim() || hr.patersonGrade?.trim() || record.grade,
    jobTitle: hr.jobTitle.trim() || hr.position?.trim() || record.position,
    gender: hr.gender.trim() || excelSexeToGender(record.sexe),
    appointmentDate,
    fromHr: true,
    sexe: record.sexe,
    position: record.position,
    openingBalance: record.openingBalance,
    days: record.days,
  };
}

/**
 * Code effectif d’un jour :
 * - dimanche ou avant embauche → vide
 * - code stocké (non-IN) sinon
 * - sinon IN (lun–sam après embauche)
 */
export function resolveDayCode(
  iso: string,
  appointmentDate: string,
  days: Record<string, CongeStoredDayCode>,
): LeaveCode | '' {
  if (!ISO_DATE_RE.test(iso)) return '';
  if (isSundayIso(iso)) return '';
  if (!isOnOrAfterHire(iso, appointmentDate)) return '';
  const stored = days[iso];
  if (stored && isCongeStoredDayCode(stored)) return stored;
  return 'IN';
}

export function normalizeDayCodeInput(raw: unknown): LeaveCode | '' {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) return '';
  return isLeaveCode(v) ? v : '';
}

export function countAlDays(
  days: Record<string, CongeStoredDayCode>,
  rangeStart: string,
  rangeEnd: string,
): number {
  let n = 0;
  for (const [iso, code] of Object.entries(days)) {
    if (code !== 'AL') continue;
    if (iso < rangeStart || iso > rangeEnd) continue;
    n += 1;
  }
  return n;
}

export function eachIsoDateInclusive(rangeStart: string, rangeEnd: string): string[] {
  const start = parseIsoDateUtc(rangeStart);
  const end = parseIsoDateUtc(rangeEnd);
  if (!start || !end || end.getTime() < start.getTime()) return [];
  const out: string[] = [];
  const cur = new Date(start.getTime());
  while (cur.getTime() <= end.getTime()) {
    out.push(isoFromParts(cur.getUTCFullYear(), cur.getUTCMonth() + 1, cur.getUTCDate()));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function monthRangeIso(year: number, month: number): { start: string; end: string } {
  const start = isoFromParts(year, month, 1);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start, end: isoFromParts(year, month, last) };
}

export const CONGE_MONTH_LABELS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
] as const;

export function formatIsoFr(iso: string): string {
  const s = String(iso || '').trim();
  if (!ISO_DATE_RE.test(s)) return s || '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export function formatCongeNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : digits,
    maximumFractionDigits: digits,
  });
}

export function localTodayIso(): string {
  const d = new Date();
  return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Aujourd’hui si dans la plage, sinon le dernier jour du planning. */
export function clampAsOfIso(rangeStart: string, rangeEnd: string, today = localTodayIso()): string {
  if (today < rangeStart) return rangeStart;
  if (today > rangeEnd) return rangeEnd;
  return today;
}

export function monthsInIsoRange(rangeStart: string, rangeEnd: string): Array<{
  year: number;
  month: number;
  start: string;
  end: string;
  label: string;
}> {
  const start = parseIsoDateUtc(rangeStart);
  const end = parseIsoDateUtc(rangeEnd);
  if (!start || !end || end.getTime() < start.getTime()) return [];
  const out: Array<{ year: number; month: number; start: string; end: string; label: string }> = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    const range = monthRangeIso(y, m);
    out.push({
      year: y,
      month: m,
      start: range.start < rangeStart ? rangeStart : range.start,
      end: range.end > rangeEnd ? rangeEnd : range.end,
      label: `${CONGE_MONTH_LABELS_FR[m - 1]} ${y}`,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Solde au début du mois `month` (1–12), puis après application du mois.
 * Reproduit Excel : Solde M = MIN(limite, solde_début_M-1 + augmentation − COUNTIF(jours M-1, "AL")).
 * Solde Janvier = MIN(limite, openingBalance) sans accrual de janvier.
 */
export function monthStartBalance(
  employee: Pick<CongeEmployeeRecord, 'grade' | 'appointmentDate' | 'openingBalance' | 'days'>,
  exerciseYear: number,
  month: number,
  grades: CongeGradeRow[] = DEFAULT_CONGE_GRADES,
  bands: CongeSeniorityBand[] = DEFAULT_CONGE_SENIORITY_BANDS,
): number {
  const seniority = seniorityYearsAsOfJan1(employee.appointmentDate, exerciseYear);
  const accrual = monthlyAccrual(employee.grade, seniority, grades, bands);
  let balance = capLeaveBalance(employee.openingBalance, employee.grade, grades);
  const target = Math.min(12, Math.max(1, Math.trunc(month)));
  for (let m = 1; m < target; m += 1) {
    const { start, end } = monthRangeIso(exerciseYear, m);
    const al = countAlDays(employee.days, start, end);
    balance = capLeaveBalance(balance + accrual - al, employee.grade, grades);
  }
  return balance;
}

export function monthEndBalance(
  employee: Pick<CongeEmployeeRecord, 'grade' | 'appointmentDate' | 'openingBalance' | 'days'>,
  exerciseYear: number,
  month: number,
  grades: CongeGradeRow[] = DEFAULT_CONGE_GRADES,
  bands: CongeSeniorityBand[] = DEFAULT_CONGE_SENIORITY_BANDS,
): number {
  const start = monthStartBalance(employee, exerciseYear, month, grades, bands);
  const seniority = seniorityYearsAsOfJan1(employee.appointmentDate, exerciseYear);
  const accrual = monthlyAccrual(employee.grade, seniority, grades, bands);
  const { start: from, end: to } = monthRangeIso(exerciseYear, month);
  const al = countAlDays(employee.days, from, to);
  return capLeaveBalance(start + accrual - al, employee.grade, grades);
}
