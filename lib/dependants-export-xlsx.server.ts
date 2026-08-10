import 'server-only';

import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';
import {
  DEPENDANTS_DATA_START,
  DEPENDANTS_EXIT_SHEET,
  DEPENDANTS_SHEET,
  DEP_COL,
  RESUME_SHEET,
} from './dependants-columns';
import type { Dependant } from './dependants-types';
import {
  computeFamilyCompositionCounts,
  isDependantSummaryRow,
  isEmployeeStatut,
} from './dependants-utils';
import { EMPLOYEE_EXIT_SHEET, parseDateToExcelSerial } from './employee-columns';
import { DEPENDANTS_EXPORT_TEMPLATE_PATH } from './excel-export-template-paths';
import { withExcelLock } from './excel-io';

const FIRST_DATA_ROW = DEPENDANTS_DATA_START + 1; // Excel row 3

/** Colonnes Excel 1-based : I=âge (formule), J=composition, K=enfants, L=total famille. */
const COL_N = 1;
const COL_AGE = 9;
const COL_COMPOSITION = 10;
const COL_ENFANTS = 11;
const COL_TOTAL = 12;
const COL_MATRICULE = 2;
const COL_PACTILIS = 3;
const COL_STATUT = 4;
const COL_NOM = 6;
/** En-tête « Total » (nombre de lignes) : libellé L1, valeur M1. */
const HEADER_TOTAL_LABEL_COL = 12;
const HEADER_TOTAL_VALUE_COL = 13;

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

function resolveDependantsExportTemplatePath(): string {
  return DEPENDANTS_EXPORT_TEMPLATE_PATH;
}

function findLastDependantsDataRow(sheet: PopulateSheet): number {
  let last = FIRST_DATA_ROW - 1;
  const used = sheet.usedRange();
  const maxScan = used ? Math.min(used.endCell().rowNumber(), 8000) : 8000;

  for (let row = FIRST_DATA_ROW; row <= maxScan; row++) {
    const matricule = sheet.cell(row, COL_MATRICULE).value();
    if (matricule !== undefined && matricule !== null && String(matricule).trim() !== '') {
      last = row;
    }
  }

  return last;
}

function isSummaryExportRow(sheet: PopulateSheet, row: number): boolean {
  return isDependantSummaryRow({
    pactilis: String(sheet.cell(row, COL_PACTILIS).value() ?? ''),
    nom: String(sheet.cell(row, COL_NOM).value() ?? ''),
    statut: String(sheet.cell(row, COL_STATUT).value() ?? ''),
  });
}

/**
 * Recalcule Composition (J) / Enfants (K) / Total (L) sur chaque ligne employé
 * selon le nombre réel de membres de la famille (même matricule).
 */
function recalculateFamilyTotalsOnSheet(sheet: PopulateSheet, lastDataRow: number): void {
  if (lastDataRow < FIRST_DATA_ROW) return;

  const byMatricule = new Map<string, number[]>();

  for (let row = FIRST_DATA_ROW; row <= lastDataRow; row++) {
    if (isSummaryExportRow(sheet, row)) continue;
    const matricule = String(sheet.cell(row, COL_MATRICULE).value() ?? '').trim();
    if (!matricule) continue;
    const list = byMatricule.get(matricule) ?? [];
    list.push(row);
    byMatricule.set(matricule, list);
  }

  for (const rows of byMatricule.values()) {
    const members = rows.map((row) => ({
      row,
      statut: String(sheet.cell(row, COL_STATUT).value() ?? '').trim(),
    }));
    const counts = computeFamilyCompositionCounts(members);

    for (const member of members) {
      if (!isEmployeeStatut(member.statut)) continue;
      sheet.cell(member.row, COL_COMPOSITION).value(counts.compositionFamille);
      sheet.cell(member.row, COL_ENFANTS).value(counts.enfants);
      sheet.cell(member.row, COL_TOTAL).value(counts.total);
    }
  }
}

/**
 * Total global (M1) = nombre de lignes bénéficiaires (hors récap).
 * Renumérote aussi la colonne N° (A) en 1…n.
 */
