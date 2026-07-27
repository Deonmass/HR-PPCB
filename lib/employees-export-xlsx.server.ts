import 'server-only';

import fs from 'fs';
import path from 'path';
import XlsxPopulate from 'xlsx-populate';
import { EMP_COL, EMPLOYEE_EXIT_SHEET, EMPLOYEE_MASTER_SHEET } from './employee-columns';
import {
  EMPLOYEES_HR_EXPORT_TEMPLATE_PATH,
  EXPORT_TEMPLATE_FILES,
  getExportTemplatesDirectory,
} from './excel-export-template-paths';
import { withExcelLock } from './excel-io';
import { getEmployeeWorkbookPath } from './excel-data-paths';

const EXCEL_PATH = getEmployeeWorkbookPath();
const MASTER_SHEET = EMPLOYEE_MASTER_SHEET;
const BASE_SHEET = 'Base';
const EXIT_EXPORT_SHEET = 'EXIT';
const DASHBOARD_SHEET = 'Dashboard';
const FIRST_DATA_ROW = 3;
const AGE_COL = EMP_COL.age + 1; // L = 12
const DOB_COL_LETTER = 'K';
const MATRICULE_COL = 1;
const NOM_COL = EMP_COL.nom + 1; // C = 3
const JOB_TITLE_COL = EMP_COL.jobTitle + 1; // F = 6

/** Colonnes Excel 1-based à supprimer (vidées + masquées) à l’export. */
const COL_T = 20;
const COL_U = 21;
const COL_V_LM_NAME = 22;
const COL_W_LM_POS = 23;
const COL_X = 24;

/** Après conservation de V/W : raison exit reste en AD (col 30). */
const COL_RAISON_EXIT = EMP_COL.raisonExit + 1;

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

function resolveEmployeesHrExportTemplatePath(): string {
  return EMPLOYEES_HR_EXPORT_TEMPLATE_PATH;
}

function ageFormula(row: number): string {
  return `DATEDIF(${DOB_COL_LETTER}${row},TODAY(),"Y")`;
}

function findLastDataRow(sheet: PopulateSheet, startRow = FIRST_DATA_ROW): number {
  let last = startRow - 1;
  const used = sheet.usedRange();
  const maxScan = used ? Math.min(used.endCell().rowNumber(), 8000) : 8000;

  for (let row = startRow; row <= maxScan; row++) {
    const matricule = sheet.cell(row, MATRICULE_COL).value();
    if (matricule !== undefined && matricule !== null && String(matricule).trim() !== '') {
      last = row;
    }
  }

  return last;
}

function maxDataCol(sheet: PopulateSheet): number {
  const used = sheet.usedRange();
  const fromUsed = used ? used.endCell().columnNumber() : 0;
  return Math.max(fromUsed, COL_RAISON_EXIT);
}

function readCellValue(sheet: PopulateSheet, row: number, col: number): unknown {
  const cell = sheet.cell(row, col);
  try {
    const hyperlink = typeof cell.hyperlink === 'function' ? cell.hyperlink() : undefined;
    if (typeof hyperlink === 'string' && hyperlink.trim()) return hyperlink.trim();
  } catch {
    // ignore
  }
  return cell.value();
}

function writeCellValue(sheet: PopulateSheet, row: number, col: number, value: unknown): void {
  // Ne jamais écraser la formule d'âge
  if (col === AGE_COL && row >= FIRST_DATA_ROW) return;
  sheet.cell(row, col).value(value === undefined ? null : value);
}

