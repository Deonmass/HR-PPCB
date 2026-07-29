/** Types for Protocol — Visas de travail */

export type WorkVisaDossierStatus = 'actif' | 'inactif';

export type WorkVisaDocKind = 'passport' | 'workVisa' | 'workCard' | 'vsr';

export type WorkVisaDocStatus = 'actif' | 'expire' | 'absent';

export type WorkVisaAlertLevel = 'none' | 'm4' | 'm3' | 'm2' | 'm1' | 'today' | 'expired';

export type WorkVisaReport =
  | 'visa-valide'
  | 'visa-expire'
  | 'expat-sans-vsr'
  | 'expat-avec-vsr';

export interface WorkVisaDocumentVersion {
  id: string;
  number: string;
  /** Type de passeport (ordinaire, diplomatique, …) */
  type?: string;
  issueDate?: string;
  startDate?: string;
  expiryDate: string;
  archivedAt?: string;
}

export interface WorkVisaDocumentSlot {
  current: WorkVisaDocumentVersion | null;
  history: WorkVisaDocumentVersion[];
}

export interface WorkVisaDossier {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  centreCout: string;
  sexe: string;
  nationalite: string;
  isExpat: boolean;
  status: WorkVisaDossierStatus;
  passport: WorkVisaDocumentSlot;
  workVisa: WorkVisaDocumentSlot;
  workCard: WorkVisaDocumentSlot;
  vsr: WorkVisaDocumentSlot;
  createdAt: string;
  updatedAt: string;
}

export interface WorkVisaDocumentInput {
  number?: string;
  type?: string;
  issueDate?: string;
  startDate?: string;
  expiryDate?: string;
}

export interface WorkVisaDossierInput {
  id?: string;
  matricule: string;
  nom: string;
  prenom?: string;
  centreCout?: string;
  sexe?: string;
  nationalite?: string;
  isExpat?: boolean;
  status?: WorkVisaDossierStatus;
  passport?: WorkVisaDocumentInput | null;
  workVisa?: WorkVisaDocumentInput | null;
  workCard?: WorkVisaDocumentInput | null;
  vsr?: WorkVisaDocumentInput | null;
}

export interface WorkVisaValidity {
  daysRemaining: number | null;
  label: string;
  status: WorkVisaDocStatus;
  alertLevel: WorkVisaAlertLevel;
  alert: boolean;
}

export interface WorkVisaDossierView extends WorkVisaDossier {
  displayName: string;
  passportValidity: WorkVisaValidity;
  workVisaValidity: WorkVisaValidity;
  workCardValidity: WorkVisaValidity;
  vsrValidity: WorkVisaValidity;
  hasAnyAlert: boolean;
}

export interface WorkVisaKpis {
  total: number;
  expats: number;
  visasValides: number;
  visasExpires: number;
  passportsExpires: number;
  workCardsExpires: number;
  vsrExpires: number;
  alerts4m: number;
}

export interface WorkVisaFilterOptions {
  centresCout: string[];
  nationalites: string[];
  sexes: string[];
}

export interface WorkVisaListQuery {
  q?: string;
  centreCout?: string;
  nationalite?: string;
  sexe?: string;
  status?: WorkVisaDossierStatus | '';
  report?: WorkVisaReport | '';
  passportExpired?: boolean;
  workCardExpired?: boolean;
  vsrExpired?: boolean;
  visaExpired?: boolean;
  visaValide?: boolean;
  alert4m?: boolean;
}

export interface WorkVisaStoreData {
  meta: { version: number };
  dossiers: WorkVisaDossier[];
}

export interface WorkVisaBundle {
  dossiers: WorkVisaDossierView[];
  kpis: WorkVisaKpis;
  filters: WorkVisaFilterOptions;
}

export const WORK_VISA_DOC_LABELS: Record<WorkVisaDocKind, string> = {
  passport: 'Passeport',
  workVisa: 'Visa de travail',
  workCard: 'Carte de travail',
  vsr: 'VSR',
};

export const WORK_VISA_ALERT_DAYS = {
  m4: 120,
  m3: 90,
  m2: 60,
  m1: 30,
} as const;
