/** Colonnes feuille DEPENDANTS (avec N° Pactilis). */
export const DEP_COL = {
  id: 0,
  matricule: 1,
  pactilis: 2,
  statut: 3,
  sexe: 4,
  nom: 5,
  localisation: 6,
  dateNaissance: 7,
  age: 8,
  compositionFamille: 9,
  enfants: 10,
  total: 11,
  commentaires: 12,
  /** Lien SharePoint : certificat de mariage (conjoint) ou acte de naissance (enfant). */
  lienDocument: 13,
  /** Colonnes ajoutées : agents affectés à Zamba logés au village. */
  numeroVilla: 14,
  typeMaison: 15,
} as const;

export const DEPENDANTS_SHEET = 'DEPENDANTS';
/** Feuille export — familles d’agents sortis (EXIT). */
export const DEPENDANTS_EXIT_SHEET = 'DEPENDANTS EXIT';
export const RESUME_SHEET = 'RESUME';
export const DEPENDANTS_DATA_START = 2;

/** Libellé Excel de la colonne lien document. */
export const DEP_LIEN_DOCUMENT_HEADER = 'Lien document';

export function getDependantDocumentLinkLabel(statut: string): string {
  if (/employ/i.test(statut)) return 'Lien document employé (SharePoint)';
  if (/conjoint/i.test(statut)) return 'Lien certificat de mariage (SharePoint)';
  if (/enfant/i.test(statut)) return 'Lien acte de naissance (SharePoint)';
  return 'Lien document (SharePoint)';
}

export function dependantNeedsDocumentLink(statut: string): boolean {
  return /employ|conjoint|enfant/i.test(statut);
}
