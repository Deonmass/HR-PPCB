import fs from 'fs/promises';
import path from 'path';
import { DOCUMENT_FIELDS, normalizeDocStatus } from './documents';
import {
  EMP_COL,
  EMP_CONTRACT_HEADERS,
  EMP_LAST_COL,
  EMPLOYEE_EXIT_SHEET,
  computeAgeFromDisplayDate,
  computeFinPeriodeEssai,
  formatExcelDateValue,
  isRealExitRaison,
  normalizeEmployeeStatut,
  parseDateToExcelSerial,
  parseOptionalNumber,
  todayDisplayDate,
} from './employee-columns';
import {
  type AoaRow,
  cloneRowStyle,
  getSheet,
  getSheetBlock,
  readWorkbook,
  saveWorkbook,
  withExcelLock,
  shiftRowsUp,
  writeRowValues,
} from './excel-io';
import type { Employee } from './types';
import { emptyEmployeeHrProfile } from './types';
import * as XLSX from 'xlsx-js-style';
import type { WorkBook, WorkSheet } from 'xlsx-js-style';

import { getEmployeeWorkbookPath, getEmployeesSnapshotPath } from './excel-data-paths';

/**
 * `Excel/EMPLOYEE.xlsx` is the live database for the Employés module.
 * Master data is read from sheet "EMPLOYEE"; documents from "CHECK DOCUMENTS BASE".
 * Inactive employees are moved to sheet "EXIT" and removed from the active base.
 * Check Documents rows are never deleted on exit: the employee is simply excluded
 * from active listings / % conformité until they return Active.
 * Les feuilles EMPLOYEE et CHECK DOCUMENTS BASE restent alignées : à l'ajout (app
 * ou Excel) une ligne manquante est créée de l'autre côté (réconciliation bilatérale).
 * La colonne Age (formule) n'est jamais écrasée.
 */

const EXCEL_PATH = getEmployeeWorkbookPath();
const SNAPSHOT_PATH = getEmployeesSnapshotPath();

const MASTER_SHEET_NAME = 'EMPLOYEE';
const MASTER_DATA_START = 2;
const EXIT_DATA_START = 2;
const SHEET_NAME = 'CHECK DOCUMENTS BASE';
const DATA_START = 3;
const DOC_COL_START = 6;

interface EmployeesCache {
  mtimeMs: number;
  employees: Employee[];
  exits: Employee[];
}

let employeesCache: EmployeesCache | null = null;

export function invalidateEmployeesCache(): void {
  employeesCache = null;
}

/** Force le rechargement après modification externe du fichier Excel. */
export async function refreshEmployeesFromExcel(): Promise<Employee[]> {
  invalidateEmployeesCache();
  return readEmployees();
}

async function getExcelMtime(): Promise<number> {
  const stat = await fs.stat(EXCEL_PATH);
  return stat.mtimeMs;
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

interface EmployeesReadState {
  dataRows: AoaRow[];
  masterRows: AoaRow[];
  exitRows: AoaRow[];
}

interface EmployeesWorkbookState extends EmployeesReadState {
  wb: Awaited<ReturnType<typeof readWorkbook>>;
  ws: WorkSheet;
  masterWs: WorkSheet;
  exitWs: WorkSheet;
}

function ensureContractHeaders(ws: WorkSheet): boolean {
  let changed = false;
  for (const [colRaw, label] of Object.entries(EMP_CONTRACT_HEADERS)) {
    const col = Number(colRaw);
    const addr = XLSX.utils.encode_cell({ r: 1, c: col });
    const cell = ws[addr] as { v?: unknown } | undefined;
    if (str(cell?.v) === label) continue;
    writeRowValues(ws, 1, [label], col);
    changed = true;
  }
  return changed;
}

function copyMasterHeaderRows(masterWs: WorkSheet): AoaRow[] {
  const rows: AoaRow[] = [];
  for (let r = 0; r < MASTER_DATA_START; r++) {
    const row: AoaRow = [];
    for (let c = 0; c <= EMP_LAST_COL; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = masterWs[addr] as { v?: unknown } | undefined;
      const raw = cell?.v;
      if (raw === undefined || raw === null) row.push('');
      else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
        row.push(raw);
      } else {
        row.push(String(raw));
      }
    }
    rows.push(row);
  }
  for (const [colRaw, label] of Object.entries(EMP_CONTRACT_HEADERS)) {
    rows[1][Number(colRaw)] = label;
  }
  return rows;
}