function updateHeaderTotalAndRowNumbers(sheet: PopulateSheet, lastDataRow: number): number {
  sheet.cell(1, HEADER_TOTAL_LABEL_COL).value('Total');

  if (lastDataRow < FIRST_DATA_ROW) {
    sheet.cell(1, HEADER_TOTAL_VALUE_COL).value(0);
    return 0;
  }

  let count = 0;
  for (let row = FIRST_DATA_ROW; row <= lastDataRow; row++) {
    const matricule = String(sheet.cell(row, COL_MATRICULE).value() ?? '').trim();
    if (!matricule || isSummaryExportRow(sheet, row)) {
      sheet.cell(row, COL_N).value(null);
      continue;
    }
    count += 1;
    sheet.cell(row, COL_N).value(count);
  }

  sheet.cell(1, HEADER_TOTAL_VALUE_COL).value(count);
  return count;
}

function readCellExportValue(sheet: PopulateSheet, row: number, col: number): unknown {
  const cell = sheet.cell(row, col);
  try {
    const hyperlink = typeof cell.hyperlink === 'function' ? cell.hyperlink() : undefined;
    if (typeof hyperlink === 'string' && hyperlink.trim()) return hyperlink.trim();
    if (hyperlink && typeof hyperlink === 'object' && 'hyperlink' in (hyperlink as object)) {
      return String((hyperlink as { hyperlink: string }).hyperlink).trim();
    }
  } catch {
    // ignore hyperlink read errors
  }
  return cell.value();
}

function writeCellExportValue(sheet: PopulateSheet, row: number, col: number, value: unknown): void {
  // Ne jamais écraser la formule d'âge (colonne I).
  if (col === COL_AGE && row >= FIRST_DATA_ROW) return;

  const cell = sheet.cell(row, col);
  if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
    const href = value.trim();
    cell.value(href);
    try {
      cell.hyperlink(href);
    } catch {
      // keep plain value if hyperlink write fails
    }
    return;
  }
  cell.value(value === undefined ? null : value);
}

/** Formule d'âge attendue : DATEDIF(H{row},TODAY(),"Y"). */
function ageFormulaForRow(row: number): string {
  return `DATEDIF(H${row},TODAY(),"Y")`;
}

function ensureAgeFormulas(sheet: PopulateSheet, lastDataRow: number): void {
  if (lastDataRow < FIRST_DATA_ROW) return;

  for (let row = FIRST_DATA_ROW; row <= lastDataRow; row++) {
    const cell = sheet.cell(row, COL_AGE);
    const existing = (cell as unknown as { formula(): string | undefined }).formula();
    const expected = ageFormulaForRow(row);
    if (existing && existing.trim()) {
      const normalized = existing.replace(/\s+/g, '').toUpperCase();
      const expectedNorm = expected.replace(/\s+/g, '').toUpperCase();
      if (normalized === expectedNorm || normalized === 'SHARED') continue;
    }
    cell.formula(expected);
  }
}

function readMatriculesFromHrSheet(wb: PopulateWorkbook, sheetName: string): Set<string> {
  const sheet = wb.sheet(sheetName);
  const set = new Set<string>();
  if (!sheet) return set;
  const used = sheet.usedRange();
  const maxRow = used ? used.endCell().rowNumber() : 500;
  for (let row = 3; row <= maxRow; row++) {
    const matricule = String(sheet.cell(row, 1).value() ?? '').trim();
    const nom = String(sheet.cell(row, 3).value() ?? '').trim();
    if (!matricule || !nom || !/^\d/.test(matricule)) continue;
    set.add(matricule);
  }
  return set;
}

/**
 * Copie les valeurs DEPENDANTS live → feuille cible.
 * `mode: 'active'` = matricules EMPLOYEE ; `mode: 'exit'` = matricules EXIT.
 * Exclut les lignes récap (TOTAL DES BENEFICIAIRES…).
 */
