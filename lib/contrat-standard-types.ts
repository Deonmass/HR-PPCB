/** Types du formulaire « Contrat standard ». */

import type { ContractClassification } from './convention-collective-rules';

export type ContractType = 'CDD' | 'CDI';

export interface ContratDependantRow {
  prenom: string;
  nom: string;
  postNom: string;
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
  spousePrenom: string;
  spouseNom: string;
  spousePostNom: string;
  dependants: ContratDependantRow[];
  contractType: ContractType;
  /** Ex. « 1 an renouvelable » (CDD). */
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
  prenom: '',
  nom: '',
  postNom: '',
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
    spousePrenom: '',
    spouseNom: '',
    spousePostNom: '',
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
    exchangeRate: 2297.5,
    leaveDays: 22,
    documentDate: new Date().toISOString().slice(0, 10),
    signerMatricule: '',
    signerName: '',
    signerTitle: '',
  };
}
