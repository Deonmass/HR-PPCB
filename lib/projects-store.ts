import fs from 'fs/promises';
import path from 'path';
import { computeProjectDashboard, applyExpenseTotalsToProjects, applyExpenseTotalsToProject, applyStatusAfterExpense, sumExpensesForProject } from './projects';
import {
  type AoaRow,
  cloneRowStyle,
  getSheet,
  getSheetBlock,
  readWorkbook,
  saveWorkbook,
  shiftRowsUp,
  withExcelLock,
  writeRowValues,
} from './excel-io';
import type { ProjectExpense, ProjectRecord, ProjectsData } from './project-types';
import type { WorkSheet } from 'xlsx-js-style';

/**
 * `Excel/PROJECTS.xlsx` is the live database for the Project module.
 * Every read parses it fresh and every write (create/update/delete of a
 * project or an expense) is saved straight back into the workbook, so the
 * Excel file always reflects the current state of the app.
 *
 * Writes are surgical (see `lib/excel-io.ts`): only the cells that actually
 * change are touched, so the workbook's original formatting (colors, fonts,
 * column widths, etc.) is preserved instead of being reset on every save.
 *
 * Rows are matched by a hidden "sync id" column appended after the last
 * visible column of each sheet (col. 16 for PROJECTS, col. 5 for
 * "Budget expense Details"). This keeps row identity stable even though the
 * visible "N°" column is reused across different location groups in the
 * source spreadsheet and therefore isn't a safe unique key on its own.
 * Legacy rows without a sync id yet are backfilled automatically on first read.
 */

const EXCEL_PATH = process.env.PROJECTS_XLSX || path.join(process.cwd(), 'Excel', 'PROJECTS.xlsx');
const SNAPSHOT_PATH = path.join(process.cwd(), 'data', 'projects.json');

const PROJECTS_SHEET = 'PROJECTS';
const PROJECTS_DATA_START = 4;
const PROJECTS_ID_COL = 16;
const PROJECTS_VERIFIED_COL = 17;
const PROJECTS_COL_COUNT = 18;

const EXPENSES_SHEET = 'Budget expense Details';
const EXPENSES_DATA_START = 3;
const EXPENSES_ID_COL = 5;
const EXPENSES_COL_COUNT = 6;

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

interface ProjectsWorkbookState {
  wb: Awaited<ReturnType<typeof readWorkbook>>;
  projWs: WorkSheet;
  expWs: WorkSheet;
  projRows: AoaRow[];
  expRows: AoaRow[];
}

async function loadState(): Promise<ProjectsWorkbookState> {
  const wb = await readWorkbook(EXCEL_PATH);
  const projWs = getSheet(wb, PROJECTS_SHEET);
  const expWs = getSheet(wb, EXPENSES_SHEET);
  const proj = getSheetBlock(wb, PROJECTS_SHEET, PROJECTS_DATA_START);
  const exp = getSheetBlock(wb, EXPENSES_SHEET, EXPENSES_DATA_START);
  return { wb, projWs, expWs, projRows: proj.dataRows, expRows: exp.dataRows };
}

function rowToProject(row: AoaRow, absoluteIndex: number): { project: ProjectRecord; hadSyncId: boolean } {
  const existingId = str(row[PROJECTS_ID_COL]);
  const id = existingId || `p-${absoluteIndex}`;
  return {
    project: {
      id,
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
    },
    hadSyncId: Boolean(existingId),
  };
}

function deriveProgress(statut: string, existing: unknown): AoaRow[number] {
  if (existing !== '' && existing !== undefined && existing !== null) return existing as AoaRow[number];
  const s = statut.toLowerCase();
  if (s.includes('termin')) return 1;
  if (s.includes('non')) return 0;
  return '';
}

function projectToRow(project: ProjectRecord, progress: AoaRow[number]): AoaRow {
  return [
    project.numero,
    project.name,
    project.lieu,
    project.secteur,
    project.typeProjet,
    project.sousActivite,
    project.annee,
    project.dateDebut,
    project.dateFin,
    project.responsable,
    project.budgetPrevu ?? '',
    project.budgetDepense ?? 0,
    project.ecart ?? '',
    project.pctBudget ?? '',
    progress,
    project.statut,
    project.id,
    project.budgetPrevuVerifie ? 1 : 0,
  ];
}

function rowToExpense(row: AoaRow, absoluteIndex: number): { expense: ProjectExpense; hadSyncId: boolean } {
  const existingId = str(row[EXPENSES_ID_COL]);
  const id = existingId || `e-${absoluteIndex}`;
  return {
    expense: {
      id,
      numero: num(row[0]) ?? 0,
      date: str(row[1]),
      projet: str(row[2]),
      motif: str(row[3]),
      montant: num(row[4]) ?? 0,
    },
    hadSyncId: Boolean(existingId),
  };
}

