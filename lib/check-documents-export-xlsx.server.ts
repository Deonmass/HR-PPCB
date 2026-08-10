import 'server-only';

import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';
import {
  CHECK_DOCUMENTS_DATA_START,
  CHECK_DOCUMENTS_EXIT_SHEET,
  CHECK_DOCUMENTS_SHEET,
} from './check-documents-columns';
import { DOCUMENT_FIELDS, normalizeDocStatus } from './documents';
import { filterEmployees, type EmployeeFilters } from './employee-filters';
import {
  CHECK_DOCUMENTS_EXPORT_TEMPLATE_PATH,
} from './excel-export-template-paths';
import { readEmployeesBundle } from './employees-store';
import type { Employee } from './types';
import {
  getSheetBlock,
  readWorkbookForData,
  withExcelLock,
  type AoaRow,
} from './excel-io';

/** Ligne Excel du résumé global (totaux Y / NA / N / RATE). */
export const CHECK_DOCUMENTS_SUMMARY_ROW = 180;

export { CHECK_DOCUMENTS_EXIT_SHEET } from './check-documents-columns';

const FIRST_DATA_ROW = CHECK_DOCUMENTS_DATA_START + 1; // Excel row 4 (1-based for populate)
/** Colonnes live d’origine A–Y (identité + localisation + 19 critères). */
const LIVE_DATA_COLS = 25;
/**
 * Colonnes valeurs export : A–Z
 * (identité + date d’embauche + localisation + 19 critères).
 */
const DATA_END_COL = 26;
/** Index 0-based : insertion après JOB TITLE. */
const HIRE_DATE_INSERT_INDEX = 5;
const HIRE_DATE_HEADER = "DATE D'EMBAUCHE";
/** Compteurs Y / NA / N / RATE — décalés d’une colonne (AA–AD). */
const FORMULA_COLS = ['AA', 'AB', 'AC', 'AD'] as const;
const RATE_HEADERS = ['Y', 'NA', 'N', 'RATE %'] as const;
/** Plage des 19 critères après insertion : H–Z. */
const DOC_RANGE_START = 'H';
const DOC_RANGE_END = 'Z';
const MAX_SCAN_ROWS = 500;

const STYLE_PROPS = [
  'bold',
  'italic',
  'fill',
  'border',
  'horizontalAlignment',
  'verticalAlignment',
  'fontColor',
  'fontSize',
  'wrapText',
  'numberFormat',
] as const;

type PopulateWorkbook = Awaited<ReturnType<typeof XlsxPopulate.fromFileAsync>>;
type PopulateSheet = ReturnType<PopulateWorkbook['sheet']>;

function findLastDataRow(sheet: PopulateSheet): number {
  let last = FIRST_DATA_ROW - 1;
  for (let row = FIRST_DATA_ROW; row <= MAX_SCAN_ROWS; row++) {
    const matricule = sheet.cell(row, 1).value();
    if (matricule !== undefined && matricule !== null && String(matricule).trim() !== '') {
      last = row;
    } else if (last >= FIRST_DATA_ROW && row > last + 5) {
      break;
    }
  }
  return last;
}

function toCellValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const asNum = Number(value);
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(asNum) && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return asNum;
  }
  return String(value);
}

function hasActiveFilters(filters: EmployeeFilters): boolean {
  return Boolean(filters.dept) || Boolean(filters.search.trim());
}

function insertHireDateIntoRow(row: AoaRow, hireDate: string): AoaRow {
  const next = row.slice(0, LIVE_DATA_COLS);
  while (next.length < HIRE_DATE_INSERT_INDEX) next.push('');
  next.splice(HIRE_DATE_INSERT_INDEX, 0, hireDate);
  return next;
}

function enrichHeaderRowsWithHireDate(headerRows: AoaRow[]): AoaRow[] {
  return headerRows.map((row, index) => {
    // Ligne d’en-têtes de colonnes = Excel row 3 → index 2
    if (index !== CHECK_DOCUMENTS_DATA_START - 1) return row;
    return insertHireDateIntoRow(row, HIRE_DATE_HEADER);
  });
}

/** Ligne live (sans date d’embauche) depuis une fiche EXIT sans ligne Check Docs. */
function exitEmployeeToLiveDocRow(employee: Employee): AoaRow {
  return [
    employee.matricule,
    employee.nom,
    employee.departement,
    employee.grade,
    employee.jobTitle,
    employee.localisation ?? '',
    ...DOCUMENT_FIELDS.map((field) => normalizeDocStatus(String(employee.documents?.[field.key] || 'N'))),
  ];
}