function copyDependantsValues(
  liveSheet: PopulateSheet,
  targetSheet: PopulateSheet,
  matricules: Set<string>,
  mode: 'active' | 'exit',
): number {
  const lastDataRow = findLastDependantsDataRow(liveSheet);
  if (lastDataRow < FIRST_DATA_ROW) return FIRST_DATA_ROW - 1;

  const liveUsed = liveSheet.usedRange();
  const baseEndCol = DEP_COL.typeMaison + 1; // 1-based Excel column
  const endCol = liveUsed ? Math.max(liveUsed.endCell().columnNumber(), baseEndCol) : baseEndCol;

  for (let row = 1; row < FIRST_DATA_ROW; row++) {
    for (let col = 1; col <= endCol; col++) {
      // Ne pas écraser le Total M1 avec l’ancienne valeur live — recalculé après.
      if (row === 1 && col === HEADER_TOTAL_VALUE_COL) continue;
      const value = readCellExportValue(liveSheet, row, col);
      if (value !== undefined) writeCellExportValue(targetSheet, row, col, value);
    }
  }
  targetSheet.cell(1, HEADER_TOTAL_LABEL_COL).value('Total');

  let outRow = FIRST_DATA_ROW;
  for (let row = FIRST_DATA_ROW; row <= lastDataRow; row++) {
    if (isSummaryExportRow(liveSheet, row)) continue;
    const matricule = String(liveSheet.cell(row, COL_MATRICULE).value() ?? '').trim();
    if (!matricule) continue;
    const inSet = matricules.has(matricule);
    if (mode === 'active' && !inSet) continue;
    if (mode === 'exit' && !inSet) continue;

    for (let col = 1; col <= endCol; col++) {
      writeCellExportValue(targetSheet, outRow, col, readCellExportValue(liveSheet, row, col));
    }
    outRow += 1;
  }

  return outRow - 1;
}

function clearExtraDependantsRows(templateSheet: PopulateSheet, lastDataRow: number): void {
  const used = templateSheet.usedRange();
  if (!used) return;
  const endRow = used.endCell().rowNumber();
  const endCol = used.endCell().columnNumber();
  if (endRow <= lastDataRow) return;

  for (let row = lastDataRow + 1; row <= endRow; row++) {
    for (let col = 1; col <= endCol; col++) {
      templateSheet.cell(row, col).value(null);
    }
  }
}

function extendRowStylesIfNeeded(
  sheet: PopulateSheet,
  templateEndBeforeCopy: number,
  lastDataRow: number,
): void {
  if (lastDataRow <= templateEndBeforeCopy) return;
  try {
    const rowStyle = sheet.row(FIRST_DATA_ROW).style([...STYLE_PROPS]);
    for (let row = templateEndBeforeCopy + 1; row <= lastDataRow; row++) {
      sheet.row(row).style(rowStyle);
    }
  } catch {
    // ignore style copy errors
  }
}

function finalizeDependantsSheet(
  sheet: PopulateSheet,
  lastDataRow: number,
  templateEndBeforeCopy: number,
): number {
  extendRowStylesIfNeeded(sheet, templateEndBeforeCopy, lastDataRow);
  clearExtraDependantsRows(sheet, lastDataRow);
  ensureAgeFormulas(sheet, lastDataRow);
  recalculateFamilyTotalsOnSheet(sheet, lastDataRow);
  return updateHeaderTotalAndRowNumbers(sheet, lastDataRow);
}

/**
 * Les formules RESUME pointent vers DEPENDANTS!$X$3:$X$707.
 * On les recalibre sur la dernière ligne de données live.
 */
function updateResumeFormulaRanges(resumeSheet: PopulateSheet, lastDataRow: number): void {
  if (lastDataRow < FIRST_DATA_ROW) return;

  const used = resumeSheet.usedRange();
  if (!used) return;

  const endRow = used.endCell().rowNumber();
  const endCol = used.endCell().columnNumber();
  const rangeRe = /(DEPENDANTS!\$[A-Z]+\$3:\$[A-Z]+\$)\d+/gi;

  for (let row = 1; row <= endRow; row++) {
    for (let col = 1; col <= endCol; col++) {
      const cell = resumeSheet.cell(row, col);
      const formula = (cell as unknown as { formula(): string | undefined }).formula();
      if (!formula) continue;
      if (!rangeRe.test(formula)) {
        rangeRe.lastIndex = 0;
        continue;
      }
      rangeRe.lastIndex = 0;
      const updated = formula.replace(rangeRe, `$1${lastDataRow}`);
      if (updated !== formula) {
        cell.formula(updated);
      }
    }
  }
}

/** Plage DEPENDANTS pour une colonne (ex. G → DEPENDANTS!$G$3:$G$715). */
function dependantsColRange(colLetter: string, lastDataRow: number): string {
  return `DEPENDANTS!$${colLetter}$${FIRST_DATA_ROW}:$${colLetter}$${lastDataRow}`;
}

/**
 * Tableaux RESUME ajoutés manuellement :
 * - Localisation × statut (A26:E31) → COUNTIFS Emp/Conj/Enf + totaux
 * - Mineurs et majeurs par site (A33:D38) → âge ≤17 / reste + totaux
 */
