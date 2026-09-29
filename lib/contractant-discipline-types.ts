/** Cas disciplinaires — espace contractants. */

export const CONTRACTANT_DISCIPLINE_SANCTIONS = [
  'Avertissement verbal',
  'Avertissement écrit',
  'Blâme',
  'Mise à pied',
  'Licenciement',
  'Autre',
  'Aucune',
] as const;

export type ContractantDisciplineSanction =
  (typeof CONTRACTANT_DISCIPLINE_SANCTIONS)[number];

export const CONTRACTANT_DISCIPLINE_STATUTS = [
  'Ouvert',
  'En cours',
  'Clos',
] as const;

export type ContractantDisciplineStatut =
  (typeof CONTRACTANT_DISCIPLINE_STATUTS)[number];

export interface ContractantDisciplineCase {
  id: string;
  contractantId: string;
  employeeId: string;
  employeeName: string;
  dateIncident: string;
  motif: string;
  explication: string;
  reponse: string;
  sanction: ContractantDisciplineSanction | string;
  statut: ContractantDisciplineStatut;
  commentaires: { id: string; auteur: string; texte: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface ContractantDisciplineCaseInput {
  contractantId: string;
  employeeId: string;
  employeeName: string;
  dateIncident: string;
  motif: string;
  explication?: string;
  reponse?: string;
  sanction?: string;
  statut?: ContractantDisciplineStatut;
}