function ensureExitSheet(wb: WorkBook, masterWs: WorkSheet): WorkSheet {
  if (wb.Sheets[EMPLOYEE_EXIT_SHEET]) {
    const existing = wb.Sheets[EMPLOYEE_EXIT_SHEET];
    ensureContractHeaders(existing);
    return existing;
  }
  const headerRows = copyMasterHeaderRows(masterWs);
  const ws = XLSX.utils.aoa_to_sheet(headerRows);
  XLSX.utils.book_append_sheet(wb, ws, EMPLOYEE_EXIT_SHEET);
  return ws;
}

async function loadState(): Promise<EmployeesWorkbookState> {
  const wb = await readWorkbook(EXCEL_PATH);
  const ws = getSheet(wb, SHEET_NAME);
  const masterWs = getSheet(wb, MASTER_SHEET_NAME);
  const exitWs = ensureExitSheet(wb, masterWs);
  const sheet = getSheetBlock(wb, SHEET_NAME, DATA_START, { keyCol: 0 });
  const masterSheet = getSheetBlock(wb, MASTER_SHEET_NAME, MASTER_DATA_START, { keyCol: 0 });
  const exitSheet = getSheetBlock(wb, EMPLOYEE_EXIT_SHEET, EXIT_DATA_START, { keyCol: 0 });
  return {
    wb,
    ws,
    masterWs,
    exitWs,
    dataRows: sheet.dataRows,
    masterRows: masterSheet.dataRows,
    exitRows: exitSheet.dataRows,
  };
}

function hrFromMasterRow(row: AoaRow) {
  const dateOfBirth = formatExcelDateValue(row[EMP_COL.dateOfBirth]);
  const ageCached = parseOptionalNumber(row[EMP_COL.age]);
  const ageFromDob = computeAgeFromDisplayDate(dateOfBirth);
  const appointmentDate = formatExcelDateValue(row[EMP_COL.appointmentDate]);
  const periodeEssaiMois = parseOptionalNumber(row[EMP_COL.periodeEssaiMois]);
  const storedFinEssai = formatExcelDateValue(row[EMP_COL.dateFinPeriodeEssai]);
  const computedFinEssai = computeFinPeriodeEssai(appointmentDate, periodeEssaiMois);
  const dateFinPeriodeEssai = computedFinEssai || storedFinEssai;
  return {
    company: str(row[EMP_COL.company]),
    centreCout: str(row[EMP_COL.centreCout]),
    appointmentDate,
    gender: str(row[EMP_COL.gender]),
    dateOfBirth,
    age: ageFromDob ?? (ageCached != null && ageCached > 0 ? ageCached : null),
    nationality: str(row[EMP_COL.nationality]),
    maritalStatus: str(row[EMP_COL.maritalStatus]),
    numberOfChildren: parseOptionalNumber(row[EMP_COL.numberOfChildren]),
    personnelArea: str(row[EMP_COL.personnelArea]),
    personnelSubArea: '',
    employeeSubGroup: str(row[EMP_COL.employeeSubGroup]),
    payrollArea: str(row[EMP_COL.payrollArea]),
    position: '',
    departmentHr: str(row[EMP_COL.departmentHr]),
    lineManagerName: str(row[EMP_COL.lineManagerName]),
    lineManagerPosition: str(row[EMP_COL.lineManagerPosition]),
    patersonGrade: '',
    statut: normalizeEmployeeStatut(row[EMP_COL.statut]),
    typeContrat: str(row[EMP_COL.typeContrat]),
    periodeEssaiMois,
    dateFinPeriodeEssai,
    dateFinContrat: formatExcelDateValue(row[EMP_COL.dateFinContrat]),
    raisonExit: str(row[EMP_COL.raisonExit]) || 'NA',
  };
}