function fillSiteSummaryTableFormulas(resumeSheet: PopulateSheet, lastDataRow: number): void {
  if (lastDataRow < FIRST_DATA_ROW) return;

  const colG = dependantsColRange('G', lastDataRow);
  const colD = dependantsColRange('D', lastDataRow);
  const colI = dependantsColRange('I', lastDataRow);

  const localisationRows = [28, 29, 30] as const;
  const ageRows = [35, 36, 37] as const;

  for (const row of localisationRows) {
    const site = String(resumeSheet.cell(row, 1).value() ?? '').trim();
    if (!site || /^total$/i.test(site)) continue;

    resumeSheet.cell(row, 2).formula(`COUNTIFS(${colG},"${site}",${colD},"*Employ*")`);
    resumeSheet.cell(row, 3).formula(`COUNTIFS(${colG},"${site}",${colD},"*Conjoint*")`);
    resumeSheet.cell(row, 4).formula(`COUNTIFS(${colG},"${site}",${colD},"Enfant")`);
    resumeSheet.cell(row, 5).formula(`SUM(B${row}:D${row})`);
  }

  resumeSheet.cell(31, 2).formula('SUM(B28:B30)');
  resumeSheet.cell(31, 3).formula('SUM(C28:C30)');
  resumeSheet.cell(31, 4).formula('SUM(D28:D30)');
  resumeSheet.cell(31, 5).formula('SUM(E28:E30)');

  for (const row of ageRows) {
    const site = String(resumeSheet.cell(row, 1).value() ?? '').trim();
    if (!site || /^total$/i.test(site)) continue;

    resumeSheet.cell(row, 2).formula(`COUNTIFS(${colG},"${site}",${colI},"<=17")`);
    resumeSheet.cell(row, 3).formula(`COUNTIF(${colG},"${site}")-B${row}`);
    resumeSheet.cell(row, 4).formula(`SUM(B${row}:C${row})`);
  }

  resumeSheet.cell(38, 2).formula('SUM(B35:B37)');
  resumeSheet.cell(38, 3).formula('SUM(C35:C37)');
  resumeSheet.cell(38, 4).formula('SUM(D35:D37)');
}

function ensureExitTitle(sheet: PopulateSheet): void {
  try {
    const title = String(sheet.cell(1, 1).value() ?? '').trim();
    if (!title || /prise en charge|ppc barnet/i.test(title)) {
      sheet.cell(1, 1).value('PPC BARNET DRC — FAMILLES EXIT (SORTIS)');
    }
  } catch {
    // ignore
  }
}

function isFileLockError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
}

/** Enregistre le workbook template sur disque (retry si fichier ouvert / verrouillé). */
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
            `[dependants-export] Template non mis à jour (fichier verrouillé) : ${templatePath}`,
          );
          return;
        }
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
}

async function buildFromTemplate(templatePath: string, livePath: string): Promise<Buffer> {
  return withExcelLock(livePath, async () => {
    const [templateWb, liveWb] = await Promise.all([
      XlsxPopulate.fromFileAsync(templatePath),
      XlsxPopulate.fromFileAsync(livePath),
    ]);

    const liveSheet = liveWb.sheet(DEPENDANTS_SHEET);
    const templateSheet = templateWb.sheet(DEPENDANTS_SHEET);
    const resumeSheet = templateWb.sheet(RESUME_SHEET);

    if (!liveSheet || !templateSheet) {
      throw new Error(`Feuille ${DEPENDANTS_SHEET} introuvable`);
    }

    const lastLiveRow = findLastDependantsDataRow(liveSheet);
    recalculateFamilyTotalsOnSheet(liveSheet, lastLiveRow);
    // Recalcul en mémoire uniquement — pas d’écriture du workbook live pendant l’export.

    const activeMatricules = readMatriculesFromHrSheet(liveWb, 'EMPLOYEE');
    const exitMatricules = readMatriculesFromHrSheet(liveWb, EMPLOYEE_EXIT_SHEET);

    const templateEndBeforeCopy = templateSheet.usedRange()
      ? templateSheet.usedRange()!.endCell().rowNumber()
      : FIRST_DATA_ROW;

    const lastDataRow = copyDependantsValues(
      liveSheet,
      templateSheet,
      activeMatricules,
      'active',
    );
    finalizeDependantsSheet(templateSheet, lastDataRow, templateEndBeforeCopy);

    if (resumeSheet) {
      updateResumeFormulaRanges(resumeSheet, lastDataRow);
      fillSiteSummaryTableFormulas(resumeSheet, lastDataRow);
    }

    // Feuille familles EXIT
    const existingExit = templateWb.sheet(DEPENDANTS_EXIT_SHEET);
    if (existingExit) {
      templateWb.deleteSheet(existingExit);
    }
    const exitSheet = templateWb.cloneSheet(templateSheet, DEPENDANTS_EXIT_SHEET);
    ensureExitTitle(exitSheet);
    const exitEndBefore = findLastDependantsDataRow(exitSheet);
    const lastExitRow = copyDependantsValues(
      liveSheet,
      exitSheet,
      exitMatricules,
      'exit',
    );
    finalizeDependantsSheet(exitSheet, lastExitRow, exitEndBefore);

    return templateWb.outputAsync();
  });
}