function excelQuotedString(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Rapproche le nom du line manager avec la colonne C (COMPLET NAME)
 * pour afficher l’orthographe officielle de la base.
 */
function resolveNameAgainstColumnC(
  sheet: PopulateSheet,
  rawName: unknown,
  lastDataRow: number,
): string {
  const needle = String(rawName ?? '').trim();
  if (!needle) return '';
  const needleLc = needle.toLowerCase();

  for (let row = FIRST_DATA_ROW; row <= lastDataRow; row++) {
    const nom = String(sheet.cell(row, NOM_COL).value() ?? '').trim();
    if (nom && nom.toLowerCase() === needleLc) return nom;
  }

  let best = '';
  for (let row = FIRST_DATA_ROW; row <= lastDataRow; row++) {
    const nom = String(sheet.cell(row, NOM_COL).value() ?? '').trim();
    if (!nom) continue;
    const nomLc = nom.toLowerCase();
    if (nomLc.includes(needleLc) || needleLc.includes(nomLc)) {
      if (!best || nom.length > best.length) best = nom;
    }
  }
  return best || needle;
}

function clearColumnCells(sheet: PopulateSheet, col: number, lastRow: number): void {
  for (let row = 1; row <= Math.max(lastRow, 2); row++) {
    try {
      sheet.cell(row, col).value(null);
    } catch {
      // ignore
    }
  }
}

function hideColumn(sheet: PopulateSheet, col: number): void {
  try {
    (sheet.column(col) as { hidden(v: boolean): unknown }).hidden(true);
  } catch {
    // ignore if column node unavailable
  }
}

/**
 * - Supprime T, U, X (vidées + masquées)
 * - En-têtes Line Manager sur V / W
 * - V = nom officiel selon colonne C (de la feuille courante)
 * - W = VLOOKUP du JOB TITLE (F) selon le nom du line manager (V)
 *   — la plage de recherche peut pointer vers Base (actifs) pour les EXIT.
 */
function applyLineManagerExportLayout(
  sheet: PopulateSheet,
  lastDataRow: number,
  lookup?: { sheetName: string; lastRow: number; nameSource?: PopulateSheet },
): void {
  sheet.cell(2, COL_V_LM_NAME).value('Line Manager Name');
  sheet.cell(2, COL_W_LM_POS).value('Line manager position');

  clearColumnCells(sheet, COL_T, lastDataRow);
  clearColumnCells(sheet, COL_U, lastDataRow);
  clearColumnCells(sheet, COL_X, lastDataRow);
  hideColumn(sheet, COL_T);
  hideColumn(sheet, COL_U);
  hideColumn(sheet, COL_X);

  if (lastDataRow < FIRST_DATA_ROW) return;

  const lookupSheet = lookup?.sheetName ?? sheet.name();
  const lookupLast =
    lookup && lookup.lastRow >= FIRST_DATA_ROW ? lookup.lastRow : lastDataRow;
  const nameSource = lookup?.nameSource ?? sheet;
  const nameLast =
    lookup?.nameSource && lookup.lastRow >= FIRST_DATA_ROW ? lookup.lastRow : lastDataRow;
  const vlookupRange = `${lookupSheet}!$C$${FIRST_DATA_ROW}:$F$${lookupLast}`;
  const vlookupCol = JOB_TITLE_COL - NOM_COL + 1;

  for (let row = FIRST_DATA_ROW; row <= lastDataRow; row++) {
    const mat = sheet.cell(row, MATRICULE_COL).value();
    if (mat === undefined || mat === null || String(mat).trim() === '') continue;

    const rawManager = sheet.cell(row, COL_V_LM_NAME).value();
    const resolved = resolveNameAgainstColumnC(nameSource, rawManager, nameLast);
    sheet.cell(row, COL_V_LM_NAME).value(resolved || null);

    const fallbackPos = String(sheet.cell(row, COL_W_LM_POS).value() ?? '').trim();
    const fallbackArg = fallbackPos ? excelQuotedString(fallbackPos) : '""';
    sheet
      .cell(row, COL_W_LM_POS)
      .formula(`IFERROR(VLOOKUP(V${row},${vlookupRange},${vlookupCol},FALSE),${fallbackArg})`);
  }
}

function copySheetDataFromLive(
  liveSheet: PopulateSheet,
  targetSheet: PopulateSheet,
): number {
  const lastDataRow = findLastDataRow(liveSheet);
  if (lastDataRow < FIRST_DATA_ROW) return FIRST_DATA_ROW - 1;

  const endCol = maxDataCol(liveSheet);

  for (let row = FIRST_DATA_ROW; row <= lastDataRow; row++) {
    for (let col = 1; col <= endCol; col++) {
      writeCellValue(targetSheet, row, col, readCellValue(liveSheet, row, col));
    }
  }

  return lastDataRow;
}

function clearExtraBaseRows(baseSheet: PopulateSheet, lastDataRow: number): void {
  const used = baseSheet.usedRange();
  if (!used) return;
  const endRow = used.endCell().rowNumber();
  const endCol = used.endCell().columnNumber();
  if (endRow <= lastDataRow) return;

  for (let row = lastDataRow + 1; row <= endRow; row++) {
    for (let col = 1; col <= endCol; col++) {
      baseSheet.cell(row, col).value(null);
    }
  }
}

function extendBaseRowsIfNeeded(
  baseSheet: PopulateSheet,
  liveSheet: PopulateSheet,
  lastDataRow: number,
  templateEndBeforeCopy: number,
): void {
  if (lastDataRow <= templateEndBeforeCopy) return;

  const endCol = maxDataCol(liveSheet);
  const rowStyle = baseSheet.row(FIRST_DATA_ROW).style([...STYLE_PROPS]);

  for (let row = templateEndBeforeCopy + 1; row <= lastDataRow; row++) {
    baseSheet.row(row).style(rowStyle);
    for (let col = 1; col <= endCol; col++) {
      writeCellValue(baseSheet, row, col, readCellValue(liveSheet, row, col));
    }
  }
}

function ensureAgeFormulas(baseSheet: PopulateSheet, lastDataRow: number): void {
  if (lastDataRow < FIRST_DATA_ROW) return;
  for (let row = FIRST_DATA_ROW; row <= lastDataRow; row++) {
    const mat = baseSheet.cell(row, MATRICULE_COL).value();
    if (mat === undefined || mat === null || String(mat).trim() === '') continue;
    baseSheet.cell(row, AGE_COL).formula(ageFormula(row));
  }
}

function finalizePeopleSheet(
  targetSheet: PopulateSheet,
  liveSheet: PopulateSheet,
  templateEndBeforeCopy: number,
  lookup?: { sheetName: string; lastRow: number; nameSource?: PopulateSheet },
): number {
  const lastDataRow = copySheetDataFromLive(liveSheet, targetSheet);
  extendBaseRowsIfNeeded(targetSheet, liveSheet, lastDataRow, templateEndBeforeCopy);
  clearExtraBaseRows(targetSheet, lastDataRow);
  ensureAgeFormulas(targetSheet, lastDataRow);
  applyLineManagerExportLayout(targetSheet, lastDataRow, lookup);
  return lastDataRow;
}

/**
 * Recalibre les plages Dashboard du type Base!$X$3:$X$178 → dernière ligne live.
 */
function updateDashboardFormulaRanges(
  dashboardSheet: PopulateSheet,
  lastBaseRow: number,
  lastExitRow: number,
): void {
  if (lastBaseRow < FIRST_DATA_ROW && lastExitRow < FIRST_DATA_ROW) return;

  const used = dashboardSheet.usedRange();
  if (!used) return;

  const endRow = used.endCell().rowNumber();
  const endCol = used.endCell().columnNumber();
  const baseRe = /(Base!\$[A-Z]+\$3:\$[A-Z]+\$)\d+/gi;
  const exitRe = /(EXIT!\$[A-Z]+\$3:\$[A-Z]+\$)\d+/gi;

  for (let row = 1; row <= endRow; row++) {
    for (let col = 1; col <= endCol; col++) {
      const cell = dashboardSheet.cell(row, col);
      const formula = (cell as unknown as { formula(): string | undefined }).formula();
      if (!formula) continue;
      let updated = formula;
      if (lastBaseRow >= FIRST_DATA_ROW) {
        updated = updated.replace(baseRe, `$1${lastBaseRow}`);
        baseRe.lastIndex = 0;
      }
      if (lastExitRow >= FIRST_DATA_ROW) {
        updated = updated.replace(exitRe, `$1${lastExitRow}`);
        exitRe.lastIndex = 0;
      }
      if (updated !== formula) cell.formula(updated);
    }
  }
}

/** Bloc SORTIES sur le Dashboard Excel (référence feuille EXIT). */
function fillExitDashboardSection(
  dashboardSheet: PopulateSheet,
  lastExitRow: number,
): void {
  const startRow = 34;
  const exitRange = (col: string) =>
    lastExitRow >= FIRST_DATA_ROW
      ? `EXIT!$${col}$${FIRST_DATA_ROW}:$${col}$${lastExitRow}`
      : `EXIT!$${col}$${FIRST_DATA_ROW}:$${col}$${FIRST_DATA_ROW}`;

  dashboardSheet.cell(startRow, 2).value('SORTIES (EXIT)');
  dashboardSheet.cell(startRow + 1, 2).value('Total sorties');
  dashboardSheet.cell(startRow + 1, 3).formula(`COUNTA(${exitRange('A')})`);

  dashboardSheet.cell(startRow + 2, 2).value('Motif');
  dashboardSheet.cell(startRow + 2, 3).value('Effectif');

  const reasons: { label: string; pattern: string }[] = [
    { label: 'Demission', pattern: 'Demission' },
    { label: 'Licenciement', pattern: 'Licenciement' },
    { label: 'Retraite', pattern: 'Retraite' },
    { label: 'Fin de contrat', pattern: 'Fin de contrat' },
  ];

  reasons.forEach((reason, index) => {
    const row = startRow + 3 + index;
    dashboardSheet.cell(row, 2).value(reason.label);
    dashboardSheet
      .cell(row, 3)
      .formula(`COUNTIF(${exitRange('AD')},"${reason.pattern}")`);
  });

  const totalRow = startRow + 3 + reasons.length;
  dashboardSheet.cell(totalRow, 2).value('TOTAL');
  dashboardSheet
    .cell(totalRow, 3)
    .formula(`SUM(C${startRow + 3}:C${startRow + 2 + reasons.length})`);
}

function ensureExitSheetTitle(sheet: PopulateSheet): void {
  try {
    const title = String(sheet.cell(1, 1).value() ?? '').trim();
    if (!title || /employee base|employee file/i.test(title)) {
      sheet.cell(1, 1).value('EXIT — AGENTS SORTIS');
    }
  } catch {
    // ignore
  }
}

function isFileLockError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
}

