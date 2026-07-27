/** Feuilles Village — inventaire maisons & tailles (fichier EMPLOYEE.xlsx). */

export const TAILLE_SHEET = 'TAILLE';
export const MAISON_SHEET = 'MAISON';
/** Historique des affectations / libérations de maisons. */
export const AFFECTATION_HISTO_SHEET = 'AFFECTATION_HISTO';
/** Suggestions d’affectation pour maisons vides. */
export const SUGGESTION_AFFECTATION_SHEET = 'SUGGESTION_AFFECTATION';

/** Ligne d’en-tête 0-based ; données à partir de 1. */
export const TAILLE_DATA_START = 1;
export const MAISON_DATA_START = 1;
export const AFFECTATION_HISTO_DATA_START = 1;
export const SUGGESTION_AFFECTATION_DATA_START = 1;

export const TAILLE_COL = {
  code: 0,
  label: 1,
  capacite: 2,
  commentaires: 3,
} as const;

export const MAISON_COL = {
  numero: 0,
  taille: 1,
  typeMaison: 2,
  commentaires: 3,
  occupantExterne: 4,
} as const;

export const AFFECTATION_HISTO_COL = {
  date: 0,
  action: 1,
  matricule: 2,
  nom: 3,
  numeroVilla: 4,
  typeMaison: 5,
  ancienNumero: 6,
  raison: 7,
  commentaire: 8,
} as const;

export const SUGGESTION_AFFECTATION_COL = {
  id: 0,
  numeroVilla: 1,
  matricule: 2,
  nom: 3,
  commentaire: 4,
  createdAt: 5,
} as const;

export const TAILLE_HEADERS = ['Code', 'Libellé', 'Capacité', 'Commentaires'] as const;
export const MAISON_HEADERS = [
  'Numero',
  'Taille',
  'Type de maison',
  'Commentaires',
  'Occupant externe',
] as const;
export const AFFECTATION_HISTO_HEADERS = [
  'Date',
  'Action',
  'Matricule',
  'Nom',
  'Numero Villa',
  'Type maison',
  'Ancien numero',
  'Raison',
  'Commentaire',
] as const;
export const SUGGESTION_AFFECTATION_HEADERS = [
  'Id',
  'Numero Villa',
  'Matricule',
  'Nom',
  'Commentaire',
  'Date creation',
] as const;
