export type DocStatus = 'Y' | 'N' | 'NA';

export interface EmployeeDocuments {
  [key: string]: DocStatus | string;
}

/** Champs RH additionnels (feuille EMPLOYEE, colonnes I–AD). */
export interface EmployeeHrProfile {
  company: string;
  centreCout: string;
  appointmentDate: string;
  gender: string;
  dateOfBirth: string;
  /** Calculé (formule Excel) — lecture seule, jamais écrit. */
  age: number | null;
  nationality: string;
  maritalStatus: string;
  numberOfChildren: number | null;
  personnelArea: string;
  personnelSubArea: string;
  employeeSubGroup: string;
  payrollArea: string;
  position: string;
  departmentHr: string;
  lineManagerName: string;
  lineManagerPosition: string;
  patersonGrade: string;
  /** Active / Inactive — Inactive → feuille EXIT. */
  statut: string;
  /** CDD / CDI / Consultant / Stagiaire */
  typeContrat: string;
  /** Nombre de mois de période d'essai. */
  periodeEssaiMois: number | null;
  /** Calculé automatiquement (embauche + période d'essai). */
  dateFinPeriodeEssai: string;
  dateFinContrat: string;
  /** Demission / Licenciement / Retraite / Fin de contrat */
  raisonExit: string;
  /** Numéro CNSS */
  cnss: string;
  /** Numéro NIF */
  nif: string;
}

export interface Employee extends EmployeeHrProfile {
  matricule: string;
  nom: string;
  departement: string;
  grade: string;
  jobTitle: string;
  localisation: string;
  documents: EmployeeDocuments;
}

export function emptyEmployeeHrProfile(): EmployeeHrProfile {
  return {
    company: '',
    centreCout: '',
    appointmentDate: '',
    gender: '',
    dateOfBirth: '',
    age: null,
    nationality: '',
    maritalStatus: '',
    numberOfChildren: null,
    personnelArea: '',
    personnelSubArea: '',
    employeeSubGroup: '',
    payrollArea: '',
    position: '',
    departmentHr: '',
    lineManagerName: '',
    lineManagerPosition: '',
    patersonGrade: '',
    statut: 'Active',
    typeContrat: '',
    periodeEssaiMois: null,
    dateFinPeriodeEssai: '',
    dateFinContrat: '',
    raisonExit: 'NA',
    cnss: '',
    nif: '',
  };
}

export interface DepartmentStat {
  name: string;
  total: string | number;
  rate: string | number;
  y?: string;
  na?: string;
  n?: string;
}

export interface InspectionRow {
  critere: string;
  total: string | number;
  y: string | number;
  n: string | number;
  na: string | number;
}

export interface DashboardData {
  dashboard: {
    totalEmployee: string | number;
    conformeRate: string;
    noConformeRate: string;
    departments: DepartmentStat[];
  };
  inspections: InspectionRow[];
}

export interface DocumentField {
  key: string;
  label: string;
  short: string;
}

export interface CompletionStats {
  applicable: number;
  complete: number;
  pct: number;
  missing: number;
}
