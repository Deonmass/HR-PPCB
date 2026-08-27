/** Rapport EXCO mensuel — KPIs calculés + champs manuels (overlays). */

export type ExcoSource = 'computed' | 'manual' | 'empty';

export interface ExcoMetricValue {
  value: number | string | null;
  source: ExcoSource;
  /** Variation vs mois précédent (ratio, ex. -0.036 = -3.6 %). */
  deltaPct?: number | null;
  /** Valeur absolue du mois précédent (affichée coin bas droit). */
  prevValue?: number | string | null;
  unit?: string;
  label: string;
  key: string;
  /** Explication au survol : origine / formule de la valeur. */
  hint?: string;
}

export interface ExcoCountRow {
  label: string;
  value: number;
}

export interface ExcoSiteHeadcountRow {
  site: string;
  headcount: number;
  /** Variation vs mois précédent si disponible. */
  delta?: number | null;
}

/** Ligne d’ajout (embauche du mois) pour le modal Headcount / IN. */
export interface ExcoHireListRow {
  matricule: string;
  nom: string;
  localisation: string;
  departement: string;
  grade: string;
  genre: string;
  company: string;
  appointmentDate: string;
  /** Bucket site (Plant, HQ and Regions, Lubudi, Graduates). */
  site: string;
  /** Embauche / présent — libellé pour le modal. */
  reason?: string;
}

export interface ExcoOtDeptRow {
  department: string;
  hours: number;
  /** Coût USD — import ou manuel. */
  cost: number | null;
  costSource: ExcoSource;
  /** Heures par mois (1..12) pour capt.1 — null = vide. */
  hoursByMonth?: Array<number | null>;
}

export interface ExcoOtEmployeeRow {
  matricule: string;
  nom: string;
  department: string;
  hours: number;
  /** Coût FC (import). */
  costFc?: number | null;
  /** Coût USD (import + taux). */
  costUsd?: number | null;
  /** Leave balance jours — manuel ou import. */
  leaveBalance: number | null;
}

export interface ExcoRecruitmentRow {
  id: string;
  category: 'replacement' | 'new';
  position: string;
  grade: string;
  status: string;
  comments: string;
  budgeted: string;
  department: string;
  location: string;
  contractType: string;
}

export interface ExcoAuditFinding {
  id: string;
  number: string;
  finding: string;
  severity: 'Low' | 'Medium' | 'High' | '';
  status: 'Open' | 'Closed' | 'Overdue' | 'On going' | '';
  comments: string;
  dueDate: string;
}

export interface ExcoIsoAction {
  id: string;
  nc: string;
  correctiveAction: string;
  responsible: string;
  start: string;
  deadline: string;
  status: 'Open' | 'Closed' | '';
}

export interface ExcoCsrFy27Row {
  id: string;
  name: string;
  objective: string;
  progress: string;
  risks: string;
  nextSteps: string;
}

export type ExcoCahierIcon =
  | 'scholarship'
  | 'infrastructure'
  | 'agriculture'
  | 'leisure'
  | 'electricity';

export interface ExcoCahierHighlight {
  id: string;
  icon: ExcoCahierIcon;
  title: string;
  body: string;
  /** 0–100, used for the circular progress ring. */
  progressPct: number;
}

export interface ExcoCsrProject {
  id: string;
  name: string;
  objective: string;
  progress: string;
  risks: string;
  nextSteps: string;
  /** Provenance : module Projet ou saisie EXCO. */
  source?: 'project' | 'manual';
  typeProjet?: string;
  lieu?: string;
  secteur?: string;
  annee?: string;
  statut?: string;
  responsable?: string;
  budgetPrevu?: number | null;
  budgetDepense?: number | null;
  pctBudget?: number | null;
  dateDebut?: string;
  dateFin?: string;
}

export interface ExcoCsrSecteurRow {
  label: string;
  csr: number;
  cahier: number;
  total: number;
}

export interface ExcoCsrSummary {
  total: number;
  enCours: number;
  termines: number;
  nonDebutes: number;
  budgetPrevu: number;
  budgetDepense: number;
  byType: ExcoCountRow[];
  bySecteur: ExcoCsrSecteurRow[];
}

export interface ExcoTrainingTopic {
  id: string;
  title: string;
}

