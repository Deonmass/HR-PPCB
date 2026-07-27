export interface VillageTaille {
  code: string;
  label: string;
  capacite: number | null;
  commentaires: string;
}

export interface VillageMaison {
  numero: string;
  taille: string;
  typeMaison: string;
  commentaires: string;
  /** Nom hors effectif (ex. Nursery School) — distinct des agents. */
  occupantExterne: string;
}

export interface VillageMaisonFormData {
  numero: string;
  taille: string;
  typeMaison?: string;
  commentaires?: string;
  /** Si omis à la mise à jour, la valeur existante est conservée. */
  occupantExterne?: string;
}

export interface VillageTailleFormData {
  code: string;
  label: string;
  capacite?: number | null;
  commentaires?: string;
}

export interface VillageMaisonOccupancy extends VillageMaison {
  occupied: boolean;
  occupants: Array<{
    matricule: string;
    nom: string;
    departement: string;
    familleSize: number;
    /** Occupant hors employé (stocké sur la feuille MAISON). */
    externe?: boolean;
  }>;
  occupantCount: number;
  capacite: number | null;
}

export interface VillageDashboardStats {
  zamba: number;
  village: number;
  kimpese: number;
  /** Effectif agents + dépendants (même matricule). */
  zambaPersonnes: number;
  villagePersonnes: number;
  kimpesePersonnes: number;
  autres: number;
  maisonsTotal: number;
  maisonsOccupees: number;
  maisonsVides: number;
  parTaille: Array<{ label: string; total: number; occupees: number; vides: number }>;
  /** Matrice : départements (lignes) × tailles de maison (colonnes). */
  tailleColumns: string[];
  parDepartementTaille: Array<{
    departement: string;
    counts: Record<string, number>;
    total: number;
  }>;
  quiOu: Array<{
    matricule: string;
    nom: string;
    numeroVilla: string;
    taille: string;
    typeMaison: string;
    departement: string;
    familleSize: number;
    externe?: boolean;
  }>;
}
