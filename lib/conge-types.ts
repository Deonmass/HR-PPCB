/** Planning de congé (grille journalière + barème de grades). */

export const CONGE_STORE_VERSION = 1 as const;

export const LEAVE_CODES = [
  { code: 'IN', label: 'Présent', deductsBalance: false, color: '#0d9488' },
  { code: 'AL', label: 'Congé annuel', deductsBalance: true, color: '#eab308' },
  { code: 'SL', label: 'Maladie', deductsBalance: false, color: '#f97316' },
  { code: 'CL', label: 'Circonstance', deductsBalance: false, color: '#2563eb' },
  { code: 'PL', label: 'Paternité', deductsBalance: false, color: '#7c3aed' },
  { code: 'ML', label: 'Maternité', deductsBalance: false, color: '#db2777' },
  { code: 'SP', label: 'Spécial', deductsBalance: false, color: '#64748b' },
  { code: 'UL', label: 'Sans solde', deductsBalance: false, color: '#e30613' },
] as const;

export type LeaveCode = (typeof LEAVE_CODES)[number]['code'];

/** Codes persistés : tout sauf IN (défaut lun–sam après embauche). */
export type CongeStoredDayCode = Exclude<LeaveCode, 'IN'>;

export const CONGE_STORED_DAY_CODES: readonly CongeStoredDayCode[] = LEAVE_CODES
  .filter((item) => item.code !== 'IN')
  .map((item) => item.code as CongeStoredDayCode);

export interface CongeGradeRow {
  grade: string;
  categorie: string;
  joursAnnuels: number;
  joursParMois: number;
  limiteAnnee: number;
}

export interface CongeSeniorityBand {
  label: string;
  /** Seuil inférieur (ans), lookup approximatif type VLOOKUP TRUE. */
  minYears: number;
  extraDaysPerYear: number;
  extraPerMonth: number;
}

/** Snapshot Excel (identité affichée overlayée depuis le fichier RH). */
export interface CongeEmployeeRecord {
  matricule: string;
  nom: string;
  sexe: string;
  departement: string;
  position: string;
  grade: string;
  /** Date d’embauche ISO `YYYY-MM-DD`. */
  appointmentDate: string;
  /** Solde d’ouverture (constante Solde Janvier Excel, déjà plafonnée). */
  openingBalance: number;
  /** Jour ISO → code, uniquement les non-`IN`. */
  days: Record<string, CongeStoredDayCode>;
}

export interface CongeStoreData {
  version: typeof CONGE_STORE_VERSION;
  exerciseYear: number;
  rangeStart: string;
  rangeEnd: string;
  source: string;
  updatedAt: string;
  grades: CongeGradeRow[];
  seniorityBands: CongeSeniorityBand[];
  employees: CongeEmployeeRecord[];
}

export interface CongeHrIdentity {
  matricule: string;
  nom: string;
  departement: string;
  departmentHr?: string;
  grade: string;
  patersonGrade?: string;
  jobTitle: string;
  position?: string;
  gender: string;
  appointmentDate: string;
}

export interface CongeEmployeeView {
  matricule: string;
  nom: string;
  departement: string;
  grade: string;
  jobTitle: string;
  gender: string;
  appointmentDate: string;
  fromHr: boolean;
  sexe: string;
  position: string;
  openingBalance: number;
  days: Record<string, CongeStoredDayCode>;
}

export interface CongeBundle {
  exerciseYear: number;
  rangeStart: string;
  rangeEnd: string;
  source: string;
  updatedAt: string;
  grades: CongeGradeRow[];
  seniorityBands: CongeSeniorityBand[];
  employees: CongeEmployeeView[];
}

export interface CongeChartItem {
  label: string;
  value: number;
}

export type CongeDrillKind =
  | { kind: 'effectif' }
  | { kind: 'onLeave' }
  | { kind: 'onLeaveMonth' }
  | { kind: 'alDays' }
  | { kind: 'balance' }
  | { kind: 'code'; code: LeaveCode }
  | { kind: 'dept'; departement: string };

export interface CongeDayPatch {
  matricule: string;
  iso: string;
  code: string;
}

