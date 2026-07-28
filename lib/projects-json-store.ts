import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_PROJECT_EXPENSES_KEY,
  DURABLE_PROJECTS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import {
  applyExpenseTotalsToProject,
  applyExpenseTotalsToProjects,
  applyStatusAfterExpense,
  computeProjectDashboard,
  sumExpensesForProject,
} from './projects';
import type { ProjectExpense, ProjectRecord, ProjectsData } from './project-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import { getProjectsSnapshotPath, getProjectsWorkbookPath } from './excel-data-paths';
import {
  type AoaRow,
  getSheetBlock,
  readWorkbookForData,
  withExcelLock,
} from './excel-io';

const PROJECTS_SHEET = 'PROJECTS';
const PROJECTS_DATA_START = 4;
const PROJECTS_ID_COL = 16;
const PROJECTS_VERIFIED_COL = 17;
const EXPENSES_SHEET = 'Budget expense Details';
const EXPENSES_DATA_START = 3;
const EXPENSES_ID_COL = 5;

export interface ExpenseMutationResult {
  expense?: ProjectExpense;
  updatedProjects: ProjectRecord[];
}

function resolveStorePath(relativePath: string): string {
  if (canPersistProjectFiles()) return path.join(process.cwd(), relativePath);
  const writable = path.join(getWritableDataRoot(), relativePath.replace(/^data[\\/]/, ''));
  const bundled = path.join(process.cwd(), relativePath);
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore seed errors
  }
  return writable;
}

function projectsPath(): string {
  return resolveStorePath(path.join('data', 'projects', 'projects.json'));
}

function expensesPath(): string {
  return resolveStorePath(path.join('data', 'projects', 'expenses.json'));
}