/**
 * Filtre les lignes Check Docs + injecte la date d’embauche (après JOB TITLE).
 * `population` : actifs (EMPLOYEE) ou sortis (EXIT).
 */
async function prepareExportRows(
  dataRows: AoaRow[],
  filters: EmployeeFilters,
  population: 'active' | 'exit',
): Promise<AoaRow[]> {
  const { employees, exits } = await readEmployeesBundle();
  const pool = population === 'active' ? employees : exits;
  const hireByMatricule = new Map(
    [...employees, ...exits].map((e) => [e.matricule, e.appointmentDate?.trim() || ''] as const),
  );

  const scopedList = hasActiveFilters(filters)
    ? filterEmployees(pool, filters)
    : pool;
  const scoped = new Set(scopedList.map((e) => e.matricule));

  const rows = dataRows
    .filter((row) => {
      const matricule = String(row[0] ?? '').trim();
      return matricule !== '' && scoped.has(matricule);
    })
    .map((row) => {
      const matricule = String(row[0] ?? '').trim();
      return insertHireDateIntoRow(row, hireByMatricule.get(matricule) || '');
    });

  if (population === 'exit') {
    const present = new Set(rows.map((row) => String(row[0] ?? '').trim()));
    for (const exit of scopedList) {
      if (present.has(exit.matricule)) continue;
      rows.push(
        insertHireDateIntoRow(
          exitEmployeeToLiveDocRow(exit),
          hireByMatricule.get(exit.matricule) || '',
        ),
      );
    }
  }

  return rows.sort((a, b) =>
    String(a[1] ?? '').localeCompare(String(b[1] ?? ''), 'fr'),
  );
}

/** Écrit A–Z (valeurs identité + date embauche + localisation + critères). */
function writeLiveBlockOntoTemplate(
  sheet: PopulateSheet,
  headerRows: AoaRow[],
  dataRows: AoaRow[],
): number {
  headerRows.forEach((row, index) => {
    const excelRow = index + 1;
    for (let col = 1; col <= DATA_END_COL; col++) {
      const value = toCellValue(row[col - 1]);
      if (value !== null) sheet.cell(excelRow, col).value(value);
    }
  });

  if (dataRows.length === 0) return FIRST_DATA_ROW - 1;

  const matrix = dataRows.map((row) => {
    const out: Array<string | number | boolean | null> = [];
    for (let col = 0; col < DATA_END_COL; col++) {
      out.push(toCellValue(row[col]));
    }
    return out;
  });

  const endRow = FIRST_DATA_ROW + dataRows.length - 1;
  sheet.range(FIRST_DATA_ROW, 1, endRow, DATA_END_COL).value(matrix);
  return endRow;
}

function clearExtraDataRows(sheet: PopulateSheet, lastDataRow: number, templateEndBeforeWrite: number): void {
  if (templateEndBeforeWrite <= lastDataRow) return;
  const blank = Array.from({ length: DATA_END_COL }, () => null);
  for (let row = lastDataRow + 1; row <= templateEndBeforeWrite; row++) {
    sheet.range(row, 1, row, DATA_END_COL).value([blank]);
    for (const col of FORMULA_COLS) {
      sheet.cell(`${col}${row}`).value(null);
    }
  }
}

function extendDataRowsIfNeeded(
  sheet: PopulateSheet,
  templateEndBeforeWrite: number,
  lastDataRow: number,
): void {
  if (lastDataRow <= templateEndBeforeWrite) return;

  let rowStyle: unknown;
  try {
    rowStyle = sheet.row(FIRST_DATA_ROW).style([...STYLE_PROPS]);
  } catch {
    return;
  }

  for (let row = templateEndBeforeWrite + 1; row <= lastDataRow; row++) {
    try {
      sheet.row(row).style(rowStyle as never);
    } catch {
      // ignore
    }
  }
}