function rowToEmployeeMaster(row: AoaRow): Omit<Employee, 'documents'> | null {
  const matricule = str(row[EMP_COL.matricule]);
  const nom = str(row[EMP_COL.nom]);
  if (!matricule || !nom || !/^\d/.test(matricule)) return null;
  return {
    matricule,
    nom,
    departement: str(row[EMP_COL.departement]),
    grade: str(row[EMP_COL.grade]),
    jobTitle: str(row[EMP_COL.jobTitle]),
    localisation: str(row[EMP_COL.localisation]),
    ...hrFromMasterRow(row),
  };
}

function masterCoreValues(employee: Employee, existing?: AoaRow): AoaRow {
  return [
    employee.matricule,
    employee.company || str(existing?.[EMP_COL.company]),
    employee.nom,
    employee.departement,
    employee.grade,
    employee.jobTitle,
    employee.localisation ?? '',
    employee.centreCout || str(existing?.[EMP_COL.centreCout]),
  ];
}

function masterPreAgeValues(employee: Employee): AoaRow {
  return [
    parseDateToExcelSerial(employee.appointmentDate || ''),
    employee.gender || '',
    parseDateToExcelSerial(employee.dateOfBirth || ''),
  ];
}

function masterPostAgeValues(employee: Employee): AoaRow {
  return [
    employee.nationality || '',
    employee.maritalStatus || '',
    employee.numberOfChildren ?? '',
    employee.personnelArea || '',
    '',
    employee.employeeSubGroup || '',
    employee.payrollArea || '',
    '',
    employee.departmentHr || employee.departement || '',
    employee.lineManagerName || '',
    employee.lineManagerPosition || '',
    '',
  ];
}

function masterContractValues(employee: Employee): AoaRow {
  return [
    normalizeEmployeeStatut(employee.statut),
    employee.typeContrat || '',
    employee.periodeEssaiMois ?? '',
    parseDateToExcelSerial(employee.dateFinPeriodeEssai || ''),
    parseDateToExcelSerial(employee.dateFinContrat || ''),
    employee.raisonExit || '',
  ];
}

function applyContractDefaults(employee: Employee): Employee {
  let statut = normalizeEmployeeStatut(employee.statut);
  const periodeEssaiMois = employee.periodeEssaiMois;
  const dateFinPeriodeEssai = computeFinPeriodeEssai(
    employee.appointmentDate || '',
    periodeEssaiMois,
  );
  let dateFinContrat = employee.dateFinContrat || '';
  let raisonExit = employee.raisonExit || '';

  // Toute vraie raison de sortie force Inactive ; NA ramène Active.
  if (isRealExitRaison(raisonExit)) {
    statut = 'Inactive';
  } else if (/^na$/i.test(raisonExit.trim()) || !raisonExit.trim()) {
    raisonExit = 'NA';
    statut = 'Active';
  }

  if (statut === 'Inactive') {
    if (!dateFinContrat) dateFinContrat = todayDisplayDate();
  }

  return {
    ...employee,
    statut,
    periodeEssaiMois,
    dateFinPeriodeEssai,
    dateFinContrat,
    raisonExit,
  };
}

function rowToEmployee(row: AoaRow): Employee | null {
  const matricule = str(row[0]);
  const nom = str(row[1]);
  if (!matricule || !nom || !/^\d/.test(matricule)) return null;
  const documents: Record<string, string> = {};
  DOCUMENT_FIELDS.forEach((field, i) => {
    documents[field.key] = normalizeDocStatus(String(row[DOC_COL_START + i] ?? ''));
  });
  return {
    matricule,
    nom,
    departement: str(row[2]),
    grade: str(row[3]),
    jobTitle: str(row[4]),
    localisation: str(row[5]),
    documents,
    ...emptyEmployeeHrProfile(),
  };
}

