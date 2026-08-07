/** Historique des mouvements de personnel (affectations, promotions, etc.). */

export const MOUVEMENT_TYPES = [
  { id: 'nouvelle_affectation', label: 'Nouvelle affectation' },
  { id: 'changement_transversal', label: 'Changement transversal' },
  { id: 'promotion', label: 'Promotion' },
  { id: 'mutation_departement', label: 'Mutation département' },
  { id: 'reclassement', label: 'Reclassement' },
  { id: 'retrogradation', label: 'Rétrogradation' },
  { id: 'autre', label: 'Autre' },
] as const;

export type MouvementTypeId = (typeof MOUVEMENT_TYPES)[number]['id'];

export interface Mouvement {
  id: string;
  /** N° d’ordre affiché (séquentiel). */
  numeroOrdre: number;
  agentMatricule: string;
  agentNom: string;
  posteAvant: string;
  departementAvant: string;
  posteActuel: string;
  departementActuel: string;
  /** Date du mouvement (YYYY-MM-DD ou ISO). */
  date: string;
  type: MouvementTypeId;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface MouvementInput {
  agentMatricule: string;
  agentNom: string;
  posteAvant?: string;
  departementAvant?: string;
  posteActuel: string;
  departementActuel: string;
  date: string;
  type: MouvementTypeId;
  notes?: string;
  /** Mettre à jour le poste / dept. de l’employé (défaut true). */
  applyToEmployee?: boolean;
}

export interface MouvementsDashboard {
  total: number;
  thisMonth: number;
  thisYear: number;
  nouvellesAffectations: number;
  promotions: number;
  transversaux: number;
  parType: Array<{ label: string; count: number; id: string }>;
  parDepartementActuel: Array<{ label: string; count: number }>;
  recents: Mouvement[];
}

export function mouvementTypeLabel(type: string): string {
  return MOUVEMENT_TYPES.find((t) => t.id === type)?.label || type || '—';
}

export function isMouvementTypeId(value: string): value is MouvementTypeId {
  return MOUVEMENT_TYPES.some((t) => t.id === value);
}
