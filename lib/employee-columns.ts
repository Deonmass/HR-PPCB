/** Colonnes feuille EMPLOYEE (0-based, ligne d'en-tête = 2 → Excel row 2). */
export const EMP_COL = {
  matricule: 0,
  company: 1,
  nom: 2,
  departement: 3,
  grade: 4,
  jobTitle: 5,
  localisation: 6,
  centreCout: 7,
  appointmentDate: 8,
  gender: 9,
  dateOfBirth: 10,
  /** Formule DATEDIF — ne jamais écrire cette colonne. */
  age: 11,
  nationality: 12,
  maritalStatus: 13,
  numberOfChildren: 14,
  personnelArea: 15,
  personnelSubArea: 16,
  employeeSubGroup: 17,
  payrollArea: 18,
  position: 19,
  departmentHr: 20,
  lineManagerName: 21,
  lineManagerPosition: 22,
  patersonGrade: 23,
  /** Active / Inactive */
  statut: 24,
  /** CDD / CDI / Consultant / Stagiaire */
  typeContrat: 25,
  /** Nombre de mois de période d'essai */
  periodeEssaiMois: 26,
  /** Calculé : date d'embauche + période d'essai */
  dateFinPeriodeEssai: 27,
  dateFinContrat: 28,
  /** Demission / Licenciement / Retraite / Fin de contrat */
  raisonExit: 29,
} as const;

export const EMP_AGE_COL = EMP_COL.age;
export const EMP_LAST_COL = EMP_COL.raisonExit;

export const EMPLOYEE_MASTER_SHEET = 'EMPLOYEE';
export const EMPLOYEE_EXIT_SHEET = 'EXIT';
export const EMPLOYEE_MASTER_DATA_START = 2;

export const EMPLOYEE_STATUTS = ['Active', 'Inactive'] as const;
export type EmployeeStatut = (typeof EMPLOYEE_STATUTS)[number];

export const TYPE_CONTRATS = ['CDD', 'CDI', 'Consultant', 'Stagiaire'] as const;
export type TypeContrat = (typeof TYPE_CONTRATS)[number];

export const RAISON_EXITS = [
  'NA',
  'Demission',
  'Licenciement',
  'Retraite',
  'Fin de contrat',
] as const;
export type RaisonExit = (typeof RAISON_EXITS)[number];

/** Vraie raison de sortie (exclut NA / vide) → implique statut Inactive. */
export function isRealExitRaison(raison: string | null | undefined): boolean {
  const raw = String(raison ?? '').trim();
  if (!raw || /^na$/i.test(raw) || raw === '—') return false;
  return (RAISON_EXITS as readonly string[]).includes(raw) || Boolean(raw);
}

export const EMP_CONTRACT_HEADERS: Record<number, string> = {
  [EMP_COL.statut]: 'Statut',
  [EMP_COL.typeContrat]: 'Type de contrat',
  [EMP_COL.periodeEssaiMois]: "Periode d'essai (mois)",
  [EMP_COL.dateFinPeriodeEssai]: "Date fin periode d'essai",
  [EMP_COL.dateFinContrat]: 'Date fin contrat',
  [EMP_COL.raisonExit]: 'Raison exit',
};

const EXCEL_EPOCH_OFFSET = 25569;

export function formatExcelDateValue(value: unknown): string {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Serial Excel = jours depuis 1899-12-30, interprété en UTC pour éviter les décalages TZ
    const days = Math.floor(value);
    const date = new Date(Date.UTC(1899, 11, 30 + days));
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = date.getUTCFullYear();
    if (yyyy > 1900 && yyyy < 2100) return `${dd}/${mm}/${yyyy}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const dd = String(value.getDate()).padStart(2, '0');
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const yyyy = value.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const fr = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) {
    const dd = fr[1].padStart(2, '0');
    const mm = fr[2].padStart(2, '0');
    return `${dd}/${mm}/${fr[3]}`;
  }
  const iso = new Date(`${trimmed}T00:00:00`);
  if (!Number.isNaN(iso.getTime())) {
    const dd = String(iso.getDate()).padStart(2, '0');
    const mm = String(iso.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${iso.getFullYear()}`;
  }
  return trimmed;
}

