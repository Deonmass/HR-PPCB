/** Cas disciplinaires des agents PPC. */

export const PPC_DISCIPLINE_SANCTIONS = [
  'Avertissement verbal',
  'Avertissement écrit',
  'Blâme',
  'Mise à pied',
  'Licenciement',
  'Autre',
  'Aucune',
] as const;

export type PpcDisciplineSanction = (typeof PPC_DISCIPLINE_SANCTIONS)[number];

export const PPC_DISCIPLINE_STATUTS = [
  'Ouvert',
  "Demande d'explication",
  'Réponse reçue',
  'Clos',
] as const;

export type PpcDisciplineStatut = (typeof PPC_DISCIPLINE_STATUTS)[number];

export const PPC_DISCIPLINE_EVENT_TYPES = [
  'ouverture',
  'demande',
  'reponse',
  'sanction',
  'statut',
  'commentaire',
] as const;

export type PpcDisciplineEventType = (typeof PPC_DISCIPLINE_EVENT_TYPES)[number];

export interface PpcDisciplineEvent {
  id: string;
  type: PpcDisciplineEventType;
  auteur: string;
  texte: string;
  date: string;
  createdAt: string;
}

export interface PpcDisciplineCase {
  id: string;
  matricule: string;
  employeeName: string;
  departement: string;
  jobTitle: string;
  parti: boolean;
  dateIncident: string;
  motif: string;
  faits: string;
  demandeDate: string;
  /** Conservé pour les dossiers déjà saisis en texte. */
  demandeTexte: string;
  /** Lien vers le document de demande d'explication. */
  demandeLien: string;
  demandeEcheance: string;
  reponseDate: string;
  reponseTexte: string;
  /** Lien vers le document de réponse de l'agent. */
  reponseLien: string;
  sanction: string;
  dateSanction: string;
  statut: PpcDisciplineStatut;
  historique: PpcDisciplineEvent[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface PpcDisciplineCaseInput {
  matricule: string;
  employeeName: string;
  departement?: string;
  jobTitle?: string;
  parti?: boolean;
  dateIncident: string;
  motif: string;
  faits?: string;
  statut?: PpcDisciplineStatut;
}

export interface PpcDisciplineAgent {
  matricule: string;
  nom: string;
  departement: string;
  jobTitle: string;
  parti: boolean;
}
