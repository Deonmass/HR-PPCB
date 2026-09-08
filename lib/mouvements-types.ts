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
  /** Date du mouvement (YYYY-MM-DD, année seule, ou ISO). */
  date: string;
  /** Année de filtre (feuille FY27 → 2026). */
  annee: number;
  /** Feuille source Excel, ex. Mvt employee-FY27. */
  sourceSheet?: string;
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

function dateSortKey(value: string): string {
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  return s;
}

function importSequence(id: string): number {
  const match = String(id).match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

/** Plus récent d’abord (année / date, puis ordre Excel). */
export function compareMouvementsByRecency(a: Mouvement, b: Mouvement): number {
  const ya = Number(a.annee) || 0;
  const yb = Number(b.annee) || 0;
  if (ya !== yb) return yb - ya;
  const da = dateSortKey(a.date);
  const db = dateSortKey(b.date);
  if (da !== db) return db.localeCompare(da);
  const seq = importSequence(b.id) - importSequence(a.id);
  if (seq !== 0) return seq;
  return String(b.agentNom).localeCompare(String(a.agentNom), 'fr', { sensitivity: 'base' });
}

/** Liste : n° 1 = plus récent, en première ligne. */
export function compareMouvementsChrono(a: Mouvement, b: Mouvement): number {
  return (a.numeroOrdre || 0) - (b.numeroOrdre || 0);
}

export function withNumeroOrdreRecentFirst(items: Mouvement[]): Mouvement[] {
  return [...items]
    .sort(compareMouvementsByRecency)
    .map((item, index) => ({ ...item, numeroOrdre: index + 1 }));
}
