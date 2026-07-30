import 'server-only';

import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';
import {
  normalizeEmployeeStatut,
  parseDateToExcelSerial,
} from './employee-columns';
import {
  EXPORT_EMP_COL,
  EXPORT_EMP_HEADERS,
  EXPORT_EMP_LAST_COL,
  EXPORT_RAISON_EXIT_COL_LETTER,
} from './employees-export-columns';
import {
  EMPLOYEES_HR_EXPORT_TEMPLATE_PATH,
  EXPORT_TEMPLATE_FILES,
  getExportTemplatesDirectory,
} from './excel-export-template-paths';
import { readEmployeesBundle } from './employees-store';
import { isCddEmployee, isInActiveTrialPeriod, resolveEssaiStatutEval } from './employees-trial';
import type { Employee } from './types';

const MASTER_SHEET = 'EMPLOYEE';
const BASE_SHEET = 'Base';
const EXIT_EXPORT_SHEET = 'EXIT';
const ESSAI_EXPORT_SHEET = "Periode d'essai";
const CDD_EXPORT_SHEET = 'CDD';
const DASHBOARD_SHEET = 'Dashboard';
const FIRST_DATA_ROW = 3;
const AGE_COL = EXPORT_EMP_COL.age + 1;
const END_COL = EXPORT_EMP_LAST_COL + 1;

const KEEP_SHEETS = new Set([
  DASHBOARD_SHEET,
  BASE_SHEET,
  EXIT_EXPORT_SHEET,
  ESSAI_EXPORT_SHEET,
  CDD_EXPORT_SHEET,
]);

/** Plafond anti-explosion mémoire (xlsx-populate matérialise chaque cellule touchée). */
const MAX_TEMPLATE_SCAN = 40;
const MAX_DATA_ROWS = 2000;

type PopulateWorkbook = Awaited<ReturnType<typeof XlsxPopulate.fromFileAsync>>;
type PopulateSheet = ReturnType<PopulateWorkbook['sheet']>;

function resolveEmployeesHrExportTemplatePath(): string {
  return EMPLOYEES_HR_EXPORT_TEMPLATE_PATH;
}

function ageFormula(row: number): string {
  return `DATEDIF(K${row},TODAY(),"Y")`;
}

function cellValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function employeeToExportValues(employee: Employee): (string | number | boolean | null)[] {
  const values: (string | number | boolean | null)[] = new Array(EXPORT_EMP_LAST_COL + 1).fill(null);
  values[EXPORT_EMP_COL.matricule] = cellValue(employee.matricule || '');
  values[EXPORT_EMP_COL.company] = cellValue(employee.company || '');
  values[EXPORT_EMP_COL.nom] = cellValue(employee.nom || '');
  values[EXPORT_EMP_COL.departement] = cellValue(employee.departement || '');
  values[EXPORT_EMP_COL.grade] = cellValue(employee.grade || '');
  values[EXPORT_EMP_COL.jobTitle] = cellValue(employee.jobTitle || '');
  values[EXPORT_EMP_COL.localisation] = cellValue(employee.localisation || '');
  values[EXPORT_EMP_COL.centreCout] = cellValue(employee.centreCout || '');
  values[EXPORT_EMP_COL.appointmentDate] = cellValue(parseDateToExcelSerial(employee.appointmentDate || ''));
  values[EXPORT_EMP_COL.gender] = cellValue(employee.gender || '');
  values[EXPORT_EMP_COL.dateOfBirth] = cellValue(parseDateToExcelSerial(employee.dateOfBirth || ''));
  values[EXPORT_EMP_COL.nationality] = cellValue(employee.nationality || '');
  values[EXPORT_EMP_COL.maritalStatus] = cellValue(employee.maritalStatus || '');
  values[EXPORT_EMP_COL.numberOfChildren] = cellValue(employee.numberOfChildren ?? '');
  values[EXPORT_EMP_COL.personnelArea] = cellValue(employee.personnelArea || '');
  values[EXPORT_EMP_COL.employeeSubGroup] = cellValue(employee.employeeSubGroup || '');
  values[EXPORT_EMP_COL.payrollArea] = cellValue(employee.payrollArea || '');
  // Payroll periode : pas de champ dédié en JSON — laisser vide.
  values[EXPORT_EMP_COL.payrollPeriode] = null;
  values[EXPORT_EMP_COL.lineManagerName] = cellValue(employee.lineManagerName || '');
  values[EXPORT_EMP_COL.lineManagerPosition] = cellValue(employee.lineManagerPosition || '');
  values[EXPORT_EMP_COL.cnss] = cellValue(employee.cnss || '');
  values[EXPORT_EMP_COL.nif] = cellValue(employee.nif || '');
  values[EXPORT_EMP_COL.statut] = cellValue(normalizeEmployeeStatut(employee.statut));
  values[EXPORT_EMP_COL.typeContrat] = cellValue(employee.typeContrat || '');
  values[EXPORT_EMP_COL.dureeContratMois] = cellValue(employee.dureeContratMois ?? '');
  values[EXPORT_EMP_COL.periodeEssaiMois] = cellValue(employee.periodeEssaiMois ?? '');
  values[EXPORT_EMP_COL.dateFinPeriodeEssai] = cellValue(
    parseDateToExcelSerial(employee.dateFinPeriodeEssai || ''),
  );
  values[EXPORT_EMP_COL.dateFinContrat] = cellValue(parseDateToExcelSerial(employee.dateFinContrat || ''));
  values[EXPORT_EMP_COL.raisonExit] = cellValue(employee.raisonExit || '');
  values[EXPORT_EMP_COL.essaiActions] = cellValue(employee.essaiActions || '');
  values[EXPORT_EMP_COL.essaiResponsable] = cellValue(employee.essaiResponsable || '');
  values[EXPORT_EMP_COL.essaiEcheanceEval] = cellValue(
    parseDateToExcelSerial(employee.essaiEcheanceEval || ''),
  );
  values[EXPORT_EMP_COL.essaiStatutEval] = cellValue(resolveEssaiStatutEval(employee));
  values[EXPORT_EMP_COL.essaiCommentaire] = cellValue(employee.essaiCommentaire || '');
  return values;
}