export function parseDateToExcelSerial(value: string): number | string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const fr = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fr) {
    const date = new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]));
    if (!Number.isNaN(date.getTime())) {
      return Math.round(date.getTime() / 86400000) + EXCEL_EPOCH_OFFSET;
    }
  }
  const iso = new Date(`${trimmed}T00:00:00`);
  if (!Number.isNaN(iso.getTime())) {
    return Math.round(iso.getTime() / 86400000) + EXCEL_EPOCH_OFFSET;
  }
  return trimmed;
}

export function computeAgeFromDisplayDate(dateNaissance: string): number | null {
  const trimmed = dateNaissance.trim();
  if (!trimmed) return null;
  const fr = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  let birth: Date | null = null;
  if (fr) birth = new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]));
  else {
    const iso = new Date(`${trimmed}T00:00:00`);
    if (!Number.isNaN(iso.getTime())) birth = iso;
  }
  if (!birth || Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export type SeniorityParts = { years: number; months: number };

/** Ancienneté en années et mois complets depuis la date d'embauche (à la date `asOf`, défaut = aujourd'hui). */
export function computeSeniority(
  appointmentDate: string,
  asOf: Date = new Date(),
): SeniorityParts | null {
  const parts = parseDisplayDateParts(appointmentDate);
  if (!parts) return null;
  const hire = new Date(parts.y, parts.m - 1, parts.d);
  if (Number.isNaN(hire.getTime()) || hire.getTime() > asOf.getTime()) return null;
  let years = asOf.getFullYear() - hire.getFullYear();
  let months = asOf.getMonth() - hire.getMonth();
  if (asOf.getDate() < hire.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0 || years >= 80) return null;
  return { years, months };
}

/** Ancienneté en années complètes depuis la date d'embauche (à la date `asOf`, défaut = aujourd'hui). */
export function computeSeniorityYears(
  appointmentDate: string,
  asOf: Date = new Date(),
): number | null {
  return computeSeniority(appointmentDate, asOf)?.years ?? null;
}

/** Affichage compact : « 9 an(s) (3m) ». */
export function formatSeniority(value: SeniorityParts | null): string {
  if (!value) return '—';
  return `${value.years} an(s) (${value.months}m)`;
}

/** Libellé long pour infobulle : « 9 ans 3 mois ». */
export function formatSeniorityLabel(value: SeniorityParts | null): string {
  if (!value) return '—';
  const yLabel = value.years <= 1 ? 'an' : 'ans';
  return `${value.years} ${yLabel} ${value.months} mois`;
}

/** Année extraite d'une date affichée JJ/MM/AAAA. */
export function yearFromDisplayDate(value: string): number | null {
  const parts = parseDisplayDateParts(value);
  return parts?.y ?? null;
}

function ymdKey(year: number, month: number, day: number): number {
  return year * 10000 + month * 100 + day;
}

/** Dernier jour du mois civil (`month` = 1–12). */
export function endOfYearMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

type PresenceEmployee = {
  appointmentDate?: string;
  dateFinContrat?: string;
  statut?: string;
  raisonExit?: string;
};

function isActualDeparture(
  employee: PresenceEmployee,
  opts?: { isExit?: boolean },
): boolean {
  if (opts?.isExit) return true;
  if (/^inact/i.test(String(employee.statut || ''))) return true;
  return isRealExitRaison(employee.raisonExit);
}

/**
 * Encore en poste à la date `asOf` (dernier jour du mois pour l'effectif) :
 * embauché au plus tard ce jour-là.
 * `dateFinContrat` n'est une date de sortie que si la personne a vraiment quitté
 * (Inactive / raison d'exit / liste Exit) — pas la fin prévue d'un CDD toujours actif.
 */
export function wasPresentOnAsOf(
  employee: PresenceEmployee,
  asOf: Date,
  opts?: { isExit?: boolean },
): boolean {
  const hire = parseDisplayDateParts(employee.appointmentDate ?? '');
  if (!hire) return false;
  const asOfKey = ymdKey(asOf.getFullYear(), asOf.getMonth() + 1, asOf.getDate());
  if (ymdKey(hire.y, hire.m, hire.d) > asOfKey) return false;
  if (!isActualDeparture(employee, opts)) return true;
  const exit = parseDisplayDateParts(employee.dateFinContrat ?? '');
  if (!exit) return true;
  return ymdKey(exit.y, exit.m, exit.d) > asOfKey;
}

export function wasPresentAtEndOfYearMonth(
  employee: PresenceEmployee,
  year: number,
  month: number,
  opts?: { isExit?: boolean },
): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  return wasPresentOnAsOf(employee, endOfYearMonth(year, month), opts);
}