export interface ExcoManualKpis {
  staffCost?: number | null;
  leaveCost?: number | null;
  leaveBalanceAvgDays?: number | null;
  absenteeismPct?: number | null;
  volumePerEmp?: number | null;
  revenuePerEmp?: number | null;
  overtimeCost?: number | null;
  trainingCost?: number | null;
  trainingHours?: number | null;
  trainingBudget?: number | null;
  onboardingSurvey?: number | null;
  climateSurvey?: number | null;
  competencyGapCoverage?: number | null;
  successionCoverage?: number | null;
  staffCostBudgetYtd?: number | null;
  volumeBudgetYtd?: number | null;
  revenueBudgetYtd?: number | null;
  softSkillsHoursPct?: number | null;
  technicalSkillsHoursPct?: number | null;
  safetyTopicsHoursPct?: number | null;
  trainingPlantPct?: number | null;
  trainingHqPct?: number | null;
}

/** Saisie YTD Staff Cost (capture 3) — Actual + Plan Budget. */
export interface ExcoStaffCostYtdInput {
  actualHeadcount?: number | null;
  salariesActualYtd?: number | null;
  volumesActualYtd?: number | null;
  revenueActualYtd?: number | null;
  budgetHeadcount?: number | null;
  salariesBudgetYtd?: number | null;
  volumesBudgetYtd?: number | null;
  revenueBudgetYtd?: number | null;
}

/**
 * Staff cost / volume / revenue : publiés depuis New report.xlsx (Staff_Cost_KPI).
 */
export const EXCO_PUBLISH_FINANCE_KPIS = true;

const UNPUBLISHED_FINANCE_KPI_KEYS = [
  'staffCost',
  'volumePerEmp',
  'revenuePerEmp',
  'staffCostBudgetYtd',
  'volumeBudgetYtd',
  'revenueBudgetYtd',
] as const;

/** KPI manuels visibles (les 3 financiers restent en base tant que non publiés). */
export function visibleManualKpis(mk: ExcoManualKpis | undefined | null): ExcoManualKpis {
  const src = mk || {};
  if (EXCO_PUBLISH_FINANCE_KPIS) return src;
  const next: ExcoManualKpis = { ...src };
  for (const key of UNPUBLISHED_FINANCE_KPI_KEYS) {
    delete next[key];
  }
  return next;
}

/** Snapshot finance / leave saisi pour un mois (année civile). */
export type ExcoFinanceByMonth = Record<string, ExcoManualKpis>;

/** Point de tendance mensuel (année civile janvier → décembre). */
export interface ExcoTrendMonth {
  month: number;
  label: string;
  headcount: number;
  plant: number;
  hq: number;
  lubudi: number;
  graduates: number;
  genderMalePct: number | null;
  genderFemalePct: number | null;
  /** Ratio H/F hors HQ (Plant + Lubudi + Graduates). */
  genderMalePctSites: number | null;
  genderFemalePctSites: number | null;
  genderMalePctHq: number | null;
  genderFemalePctHq: number | null;
  averageAge: number | null;
  averageAgeMale: number | null;
  averageAgeFemale: number | null;
  hires: number;
  exits: number;
  turnoverPct: number | null;
  attritionPct: number | null;
  promotions: number;
  overtimeHours: number;
  staffCost: number | null;
  volumePerEmp: number | null;
  revenuePerEmp: number | null;
  leaveBalanceAvgDays: number | null;
  leaveCost: number | null;
  overtimeCost: number | null;
  leavePlantAvgDays: number | null;
  leaveHqAvgDays: number | null;
  leaveLubudiAvgDays: number | null;
  /** Provision (leave not taken) en 000 USD. */
  leaveProvisionUsd000: number | null;
}

export interface ExcoNarrative {
  meetingTitle?: string;
  meetingDate?: string;
  meetingPlace?: string;
  highlights?: string;
  lowlights?: string;
  focus?: string;
  approvalItems?: string;
  medicalCases?: string;
  /** Slide de clôture — titre principal (ex. « Et merci »). */
  thankYouTitle?: string;
  /** Slide de clôture — sous-titre / message (ex. « Thank You »). */
  thankYouMessage?: string;
}