function expenseToRow(expense: ProjectExpense): AoaRow {
  return [expense.numero, expense.date, expense.projet, expense.motif, expense.montant, expense.id];
}

function extractProjects(
  rows: AoaRow[],
): { projects: ProjectRecord[]; backfills: { row: number; id: string }[] } {
  const backfills: { row: number; id: string }[] = [];
  const projects: ProjectRecord[] = [];
  rows.forEach((row, i) => {
    if (!str(row[1])) return;
    const { project, hadSyncId } = rowToProject(row, i + PROJECTS_DATA_START);
    if (!hadSyncId) backfills.push({ row: i + PROJECTS_DATA_START, id: project.id });
    projects.push(project);
  });
  return { projects, backfills };
}

function extractExpenses(
  rows: AoaRow[],
): { expenses: ProjectExpense[]; backfills: { row: number; id: string }[] } {
  const backfills: { row: number; id: string }[] = [];
  const expenses: ProjectExpense[] = [];
  rows.forEach((row, i) => {
    if (num(row[0]) === null) return;
    const { expense, hadSyncId } = rowToExpense(row, i + EXPENSES_DATA_START);
    if (!hadSyncId) backfills.push({ row: i + EXPENSES_DATA_START, id: expense.id });
    expenses.push(expense);
  });
  return { expenses, backfills };
}

function findProjectRowIndex(rows: AoaRow[], id: string): number {
  return rows.findIndex((row, i) => {
    if (!str(row[1])) return false;
    const existingId = str(row[PROJECTS_ID_COL]) || `p-${i + PROJECTS_DATA_START}`;
    return existingId === id;
  });
}

function findExpenseRowIndex(rows: AoaRow[], id: string): number {
  return rows.findIndex((row, i) => {
    if (num(row[0]) === null) return false;
    const existingId = str(row[EXPENSES_ID_COL]) || `e-${i + EXPENSES_DATA_START}`;
    return existingId === id;
  });
}

function buildProjectsData(projects: ProjectRecord[], expenses: ProjectExpense[]): ProjectsData {
  const projectsWithDepense = applyExpenseTotalsToProjects(projects, expenses);
  return {
    source: EXCEL_PATH,
    importedAt: new Date().toISOString(),
    dashboards: {
      csr: computeProjectDashboard(projectsWithDepense, 'CSR', 'FY2026', 'DASHBOARD CSR'),
      cc: computeProjectDashboard(projectsWithDepense, 'Cahier de charges', 'FY2024', 'DASHBOARD CAHIER DES CHARGES'),
    },
    projects: projectsWithDepense,
    expenses,
  };
}

export interface ExpenseMutationResult {
  expense?: ProjectExpense;
  updatedProjects: ProjectRecord[];
}

function syncProjectsBudgetDepense(
  state: ProjectsWorkbookState,
  onlyNames?: Set<string>,
): ProjectRecord[] {
  const { projects } = extractProjects(state.projRows);
  const { expenses } = extractExpenses(state.expRows);
  const synced = applyExpenseTotalsToProjects(projects, expenses);
  const updated: ProjectRecord[] = [];

  synced.forEach((project, index) => {
    const original = projects[index];
    if (!original) return;

    const nameKey = project.name.trim().toLowerCase();
    if (onlyNames && !onlyNames.has(nameKey)) return;

    const withStatus = applyStatusAfterExpense(project);

    const changed =
      withStatus.budgetDepense !== original.budgetDepense ||
      withStatus.ecart !== original.ecart ||
      withStatus.pctBudget !== original.pctBudget ||
      withStatus.budgetPrevuVerifie !== original.budgetPrevuVerifie ||
      withStatus.statut !== original.statut;

    if (!changed) return;

    const idx = findProjectRowIndex(state.projRows, withStatus.id);
    if (idx < 0) return;

    const progress = deriveProgress(withStatus.statut, state.projRows[idx][14]);
    const row = projectToRow(withStatus, progress);
    writeRowValues(state.projWs, PROJECTS_DATA_START + idx, row);
    state.projRows[idx] = row;
    updated.push(withStatus);
  });

  return updated;
}

async function writeSnapshot(data: ProjectsData): Promise<void> {
  try {
    await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
    await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // Best-effort only: Excel remains the source of truth even if this snapshot write fails.
  }
}

/** Re-reads the current sheet contents (post-edit) and refreshes the JSON snapshot. */
async function buildAndSnapshot(state: ProjectsWorkbookState): Promise<ProjectsData> {
  const proj = getSheetBlock(state.wb, PROJECTS_SHEET, PROJECTS_DATA_START);
  const exp = getSheetBlock(state.wb, EXPENSES_SHEET, EXPENSES_DATA_START);
  const { projects } = extractProjects(proj.dataRows);
  const { expenses } = extractExpenses(exp.dataRows);
  const data = buildProjectsData(projects, expenses);
  await writeSnapshot(data);
  return data;
}