async function persistUpdatedTemplate(
  templatePath: string,
  templateWb: PopulateWorkbook,
): Promise<void> {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await templateWb.toFileAsync(templatePath);
      return;
    } catch (err) {
      if (!isFileLockError(err) || attempt === attempts) {
        if (isFileLockError(err)) {
          console.warn(
            `[employees-hr-export] Template non mis à jour (fichier verrouillé) : ${templatePath}`,
          );
          return;
        }
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
}

/**
 * Export RH via template :
 * - Dashboard : design / graphiques / formules (+ bloc SORTIES)
 * - Base : employés actifs (T/U/X masquées, LM sur V/W)
 * - EXIT : agents sortis (même mise en forme)
 */
export async function buildEmployeesHrExportBuffer(livePath = EXCEL_PATH): Promise<Buffer> {
  const templatePath = resolveEmployeesHrExportTemplatePath();
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Template introuvable : ${templatePath}. Placez ${EXPORT_TEMPLATE_FILES.employeesHr} dans ${getExportTemplatesDirectory()}.`,
    );
  }

  return withExcelLock(livePath, async () => {
    const [templateWb, liveWb] = await Promise.all([
      XlsxPopulate.fromFileAsync(templatePath),
      XlsxPopulate.fromFileAsync(livePath),
    ]);

    const liveSheet = liveWb.sheet(MASTER_SHEET);
    const liveExitSheet = liveWb.sheet(EMPLOYEE_EXIT_SHEET);
    const baseSheet = templateWb.sheet(BASE_SHEET) ?? templateWb.sheet(MASTER_SHEET);
    const dashboardSheet = templateWb.sheet(DASHBOARD_SHEET);

    if (!liveSheet || !baseSheet) {
      throw new Error(`Feuille ${MASTER_SHEET} / ${BASE_SHEET} introuvable`);
    }

    // Ne garder que Dashboard + Base (+ EXIT sera clonée ensuite)
    for (const sheet of [...templateWb.sheets()]) {
      const name = sheet.name();
      if (
        name !== DASHBOARD_SHEET &&
        name !== BASE_SHEET &&
        name !== EXIT_EXPORT_SHEET &&
        name !== baseSheet.name()
      ) {
        sheet.delete();
      }
    }
    if (baseSheet.name() !== BASE_SHEET) {
      baseSheet.name(BASE_SHEET);
    }

    const templateEndBeforeCopy = baseSheet.usedRange()
      ? baseSheet.usedRange()!.endCell().rowNumber()
      : FIRST_DATA_ROW;

    const lastBaseRow = finalizePeopleSheet(baseSheet, liveSheet, templateEndBeforeCopy);

    // Feuille EXIT (même structure que Base)
    const existingExit = templateWb.sheet(EXIT_EXPORT_SHEET);
    if (existingExit) {
      templateWb.deleteSheet(existingExit);
    }
    const exitSheet = templateWb.cloneSheet(baseSheet, EXIT_EXPORT_SHEET);
    ensureExitSheetTitle(exitSheet);

    let lastExitRow = FIRST_DATA_ROW - 1;
    const lmLookup = {
      sheetName: BASE_SHEET,
      lastRow: lastBaseRow,
      nameSource: baseSheet,
    };
    if (liveExitSheet) {
      const exitTemplateEnd = findLastDataRow(exitSheet);
      lastExitRow = finalizePeopleSheet(
        exitSheet,
        liveExitSheet,
        exitTemplateEnd,
        lmLookup,
      );
    } else {
      clearExtraBaseRows(exitSheet, FIRST_DATA_ROW - 1);
      applyLineManagerExportLayout(exitSheet, FIRST_DATA_ROW - 1, lmLookup);
    }

    if (dashboardSheet) {
      updateDashboardFormulaRanges(dashboardSheet, lastBaseRow, lastExitRow);
      fillExitDashboardSection(dashboardSheet, lastExitRow);
    }

    // Ne jamais réécrire le template sur disque (Vercel read-only + local immutable).
    return templateWb.outputAsync() as Promise<Buffer>;
  });
}

export function buildEmployeesHrExportFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `EMPLOYEES_HR_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
}