export interface ExcoPolicyBuckets {
  expiredPendingUpdate: string[];
  submittedToExco: string[];
  pendingPublication: string[];
  underCommunication: string[];
}

export interface ExcoOverlays {
  manualKpis: ExcoManualKpis;
  /** Historique finance par mois (clé "1".."12") — année civile. */
  financeByMonth: ExcoFinanceByMonth;
  /**
   * Saisie YTD Staff Cost KPI (capture 3) par mois calendaire ("1".."12").
   * Alimente le Tableau 1 (Actual / Budget / %) via les formules New report.
   */
  staffCostYtdByMonth: Record<string, ExcoStaffCostYtdInput>;
  /**
   * Notes / formules personnalisées Staff Cost (clé cellule → texte).
   * N’altère pas le calcul ; sert à documenter / ajuster l’explication affichée.
   */
  staffCostFormulaNotes: Record<
    string,
    { explanation: string; calc: string | null; formula: string }
  >;
  narrative: ExcoNarrative;
  recruitment: ExcoRecruitmentRow[];
  auditFindings: ExcoAuditFinding[];
  isoActions: ExcoIsoAction[];
  csrProjects: ExcoCsrProject[];
  /** Slide CSR – FY27 (tableau initiatives). Vide = contenu par défaut. */
  csrFy27Rows: ExcoCsrFy27Row[];
  /** Slide Cahier des Charges (icônes + textes). Vide = contenu par défaut. */
  cahierHighlights: ExcoCahierHighlight[];
  trainingTopics: ExcoTrainingTopic[];
  upcomingTrainings: ExcoTrainingTopic[];
  policies: ExcoPolicyBuckets;
  /** Coûts OT manuels par département (clé = nom dept). */
  overtimeCostByDept: Record<string, number | null>;
  /** Soldes congés manuels par matricule. */
  leaveBalanceByMatricule: Record<string, number | null>;
  /**
   * Imports OT Excel (Component Posted Units + Leave Balances) par mois (clé "1".."12").
   * Alimente capt.1 (heures par dept / mois) et capt.2 (top agents).
   */
  overtimeImportsByMonth: Record<string, import('./exco-ot-import').ExcoOtMonthImport>;
  /**
   * Imports Leave Balances (Annual / Closing Balance) par mois — slide 6. Leaves.
   */
  leaveImportsByMonth: Record<string, import('./exco-ot-import').ExcoLeaveMonthImport>;
  /**
   * Imports New Engagements / Terminations parsés (JSON) par mois — le xlsx n’est plus conservé.
   */
  engagementsImportsByMonth: Record<
    string,
    import('./exco-engagements-parse').ExcoEngagementRow[]
  >;
  /**
   * Sources déjà importées en JSON (xlsx supprimé après traitement).
   */
  importedSources: Partial<
    Record<
      'componentPostedUnits' | 'leaveBalances' | 'engagementsTerminations',
      { importedAt: string; originalName: string }
    >
  >;
  /**
   * Snapshot complet du classeur « New report.xlsx » (source unique des chiffres).
   */
  workbookSnapshot?: import('./exco-new-report-parse').ExcoWorkbookSnapshot | null;
  /** Métadonnées de la dernière génération (pour réouverture). */
  generationMeta: {
    fxRateFcPerUsd: number | null;
    generatedAt: string;
    sourceFiles: string[];
  } | null;
}

export interface ExcoReportRecord {
  year: number;
  month: number;
  overlays: ExcoOverlays;
  updatedAt: string;
  updatedBy?: string;
}

