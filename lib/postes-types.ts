/** Catalogues et postes vacants — gestion des postes (fichier employés + stock vacant). */

export interface PosteOccupant {
  matricule: string;
  nom: string;
  departement: string;
  grade: string;
  localisation: string;
  jobTitle: string;
  position: string;
  statut: string;
  company: string;
  centreCout: string;
  lineManagerName: string;
  lineManagerPosition: string;
}

/** Groupe de postes issus des employés (même intitulé). */
export interface PosteGroup {
  key: string;
  title: string;
  count: number;
  departments: string[];
  /** Valeurs majoritaires dérivées des occupants. */
  department: string;
  location: string;
  grade: string;
  costCenter: string;
  reportsTo: string;
  company: string;
  occupants: PosteOccupant[];
}

export interface VacantPoste {
  id: string;
  title: string;
  department: string;
  location: string;
  grade: string;
  reportsTo: string;
  costCenter: string;
  jobDescription: string;
  jobLevel: string;
  headcount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface VacantPosteInput {
  title: string;
  department?: string;
  location?: string;
  grade?: string;
  reportsTo?: string;
  costCenter?: string;
  jobDescription?: string;
  jobLevel?: string;
  headcount?: number;
  notes?: string;
}

/** Champs poste de l’employé modifiables depuis le module Postes. */
export interface EmployeePosteUpdate {
  matricule: string;
  jobTitle: string;
  position?: string;
  departement?: string;
  departmentHr?: string;
  grade?: string;
  localisation?: string;
  centreCout?: string;
  lineManagerName?: string;
  lineManagerPosition?: string;
  patersonGrade?: string;
  company?: string;
}

/** Modification d’un poste catalogue → appliqué à tous les occupants. */
export interface CatalogPosteUpdate {
  fromTitle: string;
  title: string;
  department?: string;
  location?: string;
  grade?: string;
  costCenter?: string;
  reportsTo?: string;
  company?: string;
  /** Si true, écrit aussi le jobTitle/position renommé. */
  applyMeta?: boolean;
}

export interface PosteFieldSuggestions {
  departments: string[];
  locations: string[];
  grades: string[];
  costCenters: string[];
  reportsTo: string[];
  titles: string[];
}

export interface PostesStatRow {
  label: string;
  value: number;
  color?: string;
}

export interface PostesDashboard {
  totalPostes: number;
  totalOccupants: number;
  totalVacantSlots: number;
  monoOccupant: number;
  multiOccupant: number;
  byDepartment: PostesStatRow[];
  byLocation: PostesStatRow[];
  topPostes: PostesStatRow[];
  occupancy: PostesStatRow[];
}

export interface PostesBundle {
  titles: string[];
  groups: PosteGroup[];
  vacants: VacantPoste[];
  totalOccupied: number;
  totalVacantSlots: number;
  suggestions: PosteFieldSuggestions;
  dashboard: PostesDashboard;
}