export function wasPresentAtEndOfYear(
  employee: PresenceEmployee,
  year: number,
  opts?: { isExit?: boolean },
): boolean {
  return wasPresentOnAsOf(employee, new Date(year, 11, 31), opts);
}

export function exitedInYearMonth(
  employee: PresenceEmployee,
  year: number,
  month: number,
): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  const exit = parseDisplayDateParts(employee.dateFinContrat ?? '');
  if (!exit) return false;
  return exit.y === year && exit.m === month;
}

export function exitedInYear(employee: PresenceEmployee, year: number): boolean {
  const exit = parseDisplayDateParts(employee.dateFinContrat ?? '');
  return exit != null && exit.y === year;
}

/**
 * Présent durant l'année civile `year` :
 * embauché au plus tard cette année, et (toujours actif OU sorti pendant/après cette année).
 */
export function wasPresentInYear(
  employee: PresenceEmployee,
  year: number,
  opts?: { isExit?: boolean },
): boolean {
  const hireYear = yearFromDisplayDate(employee.appointmentDate ?? '');
  if (hireYear == null || hireYear > year) return false;
  if (!opts?.isExit) return true;
  const exitYear = yearFromDisplayDate(employee.dateFinContrat ?? '');
  // Sans date de fin : on considère qu'il était encore là cette année
  if (exitYear == null) return true;
  return exitYear >= year;
}

/**
 * Présent à un moment du mois civil `month` (1–12) de l'année `year` :
 * embauché au plus tard la fin du mois, et (actif OU sorti à partir du début du mois).
 * Pour l'effectif au dernier jour du mois, utiliser `wasPresentAtEndOfYearMonth`.
 */
export function wasPresentInYearMonth(
  employee: PresenceEmployee,
  year: number,
  month: number,
  opts?: { isExit?: boolean },
): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  const hire = parseDisplayDateParts(employee.appointmentDate ?? '');
  if (!hire) return false;
  const hireKey = hire.y * 100 + hire.m;
  const monthKey = year * 100 + month;
  if (hireKey > monthKey) return false;
  if (!opts?.isExit) return true;
  const exit = parseDisplayDateParts(employee.dateFinContrat ?? '');
  if (!exit) return true;
  const exitKey = exit.y * 100 + exit.m;
  return exitKey >= monthKey;
}

export function parseOptionalNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

export function parseDisplayDateParts(value: string): { y: number; m: number; d: number } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const fr = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) {
    return { d: Number(fr[1]), m: Number(fr[2]), y: Number(fr[3]) };
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) };
  }
  return null;
}

/** Clé numérique YYYYMMDD pour trier une date affichée (0 si invalide). */
export function displayDateSortKey(value: string): number {
  const parts = parseDisplayDateParts(value);
  if (!parts) return 0;
  return parts.y * 10000 + parts.m * 100 + parts.d;
}

/** Date fin période d'essai = date d'embauche + N mois (supporte décimales, ex. 3.5). */
export function computeFinPeriodeEssai(
  appointmentDate: string,
  periodeEssaiMois: number | null | undefined,
): string {
  if (periodeEssaiMois == null || !Number.isFinite(periodeEssaiMois) || periodeEssaiMois < 0) {
    return '';
  }
  const parts = parseDisplayDateParts(appointmentDate);
  if (!parts) return '';

  const wholeMonths = Math.trunc(periodeEssaiMois);
  const fraction = periodeEssaiMois - wholeMonths;

  // Addition de mois sans débordement (ex. 31 jan + 1 mois → 28/29 fév).
  let year = parts.y;
  let monthIndex = parts.m - 1 + wholeMonths;
  year += Math.floor(monthIndex / 12);
  monthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
  const day = Math.min(parts.d, lastDayOfMonth);

  const date = new Date(year, monthIndex, day);
  if (Number.isNaN(date.getTime())) return '';

  if (fraction > 0) {
    // Partie décimale en jours (1 mois ≈ 30,437 jours).
    date.setDate(date.getDate() + Math.round(fraction * (365.25 / 12)));
  }

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

export function normalizeEmployeeStatut(value: unknown): EmployeeStatut {
  const raw = String(value ?? '').trim();
  if (/^inact/i.test(raw)) return 'Inactive';
  return 'Active';
}

export function todayDisplayDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