/** Écrit / aligne les en-têtes du template (CNSS, NIF, contrat, exit). */
function applyExportHeaders(sheet: PopulateSheet): void {
  for (let col0 = 0; col0 <= EXPORT_EMP_LAST_COL; col0++) {
    const header = EXPORT_EMP_HEADERS[col0];
    if (header) sheet.cell(2, col0 + 1).value(header);
  }
}

/** Dernière ligne modèle occupée (scan court, sans usedRange étendu). */
function findSampleLastRow(sheet: PopulateSheet): number {
  let last = FIRST_DATA_ROW - 1;
  for (let row = FIRST_DATA_ROW; row <= FIRST_DATA_ROW + MAX_TEMPLATE_SCAN; row++) {
    const matricule = sheet.cell(row, 1).value();
    if (matricule !== undefined && matricule !== null && String(matricule).trim() !== '') {
      last = row;
    }
  }
  return last;
}

function clearRow(sheet: PopulateSheet, row: number): void {
  for (let col = 1; col <= END_COL; col++) {
    sheet.cell(row, col).value(null);
  }
}

function writeEmployeeRow(sheet: PopulateSheet, row: number, employee: Employee): void {
  const values = employeeToExportValues(employee);
  for (let col0 = 0; col0 <= EXPORT_EMP_LAST_COL; col0++) {
    if (col0 === EXPORT_EMP_COL.age) continue;
    sheet.cell(row, col0 + 1).value(values[col0]);
  }
  sheet.cell(row, AGE_COL).formula(ageFormula(row));
}

/**
 * Remplit une feuille sans range massif ni clone :
 * - efface seulement les lignes modèle existantes (≤ ~40)
 * - écrit ligne par ligne (pic mémoire bas)
 */
function fillPeopleSheet(sheet: PopulateSheet, employees: Employee[]): number {
  if (employees.length > MAX_DATA_ROWS) {
    throw new Error(`Export limité à ${MAX_DATA_ROWS} lignes (reçu ${employees.length}).`);
  }

  applyExportHeaders(sheet);

  const sampleLast = findSampleLastRow(sheet);
  const lastDataRow = employees.length > 0
    ? FIRST_DATA_ROW + employees.length - 1
    : FIRST_DATA_ROW - 1;

  // Effacer uniquement les anciennes lignes modèle (pas de range géant).
  const clearUntil = Math.max(sampleLast, lastDataRow);
  for (let row = FIRST_DATA_ROW; row <= clearUntil; row++) {
    clearRow(sheet, row);
  }

  for (let i = 0; i < employees.length; i++) {
    writeEmployeeRow(sheet, FIRST_DATA_ROW + i, employees[i]!);
  }

  return lastDataRow;
}

function ensurePeopleSheet(
  workbook: PopulateWorkbook,
  baseSheet: PopulateSheet,
  sheetName: string,
  title: string,
): PopulateSheet {
  const existing = workbook.sheet(sheetName);
  if (existing) {
    existing.cell(1, 1).value(title);
    return existing;
  }

  // Pas de cloneSheet : nouvelle feuille + 2 lignes d'en-tête seulement.
  const sheet = workbook.addSheet(sheetName);
  for (let row = 1; row <= 2; row++) {
    for (let col = 1; col <= END_COL; col++) {
      const value = baseSheet.cell(row, col).value();
      if (value !== undefined && value !== null && value !== '') {
        sheet.cell(row, col).value(value);
      }
    }
  }
  sheet.cell(1, 1).value(title);
  return sheet;
}

