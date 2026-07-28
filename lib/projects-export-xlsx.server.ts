import 'server-only';

import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';
import {
  EXPORT_TEMPLATE_FILES,
  PROJECTS_EXPORT_TEMPLATE_PATH,
} from './excel-export-template-paths';
import type { ProjectExpense, ProjectRecord } from './project-types';
import { clearCellValue, setCellValue } from './xlsx-populate-utils';

type PopulateWorkbook = Awaited<ReturnType<typeof XlsxPopulate.fromFileAsync>>;
type PopulateSheet = ReturnType<PopulateWorkbook['sheet']>;

const PROJECTS_SHEET = 'PROJECTS';
const EXPENSES_SHEET = 'Budget expense Details';
const PARAMS_SHEET = 'Params';

const PROJECTS_DATA_START = 5;
/** Data columns only: B–I (2–9) + L Avancement (12). Formula cols A/J/K/M are preserved. */
const PROJECTS_DATA_COLS = [2, 3, 4, 5, 6, 7, 8, 9, 12] as const;
const EXPENSES_DATA_START = 4;
const EXPENSES_COL_COUNT = 5; // A–E
const EXPENSE_RANGE_FLOOR = 86;
const PROJECTS_FORMULA_FLOOR = 124;

function colLetter(col1Based: number): string {
  let n = col1Based;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function cellAddress(row: number, col1Based: number): string {
  return `${colLetter(col1Based)}${row}`;
}

function cellFormula(sheet: PopulateSheet, address: string): string | undefined {
  return (sheet.cell(address) as unknown as { formula(): string | undefined }).formula() || undefined;
}

function hasFormula(sheet: PopulateSheet, address: string): boolean {
  return Boolean(cellFormula(sheet, address));
}

function clearDataCell(sheet: PopulateSheet, address: string): void {
  if (hasFormula(sheet, address)) return;
  clearCellValue(sheet, address);
}

function setDataValue(sheet: PopulateSheet, address: string, value: unknown): void {
  if (hasFormula(sheet, address)) return;
  setCellValue(sheet, address, value);
}

function clearDataCols(
  sheet: PopulateSheet,
  fromRow: number,
  toRow: number,
  cols: readonly number[],
): void {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (const col of cols) {
      clearDataCell(sheet, cellAddress(row, col));
    }
  }
}

function clearRows(sheet: PopulateSheet, fromRow: number, toRow: number, colCount: number): void {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let col = 1; col <= colCount; col += 1) {
      clearCellValue(sheet, cellAddress(row, col));
    }
  }
}

function findLastUsedRow(sheet: PopulateSheet, startRow: number, keyCol: number): number {
  const used = sheet.usedRange();
  const maxScan = used ? Math.min(used.endCell().rowNumber(), 5000) : startRow;
  let last = startRow - 1;
  for (let row = startRow; row <= maxScan; row += 1) {
    const value = sheet.cell(row, keyCol).value();
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      last = row;
    }
  }
  return last;
}

/** Map app statut → Avancement (L) so template Statut formula (M) recalculates correctly. */
function avancementFromStatut(statut: string): number {
  const normalized = statut
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (normalized.includes('termin')) return 1;
  if (normalized.includes('cours')) return 0.5;
  return 0;
}

function budgetDepenseFormula(row: number, expenseEnd: number): string {
  return `SUMIFS('Budget expense Details'!$E$4:$E$${expenseEnd},'Budget expense Details'!$C$4:$C$${expenseEnd},PROJECTS!B${row})`;
}

function ecartFormula(row: number): string {
  return `IF(I${row}-J${row}=0,0,I${row}-J${row})`;
}

function statutFormula(row: number): string {
  return `IF(L${row}<0.1,"Non debuté",IF(L${row}<1,"En cours","Terminé"))`;
}

function ensureProjectRowFormulas(sheet: PopulateSheet, row: number, expenseEnd: number): void {
  const addrA = cellAddress(row, 1);
  const addrJ = cellAddress(row, 10);
  const addrK = cellAddress(row, 11);
  const addrM = cellAddress(row, 13);

  // A5 stays a seed value; A6+ use A{n-1}+1 (rewrite SHARED refs to real formulas).
  if (row > PROJECTS_DATA_START && (!hasFormula(sheet, addrA) || cellFormula(sheet, addrA) === 'SHARED')) {
    sheet.cell(addrA).formula(`A${row - 1}+1`);
  }

  sheet.cell(addrJ).formula(budgetDepenseFormula(row, expenseEnd));
  sheet.cell(addrK).formula(ecartFormula(row));
  sheet.cell(addrM).formula(statutFormula(row));
}