export async function readProjects(): Promise<ProjectsData> {
  try {
    return await withExcelLock(EXCEL_PATH, async () => {
      const state = await loadState();
      const { backfills: projBackfills } = extractProjects(state.projRows);
      const { backfills: expBackfills } = extractExpenses(state.expRows);
      if (projBackfills.length || expBackfills.length) {
        projBackfills.forEach(({ row, id }) => writeRowValues(state.projWs, row, [id], PROJECTS_ID_COL));
        expBackfills.forEach(({ row, id }) => writeRowValues(state.expWs, row, [id], EXPENSES_ID_COL));
        await saveWorkbook(state.wb, EXCEL_PATH);
      }
      return buildAndSnapshot(state);
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      try {
        const raw = await fs.readFile(SNAPSHOT_PATH, 'utf8');
        return JSON.parse(raw) as ProjectsData;
      } catch {
        // Fall through to the original error.
      }
    }
    throw err;
  }
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  const data = await readProjects();
  return data.projects.find((p) => p.id === id);
}

export async function upsertProject(project: ProjectRecord): Promise<ProjectRecord> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadState();
    const { expenses } = extractExpenses(state.expRows);
    const expenseTotal = sumExpensesForProject(project.name, expenses);
    const normalized = applyExpenseTotalsToProject(project, expenseTotal);
    const idx = findProjectRowIndex(state.projRows, normalized.id);
    const existingProgress = idx >= 0 ? state.projRows[idx][14] : '';
    const progress = deriveProgress(normalized.statut, existingProgress);
    const row = projectToRow(normalized, progress);
    if (idx >= 0) {
      writeRowValues(state.projWs, PROJECTS_DATA_START + idx, row);
    } else {
      const newRow = PROJECTS_DATA_START + state.projRows.length;
      cloneRowStyle(state.projWs, newRow - 1, newRow, 0, PROJECTS_COL_COUNT - 1);
      writeRowValues(state.projWs, newRow, row);
    }
    await saveWorkbook(state.wb, EXCEL_PATH);
    await buildAndSnapshot(state);
    return normalized;
  });
}

export async function deleteProject(id: string): Promise<boolean> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadState();
    const idx = findProjectRowIndex(state.projRows, id);
    if (idx < 0) return false;
    shiftRowsUp(state.projWs, PROJECTS_DATA_START + idx, 1);
    await saveWorkbook(state.wb, EXCEL_PATH);
    await buildAndSnapshot(state);
    return true;
  });
}

export async function upsertExpense(expense: ProjectExpense): Promise<ExpenseMutationResult> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadState();
    const idx = findExpenseRowIndex(state.expRows, expense.id);
    const previousName = idx >= 0 ? str(state.expRows[idx][2]) : '';
    const normalized: ProjectExpense = { ...expense, montant: Number(expense.montant) || 0 };
    const row = expenseToRow(normalized);
    if (idx >= 0) {
      writeRowValues(state.expWs, EXPENSES_DATA_START + idx, row);
      state.expRows[idx] = row;
    } else {
      const newRow = EXPENSES_DATA_START + state.expRows.length;
      cloneRowStyle(state.expWs, newRow - 1, newRow, 0, EXPENSES_COL_COUNT - 1);
      writeRowValues(state.expWs, newRow, row);
      state.expRows.push(row);
    }

    const namesToSync = new Set<string>();
    if (previousName.trim()) namesToSync.add(previousName.trim().toLowerCase());
    if (normalized.projet.trim()) namesToSync.add(normalized.projet.trim().toLowerCase());

    const updatedProjects = syncProjectsBudgetDepense(state, namesToSync);
    await saveWorkbook(state.wb, EXCEL_PATH);
    await buildAndSnapshot(state);
    return { expense: normalized, updatedProjects };
  });
}

export async function deleteExpense(id: string): Promise<ExpenseMutationResult | null> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadState();
    const idx = findExpenseRowIndex(state.expRows, id);
    if (idx < 0) return null;
    const previousName = str(state.expRows[idx][2]);
    shiftRowsUp(state.expWs, EXPENSES_DATA_START + idx, 1);
    state.expRows.splice(idx, 1);

    const namesToSync = new Set<string>();
    if (previousName.trim()) namesToSync.add(previousName.trim().toLowerCase());

    const updatedProjects = syncProjectsBudgetDepense(state, namesToSync);
    await saveWorkbook(state.wb, EXCEL_PATH);
    await buildAndSnapshot(state);
    return { updatedProjects };
  });
}