async function buildFromLiveWorkbook(livePath: string): Promise<Buffer> {
  return withExcelLock(livePath, async () => {
    const liveWb = await XlsxPopulate.fromFileAsync(livePath);
    const liveSheet = liveWb.sheet(DEPENDANTS_SHEET);
    if (!liveSheet) {
      throw new Error(`Feuille ${DEPENDANTS_SHEET} introuvable`);
    }

    const lastLiveRow = findLastDependantsDataRow(liveSheet);
    recalculateFamilyTotalsOnSheet(liveSheet, lastLiveRow);
    updateHeaderTotalAndRowNumbers(liveSheet, lastLiveRow);
    // Export en mémoire — ne pas écrire le workbook live.

    const exportWb = await XlsxPopulate.fromBlankAsync();
    const activeSheet = exportWb.sheet(0).name(DEPENDANTS_SHEET);
    const activeMatricules = readMatriculesFromHrSheet(liveWb, 'EMPLOYEE');
    const exitMatricules = readMatriculesFromHrSheet(liveWb, EMPLOYEE_EXIT_SHEET);

    const lastActive = copyDependantsValues(
      liveSheet,
      activeSheet,
      activeMatricules,
      'active',
    );
    finalizeDependantsSheet(activeSheet, lastActive, FIRST_DATA_ROW);

    const exitSheet = exportWb.addSheet(DEPENDANTS_EXIT_SHEET);
    ensureExitTitle(exitSheet);
    const lastExit = copyDependantsValues(liveSheet, exitSheet, exitMatricules, 'exit');
    finalizeDependantsSheet(exitSheet, lastExit, FIRST_DATA_ROW);

    const liveResume = liveWb.sheet(RESUME_SHEET);
    if (liveResume) {
      const resumeSheet = exportWb.addSheet(RESUME_SHEET);
      const used = liveResume.usedRange();
      if (used) {
        const endRow = used.endCell().rowNumber();
        const endCol = used.endCell().columnNumber();
        for (let row = 1; row <= endRow; row++) {
          for (let col = 1; col <= endCol; col++) {
            const cell = liveResume.cell(row, col);
            const formula = (cell as unknown as { formula(): string | undefined }).formula();
            if (formula) resumeSheet.cell(row, col).formula(formula);
            else resumeSheet.cell(row, col).value(cell.value());
          }
        }
      }
      updateResumeFormulaRanges(resumeSheet, lastActive);
      fillSiteSummaryTableFormulas(resumeSheet, lastActive);
    }

    return exportWb.outputAsync();
  });
}

export async function buildFormattedDependantsWorkbookBuffer(livePath: string): Promise<Buffer> {
  const templatePath = resolveDependantsExportTemplatePath();

  if (fs.existsSync(templatePath)) {
    return buildFromTemplate(templatePath, livePath);
  }

  return buildFromLiveWorkbook(livePath);
}

const DEPENDANTS_HEADERS = [
  'N°',
  'Matricule',
  'N° Pactilis',
  'Statut',
  'Sexe',
  'Nom',
  'Localisation',
  'Date de naissance',
  'Âge',
  'Composition famille',
  'Enfants',
  'Total',
  'Commentaires',
  'Lien document',
  'N° villa',
  'Type maison',
] as const;

