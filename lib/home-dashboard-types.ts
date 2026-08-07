import type { TravelHistoryDashboard } from './travel-history-types';

export type HomeKpiColor = 'red' | 'cyan' | 'violet' | 'green' | 'orange' | 'slate';

export interface HomeKpi {
  label: string;
  value: string | number;
  meta?: string;
  color: HomeKpiColor;
  href?: string;
}

export interface HomeChartSlice {
  label: string;
  value: number;
  color?: string;
}

export interface HomeBarItem {
  label: string;
  value: number;
  secondary?: number;
  color?: string;
}

export interface HomeCharts {
  employeesByDepartment: HomeBarItem[];
  documentsCompliance: HomeChartSlice[];
  dependantsBreakdown: HomeChartSlice[];
  projectsBudget: HomeBarItem[];
  travelByDepartment: HomeBarItem[];
  charroiStatus: HomeChartSlice[];
  villageHouseTypes: HomeChartSlice[];
}

export interface HomeEmployesSection {
  total: number;
  departments: number;
  avgCompletion: number;
  needsAttention: number;
  active: number;
  inactive: number;
  topDepartments: HomeBarItem[];
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
  conformePct: number;
  nonConformePct: number;
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

export interface HomeCharroiSection {
  total: number;
  alertes: number;
  assuranceSoon: number;
  vignetteSoon: number;
  controleSoon: number;
  href: string;
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

export interface HomeVillageSection {
  totalMaisons: number;
  byType: HomeChartSlice[];
  hrefMaisons: string;
  guestHouse?: {
    totalRooms: number;
    onsiteRooms: number;
    occupied: number;
    empty: number;
    pendingReservations: number;
    kimpeseHotels: number;
    occupancyRate: number;
    href: string;
  };
}

export interface HomeModuleLink {
  label: string;
  href: string;
  description?: string;
  meta?: string;
}

export interface HomeFacturesSection {
  total: number;
  enCours: number;
  paid: number;
  enRetard: number;
  fournisseurs: number;
  hrefFactures: string;
  hrefSoa: string;
  hrefFournisseurs: string;
  links: HomeModuleLink[];
}

export interface HomeProtocolSection {
  links: HomeModuleLink[];
}

export interface HomeModulePlaceholder {
  label: string;
  description: string;
  href: string;
}

export interface HomeDashboardData {
  kpis: HomeKpi[];
  charts: HomeCharts;
  employes?: HomeEmployesSection;
  dependants?: HomeDependantsSection;
  documents?: HomeDocumentsSection;
  projects?: HomeProjectsSection;
  travel?: HomeTravelSection;
  charroi?: HomeCharroiSection;
  village?: HomeVillageSection;
  factures?: HomeFacturesSection;
  protocol?: HomeProtocolSection;
  settings?: HomeSettingsSection;
  placeholders: HomeModulePlaceholder[];
}

export type HomeSearchResultType =
  | 'module'
  | 'employee'
  | 'vehicle'
  | 'project'
  | 'travel'
  | 'page';

export interface HomeSearchResult {
  id: string;
  type: HomeSearchResultType;
  title: string;
  subtitle: string;
  href: string;
  meta?: string;
}

export interface HomeSearchResponse {
  query: string;
  results: HomeSearchResult[];
}
