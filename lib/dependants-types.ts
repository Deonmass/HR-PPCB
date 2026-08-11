export interface Dependant {
  id: number;
  /** Matricule du chef de famille (mari) — ancre du bloc familial. */
  matricule: string;
  /**
   * Matricule employé propre du conjoint lorsqu’il/elle est aussi agent.
   * N’isole jamais la personne : le regroupement reste sur `matricule` (mari).
   * Affiché uniquement en liste pour les « Conjoint employé ».
   */
  ownMatricule?: string;
  /**
   * @deprecated Ancien modèle inversé (matricule=soi, familyMatricule=mari).
   * Migré automatiquement vers matricule=mari + ownMatricule=soi.
   */
  familyMatricule?: string;
  pactilis: string;
  statut: string;
  sexe: string;
  nom: string;
  localisation: string;
  /**
   * Colonnes ajoutées dans `EMPLOYEE.xlsx` (feuille DEPENDANTS) :
   * - pour les agents affectés à Zamba : numéro de villa au village
   * - pour catégoriser le type d’habitation
   */
  numeroVilla?: string;
  typeMaison?: string;
  dateNaissance: string;
  age: number | null;
  compositionFamille: number | null;
  enfants: number | null;
  total: number | null;
  commentaires: string;
  /** URL SharePoint du certificat de mariage (conjoint) ou acte de naissance (enfant). */
  lienDocument: string;
  employeNom: string;
  departement: string;
}

export type DependantFormData = Omit<Dependant, 'id' | 'employeNom' | 'departement' | 'age'> & {
  age?: number | null;
  numeroVilla?: string;
  typeMaison?: string;
};

export interface DependantChartItem {
  label: string;
  value: number;
}

export interface DependantLocalisationStatut {
  localisation: string;
  employe: number;
  conjoint: number;
  enfant: number;
}

export interface DependantLocalisationAge {
  localisation: string;
  mineurs: number;
  majeurs: number;
}

export interface DependantStackedSegment {
  label: string;
  value: number;
  className?: string;
}

export interface DependantStackedBar {
  label: string;
  segments: DependantStackedSegment[];
}

export interface DependantFamilleRepartition {
  bars: DependantStackedBar[];
}

export interface DependantsDashboard {
  kpis: DependantChartItem[];
  parStatut: DependantChartItem[];
  parSexe: DependantChartItem[];
  parLocalisationStatut: DependantLocalisationStatut[];
  parLocalisationAge: DependantLocalisationAge[];
  parTrancheAge: DependantChartItem[];
  familleRepartition: DependantFamilleRepartition;
  indicateurs: DependantChartItem[];
}

export interface DependantsData {
  dependants: Dependant[];
  /** Familles d'employés en EXIT (ou hors effectif actif). */
  exitedDependants: Dependant[];
  dashboard: DependantsDashboard;
}