function dependantToExportRow(item: Dependant, index: number): unknown[] {
  return [
    index,
    item.matricule,
    item.pactilis,
    item.statut,
    item.sexe,
    item.nom,
    item.localisation,
    parseDateToExcelSerial(item.dateNaissance || ''),
    item.age ?? '',
    item.compositionFamille ?? '',
    item.enfants ?? '',
    item.total ?? '',
    item.commentaires || '',
    item.lienDocument || '',
    item.numeroVilla || '',
    item.typeMaison || '',
  ];
}

function writeDependantsSheetFromJson(
  sheet: PopulateSheet,
  rows: Dependant[],
): number {
  sheet.cell(1, HEADER_TOTAL_LABEL_COL).value('Total');
  sheet.cell(1, HEADER_TOTAL_VALUE_COL).value(rows.length);

  DEPENDANTS_HEADERS.forEach((header, index) => {
    sheet.cell(2, index + 1).value(header);
  });

  if (rows.length === 0) return FIRST_DATA_ROW - 1;

  rows.forEach((item, index) => {
    const excelRow = FIRST_DATA_ROW + index;
    const values = dependantToExportRow(item, index + 1);
    values.forEach((value, colIndex) => {
      writeCellExportValue(sheet, excelRow, colIndex + 1, value);
    });
    sheet.cell(excelRow, COL_AGE).formula(ageFormulaForRow(excelRow));
  });

  return FIRST_DATA_ROW + rows.length - 1;
}

/**
 * Export dépendants depuis le store JSON (sans EMPLOYEE.xlsx).
 * Utilise le template s’il est présent, sinon un classeur vide.
 */
export async function buildDependantsExportBufferFromJson(): Promise<Buffer> {
  const [{ readDependantsData }, { readEmployeesBundle }] = await Promise.all([
    import('./dependants-store'),
    import('./employees-store'),
  ]);

  const [{ dependants, exitedDependants }, { employees, exits }] = await Promise.all([
    readDependantsData(),
    readEmployeesBundle(),
  ]);

  const activeMats = new Set(employees.map((item) => item.matricule.trim()).filter(Boolean));
  const exitMats = new Set(exits.map((item) => item.matricule.trim()).filter(Boolean));

  const activeRows = dependants.filter((item) => activeMats.has(item.matricule.trim()));
  const exitRows = [
    ...dependants.filter((item) => exitMats.has(item.matricule.trim())),
    ...exitedDependants.filter(
      (item) => exitMats.has(item.matricule.trim()) || !activeMats.has(item.matricule.trim()),
    ),
  ];
  const exitById = new Map(exitRows.map((item) => [item.id, item]));
  const uniqueExitRows = [...exitById.values()];

  const templatePath = resolveDependantsExportTemplatePath();
  const workbook = fs.existsSync(templatePath)
    ? await XlsxPopulate.fromFileAsync(templatePath)
    : await XlsxPopulate.fromBlankAsync();

  let activeSheet = workbook.sheet(DEPENDANTS_SHEET);
  if (!activeSheet) {
    activeSheet = workbook.sheet(0).name(DEPENDANTS_SHEET);
  }

  const templateEndBefore = activeSheet.usedRange()
    ? activeSheet.usedRange()!.endCell().rowNumber()
    : FIRST_DATA_ROW;

  if (fs.existsSync(templatePath)) {
    clearExtraDependantsRows(activeSheet, FIRST_DATA_ROW - 1);
  }

  const lastActive = writeDependantsSheetFromJson(activeSheet, activeRows);
  finalizeDependantsSheet(activeSheet, lastActive, templateEndBefore);

  const resumeSheet = workbook.sheet(RESUME_SHEET);
  if (resumeSheet) {
    updateResumeFormulaRanges(resumeSheet, Math.max(lastActive, FIRST_DATA_ROW));
    fillSiteSummaryTableFormulas(resumeSheet, Math.max(lastActive, FIRST_DATA_ROW));
  }

  const existingExit = workbook.sheet(DEPENDANTS_EXIT_SHEET);
  if (existingExit) workbook.deleteSheet(existingExit);

  const exitSheet = workbook.cloneSheet(activeSheet, DEPENDANTS_EXIT_SHEET);
  ensureExitTitle(exitSheet);
  clearExtraDependantsRows(exitSheet, FIRST_DATA_ROW - 1);
  const lastExit = writeDependantsSheetFromJson(exitSheet, uniqueExitRows);
  finalizeDependantsSheet(exitSheet, lastExit, FIRST_DATA_ROW);

  return workbook.outputAsync();
}
