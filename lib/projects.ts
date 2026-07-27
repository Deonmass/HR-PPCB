export {
  type BudgetRow,
  type ProjectDashboard,
  type ProjectEffectifs,
  type ProjectExpense,
  type ProjectRecord,
  type ProjectsData,
  type ProjectStatus,
} from './project-types';

import type { BudgetRow, ProjectDashboard, ProjectExpense, ProjectRecord } from './project-types';

export function formatUsd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return `${formatted} $`;
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)} %`;
}

export function getProjectTypes(projects: { typeProjet: string }[]): string[] {
  return [...new Set(projects.map((p) => p.typeProjet).filter(Boolean))].sort();
}

export function getProjectSectors(projects: { secteur: string }[]): string[] {
  return [...new Set(projects.map((p) => p.secteur).filter(Boolean))].sort();
}

export function getProjectStatuses(projects: { statut: string }[]): string[] {
  return [...new Set(projects.map((p) => p.statut).filter(Boolean))];
}

export function getExpenseProjects(expenses: { projet: string }[]): string[] {
  return [...new Set(expenses.map((e) => e.projet).filter(Boolean))].sort();
}

export function statusBadgeClass(statut: string): string {
  const s = statut.toLowerCase();
  if (s.includes('termin')) return 'badge-y';
  if (s.includes('cours')) return 'badge-na';
  return 'badge-n';
}

export function ecartClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value > 0) return 'text-success';
  if (value < 0) return 'text-danger';
  return '';
}

export const PROJECT_TYPES = ['CSR', 'Cahier de charges'] as const;
export const PROJECT_STATUTS = ['Terminé', 'En cours', 'Non debuté'] as const;

export const PROJECT_STATUS_OPTIONS = [
  { value: 'Non debuté', label: 'Non débuté' },
  { value: 'En cours', label: 'En cours' },
  { value: 'Terminé', label: 'Terminé' },
] as const;

export function formatProjectStatus(statut: string): string {
  const match = PROJECT_STATUS_OPTIONS.find(
    (option) => option.value.toLowerCase() === statut.toLowerCase(),
  );
  return match?.label ?? statut;
}

export function applyStatusAfterExpense(project: ProjectRecord): ProjectRecord {
  if (project.budgetDepense <= 0) return project;
  const normalized = project.statut.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (normalized.includes('termin')) return project;
  if (normalized.includes('cours')) return project;
  return { ...project, statut: 'En cours' };
}

export function needsBudgetPrevuVerification(
  project: Pick<ProjectRecord, 'budgetPrevu' | 'budgetDepense' | 'budgetPrevuVerifie'>,
): boolean {
  if (project.budgetPrevuVerifie) return false;
  const depense = Number(project.budgetDepense) || 0;
  if (depense <= 0) return false;
  const prevu = project.budgetPrevu;
  if (prevu === null || prevu === undefined) return true;
  return prevu === depense;
}

export function getBudgetPrevuVerificationMessage(
  project: Pick<ProjectRecord, 'budgetPrevu' | 'budgetDepense' | 'budgetPrevuVerifie'>,
): string {
  const depense = Number(project.budgetDepense) || 0;
  if (!needsBudgetPrevuVerification(project)) return '';
  if (project.budgetPrevu === null || project.budgetPrevu === undefined) {
    return 'Ce projet présente des dépenses sans budget prévu renseigné.';
  }
  if (project.budgetPrevu === depense) {
    return 'Le budget prévu est égal au budget dépensé — cochez « Projet non prévu » ou renseignez un montant distinct.';
  }
  return '';
}

export function validateBudgetPrevuVerification(project: ProjectRecord): string | null {
  if (needsBudgetPrevuVerification(project) && !project.budgetPrevuVerifie) {
    return 'Veuillez cocher « Projet non prévu » ou renseigner un budget prévu.';
  }
  return null;
}

export function recomputeProjectFields(
  budgetPrevu: number | null,
  budgetDepense: number,
): { ecart: number | null; pctBudget: number | null } {
  if (budgetPrevu === null || budgetPrevu === undefined) {
    return {
      ecart: budgetDepense ? -budgetDepense : null,
      pctBudget: null,
    };
  }
  return {
    ecart: budgetPrevu - budgetDepense,
    pctBudget: budgetPrevu > 0 ? budgetDepense / budgetPrevu : null,
  };
}

export function assignProjectNumero(
  project: ProjectRecord,
  projects: ProjectRecord[],
): ProjectRecord {
  if (project.numero !== null && project.numero !== undefined) return project;
  const maxNum = projects.reduce((max, p) => Math.max(max, p.numero ?? 0), 0);
  return { ...project, numero: maxNum + 1 };
}

export function createEmptyProject(projects: ProjectRecord[]): ProjectRecord {
  const maxNum = projects.reduce((max, p) => Math.max(max, p.numero ?? 0), 0);
  return {
    id: `p-${Date.now()}`,
    numero: maxNum + 1,
    name: '',
    lieu: '',
    secteur: '',
    typeProjet: 'CSR',
    sousActivite: '',
    annee: 'FY2026',
    dateDebut: '',
    dateFin: '',
    responsable: '',
    budgetPrevu: null,
    budgetDepense: 0,
    budgetPrevuVerifie: false,
    ecart: null,
    pctBudget: null,
    statut: 'Non debuté',
  };
}

export function normalizeProject(input: ProjectRecord): ProjectRecord {
  const budgetDepense = Number(input.budgetDepense) || 0;
  const budgetPrevuVerifie = Boolean(input.budgetPrevuVerifie);
  let budgetPrevu =
    input.budgetPrevu === null || input.budgetPrevu === undefined || Number.isNaN(Number(input.budgetPrevu))
      ? null
      : Number(input.budgetPrevu);
  if (budgetPrevuVerifie) {
    budgetPrevu = budgetDepense;
  }
  const { ecart, pctBudget } = recomputeProjectFields(budgetPrevu, budgetDepense);
  return {
    ...input,
    budgetPrevu,
    budgetDepense,
    budgetPrevuVerifie,
    ecart,
    pctBudget,
  };
}

export function isValidExpense(expense: ProjectExpense): boolean {
  return Boolean(expense.projet?.trim()) && expense.montant > 0;
}

export function filterValidExpenses(expenses: ProjectExpense[]): ProjectExpense[] {
  return expenses.filter(isValidExpense);
}

function normalizeProjectNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function sumExpensesForProject(projectName: string, expenses: ProjectExpense[]): number {
  const key = normalizeProjectNameKey(projectName);
  if (!key) return 0;
  return filterValidExpenses(expenses)
    .filter((e) => normalizeProjectNameKey(e.projet) === key)
    .reduce((sum, e) => sum + e.montant, 0);
}

export function sumExpensesByProject(expenses: ProjectExpense[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const expense of filterValidExpenses(expenses)) {
    const key = normalizeProjectNameKey(expense.projet);
    if (!key) continue;
    totals.set(key, (totals.get(key) ?? 0) + expense.montant);
  }
  return totals;
}

export function applyExpenseTotalsToProject(
  project: ProjectRecord,
  expenseTotal: number,
): ProjectRecord {
  const budgetDepense = Math.round((expenseTotal + Number.EPSILON) * 100) / 100;
  return normalizeProject({
    ...project,
    budgetDepense,
  });
}

export function applyExpenseTotalsToProjects(
  projects: ProjectRecord[],
  expenses: ProjectExpense[],
): ProjectRecord[] {
  const totals = sumExpensesByProject(expenses);
  return projects.map((project) => {
    const total = totals.get(normalizeProjectNameKey(project.name)) ?? 0;
    return applyExpenseTotalsToProject(project, total);
  });
}

export function expenseDateToInputValue(date: string): string {
  const parts = date.split('/');
  if (parts.length !== 3) return '';
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2];
  if (!/^\d{4}$/.test(year)) return '';
  return `${year}-${month}-${day}`;
}

export function inputValueToExpenseDate(value: string): string {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
}

export function parseExpenseDate(date: string): { month: number; year: number } | null {
  const parts = date.split('/');
  if (parts.length !== 3) return null;
  const month = Number(parts[1]);
  const year = Number(parts[2]);
  if (!month || !year) return null;
  return { month, year };
}

export function getExpenseYears(expenses: ProjectExpense[]): string[] {
  const years = new Set<string>();
  for (const expense of filterValidExpenses(expenses)) {
    const parsed = parseExpenseDate(expense.date);
    if (parsed) years.add(String(parsed.year));
  }
  return [...years].sort((a, b) => Number(b) - Number(a));
}

export const EXPENSE_MONTH_LABELS = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc',
];

export function aggregateExpensesByMonth(expenses: ProjectExpense[], year: string): number[] {
  const months = Array.from({ length: 12 }, () => 0);
  for (const expense of filterValidExpenses(expenses)) {
    const parsed = parseExpenseDate(expense.date);
    if (!parsed || String(parsed.year) !== year) continue;
    months[parsed.month - 1] += expense.montant;
  }
  return months;
}

export function createEmptyExpense(expenses: ProjectExpense[]): ProjectExpense {
  const maxNum = expenses.reduce((max, e) => Math.max(max, e.numero), 0);
  const today = new Date();
  const date = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  return {
    id: `e-${Date.now()}`,
    numero: maxNum + 1,
    date,
    projet: '',
    motif: 'Initial',
    montant: 0,
  };
}

export function computeSectorProjectCounts(
  projects: ProjectRecord[],
  typeProjet: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const project of projects) {
    if (project.typeProjet !== typeProjet) continue;
    const secteur = project.secteur?.trim();
    if (!secteur) continue;
    counts[secteur] = (counts[secteur] ?? 0) + 1;
  }
  return counts;
}

export function getBudgetRow(
  rows: { categorie?: string; prevus: number; depense: number }[],
  key: string,
) {
  const target = key.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return rows.find((row) => {
    const label = String(row.categorie ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return label === target;
  });
}

function normalizeStatusKey(statut: string): 'termine' | 'encours' | 'nonDebute' {
  const s = statut.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (s.includes('termin')) return 'termine';
  if (s.includes('cours')) return 'encours';
  return 'nonDebute';
}

/**
 * Dashboards are entirely derived from the live `projects` list instead of
 * being parsed from separate Excel dashboard sheets. This keeps effectifs,
 * budgets and sector breakdowns always consistent with the PROJECTS data —
 * immediately after any create/edit/delete, with no stale cached numbers.
 */
export function computeProjectDashboard(
  allProjects: ProjectRecord[],
  typeProjet: string,
  fallbackFiscalYear: string,
  title: string,
): ProjectDashboard {
  const projects = allProjects.filter((p) => p.typeProjet === typeProjet);

  const effectifs = { total: projects.length, termine: 0, encours: 0, nonDebute: 0 };
  const statusTotals: Record<'termine' | 'encours' | 'nonDebute', { prevus: number; depense: number }> = {
    termine: { prevus: 0, depense: 0 },
    encours: { prevus: 0, depense: 0 },
    nonDebute: { prevus: 0, depense: 0 },
  };
  const sectorTotals = new Map<string, { prevus: number; depense: number }>();
  const sectorCounts: Record<string, number> = {};
  const locationTotals = new Map<string, { nombre: number; prevus: number; depense: number }>();

  for (const project of projects) {
    const statusKey = normalizeStatusKey(project.statut || '');
    effectifs[statusKey] += 1;
    const prevu = project.budgetPrevu ?? 0;
    const depense = project.budgetDepense ?? 0;
    statusTotals[statusKey].prevus += prevu;
    statusTotals[statusKey].depense += depense;

    const secteur = project.secteur?.trim();
    if (secteur) {
      sectorCounts[secteur] = (sectorCounts[secteur] ?? 0) + 1;
      const agg = sectorTotals.get(secteur) ?? { prevus: 0, depense: 0 };
      agg.prevus += prevu;
      agg.depense += depense;
      sectorTotals.set(secteur, agg);
    }

    const lieu = project.lieu?.trim();
    if (lieu) {
      const agg = locationTotals.get(lieu) ?? { nombre: 0, prevus: 0, depense: 0 };
      agg.nombre += 1;
      agg.prevus += prevu;
      agg.depense += depense;
      locationTotals.set(lieu, agg);
    }
  }

  const toBudgetRow = (categorie: string, agg: { prevus: number; depense: number }): BudgetRow => ({
    categorie,
    prevus: agg.prevus,
    depense: agg.depense,
    ecart: agg.prevus - agg.depense,
  });

  const totalAgg = {
    prevus: statusTotals.termine.prevus + statusTotals.encours.prevus + statusTotals.nonDebute.prevus,
    depense: statusTotals.termine.depense + statusTotals.encours.depense + statusTotals.nonDebute.depense,
  };

  const budgetByStatus: BudgetRow[] = [
    toBudgetRow('Terminé', statusTotals.termine),
    toBudgetRow('En cours', statusTotals.encours),
    toBudgetRow('Non debuté', statusTotals.nonDebute),
    toBudgetRow('Total', totalAgg),
  ];

  const sectorBudget: BudgetRow[] = [...sectorTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([secteur, agg]) => ({
      secteur,
      prevus: agg.prevus,
      depense: agg.depense,
      ecart: agg.prevus - agg.depense,
    }));
  sectorBudget.push({
    secteur: 'TOTAL',
    prevus: totalAgg.prevus,
    depense: totalAgg.depense,
    ecart: totalAgg.prevus - totalAgg.depense,
  });

  const byLocation = [...locationTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([lieu, agg]) => ({
      lieu,
      nombre: agg.nombre,
      prevus: agg.prevus,
      depense: agg.depense,
      ecart: agg.prevus - agg.depense,
    }));

  const resolvedFiscalYear = projects.find((p) => p.annee?.trim())?.annee?.trim() || fallbackFiscalYear;

  return {
    fiscalYear: resolvedFiscalYear,
    title,
    effectifs,
    budgetByStatus,
    sectors: {
      effectifs: { total: projects.length, counts: sectorCounts },
      budget: sectorBudget,
    },
    byLocation,
  };
}
