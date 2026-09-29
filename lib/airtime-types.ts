export interface AirtimeGrilleRow {
  description: string;
  grade: string;
  allowanceUsd: number;
}

export interface AirtimeLineInput {
  matricule: string;
  nom: string;
  grade: string;
  centreCout: string;
  title: string;
  societe: string;
  department: string;
  place: string;
  msisdn: string;
  actualAirtime: number | null;
}

/** Personne choisie dans le formulaire Airtime (employé PPC ou contractant). */
export interface AirtimeDirectoryPerson {
  key: string;
  kind: 'ppc' | 'contractant';
  nom: string;
  matricule: string;
  societe: string;
  grade: string;
  department: string;
  centreCout: string;
  title: string;
  place: string;
  telephone: string;
}

export interface AirtimeAssignment {
  /** Index dans data/employees/airtime.json. */
  lineIndex: number;
  sr: number | null;
  matricule: string;
  /** Nom issu de la feuille Airtime (secours si hors base). */
  excelName: string;
  /** Grade feuille Airtime (secours). */
  excelGrade: string;
  excelCentreCout: string;
  excelTitle: string;
  excelSociete: string;
  excelDepartment: string;
  excelPlace: string;
  msisdn: string;
  actualAirtime: number | null;
  /** Matériel ou pool qui utilise une SIM, pas une personne. */
  simLine: boolean;
  /** Trouvé dans la base employés. */
  matched: boolean;
  /** Trouvé dans la liste des contractants (nom sans matricule PPC). */
  contractantMatched: boolean;
  contractantId: string;
  contractantEmployeeId: string;
  /** Compagnie : société de la fiche, ou dénomination du contractant. */
  compagnie: string;
  nom: string;
  grade: string;
  departement: string;
  centreCout: string;
  position: string;
  jobTitle: string;
  localisation: string;
  telephone: string;
  /** Catégorie grille (Exco Members, HOD, …). */
  grilleCategory: string;
  quotaAirtime: number | null;
  ecart: number | null;
}

export interface AirtimePhoneRenewalRow {
  id: string;
  label: string;
  quantity: number;
  unitPriceUsd: number;
  totalUsd: number;
}

export interface AirtimeDashboardStats {
  totalLines: number;
  withNumber: number;
  withoutNumber: number;
  matched: number;
  unmatched: number;
  availableNumbers: number;
  ppcTotal: number;
  ppcWithCug: number;
  ppcWithoutCug: number;
  contractantTotal: number;
  contractantWithCug: number;
  contractantWithoutCug: number;
  simLines: number;
  totalQuota: number;
  totalActual: number;
  byPlace: { place: string; count: number }[];
  byCategory: { category: string; count: number; quota: number }[];
  phoneRenewal: AirtimePhoneRenewalRow[];
  phoneRenewalTotal: number;
}

export interface AirtimeBundle {
  source: string;
  updatedAt: string;
  grille: AirtimeGrilleRow[];
  rows: AirtimeAssignment[];
  stats: AirtimeDashboardStats;
  phonesSynced: number;
}