function employeeToRow(employee: Employee): AoaRow {
  const docs = DOCUMENT_FIELDS.map((f) => normalizeDocStatus(String(employee.documents?.[f.key] || '')));
  let y = 0;
  let na = 0;
  let n = 0;
  docs.forEach((v) => {
    if (v === 'Y') y++;
    else if (v === 'NA') na++;
    else n++;
  });
  const total = y + na + n || 1;
  const rate = (y + na) / total;
  return [
    employee.matricule,
    employee.nom,
    employee.departement,
    employee.grade,
    employee.jobTitle,
    employee.localisation ?? '',
    ...docs,
    y,
    na,
    n,
    rate,
  ];
}

function extractActiveEmployees(dataRows: AoaRow[], masterRows: AoaRow[]): Employee[] {
  const masterByMatricule = new Map<string, ReturnType<typeof rowToEmployeeMaster>>();
  for (const row of masterRows) {
    const master = rowToEmployeeMaster(row);
    if (master) masterByMatricule.set(master.matricule, master);
  }

  const employees: Employee[] = [];
  for (const row of dataRows) {
    const employee = rowToEmployee(row);
    if (!employee) continue;
    const master = masterByMatricule.get(employee.matricule);
    // Ligne Check Documents d'un employé Exit : on la conserve dans Excel
    // mais on ne la compte plus dans la population active / % conformité.
    if (!master) continue;
    Object.assign(employee, master, { statut: 'Active' });
    employees.push(employee);
  }

  for (const row of masterRows) {
    const master = rowToEmployeeMaster(row);
    if (!master || employees.some((employee) => employee.matricule === master.matricule)) continue;
    employees.push({
      ...master,
      statut: 'Active',
      documents: Object.fromEntries(DOCUMENT_FIELDS.map((field) => [field.key, 'N'])),
    });
  }

  return employees.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

function extractExitedEmployees(exitRows: AoaRow[]): Employee[] {
  const exits: Employee[] = [];
  for (const row of exitRows) {
    const master = rowToEmployeeMaster(row);
    if (!master) continue;
    exits.push({
      ...master,
      statut: 'Inactive',
      documents: Object.fromEntries(DOCUMENT_FIELDS.map((field) => [field.key, 'N'])),
    });
  }
  return exits.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

async function writeSnapshot(employees: Employee[], exits: Employee[]): Promise<void> {
  try {
    await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
    await fs.writeFile(
      SNAPSHOT_PATH,
      JSON.stringify({ employees, exits }, null, 2),
      'utf-8',
    );
  } catch {
    // Best-effort only
  }
}

async function persistEmployeesCache(employees: Employee[], exits: Employee[]): Promise<void> {
  const mtimeMs = await getExcelMtime();
  employeesCache = { mtimeMs, employees, exits };
  await writeSnapshot(employees, exits);
}

async function buildAndSnapshot(state: EmployeesWorkbookState): Promise<{
  employees: Employee[];
  exits: Employee[];
}> {
  const employees = extractActiveEmployees(state.dataRows, state.masterRows);
  const exits = extractExitedEmployees(state.exitRows);
  await persistEmployeesCache(employees, exits);
  return { employees, exits };
}

function writeMasterRowOnto(
  ws: WorkSheet,
  rows: AoaRow[],
  dataStart: number,
  employee: Employee,
): void {
  const idx = rows.findIndex((row) => str(row[0]) === employee.matricule);
  const existing = idx >= 0 ? rows[idx] : undefined;
  const excelRow = idx >= 0 ? dataStart + idx : dataStart + rows.length;

  if (idx < 0) {
    cloneRowStyle(ws, excelRow - 1, excelRow, 0, EMP_LAST_COL);
  }

  const core = masterCoreValues(employee, existing);
  writeRowValues(ws, excelRow, core, 0);
  writeRowValues(ws, excelRow, masterPreAgeValues(employee), EMP_COL.appointmentDate);
  writeRowValues(ws, excelRow, masterPostAgeValues(employee), EMP_COL.nationality);
  writeRowValues(ws, excelRow, masterContractValues(employee), EMP_COL.statut);

  const merged: AoaRow = [...(existing ? [...existing] : [])];
  while (merged.length <= EMP_LAST_COL) merged.push('');
  core.forEach((v, i) => {
    merged[i] = v;
  });
  masterPreAgeValues(employee).forEach((v, i) => {
    merged[EMP_COL.appointmentDate + i] = v;
  });
  masterPostAgeValues(employee).forEach((v, i) => {
    merged[EMP_COL.nationality + i] = v;
  });
  masterContractValues(employee).forEach((v, i) => {
    merged[EMP_COL.statut + i] = v;
  });

  if (idx >= 0) rows[idx] = merged;
  else rows.push(merged);
}

function removeMasterRow(
  ws: WorkSheet,
  rows: AoaRow[],
  dataStart: number,
  matricule: string,
): boolean {
  const idx = rows.findIndex((row) => str(row[0]) === matricule);
  if (idx < 0) return false;
  shiftRowsUp(ws, dataStart + idx, 1);
  rows.splice(idx, 1);
  return true;
}

/**
 * Met à jour uniquement l'identité (A–F) si la ligne existe déjà —
 * ne touche jamais aux colonnes documents (G–Y). Crée la ligne sinon.
 */
function syncCheckDocsIdentityRow(state: EmployeesWorkbookState, employee: Employee): void {
  const idx = state.dataRows.findIndex((row) => str(row[0]) === employee.matricule);
  const identity: AoaRow = [
    employee.matricule,
    employee.nom,
    employee.departement,
    employee.grade,
    employee.jobTitle,
    employee.localisation ?? '',
  ];

  if (idx >= 0) {
    writeRowValues(state.ws, DATA_START + idx, identity, 0);
    const existing = [...state.dataRows[idx]];
    identity.forEach((value, i) => {
      existing[i] = value;
    });
    state.dataRows[idx] = existing;
    return;
  }

  const row = employeeToRow(employee);
  const newRow = DATA_START + state.dataRows.length;
  cloneRowStyle(state.ws, newRow - 1, newRow, 0, row.length - 1);
  writeRowValues(state.ws, newRow, row);
  state.dataRows.push(row);
}

function checkDocsIdentityMatches(row: AoaRow, employee: Pick<Employee, 'matricule' | 'nom' | 'departement' | 'grade' | 'jobTitle' | 'localisation'>): boolean {
  return (
    str(row[0]) === employee.matricule
    && str(row[1]) === employee.nom
    && str(row[2]) === employee.departement
    && str(row[3]) === employee.grade
    && str(row[4]) === employee.jobTitle
    && str(row[5]) === (employee.localisation ?? '')
  );
}

/**
 * Aligne EMPLOYEE ↔ CHECK DOCUMENTS BASE :
 * - actif dans EMPLOYEE sans ligne check-docs → crée la ligne (docs = N)
 * - ligne check-docs sans EMPLOYEE ni EXIT → crée la fiche EMPLOYEE
 * - identité check-docs désynchronisée → met à jour A–F depuis EMPLOYEE
 * Les orphelins check-docs d'employés EXIT sont laissés tels quels.
 */
function reconcileEmployeeAndCheckDocs(state: EmployeesWorkbookState): boolean {
  let changed = false;

  const exitMatricules = new Set<string>();
  for (const row of state.exitRows) {
    const matricule = str(row[EMP_COL.matricule]);
    if (matricule && /^\d/.test(matricule)) exitMatricules.add(matricule);
  }

  const checkByMatricule = new Map<string, number>();
  state.dataRows.forEach((row, index) => {
    const matricule = str(row[0]);
    if (matricule && /^\d/.test(matricule)) checkByMatricule.set(matricule, index);
  });

  for (const row of state.masterRows) {
    const master = rowToEmployeeMaster(row);
    if (!master) continue;

    const employee: Employee = {
      ...master,
      documents: Object.fromEntries(DOCUMENT_FIELDS.map((field) => [field.key, 'N'])),
    };

    const existingIdx = checkByMatricule.get(master.matricule);
    if (existingIdx === undefined) {
      syncCheckDocsIdentityRow(state, employee);
      checkByMatricule.set(master.matricule, state.dataRows.length - 1);
      changed = true;
      continue;
    }

    if (!checkDocsIdentityMatches(state.dataRows[existingIdx], master)) {
      syncCheckDocsIdentityRow(state, employee);
      changed = true;
    }
  }

  const masterMatricules = new Set<string>();
  for (const row of state.masterRows) {
    const matricule = str(row[EMP_COL.matricule]);
    if (matricule && /^\d/.test(matricule)) masterMatricules.add(matricule);
  }

  for (const row of state.dataRows) {
    const fromDocs = rowToEmployee(row);
    if (!fromDocs) continue;
    if (masterMatricules.has(fromDocs.matricule)) continue;
    if (exitMatricules.has(fromDocs.matricule)) continue;

    writeMasterRowOnto(state.masterWs, state.masterRows, MASTER_DATA_START, {
      ...emptyEmployeeHrProfile(),
      ...fromDocs,
      statut: 'Active',
      raisonExit: 'NA',
      departmentHr: fromDocs.departement || fromDocs.departmentHr || '',
    });
    masterMatricules.add(fromDocs.matricule);
    changed = true;
  }

  return changed;
}

function isMalanga(value: unknown): boolean {
  return /^malanga$/i.test(str(value));
}

async function replaceMalangaWithZamba(state: EmployeesWorkbookState): Promise<boolean> {
  let changed = false;
  for (let i = 0; i < state.masterRows.length; i++) {
    const row = state.masterRows[i];
    const excelRow = MASTER_DATA_START + i;
    if (isMalanga(row[EMP_COL.localisation])) {
      writeRowValues(state.masterWs, excelRow, ['Zamba'], EMP_COL.localisation);
      row[EMP_COL.localisation] = 'Zamba';
      changed = true;
    }
    if (isMalanga(row[EMP_COL.personnelSubArea])) {
      writeRowValues(state.masterWs, excelRow, ['Zamba'], EMP_COL.personnelSubArea);
      row[EMP_COL.personnelSubArea] = 'Zamba';
      changed = true;
    }
  }

  for (let i = 0; i < state.dataRows.length; i++) {
    const row = state.dataRows[i];
    if (!isMalanga(row[5])) continue;
    writeRowValues(state.ws, DATA_START + i, ['Zamba'], 5);
    row[5] = 'Zamba';
    changed = true;
  }

  return changed;
}

function getMasterHeader(ws: WorkSheet, col: number): string {
  const addr = XLSX.utils.encode_cell({ r: 1, c: col });
  const cell = ws[addr] as { v?: unknown } | undefined;
  return str(cell?.v);
}

function deprecatedHeadersPresent(ws: WorkSheet): boolean {
  return (
    /sub\s*area/i.test(getMasterHeader(ws, EMP_COL.personnelSubArea))
    || /^position$/i.test(getMasterHeader(ws, EMP_COL.position))
    || /paterson/i.test(getMasterHeader(ws, EMP_COL.patersonGrade))
  );
}

function clearDeprecatedHeaders(ws: WorkSheet): void {
  const headerRow = 1;
  writeRowValues(ws, headerRow, [''], EMP_COL.personnelSubArea);
  writeRowValues(ws, headerRow, [''], EMP_COL.position);
  writeRowValues(ws, headerRow, [''], EMP_COL.patersonGrade);
}

export async function readEmployees(): Promise<Employee[]> {
  const bundle = await readEmployeesBundle();
  return bundle.employees;
}

export async function readExitedEmployees(): Promise<Employee[]> {
  const bundle = await readEmployeesBundle();
  return bundle.exits;
}

export async function readEmployeesBundle(): Promise<{ employees: Employee[]; exits: Employee[] }> {
  const mtimeMs = await getExcelMtime();
  if (employeesCache?.mtimeMs === mtimeMs) {
    return { employees: employeesCache.employees, exits: employeesCache.exits };
  }

  return withExcelLock(EXCEL_PATH, async () => {
    if (employeesCache?.mtimeMs === mtimeMs) {
      return { employees: employeesCache.employees, exits: employeesCache.exits };
    }

    const state = await loadState();
    let dirty = false;
    if (deprecatedHeadersPresent(state.masterWs)) {
      clearDeprecatedHeaders(state.masterWs);
      dirty = true;
    }
    if (ensureContractHeaders(state.masterWs)) dirty = true;
    if (ensureContractHeaders(state.exitWs)) dirty = true;
    if (await replaceMalangaWithZamba(state)) dirty = true;
    if (reconcileEmployeeAndCheckDocs(state)) dirty = true;
    if (dirty) await saveWorkbook(state.wb, EXCEL_PATH);

    return buildAndSnapshot(state);
  });
}

export async function getEmployee(matricule: string): Promise<Employee | undefined> {
  const { employees, exits } = await readEmployeesBundle();
  return (
    employees.find((e) => e.matricule === matricule)
    ?? exits.find((e) => e.matricule === matricule)
  );
}

export async function upsertEmployee(employee: Employee): Promise<Employee> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadState();
    const normalized = applyContractDefaults(employee);

    if (normalized.statut === 'Inactive') {
      removeMasterRow(state.masterWs, state.masterRows, MASTER_DATA_START, normalized.matricule);
      // Ne pas modifier CHECK DOCUMENTS BASE — la ligne reste, hors % conformité.
      writeMasterRowOnto(state.exitWs, state.exitRows, EXIT_DATA_START, normalized);
    } else {
      removeMasterRow(state.exitWs, state.exitRows, EXIT_DATA_START, normalized.matricule);
      writeMasterRowOnto(state.masterWs, state.masterRows, MASTER_DATA_START, normalized);
      syncCheckDocsIdentityRow(state, normalized);
    }

    ensureContractHeaders(state.masterWs);
    ensureContractHeaders(state.exitWs);
    reconcileEmployeeAndCheckDocs(state);

    await saveWorkbook(state.wb, EXCEL_PATH);
    await buildAndSnapshot(state);
    return normalized;
  });
}

