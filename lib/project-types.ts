export type ProjectStatus = 'Terminé' | 'En cours' | 'Non debuté' | 'Closed' | string;

export interface BudgetRow {
  categorie?: string;
  secteur?: string;
  prevus: number;
  depense: number;
  ecart: number;
}

export interface ProjectEffectifs {
  total: number;
  termine: number;
  encours: number;
  nonDebute: number;
}

export interface ProjectDashboard {
  fiscalYear: string;
  title: string;
  effectifs: ProjectEffectifs;
  budgetByStatus: BudgetRow[];
  sectors: {
    effectifs: {
      total: number;
      counts: Record<string, number>;
    };
    budget: BudgetRow[];
  };
  byLocation?: Array<{
    lieu: string;
    nombre: number;
    prevus: number;
    depense: number;
    ecart: number;
  }>;
}

/** Historique des changements d’évolution (%) et de commentaire. */
export interface ProjectHistoryEntry {
  id: string;
  at: string;
  field: 'evolution' | 'commentaire';
  from: string | number | null;
  to: string | number | null;
}

export interface ProjectRecord {
  id: string;
  numero: number | null;
  name: string;
  lieu: string;
  secteur: string;
  typeProjet: string;
  sousActivite: string;
  annee: string;
  dateDebut: string;
  dateFin: string;
  responsable: string;
  budgetPrevu: number | null;
  budgetDepense: number;
  budgetPrevuVerifie?: boolean;
  ecart: number | null;
  pctBudget: number | null;
  /** Avancement 0–100 ; pilote le statut. */
  evolution: number;
  commentaire: string;
  history: ProjectHistoryEntry[];
  statut: ProjectStatus;
}

export interface ProjectExpense {
  id: string;
  numero: number;
  date: string;
  projet: string;
  motif: string;
  montant: number;
}

export interface ProjectsData {
  source: string;
  importedAt: string;
  dashboards: {
    csr: ProjectDashboard;
    cc: ProjectDashboard;
  };
  projects: ProjectRecord[];
  expenses: ProjectExpense[];
}