function updateDashboardFormulas(
  dashboardSheet: PopulateSheet,
  lastBaseRow: number,
  lastExitRow: number,
): void {
  // Zone KPI fixe uniquement — ne pas parcourir usedRange (charts → explosion RAM).
  for (let row = 1; row <= 45; row++) {
    for (let col = 1; col <= 8; col++) {
      const cell = dashboardSheet.cell(row, col);
      let formula = '';
      try {
        formula = String(cell.formula() ?? '');
      } catch {
        continue;
      }
      if (!formula || (!formula.includes('Base!') && !formula.includes('EXIT!'))) continue;
      let updated = formula;
      if (lastBaseRow >= FIRST_DATA_ROW) {
        updated = updated.replace(
          /Base!\$([A-Z]+)\$3:\$\1\$\d+/gi,
          (_m, colLetter: string) => `Base!$${colLetter}$3:$${colLetter}$${lastBaseRow}`,
        );
      }
      if (lastExitRow >= FIRST_DATA_ROW) {
        updated = updated.replace(
          /EXIT!\$([A-Z]+)\$3:\$\1\$\d+/gi,
          (_m, colLetter: string) => `EXIT!$${colLetter}$3:$${colLetter}$${lastExitRow}`,
        );
      }
      if (updated !== formula) cell.formula(updated);
    }
  }

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

  const reasons = ['Demission', 'Licenciement', 'Retraite', 'Fin de contrat'];
  const raisonCol = EXPORT_RAISON_EXIT_COL_LETTER;
  reasons.forEach((reason, index) => {
    const row = startRow + 3 + index;
    dashboardSheet.cell(row, 2).value(reason);
    dashboardSheet.cell(row, 3).formula(`COUNTIF(${exitRange(raisonCol)},"${reason}")`);
  });

  const totalRow = startRow + 3 + reasons.length;
  dashboardSheet.cell(totalRow, 2).value('TOTAL');
  dashboardSheet
    .cell(totalRow, 3)
    .formula(`SUM(C${startRow + 3}:C${startRow + 2 + reasons.length})`);
}

/**
 * Export RH (xlsx-populate) optimisé mémoire :
 * - un seul workbook
 * - pas de cloneSheet / pas de range massif
 * - effacement limité aux lignes modèle
 */
export async function buildEmployeesHrExportBuffer(): Promise<Buffer> {
  const templatePath = resolveEmployeesHrExportTemplatePath();
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Template introuvable : ${templatePath}. Placez ${EXPORT_TEMPLATE_FILES.employeesHr} dans ${getExportTemplatesDirectory()}.`,
    );
  }

  const { employees, exits } = await readEmployeesBundle();
  const workbook = await XlsxPopulate.fromFileAsync(templatePath);

  const baseSheet = workbook.sheet(BASE_SHEET) ?? workbook.sheet(MASTER_SHEET);
  if (!baseSheet) {
    throw new Error(`Feuille ${MASTER_SHEET} / ${BASE_SHEET} introuvable dans le template`);
  }
  if (baseSheet.name() !== BASE_SHEET) {
    baseSheet.name(BASE_SHEET);
  }

  // Garder Dashboard + Base + EXIT + Periode d'essai + CDD.
  for (const sheet of [...workbook.sheets()]) {
    const name = sheet.name();
    if (!KEEP_SHEETS.has(name)) {
      try {
        sheet.delete();
      } catch {
        // ignore
      }
    }
  }

  const exitSheet = ensurePeopleSheet(workbook, baseSheet, EXIT_EXPORT_SHEET, 'EXIT — AGENTS SORTIS');
  const essaiSheet = ensurePeopleSheet(
    workbook,
    baseSheet,
    ESSAI_EXPORT_SHEET,
    "PERIODE D'ESSAI — EN COURS",
  );
  const cddSheet = ensurePeopleSheet(workbook, baseSheet, CDD_EXPORT_SHEET, 'CDD — CONTRATS');
  const dashboardSheet = workbook.sheet(DASHBOARD_SHEET);

  const sortedActive = [...employees].sort((a, b) =>
    (a.nom || '').localeCompare(b.nom || '', 'fr'),
  );
  const sortedExits = [...exits].sort((a, b) =>
    (a.nom || '').localeCompare(b.nom || '', 'fr'),
  );
  const sortedEssai = sortedActive.filter((e) => isInActiveTrialPeriod(e));
  const sortedCdd = sortedActive.filter((e) => isCddEmployee(e));

  const lastBaseRow = fillPeopleSheet(baseSheet, sortedActive);
  const lastExitRow = fillPeopleSheet(exitSheet, sortedExits);
  fillPeopleSheet(essaiSheet, sortedEssai);
  fillPeopleSheet(cddSheet, sortedCdd);

  if (dashboardSheet) {
    updateDashboardFormulas(dashboardSheet, lastBaseRow, lastExitRow);
  }

  return workbook.outputAsync() as Promise<Buffer>;
}

export function buildEmployeesHrExportFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `EMPLOYEES_HR_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
}