export async function deleteEmployee(matricule: string): Promise<boolean> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadState();
    let found = false;

    const docsIdx = state.dataRows.findIndex((row) => str(row[0]) === matricule);
    if (docsIdx >= 0) {
      shiftRowsUp(state.ws, DATA_START + docsIdx, 1);
      state.dataRows.splice(docsIdx, 1);
      found = true;
    }
    if (removeMasterRow(state.masterWs, state.masterRows, MASTER_DATA_START, matricule)) {
      found = true;
    }
    if (removeMasterRow(state.exitWs, state.exitRows, EXIT_DATA_START, matricule)) {
      found = true;
    }

    if (!found) return false;
    await saveWorkbook(state.wb, EXCEL_PATH);
    await buildAndSnapshot(state);
    return true;
  }).then(async (found) => {
    if (found) {
      const { removeDependantsByMatricule } = await import('./dependants-store');
      await removeDependantsByMatricule(matricule);
    }
    return found;
  });
}

export async function updateEmployeeDocument(
  matricule: string,
  docKey: string,
  value: 'Y' | 'N' | 'NA',
): Promise<Employee | null> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadState();
    const idx = state.dataRows.findIndex((row) => str(row[0]) === matricule);
    if (idx < 0) return null;
    const employee = rowToEmployee(state.dataRows[idx]);
    if (!employee) return null;
    employee.documents = { ...employee.documents, [docKey]: value };
    const row = employeeToRow(employee);
    writeRowValues(state.ws, DATA_START + idx, row);
    state.dataRows[idx] = row;
    await saveWorkbook(state.wb, EXCEL_PATH);
    const { employees } = await buildAndSnapshot(state);
    return employees.find((e) => e.matricule === matricule) ?? null;
  });
}