function num(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function isTruthyFlag(value: unknown): boolean {
  return value === 1 || value === '1' || value === true;
}

async function readJsonFile<T>(repoKey: string, filePath: string, fallback: T): Promise<T> {
  await hydrateDurableFile(repoKey, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonFile(repoKey: string, filePath: string, value: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
  await persistDurableFile(repoKey, filePath);
}

function rowToProject(row: AoaRow, absoluteIndex: number): ProjectRecord | null {
  if (!str(row[1])) return null;
  return {
    id: str(row[PROJECTS_ID_COL]) || `p-${absoluteIndex}`,
    numero: num(row[0]),
    name: str(row[1]),
    lieu: str(row[2]),
    secteur: str(row[3]),
    typeProjet: str(row[4]),
    sousActivite: str(row[5]),
    annee: str(row[6]),
    dateDebut: str(row[7]),
    dateFin: str(row[8]),
    responsable: str(row[9]),
    budgetPrevu: num(row[10]),
    budgetDepense: num(row[11]) ?? 0,
    budgetPrevuVerifie: isTruthyFlag(row[PROJECTS_VERIFIED_COL]),
    ecart: num(row[12]),
    pctBudget: num(row[13]),
    statut: str(row[15]) || 'Non debuté',
  };
}

function rowToExpense(row: AoaRow, absoluteIndex: number): ProjectExpense | null {
  if (num(row[0]) === null) return null;
  return {
    id: str(row[EXPENSES_ID_COL]) || `e-${absoluteIndex}`,
    numero: num(row[0]) ?? 0,
    date: str(row[1]),
    projet: str(row[2]),
    motif: str(row[3]),
    montant: num(row[4]) ?? 0,
  };
}

async function readLegacyFromExcel(): Promise<{ projects: ProjectRecord[]; expenses: ProjectExpense[] }> {
  const excelPath = getProjectsWorkbookPath();
  return withExcelLock(excelPath, async () => {
    const wb = await readWorkbookForData(excelPath);
    const projects = getSheetBlock(wb, PROJECTS_SHEET, PROJECTS_DATA_START).dataRows
      .map((row, i) => rowToProject(row, i + PROJECTS_DATA_START))
      .filter((item): item is ProjectRecord => Boolean(item));
    const expenses = getSheetBlock(wb, EXPENSES_SHEET, EXPENSES_DATA_START).dataRows
      .map((row, i) => rowToExpense(row, i + EXPENSES_DATA_START))
      .filter((item): item is ProjectExpense => Boolean(item));
    return { projects, expenses };
  });
}

async function readLegacyFromSnapshot(): Promise<{ projects: ProjectRecord[]; expenses: ProjectExpense[] } | null> {
  try {
    const raw = await fsPromises.readFile(getProjectsSnapshotPath(), 'utf8');
    const parsed = JSON.parse(raw) as ProjectsData;
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    };
  } catch {
    return null;
  }
}

async function ensureMigrated(): Promise<void> {
  const [projectsExists, expensesExists] = await Promise.all([
    fsPromises.access(projectsPath()).then(() => true).catch(() => false),
    fsPromises.access(expensesPath()).then(() => true).catch(() => false),
  ]);
  if (projectsExists && expensesExists) return;

  let legacy = await readLegacyFromSnapshot();
  if (!legacy || (!legacy.projects.length && !legacy.expenses.length)) {
    try {
      legacy = await readLegacyFromExcel();
    } catch {
      legacy = { projects: [], expenses: [] };
    }
  }

  await Promise.all([
    writeJsonFile(DURABLE_PROJECTS_KEY, projectsPath(), { projects: legacy.projects }),
    writeJsonFile(DURABLE_PROJECT_EXPENSES_KEY, expensesPath(), { expenses: legacy.expenses }),
  ]);
}

async function readProjectsStore(): Promise<{ projects: ProjectRecord[] }> {
  return readJsonFile(DURABLE_PROJECTS_KEY, projectsPath(), { projects: [] });
}

async function readExpensesStore(): Promise<{ expenses: ProjectExpense[] }> {
  return readJsonFile(DURABLE_PROJECT_EXPENSES_KEY, expensesPath(), { expenses: [] });
}

function buildProjectsData(projects: ProjectRecord[], expenses: ProjectExpense[]): ProjectsData {
  const projectsWithDepense = applyExpenseTotalsToProjects(projects, expenses);
  return {
    source: projectsPath(),
    importedAt: new Date().toISOString(),
    dashboards: {
      csr: computeProjectDashboard(projectsWithDepense, 'CSR', 'FY2026', 'DASHBOARD CSR'),
      cc: computeProjectDashboard(projectsWithDepense, 'Cahier de charges', 'FY2024', 'DASHBOARD CAHIER DES CHARGES'),
    },
    projects: projectsWithDepense,
    expenses,
  };
}

function syncNamedProjects(
  projects: ProjectRecord[],
  expenses: ProjectExpense[],
  onlyNames?: Set<string>,
): { projects: ProjectRecord[]; updated: ProjectRecord[] } {
  const synced = applyExpenseTotalsToProjects(projects, expenses);
  const updated: ProjectRecord[] = [];
  const next = synced.map((project, index) => {
    const original = projects[index];
    if (!original) return project;
    const nameKey = project.name.trim().toLowerCase();
    if (onlyNames && !onlyNames.has(nameKey)) return original;
    const withStatus = applyStatusAfterExpense(project);
    const changed =
      withStatus.budgetDepense !== original.budgetDepense
      || withStatus.ecart !== original.ecart
      || withStatus.pctBudget !== original.pctBudget
      || withStatus.budgetPrevuVerifie !== original.budgetPrevuVerifie
      || withStatus.statut !== original.statut;
    if (!changed) return original;
    updated.push(withStatus);
    return withStatus;
  });
  return { projects: next, updated };
}

export async function readProjects(): Promise<ProjectsData> {
  await ensureMigrated();
  const [projectsStore, expensesStore] = await Promise.all([readProjectsStore(), readExpensesStore()]);
  return buildProjectsData(projectsStore.projects, expensesStore.expenses);
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  const data = await readProjects();
  return data.projects.find((p) => p.id === id);
}

export async function upsertProject(project: ProjectRecord): Promise<ProjectRecord> {
  await ensureMigrated();
  const [projectsStore, expensesStore] = await Promise.all([readProjectsStore(), readExpensesStore()]);
  const expenseTotal = sumExpensesForProject(project.name, expensesStore.expenses);
  const normalized = applyExpenseTotalsToProject(project, expenseTotal);
  const index = projectsStore.projects.findIndex((item) => item.id === normalized.id);
  if (index >= 0) projectsStore.projects[index] = normalized;
  else projectsStore.projects.push(normalized);
  await writeJsonFile(DURABLE_PROJECTS_KEY, projectsPath(), projectsStore);
  return normalized;
}

export async function deleteProject(id: string): Promise<boolean> {
  await ensureMigrated();
  const store = await readProjectsStore();
  const next = store.projects.filter((item) => item.id !== id);
  if (next.length === store.projects.length) return false;
  await writeJsonFile(DURABLE_PROJECTS_KEY, projectsPath(), { projects: next });
  return true;
}

export async function upsertExpense(expense: ProjectExpense): Promise<ExpenseMutationResult> {
  await ensureMigrated();
  const [projectsStore, expensesStore] = await Promise.all([readProjectsStore(), readExpensesStore()]);
  const index = expensesStore.expenses.findIndex((item) => item.id === expense.id);
  const previousName = index >= 0 ? expensesStore.expenses[index].projet : '';
  const normalized: ProjectExpense = { ...expense, montant: Number(expense.montant) || 0 };
  if (index >= 0) expensesStore.expenses[index] = normalized;
  else expensesStore.expenses.push(normalized);

  const namesToSync = new Set<string>();
  if (previousName.trim()) namesToSync.add(previousName.trim().toLowerCase());
  if (normalized.projet.trim()) namesToSync.add(normalized.projet.trim().toLowerCase());

  const synced = syncNamedProjects(projectsStore.projects, expensesStore.expenses, namesToSync);
  await Promise.all([
    writeJsonFile(DURABLE_PROJECT_EXPENSES_KEY, expensesPath(), expensesStore),
    writeJsonFile(DURABLE_PROJECTS_KEY, projectsPath(), { projects: synced.projects }),
  ]);
  return { expense: normalized, updatedProjects: synced.updated };
}

export async function deleteExpense(id: string): Promise<ExpenseMutationResult | null> {
  await ensureMigrated();
  const [projectsStore, expensesStore] = await Promise.all([readProjectsStore(), readExpensesStore()]);
  const index = expensesStore.expenses.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const previousName = expensesStore.expenses[index].projet;
  expensesStore.expenses.splice(index, 1);
  const namesToSync = new Set<string>();
  if (previousName.trim()) namesToSync.add(previousName.trim().toLowerCase());
  const synced = syncNamedProjects(projectsStore.projects, expensesStore.expenses, namesToSync);
  await Promise.all([
    writeJsonFile(DURABLE_PROJECT_EXPENSES_KEY, expensesPath(), expensesStore),
    writeJsonFile(DURABLE_PROJECTS_KEY, projectsPath(), { projects: synced.projects }),
  ]);
  return { updatedProjects: synced.updated };
}