/** En-têtes + formules Y/NA/N/RATE sur AA–AD (critères H–Z). */
function applyRateFormulas(sheet: PopulateSheet, lastDataRow: number): void {
  const headerRow = CHECK_DOCUMENTS_DATA_START; // Excel row 3

  // Formats : après insertion de la date d’embauche (col F), les formats
  // du template (notamment « % » sur N) ne sont plus alignés — on les force.
  RATE_HEADERS.forEach((label, index) => {
    const col = FORMULA_COLS[index];
    const cell = sheet.cell(`${col}${headerRow}`);
    cell.value(label);
    cell.style('numberFormat', 'General');
  });

  if (lastDataRow < FIRST_DATA_ROW) return;

  for (let row = FIRST_DATA_ROW; row <= lastDataRow; row++) {
    const y = sheet.cell(`AA${row}`);
    const na = sheet.cell(`AB${row}`);
    const n = sheet.cell(`AC${row}`);
    const rate = sheet.cell(`AD${row}`);

    y.formula(`COUNTIF(${DOC_RANGE_START}${row}:${DOC_RANGE_END}${row},AA$3)`);
    na.formula(`COUNTIF(${DOC_RANGE_START}${row}:${DOC_RANGE_END}${row},AB$3)`);
    n.formula(`COUNTIF(${DOC_RANGE_START}${row}:${DOC_RANGE_END}${row},AC$3)`);
    rate.formula(`IFERROR((AA${row}+AB${row})/SUM(AA${row}:AC${row}),0)`);

    y.style('numberFormat', '0');
    na.style('numberFormat', '0');
    n.style('numberFormat', '0');
    rate.style('numberFormat', '0%');
  }
}

/**
 * Recalibre le résumé (ligne 180) sur AA–AD et la dernière ligne exportée.
 */
function recalibrateSummaryFormulas(sheet: PopulateSheet, lastDataRow: number): void {
  if (lastDataRow < FIRST_DATA_ROW) return;

  const summaryRow = CHECK_DOCUMENTS_SUMMARY_ROW;
  const first = FIRST_DATA_ROW;
  const last = Math.min(lastDataRow, summaryRow - 1);

  const y = sheet.cell(`AA${summaryRow}`);
  const na = sheet.cell(`AB${summaryRow}`);
  const n = sheet.cell(`AC${summaryRow}`);
  const rate = sheet.cell(`AD${summaryRow}`);

  y.formula(`SUM(AA${first}:AA${last})/SUM($AA$${first}:$AC$${last})`);
  na.formula(`SUM(AB${first}:AB${last})/SUM($AA$${first}:$AC$${last})`);
  n.formula(`SUM(AC${first}:AC${last})/SUM($AA$${first}:$AC$${last})`);
  rate.formula(`IFERROR(AA${summaryRow}+AB${summaryRow},0)`);

  y.style('numberFormat', '0%');
  na.style('numberFormat', '0%');
  n.style('numberFormat', '0%');
  rate.style('numberFormat', '0%');
}

function finalizeSheet(
  sheet: PopulateSheet,
  headerRows: AoaRow[],
  dataRows: AoaRow[],
  templateEndBeforeWrite: number,
): void {
  const lastDataRow = writeLiveBlockOntoTemplate(sheet, headerRows, dataRows);
  extendDataRowsIfNeeded(sheet, templateEndBeforeWrite, lastDataRow);
  clearExtraDataRows(sheet, lastDataRow, templateEndBeforeWrite);
  applyRateFormulas(sheet, lastDataRow);
  recalibrateSummaryFormulas(sheet, lastDataRow);

  try {
    sheet.column(HIRE_DATE_INSERT_INDEX + 1).width(14);
  } catch {
    // ignore
  }
}

function ensureExitTitle(sheet: PopulateSheet): void {
  try {
    const titleCell = sheet.cell(1, 1);
    const current = String(titleCell.value() ?? '').trim();
    if (!current || /employee file|check documents/i.test(current)) {
      titleCell.value('CHECK DOCUMENTS — AGENTS EXIT');
    }
  } catch {
    // ignore
  }
}

async function readLiveCheckDocumentsBlock(livePath: string) {
  return withExcelLock(livePath, async () => {
    const liveWb = await readWorkbookForData(livePath);
    return getSheetBlock(liveWb, CHECK_DOCUMENTS_SHEET, CHECK_DOCUMENTS_DATA_START, {
      maxCols: LIVE_DATA_COLS - 1,
      keyCol: 0,
      emptyStreakLimit: 5,
    });
  });
}

