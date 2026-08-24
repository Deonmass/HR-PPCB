/** Types du formulaire « Contrat standard ». */

import type { ContractClassification } from './convention-collective-rules';

export type ContractType = 'CDD' | 'CDI';

export interface ContratDependantRow {
  /** Nom complet (Nom Post-nom Prénom) — découpé à la génération Word. */
  fullName: string;
  birthPlaceDate: string;
}

export interface ContratStandardFormData {
  matricule: string;
  employeeName: string;
  civility: 'Monsieur' | 'Madame';
  nationality: string;
  birthDate: string;
  maritalStatus: string;
  address: string;
  phone: string;
  email: string;
  cnss: string;
  identityNumber: string;
  /** Nom complet du conjoint (découpé à la génération Word). */
  spouseFullName: string;
  dependants: ContratDependantRow[];
  contractType: ContractType;
  /** Ex. « 1 an renouvelable » ou « 12 mois renouvelable » (CDD). */
  contractDurationLabel: string;
  startDate: string;
  trialMonths: number;
  jobTitle: string;
  lineManagerTitle: string;
  workLocation: string;
  classification: ContractClassification;
  /** Code catégorie ex. C1, B3… */
  categoryCode: string;
  salaryUsd: number;
  /** Taux USD → CDF (Francs congolais pour 1 USD). */
  exchangeRate: number;
  leaveDays: number;
  documentDate: string;
  /** Matricule du signataire RH (employeur). */
  signerMatricule: string;
  signerName: string;
  signerTitle: string;
}

export const EMPTY_DEPENDANT_ROW: ContratDependantRow = {
  fullName: '',
  birthPlaceDate: '',
};

export function emptyContratForm(): ContratStandardFormData {
  return {
    matricule: '',
    employeeName: '',
    civility: 'Monsieur',
    nationality: '',
    birthDate: '',
    maritalStatus: '',
    address: '',
    phone: '',
    email: '',
    cnss: '',
    identityNumber: '',
    spouseFullName: '',
    dependants: [
      { ...EMPTY_DEPENDANT_ROW },
      { ...EMPTY_DEPENDANT_ROW },
      { ...EMPTY_DEPENDANT_ROW },
      { ...EMPTY_DEPENDANT_ROW },
    ],
    contractType: 'CDD',
    contractDurationLabel: '1 an renouvelable',
    startDate: '',
    trialMonths: 5,
    jobTitle: '',
    lineManagerTitle: '',
    workLocation: '',
    classification: 'maitrise',
    categoryCode: 'C1',
    salaryUsd: 0,
    exchangeRate: 2308,
    leaveDays: 22,
    documentDate: new Date().toISOString().slice(0, 10),
    signerMatricule: '',
    signerName: '',
    signerTitle: '',
  };
}

/** CDD de 12 mois : ajoute « renouvelable » après la durée, sans le dupliquer. */
export function annotateCddDurationLabel(label: string): string {
  const raw = label.trim();
  if (!raw) return raw;
  if (/renouvelable/i.test(raw)) return raw;
  if (!/(?:^|\b)12\s*mois\b/i.test(raw)) return raw;
  return raw.replace(/12\s*mois\b/i, (match) => `${match} renouvelable`);
}