export const DEFAULT_CONGE_GRADES: CongeGradeRow[] = [
  { grade: 'B1', categorie: 'Catégorie I-V (Exécution)', joursAnnuels: 20, joursParMois: 20 / 12, limiteAnnee: 30 },
  { grade: 'B2', categorie: 'Catégorie I-V (Exécution)', joursAnnuels: 20, joursParMois: 20 / 12, limiteAnnee: 30 },
  { grade: 'B3', categorie: 'Catégorie I-V (Exécution)', joursAnnuels: 20, joursParMois: 20 / 12, limiteAnnee: 30 },
  { grade: 'B4', categorie: 'Catégorie I-V (Exécution)', joursAnnuels: 20, joursParMois: 20 / 12, limiteAnnee: 30 },
  { grade: 'B5', categorie: 'Catégorie I-V (Exécution)', joursAnnuels: 20, joursParMois: 20 / 12, limiteAnnee: 30 },
  { grade: 'C1', categorie: 'Personnel de maîtrise', joursAnnuels: 22, joursParMois: 22 / 12, limiteAnnee: 33 },
  { grade: 'C2', categorie: 'Personnel de maîtrise', joursAnnuels: 22, joursParMois: 22 / 12, limiteAnnee: 33 },
  { grade: 'C3', categorie: 'Personnel de maîtrise', joursAnnuels: 22, joursParMois: 22 / 12, limiteAnnee: 33 },
  { grade: 'C4', categorie: 'Personnel de maîtrise', joursAnnuels: 22, joursParMois: 22 / 12, limiteAnnee: 33 },
  { grade: 'C5', categorie: 'Personnel de maîtrise', joursAnnuels: 22, joursParMois: 22 / 12, limiteAnnee: 36 },
  { grade: 'D1', categorie: 'Cadre de collaboration', joursAnnuels: 24, joursParMois: 24 / 12, limiteAnnee: 36 },
  { grade: 'D2', categorie: 'Cadre de collaboration', joursAnnuels: 24, joursParMois: 24 / 12, limiteAnnee: 36 },
  { grade: 'D3', categorie: 'Cadre de collaboration', joursAnnuels: 24, joursParMois: 24 / 12, limiteAnnee: 36 },
  { grade: 'D4', categorie: 'Cadre de collaboration', joursAnnuels: 24, joursParMois: 24 / 12, limiteAnnee: 36 },
  { grade: 'D5', categorie: 'Cadre de collaboration', joursAnnuels: 24, joursParMois: 24 / 12, limiteAnnee: 36 },
  { grade: 'E1', categorie: 'Cadre de collaboration', joursAnnuels: 24, joursParMois: 24 / 12, limiteAnnee: 36 },
  { grade: 'E2', categorie: 'Cadre de collaboration', joursAnnuels: 24, joursParMois: 24 / 12, limiteAnnee: 36 },
  { grade: 'E3', categorie: 'Cadre de collaboration', joursAnnuels: 24, joursParMois: 24 / 12, limiteAnnee: 36 },
  { grade: 'E4', categorie: 'Cadre de collaboration', joursAnnuels: 24, joursParMois: 24 / 12, limiteAnnee: 36 },
];

export const DEFAULT_CONGE_SENIORITY_BANDS: CongeSeniorityBand[] = [
  { label: '0-3', minYears: 0, extraDaysPerYear: 0, extraPerMonth: 0 },
  { label: '3-6', minYears: 3, extraDaysPerYear: 1, extraPerMonth: 1 / 12 },
  { label: '6-9', minYears: 6, extraDaysPerYear: 2, extraPerMonth: 2 / 12 },
  { label: '9-12', minYears: 9, extraDaysPerYear: 3, extraPerMonth: 3 / 12 },
  { label: '12-15', minYears: 12, extraDaysPerYear: 4, extraPerMonth: 4 / 12 },
  { label: '15-18', minYears: 15, extraDaysPerYear: 5, extraPerMonth: 5 / 12 },
  { label: '18-21', minYears: 18, extraDaysPerYear: 6, extraPerMonth: 6 / 12 },
  { label: '21-24', minYears: 21, extraDaysPerYear: 7, extraPerMonth: 7 / 12 },
  { label: '24-27', minYears: 24, extraDaysPerYear: 8, extraPerMonth: 8 / 12 },
  { label: '27-30', minYears: 27, extraDaysPerYear: 9, extraPerMonth: 9 / 12 },
];

export function isLeaveCode(value: string): value is LeaveCode {
  return LEAVE_CODES.some((item) => item.code === value);
}

export function isCongeStoredDayCode(value: string): value is CongeStoredDayCode {
  return CONGE_STORED_DAY_CODES.includes(value as CongeStoredDayCode);
}

export function leaveCodeLabel(code: string): string {
  return LEAVE_CODES.find((item) => item.code === code)?.label || code || '—';
}

export function leaveCodeDeductsBalance(code: string): boolean {
  return code === 'AL';
}

export function emptyCongeStore(exerciseYear = new Date().getUTCFullYear()): CongeStoreData {
  return {
    version: CONGE_STORE_VERSION,
    exerciseYear,
    rangeStart: `${exerciseYear}-01-01`,
    rangeEnd: `${exerciseYear}-06-30`,
    source: '',
    updatedAt: new Date().toISOString(),
    grades: DEFAULT_CONGE_GRADES.map((row) => ({ ...row })),
    seniorityBands: DEFAULT_CONGE_SENIORITY_BANDS.map((row) => ({ ...row })),
    employees: [],
  };
}