async function buildFromTemplate(
  templatePath: string,
  livePath: string,
  filters: EmployeeFilters,
): Promise<Buffer> {
  const [templateWb, liveBlock] = await Promise.all([
    XlsxPopulate.fromFileAsync(templatePath),
    readLiveCheckDocumentsBlock(livePath),
  ]);

  const templateSheet = templateWb.sheet(CHECK_DOCUMENTS_SHEET);
  if (!templateSheet) {
    throw new Error(`Feuille "${CHECK_DOCUMENTS_SHEET}" introuvable dans le template d'export`);
  }

  const headerRows = enrichHeaderRowsWithHireDate(liveBlock.headerRows);
  const templateEndBeforeWrite = findLastDataRow(templateSheet);

  const [activeRows, exitRows] = await Promise.all([
    prepareExportRows(liveBlock.dataRows, filters, 'active'),
    prepareExportRows(liveBlock.dataRows, filters, 'exit'),
  ]);

  finalizeSheet(templateSheet, headerRows, activeRows, templateEndBeforeWrite);

  // Feuille agents EXIT : clone du modèle formaté, puis données sortis.
  const existingExit = templateWb.sheet(CHECK_DOCUMENTS_EXIT_SHEET);
  if (existingExit) {
    templateWb.deleteSheet(existingExit);
  }
  const exitSheet = templateWb.cloneSheet(templateSheet, CHECK_DOCUMENTS_EXIT_SHEET);
  ensureExitTitle(exitSheet);
  // Après clone, les données actives sont encore présentes — on les remplace
  // et on recalcule les formules / résumé pour les sortis.
  const exitTemplateEnd = findLastDataRow(exitSheet);
  finalizeSheet(exitSheet, headerRows, exitRows, exitTemplateEnd);

  return (await templateWb.outputAsync()) as Buffer;
}

async function buildCheckDocumentsRowsFromJson(
  filters: EmployeeFilters,
  population: 'active' | 'exit',
): Promise<{ headerRows: AoaRow[]; dataRows: AoaRow[] }> {
  const { employees, exits } = await readEmployeesBundle();
  const pool = population === 'active' ? employees : exits;
  const scopedList = hasActiveFilters(filters)
    ? filterEmployees(pool, filters)
    : pool;

  const headerRows: AoaRow[] = [
    [],
    [],
    [
      'MATRICULE',
      'NOM',
      'DEPARTEMENT',
      'GRADE',
      'JOB TITLE',
      HIRE_DATE_HEADER,
      'LOCALISATION',
      ...DOCUMENT_FIELDS.map((field) => field.label || field.key),
    ],
  ];

  const dataRows = scopedList
    .map((employee) => insertHireDateIntoRow(
      exitEmployeeToLiveDocRow(employee),
      employee.appointmentDate?.trim() || '',
    ))
    .sort((a, b) => String(a[1] ?? '').localeCompare(String(b[1] ?? ''), 'fr'));

  return { headerRows, dataRows };
}

async function buildFromJsonTemplate(
  templatePath: string | null,
  filters: EmployeeFilters,
): Promise<Buffer> {
  const templateWb = templatePath && fs.existsSync(templatePath)
    ? await XlsxPopulate.fromFileAsync(templatePath)
    : await XlsxPopulate.fromBlankAsync();

  let templateSheet = templateWb.sheet(CHECK_DOCUMENTS_SHEET);
  if (!templateSheet) {
    templateSheet = templateWb.sheet(0).name(CHECK_DOCUMENTS_SHEET);
  }

  const [{ headerRows, dataRows: activeRows }, { dataRows: exitRows }] = await Promise.all([
    buildCheckDocumentsRowsFromJson(filters, 'active'),
    buildCheckDocumentsRowsFromJson(filters, 'exit'),
  ]);

  const templateEndBeforeWrite = findLastDataRow(templateSheet);
  finalizeSheet(templateSheet, headerRows, activeRows, templateEndBeforeWrite);

  const existingExit = templateWb.sheet(CHECK_DOCUMENTS_EXIT_SHEET);
  if (existingExit) {
    templateWb.deleteSheet(existingExit);
  }
  const exitSheet = templateWb.cloneSheet(templateSheet, CHECK_DOCUMENTS_EXIT_SHEET);
  ensureExitTitle(exitSheet);
  const exitTemplateEnd = findLastDataRow(exitSheet);
  finalizeSheet(exitSheet, headerRows, exitRows, exitTemplateEnd);

  return (await templateWb.outputAsync()) as Buffer;
}

export async function buildFormattedCheckDocumentsWorkbookBuffer(
  livePath: string | null,
  filters: EmployeeFilters = { search: '', dept: '' },
): Promise<Buffer> {
  const templatePath = fs.existsSync(CHECK_DOCUMENTS_EXPORT_TEMPLATE_PATH)
    ? CHECK_DOCUMENTS_EXPORT_TEMPLATE_PATH
    : null;

  if (!livePath || !fs.existsSync(livePath)) {
    return buildFromJsonTemplate(templatePath, filters);
  }

  if (!templatePath) {
    return buildFromJsonTemplate(null, filters);
  }

  try {
    return await buildFromTemplate(templatePath, livePath, filters);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/ENOENT|no such file/i.test(message)) {
      return buildFromJsonTemplate(templatePath, filters);
    }
    throw err;
  }
}
