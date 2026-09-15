export const SANTE_PATIENT_TYPES = [
  'AGENT',
  'ENFANT',
  'EPOUSE',
  'CONTRACTANT',
] as const;

export type SantePatientType = (typeof SANTE_PATIENT_TYPES)[number] | string;

export interface SanteVisit {
  id: string;
  date: string;
  nom: string;
  postnom: string;
  sexe: 'M' | 'F' | '';
  age: number | null;
  typeMalade: string;
  pathologie: string;
  traitement: string;
  reference: string;
  year: number;
  month: number;
  employeeMatricule: string;
  employeeNom: string;
  dependantId: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface SanteVisitInput {
  date: string;
  nom: string;
  postnom: string;
  sexe: 'M' | 'F' | '';
  age: number | null;
  typeMalade: string;
  pathologie: string;
  traitement: string;
  reference: string;
  employeeMatricule?: string;
  employeeNom?: string;
  dependantId?: number | null;
}

export interface SanteChartItem {
  label: string;
  value: number;
}

export interface SanteDashboard {
  total: number;
  hommes: number;
  femmes: number;
  references: number;
  sansReference: number;
  kpis: { label: string; value: number }[];
  byType: SanteChartItem[];
  byPathologie: SanteChartItem[];
  byTraitement: SanteChartItem[];
  byReference: SanteChartItem[];
  byMonth: SanteChartItem[];
}

export interface SantePersonHistory {
  key: string;
  label: string;
  employeeMatricule: string;
  employeeNom: string;
  typeMalade: string;
  sexe: string;
  visits: SanteVisit[];
}

export interface SanteEmployeeLite {
  matricule: string;
  nom: string;
  departement: string;
  gender?: string;
  age?: number | null;
  dateOfBirth?: string;
}

export interface SanteDependantLite {
  id: number;
  nom: string;
  sexe: string;
  statut: string;
  age: number | null;
  matricule: string;
  employeNom: string;
}