function writeProjectRow(sheet: PopulateSheet, row: number, project: ProjectRecord): void {
  setDataValue(sheet, cellAddress(row, 2), project.name);
  setDataValue(sheet, cellAddress(row, 3), project.lieu);
  setDataValue(sheet, cellAddress(row, 4), project.secteur);
  setDataValue(sheet, cellAddress(row, 5), project.typeProjet);
  setDataValue(sheet, cellAddress(row, 6), project.sousActivite);
  setDataValue(sheet, cellAddress(row, 7), project.annee);
  setDataValue(sheet, cellAddress(row, 8), project.responsable);

  // I = Budget prévu: input data. Overwrite seed I=J formulas so app budgets win.
  const addrI = cellAddress(row, 9);
  sheet.cell(addrI).value(project.budgetPrevu != null ? project.budgetPrevu : null);

  // L = Avancement (%): drive template Statut formula in M from app statut.
  setDataValue(sheet, cellAddress(row, 12), avancementFromStatut(project.statut));

  // A5 only: write N° when template has no auto-number formula
  if (row === PROJECTS_DATA_START && !hasFormula(sheet, cellAddress(row, 1))) {
    setDataValue(sheet, cellAddress(row, 1), project.numero ?? 1);
  }
}

function writeExpenseRow(sheet: PopulateSheet, row: number, expense: ProjectExpense): void {
  setCellValue(sheet, cellAddress(row, 1), expense.numero);
  setCellValue(sheet, cellAddress(row, 2), expense.date);
  setCellValue(sheet, cellAddress(row, 3), expense.projet);
  setCellValue(sheet, cellAddress(row, 4), expense.motif);
  setCellValue(sheet, cellAddress(row, 5), expense.montant);
}

function fillProjectsSheet(
  sheet: PopulateSheet,
  projects: ProjectRecord[],
  expenseEnd: number,
): void {
  const previousLast = findLastUsedRow(sheet, PROJECTS_DATA_START, 2);
  const lastDataRow = PROJECTS_DATA_START + Math.max(projects.length, 1) - 1;
  const clearThrough = Math.max(previousLast, lastDataRow, PROJECTS_DATA_START);
  clearDataCols(sheet, PROJECTS_DATA_START, clearThrough, PROJECTS_DATA_COLS);

  projects.forEach((project, index) => {
    const row = PROJECTS_DATA_START + index;
    ensureProjectRowFormulas(sheet, row, expenseEnd);
    writeProjectRow(sheet, row, project);
  });

  // Keep formula scaffolding on leftover template rows (empty B → SUMIFS = 0).
  for (let row = lastDataRow + 1; row <= Math.min(clearThrough, PROJECTS_FORMULA_FLOOR); row += 1) {
    if (hasFormula(sheet, cellAddress(row, 10)) || hasFormula(sheet, cellAddress(row, 11))) {
      ensureProjectRowFormulas(sheet, row, expenseEnd);
    }
  }
}

function fillExpensesSheet(sheet: PopulateSheet, expenses: ProjectExpense[]): void {
  const previousLast = findLastUsedRow(sheet, EXPENSES_DATA_START, 3);
  const clearThrough = Math.max(previousLast, EXPENSES_DATA_START + expenses.length - 1, EXPENSES_DATA_START);
  clearRows(sheet, EXPENSES_DATA_START, clearThrough, EXPENSES_COL_COUNT);

  expenses.forEach((expense, index) => {
    writeExpenseRow(sheet, EXPENSES_DATA_START + index, expense);
  });
}

/**
 * Params!A2 is UNIQUE(PROJECTS!B5:B124) in the template — leave it alone so Excel
 * rebuilds the project list. Only clear stale static spill values below A2.
 */
function clearParamsSpillValues(sheet: PopulateSheet): void {
  if (!hasFormula(sheet, 'A2')) return;
  const previousLast = findLastUsedRow(sheet, 3, 1);
  if (previousLast < 3) return;
  clearDataCols(sheet, 3, previousLast, [1]);
}

export async function buildProjectsWorkbookBuffer(
  projects: ProjectRecord[],
  expenses: ProjectExpense[],
): Promise<Buffer> {
  const templatePath = PROJECTS_EXPORT_TEMPLATE_PATH;
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Template introuvable : ${templatePath}. Placez ${EXPORT_TEMPLATE_FILES.projectsTemplate} dans Excel/.`,
    );
  }

  const workbook = await XlsxPopulate.fromFileAsync(templatePath);

  const expenseEnd = Math.max(
    EXPENSE_RANGE_FLOOR,
    EXPENSES_DATA_START + Math.max(expenses.length, 1) - 1,
  );

  const expensesSheet = workbook.sheet(EXPENSES_SHEET);
  if (!expensesSheet) {
    throw new Error(`Feuille « ${EXPENSES_SHEET} » introuvable dans ${EXPORT_TEMPLATE_FILES.projectsTemplate}`);
  }
  fillExpensesSheet(expensesSheet, expenses);

  const projectsSheet = workbook.sheet(PROJECTS_SHEET);
  if (!projectsSheet) {
    throw new Error(`Feuille « ${PROJECTS_SHEET} » introuvable dans ${EXPORT_TEMPLATE_FILES.projectsTemplate}`);
  }
  fillProjectsSheet(projectsSheet, projects, expenseEnd);

  const paramsSheet = workbook.sheet(PARAMS_SHEET);
  if (paramsSheet) {
    clearParamsSpillValues(paramsSheet);
  }

  return Buffer.from(await workbook.outputAsync());
}