export interface ExcoComputedBlock {
  headcount: number;
  prevHeadcount: number | null;
  hires: number;
  prevHires: number | null;
  /** Embauches du mois du rapport (date d’engagement), pour le KPI IN. */
  hiresList: ExcoHireListRow[];
  /** Embauches du mois précédent + mois courant (historique, non utilisé pour l’écart Headcount). */
  periodHireList: ExcoHireListRow[];
  /** Effectif présent fin de mois courant (listes genre). */
  presentList: ExcoHireListRow[];
  /** Présents ce mois, absents le mois précédent — vrais ajouts d’effectif. */
  joinersList: ExcoHireListRow[];
  /** Présents le mois précédent, absents ce mois — sorties nettes. */
  leaversList: ExcoHireListRow[];
  exits: number;
  prevExits: number | null;
  turnoverPct: number | null;
  prevTurnoverPct: number | null;
  attritionPct: number | null;
  prevAttritionPct: number | null;
  genderMalePct: number | null;
  genderFemalePct: number | null;
  prevGenderMalePct: number | null;
  prevGenderFemalePct: number | null;
  genderMale: number;
  genderFemale: number;
  averageAge: number | null;
  prevAverageAge: number | null;
  averageAgeMale: number | null;
  averageAgeFemale: number | null;
  averageSeniorityYears: number | null;
  prevAverageSeniorityYears: number | null;
  ageBands: ExcoCountRow[];
  seniorityBands: ExcoCountRow[];
  headcountBySite: ExcoSiteHeadcountRow[];
  exitsByReason: ExcoCountRow[];
  prevExitsByReason: ExcoCountRow[];
  /** Sorties du mois (date de fin de contrat), pour le tableau OUT. */
  exitsList: ExcoHireListRow[];
  /** Embauches par mois calendaire (1–12), pour drill-down. */
  hiresByMonth: Record<number, ExcoHireListRow[]>;
  /** Sorties par mois calendaire (1–12), pour drill-down. */
  exitsByMonth: Record<number, ExcoHireListRow[]>;
  /** Motifs de sortie cumulés YTD (jan → mois du rapport). */
  exitsByReasonYtd: ExcoCountRow[];
  promotionsYtd: number;
  promotionsThisMonth: number;
  overtimeHoursTotal: number;
  overtimeByDept: ExcoOtDeptRow[];
  overtimeTopEmployees: ExcoOtEmployeeRow[];
  employeesWithOt: number;
  vacantPostes: Array<{
    id: string;
    title: string;
    department: string;
    location: string;
    grade: string;
    headcount: number;
    notes: string;
  }>;
  docsCompliancePct: number | null;
  /** Projets CSR + Cahier des charges (module Projet), enrichis des overlays. */
  csrProjects: ExcoCsrProject[];
  csrSummary: ExcoCsrSummary;
  /** Tendances année civile janvier → décembre. */
  trends: ExcoTrendMonth[];
  /** Progression Audit HR (cumul % Closed Jan→Déc, asOf = fin de mois rapport). */
  auditProgression: Array<{
    month: string;
    closedCumul: number;
    closedPct: number;
  }>;
  auditTotal: number;
  auditClosed: number;
  auditClosedPct: number;
}

export interface ExcoReportPayload {
  year: number;
  month: number;
  periodLabel: string;
  prevPeriodLabel: string;
  computed: ExcoComputedBlock;
  overlays: ExcoOverlays;
  /** KPI summary fusionné (computed + manuel). */
  kpiSummary: ExcoMetricValue[];
  updatedAt: string | null;
  updatedBy: string | null;
  missingFields: string[];
}

export function emptyExcoOverlays(): ExcoOverlays {
  return {
    manualKpis: {},
    financeByMonth: {},
    staffCostYtdByMonth: {},
    staffCostFormulaNotes: {},
    narrative: {
      meetingTitle: 'EXCO MEETING',
      meetingDate: '',
      meetingPlace: '',
      highlights: '',
      lowlights: '',
      focus: '',
      approvalItems: '',
      medicalCases: '',
      thankYouTitle: 'Et merci',
      thankYouMessage: 'Thank You',
    },
    recruitment: [],
    auditFindings: [],
    isoActions: [],
    csrProjects: [],
    csrFy27Rows: [],
    cahierHighlights: [],
    trainingTopics: [],
    upcomingTrainings: [],
    policies: {
      expiredPendingUpdate: [],
      submittedToExco: [],
      pendingPublication: [],
      underCommunication: [],
    },
    overtimeCostByDept: {},
    leaveBalanceByMatricule: {},
    overtimeImportsByMonth: {},
    leaveImportsByMonth: {},
    engagementsImportsByMonth: {},
    importedSources: {},
    workbookSnapshot: null,
    generationMeta: null,
  };
}

export function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function formatExcoPeriodLabel(year: number, month: number): string {
  const names = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${names[month - 1] ?? month}-${String(year).slice(-2)}`;
}
