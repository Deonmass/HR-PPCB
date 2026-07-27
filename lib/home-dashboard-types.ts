import type { TravelHistoryDashboard } from './travel-history-types';

export type HomeKpiColor = 'red' | 'cyan' | 'violet' | 'green' | 'orange' | 'slate';

export interface HomeKpi {
  label: string;
  value: string | number;
  meta?: string;
  color: HomeKpiColor;
}

export interface HomeEmployesSection {
  total: number;
  departments: number;
  avgCompletion: number;
  needsAttention: number;
  href: string;
}

export interface HomeDependantsSection {
  totalBeneficiaires: number;
  employes: number;
  conjoints: number;
  enfants: number;
  employesAvecFamille: number;
  employesSeuls: number;
  href: string;
}

export interface HomeDocumentsSection {
  totalEmployee: number;
  conformeRate: string;
  noConformeRate: string;
  departments: Array<{ name: string; rate: string | number }>;
  href: string;
}

export interface HomeProjectScopeSummary {
  label: string;
  total: number;
  enCours: number;
  termines: number;
  prevu: number;
  depense: number;
}

export interface HomeProjectsSection {
  scopes: HomeProjectScopeSummary[];
  projectCount: number;
  expenseCount: number;
  expensesTotal: number;
  hrefDashboard: string;
  hrefProjects: string;
  hrefExpenses: string;
}

export interface HomeTravelSection {
  dashboard: TravelHistoryDashboard;
  hrefHistorique: string;
  hrefEtablir: string;
}

export interface HomeSettingsSection {
  departments: number;
  costCenters: number;
  users: number;
  activeUsers: number;
  hrefDepartements: string;
  hrefCentres: string;
  hrefUtilisateurs: string;
  hrefPermissions: string;
}

export interface HomeModulePlaceholder {
  label: string;
  description: string;
  href: string;
}

export interface HomeDashboardData {
  kpis: HomeKpi[];
  employes?: HomeEmployesSection;
  dependants?: HomeDependantsSection;
  documents?: HomeDocumentsSection;
  projects?: HomeProjectsSection;
  travel?: HomeTravelSection;
  settings?: HomeSettingsSection;
  placeholders: HomeModulePlaceholder[];
}
