import 'server-only';

import path from 'path';
import {
  getSheetBlock,
  readWorkbookForData,
  withExcelLock,
  type AoaRow,
} from './excel-io';
import { DEP_COL, DEPENDANTS_DATA_START, DEPENDANTS_SHEET } from './dependants-columns';
import { EMP_COL, EMPLOYEE_EXIT_SHEET } from './employee-columns';
import type {
  Dependant,
  DependantFormData,
  DependantsData,
} from './dependants-types';
import { buildDashboardFromDependants, computeFamilyCompositionCounts, isEmployeeStatut, isDependantSummaryRow, applyAllFamilyCompositions } from './dependants-utils';
import {
  loadDependantsPopulateWorkbook,
  populateCloneRowStyle,
  populateFindLastDataRow,
  populateShiftRowsDown,
  populateShiftRowsUp,
  populateWriteRowValues,
  savePopulateWorkbook,
} from './dependants-xlsx-mutate.server';

const EXCEL_PATH = process.env.EMPLOYEE_XLSX || path.join(process.cwd(), 'Excel', 'EMPLOYEE.xlsx');

const EMPLOYEE_SHEET = 'EMPLOYEE';
const EMPLOYEE_DATA_START = 2;

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function numOrNull(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatExcelDate(value: unknown): string {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('fr-FR');
    }
  }
  const trimmed = str(value);
  if (!trimmed) return '';
  const iso = new Date(`${trimmed}T00:00:00`);
  if (!Number.isNaN(iso.getTime())) {
    return iso.toLocaleDateString('fr-FR');
  }
  return trimmed;
}

function parseDateToExcel(value: string): number | string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const fr = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fr) {
    const date = new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]));
    if (!Number.isNaN(date.getTime())) {
      return Math.round(date.getTime() / 86400000) + 25569;
    }
  }
  const iso = new Date(`${trimmed}T00:00:00`);
  if (!Number.isNaN(iso.getTime())) {
    return Math.round(iso.getTime() / 86400000) + 25569;
  }
  return trimmed;
}

function computeAgeFromDate(dateNaissance: string): number | null {
  const trimmed = dateNaissance.trim();
  if (!trimmed) return null;
  const fr = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const date = fr
    ? new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]))
    : new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function readEmployeeIndex(
  dataRows: AoaRow[],
): Map<string, { nom: string; departement: string }> {
  const index = new Map<string, { nom: string; departement: string }>();
  for (const row of dataRows) {
    const matricule = str(row[0]);
    const nom = str(row[2]);
    if (!matricule || !nom || !/^\d/.test(matricule)) continue;
    index.set(matricule, {
      nom,
      departement: str(row[3]),
    });
  }
  return index;
}

function enrichDependant(
  row: AoaRow,
  employeeIndex: Map<string, { nom: string; departement: string }>,
  exitIndex?: Map<string, { nom: string; departement: string }>,
): Dependant | null {
  const matricule = str(row[DEP_COL.matricule]);
  const statut = str(row[DEP_COL.statut]);
  const nom = str(row[DEP_COL.nom]);
  const pactilis = str(row[DEP_COL.pactilis]);
  // Garder les lignes valides même si le nom est vide (évite l'écart 714/715).
  if (!matricule || (!nom && !statut)) return null;
  if (isDependantSummaryRow({ pactilis, nom, statut })) return null;

  const employee = employeeIndex.get(matricule) ?? exitIndex?.get(matricule);
  const dateNaissance = formatExcelDate(row[DEP_COL.dateNaissance]);
  const ageFromSheet = numOrNull(row[DEP_COL.age]);
  return {
    id: numOrNull(row[DEP_COL.id]) ?? 0,
    matricule,
    pactilis,
    statut,
    sexe: str(row[DEP_COL.sexe]),
    nom: nom || '—',
    localisation: str(row[DEP_COL.localisation]),
    numeroVilla: str(row[DEP_COL.numeroVilla]),
    typeMaison: str(row[DEP_COL.typeMaison]),
    dateNaissance,
    age: ageFromSheet ?? computeAgeFromDate(dateNaissance),
    compositionFamille: numOrNull(row[DEP_COL.compositionFamille]),
    enfants: numOrNull(row[DEP_COL.enfants]),
    total: numOrNull(row[DEP_COL.total]),
    commentaires: str(row[DEP_COL.commentaires]),
    lienDocument: str(row[DEP_COL.lienDocument]),
    employeNom: employee?.nom ?? '',
    departement: employee?.departement ?? '',
  };
}

function dependantToRow(id: number, data: DependantFormData): AoaRow {
  const age = data.age ?? computeAgeFromDate(data.dateNaissance);
  return [
    id,
    data.matricule,
    data.pactilis,
    data.statut,
    data.sexe,
    data.nom,
    data.localisation,
    parseDateToExcel(data.dateNaissance),
    age ?? '',
    data.compositionFamille ?? '',
    data.enfants ?? '',
    data.total ?? '',
    data.commentaires,
    data.lienDocument?.trim() || '',
    data.numeroVilla?.trim() || '',
    data.typeMaison?.trim() || '',
  ];
}

function readRowFromPopulate(
  sheet: Awaited<ReturnType<typeof loadDependantsPopulateWorkbook>>['sheet'],
  excelRow: number,
): AoaRow {
  const row: AoaRow = [];
  for (let col = 0; col <= DEP_COL.typeMaison; col++) {
    const cell = sheet.cell(excelRow, col + 1);
    if (col === DEP_COL.lienDocument) {
      const hyperlink = typeof cell.hyperlink === 'function' ? cell.hyperlink() : undefined;
      if (typeof hyperlink === 'string' && hyperlink.trim()) {
        row.push(hyperlink.trim());
        continue;
      }
      if (hyperlink && typeof hyperlink === 'object' && 'hyperlink' in (hyperlink as object)) {
        row.push(String((hyperlink as { hyperlink: string }).hyperlink).trim());
        continue;
      }
    }
    row.push(cell.value() as AoaRow[number]);
  }
  return row;
}

function loadDependantsRowsFromPopulate(
  sheet: Awaited<ReturnType<typeof loadDependantsPopulateWorkbook>>['sheet'],
): AoaRow[] {
  const last = populateFindLastDataRow(sheet);
  const rows: AoaRow[] = [];
  for (let excelRow = DEPENDANTS_DATA_START + 1; excelRow <= last; excelRow++) {
    rows.push(readRowFromPopulate(sheet, excelRow));
  }
  return rows;
}

function loadEmployeeIndexFromPopulate(
  workbook: Awaited<ReturnType<typeof loadDependantsPopulateWorkbook>>['workbook'],
): Map<string, { nom: string; departement: string }> {
  const sheet = workbook.sheet(EMPLOYEE_SHEET);
  const index = new Map<string, { nom: string; departement: string }>();
  const used = sheet.usedRange();
  const maxRow = used ? used.endCell().rowNumber() : 500;

  for (let row = EMPLOYEE_DATA_START + 1; row <= maxRow; row++) {
    const matricule = str(sheet.cell(row, 1).value());
    const nom = str(sheet.cell(row, 3).value());
    if (!matricule || !nom || !/^\d/.test(matricule)) continue;
    index.set(matricule, {
      nom,
      departement: str(sheet.cell(row, 4).value()),
    });
  }

  return index;
}

async function loadDependantsMutationState() {
  const { workbook, sheet } = await loadDependantsPopulateWorkbook(EXCEL_PATH);
  return {
    workbook,
    sheet,
    dataRows: loadDependantsRowsFromPopulate(sheet),
    employeeIndex: loadEmployeeIndexFromPopulate(workbook),
  };
}

function nextDependantId(dataRows: AoaRow[]): number {
  let max = 0;
  for (const row of dataRows) {
    const id = numOrNull(row[DEP_COL.id]) ?? 0;
    if (id > max) max = id;
  }
  return max + 1;
}

function findRowIndexById(dataRows: AoaRow[], id: number): number {
  return dataRows.findIndex((row) => numOrNull(row[DEP_COL.id]) === id);
}

function findFamilyInsertIndex(dataRows: AoaRow[], matricule: string): number {
  const normalizedMatricule = matricule.trim();
  if (!normalizedMatricule) return dataRows.length;

  let employeeIdx = -1;
  for (let index = 0; index < dataRows.length; index++) {
    const rowMatricule = str(dataRows[index][DEP_COL.matricule]);
    const statut = str(dataRows[index][DEP_COL.statut]);
    if (rowMatricule === normalizedMatricule && isEmployeeStatut(statut)) {
      employeeIdx = index;
      break;
    }
  }

  if (employeeIdx < 0) return dataRows.length;

  let insertAfter = employeeIdx;
  for (let index = employeeIdx + 1; index < dataRows.length; index++) {
    const row = dataRows[index];
    const rowMatricule = str(row[DEP_COL.matricule]);
    const statut = str(row[DEP_COL.statut]);

    if (rowMatricule && rowMatricule !== normalizedMatricule) break;
    if (isEmployeeStatut(statut) && rowMatricule) break;
    if (rowMatricule === normalizedMatricule || !rowMatricule) {
      insertAfter = index;
      continue;
    }
    break;
  }

  return insertAfter + 1;
}

function resolveFamilyStyleSourceRow(insertExcelRow: number): number {
  if (insertExcelRow > DEPENDANTS_DATA_START + 1) {
    return insertExcelRow - 1;
  }
  return DEPENDANTS_DATA_START + 1;
}

/** Recalcule Composition / Enfants / Total sur la ligne employé. */
function syncEmployeeFamilyComposition(
  sheet: Awaited<ReturnType<typeof loadDependantsPopulateWorkbook>>['sheet'],
  dataRows: AoaRow[],
  matricule: string,
): void {
  const normalized = matricule.trim();
  if (!normalized) return;

  const family = dataRows.filter((row) => str(row[DEP_COL.matricule]) === normalized);
  if (!family.length) return;

  const counts = computeFamilyCompositionCounts(
    family.map((row) => ({ statut: str(row[DEP_COL.statut]) })),
  );

  const employeeIdx = dataRows.findIndex(
    (row) => str(row[DEP_COL.matricule]) === normalized
      && isEmployeeStatut(str(row[DEP_COL.statut])),
  );
  if (employeeIdx < 0) return;

  const excelRow = DEPENDANTS_DATA_START + 1 + employeeIdx;
  sheet.cell(excelRow, DEP_COL.compositionFamille + 1).value(counts.compositionFamille);
  sheet.cell(excelRow, DEP_COL.enfants + 1).value(counts.enfants);
  sheet.cell(excelRow, DEP_COL.total + 1).value(counts.total);

  dataRows[employeeIdx][DEP_COL.compositionFamille] = counts.compositionFamille;
  dataRows[employeeIdx][DEP_COL.enfants] = counts.enfants;
  dataRows[employeeIdx][DEP_COL.total] = counts.total;
}

/**
 * Sépare les familles d'employés actifs (EMPLOYEE) et sortis (EXIT / hors effectif).
 * Le dashboard KPI ne compte que les actifs (ex. 175).
 * Si un matricule EXIT n'a plus de ligne DEPENDANTS (purge antérieure), on la
 * recrée depuis la fiche EXIT pour l'onglet Exit.
 */
export async function readDependantsData(): Promise<DependantsData> {
  await seedMissingExitDependantsFromExitSheet();
  return readDependantsDataFromWorkbook();
}

async function readDependantsDataFromWorkbook(): Promise<DependantsData> {
  const wb = await readWorkbookForData(EXCEL_PATH);
  const employeeSheet = getSheetBlock(wb, EMPLOYEE_SHEET, EMPLOYEE_DATA_START, { keyCol: 0 });
  const dependantsSheet = getSheetBlock(wb, DEPENDANTS_SHEET, DEPENDANTS_DATA_START, { keyCol: 1 });

  const employeeIndex = readEmployeeIndex(employeeSheet.dataRows);
  const exitRows = wb.Sheets[EMPLOYEE_EXIT_SHEET]
    ? getSheetBlock(wb, EMPLOYEE_EXIT_SHEET, EMPLOYEE_DATA_START, { keyCol: 0 }).dataRows
    : [];
  const exitIndex = readEmployeeIndex(exitRows);

  const allRows = dependantsSheet.dataRows
    .map((row) => enrichDependant(row, employeeIndex, exitIndex))
    .filter((row): row is Dependant => row !== null);

  const activeRows = allRows.filter((row) => employeeIndex.has(row.matricule));
  const exitedRows = allRows.filter(
    (row) => exitIndex.has(row.matricule) || !employeeIndex.has(row.matricule),
  );

  const dependants = applyAllFamilyCompositions(activeRows);
  const exitedDependants = applyAllFamilyCompositions(exitedRows);

  return {
    dependants,
    exitedDependants,
    dashboard: buildDashboardFromDependants(dependants),
  };
}

function formDataFromExitRow(row: AoaRow): DependantFormData | null {
  const matricule = str(row[EMP_COL.matricule]);
  const nom = str(row[EMP_COL.nom]);
  if (!matricule || !nom || !/^\d/.test(matricule)) return null;

  const gender = str(row[EMP_COL.gender]).toUpperCase();
  const sexe = gender.startsWith('F') ? 'F' : gender.startsWith('M') ? 'M' : '';

  return {
    matricule,
    pactilis: '',
    statut: 'Employé',
    sexe,
    nom,
    localisation: str(row[EMP_COL.localisation]) || 'Kinshasa',
    dateNaissance: formatExcelDate(row[EMP_COL.dateOfBirth]),
    compositionFamille: 1,
    enfants: 0,
    total: 1,
    commentaires: 'Sorti (EXIT)',
    lienDocument: '',
    numeroVilla: '',
    typeMaison: '',
  };
}

/**
 * Recrée une ligne « Employé » dans DEPENDANTS pour chaque matricule EXIT
 * qui n'y figure plus (ex. après une purge). Ne touche pas aux familles déjà présentes.
 */
async function seedMissingExitDependantsFromExitSheet(): Promise<number> {
  const wb = await readWorkbookForData(EXCEL_PATH);
  if (!wb.Sheets[EMPLOYEE_EXIT_SHEET]) return 0;

  const employeeIndex = readEmployeeIndex(
    getSheetBlock(wb, EMPLOYEE_SHEET, EMPLOYEE_DATA_START, { keyCol: 0 }).dataRows,
  );
  const exitRows = getSheetBlock(wb, EMPLOYEE_EXIT_SHEET, EMPLOYEE_DATA_START, {
    keyCol: 0,
  }).dataRows;
  const dependantsSheet = getSheetBlock(wb, DEPENDANTS_SHEET, DEPENDANTS_DATA_START, {
    keyCol: 1,
  });

  const presentMats = new Set(
    dependantsSheet.dataRows
      .map((row) => str(row[DEP_COL.matricule]))
      .filter(Boolean),
  );

  const missing: DependantFormData[] = [];
  for (const row of exitRows) {
    const matricule = str(row[EMP_COL.matricule]);
    if (!matricule || employeeIndex.has(matricule) || presentMats.has(matricule)) continue;
    const form = formDataFromExitRow(row);
    if (form) missing.push(form);
  }

  if (!missing.length) return 0;

  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadDependantsMutationState();
    let inserted = 0;

    for (const data of missing) {
      if (state.dataRows.some((row) => str(row[DEP_COL.matricule]) === data.matricule)) {
        continue;
      }
      const id = nextDependantId(state.dataRows);
      const row = dependantToRow(id, data);
      const insertIdx = findFamilyInsertIndex(state.dataRows, data.matricule);
      const insertExcelRow = DEPENDANTS_DATA_START + 1 + insertIdx;
      const styleSourceRow = resolveFamilyStyleSourceRow(insertExcelRow);

      populateShiftRowsDown(state.sheet, insertExcelRow);
      populateCloneRowStyle(state.sheet, styleSourceRow, insertExcelRow);
      populateWriteRowValues(state.sheet, insertExcelRow, row);
      state.dataRows.splice(insertIdx, 0, row);
      inserted += 1;
    }

    if (inserted > 0) {
      await savePopulateWorkbook(state.workbook, EXCEL_PATH);
    }
    return inserted;
  });
}

/**
 * Supprime toutes les lignes DEPENDANTS d'un matricule (famille entière).
 * À appeler après un passage en EXIT, hors du verrou employees-store.
 */
export async function removeDependantsByMatricule(matricule: string): Promise<number> {
  const normalized = matricule.trim();
  if (!normalized) return 0;

  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadDependantsMutationState();
    let removed = 0;

    for (let idx = state.dataRows.length - 1; idx >= 0; idx -= 1) {
      if (str(state.dataRows[idx][DEP_COL.matricule]) !== normalized) continue;
      const excelRow = DEPENDANTS_DATA_START + 1 + idx;
      populateShiftRowsUp(state.sheet, excelRow);
      state.dataRows.splice(idx, 1);
      removed += 1;
    }

    if (removed > 0) {
      await savePopulateWorkbook(state.workbook, EXCEL_PATH);
    }
    return removed;
  });
}

/**
 * Retire du fichier DEPENDANTS toutes les familles dont le matricule n'est
 * plus sur EMPLOYEE (ex. déjà en EXIT). Idempotent.
 */
export async function purgeDependantsOfInactiveEmployees(): Promise<number> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadDependantsMutationState();
    const active = state.employeeIndex;
    let removed = 0;

    for (let idx = state.dataRows.length - 1; idx >= 0; idx -= 1) {
      const mat = str(state.dataRows[idx][DEP_COL.matricule]);
      if (!mat || active.has(mat)) continue;
      const excelRow = DEPENDANTS_DATA_START + 1 + idx;
      populateShiftRowsUp(state.sheet, excelRow);
      state.dataRows.splice(idx, 1);
      removed += 1;
    }

    if (removed > 0) {
      await savePopulateWorkbook(state.workbook, EXCEL_PATH);
    }
    return removed;
  });
}

export async function createDependant(data: DependantFormData): Promise<Dependant> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadDependantsMutationState();
    const id = nextDependantId(state.dataRows);

    let payload = data;
    if (isEmployeeStatut(data.statut)) {
      const counts = computeFamilyCompositionCounts([{ statut: data.statut }]);
      payload = { ...data, ...counts };
    }

    const row = dependantToRow(id, payload);
    const insertIdx = findFamilyInsertIndex(state.dataRows, data.matricule);
    const insertExcelRow = DEPENDANTS_DATA_START + 1 + insertIdx;
    const styleSourceRow = resolveFamilyStyleSourceRow(insertExcelRow);

    populateShiftRowsDown(state.sheet, insertExcelRow);
    populateCloneRowStyle(state.sheet, styleSourceRow, insertExcelRow);
    populateWriteRowValues(state.sheet, insertExcelRow, row);
    state.dataRows.splice(insertIdx, 0, row);

    if (!isEmployeeStatut(data.statut)) {
      syncEmployeeFamilyComposition(state.sheet, state.dataRows, data.matricule);
    }

    await savePopulateWorkbook(state.workbook, EXCEL_PATH);

    const created = enrichDependant(row, state.employeeIndex);
    if (!created) throw new Error('Impossible de créer le bénéficiaire');
    return created;
  });
}

export async function updateDependant(id: number, data: DependantFormData): Promise<Dependant> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadDependantsMutationState();
    const idx = findRowIndexById(state.dataRows, id);
    if (idx < 0) throw new Error('Bénéficiaire introuvable');

    let payload = data;
    if (isEmployeeStatut(data.statut)) {
      const familyStatuts = state.dataRows
        .filter((row, rowIdx) => {
          if (str(row[DEP_COL.matricule]) !== data.matricule.trim()) return false;
          if (rowIdx === idx) return false;
          return true;
        })
        .map((row) => ({ statut: str(row[DEP_COL.statut]) }));
      familyStatuts.push({ statut: data.statut });
      payload = { ...data, ...computeFamilyCompositionCounts(familyStatuts) };
    }

    const row = dependantToRow(id, payload);
    const excelRow = DEPENDANTS_DATA_START + 1 + idx;
    populateWriteRowValues(state.sheet, excelRow, row);
    state.dataRows[idx] = row;

    if (!isEmployeeStatut(data.statut)) {
      syncEmployeeFamilyComposition(state.sheet, state.dataRows, data.matricule);
    }

    await savePopulateWorkbook(state.workbook, EXCEL_PATH);
    const updated = enrichDependant(
      isEmployeeStatut(data.statut) ? row : state.dataRows[idx],
      state.employeeIndex,
    );
    if (!updated) throw new Error('Mise à jour impossible');
    return updated;
  });
}

export async function deleteDependant(id: number): Promise<boolean> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadDependantsMutationState();
    const idx = findRowIndexById(state.dataRows, id);
    if (idx < 0) return false;
    const matricule = str(state.dataRows[idx][DEP_COL.matricule]);
    const excelRow = DEPENDANTS_DATA_START + 1 + idx;
    populateShiftRowsUp(state.sheet, excelRow);
    state.dataRows.splice(idx, 1);
    syncEmployeeFamilyComposition(state.sheet, state.dataRows, matricule);
    await savePopulateWorkbook(state.workbook, EXCEL_PATH);
    return true;
  });
}

/** Applique une localisation à tous les membres d'une famille (même matricule). */
export async function updateFamilyLocalisation(
  matricule: string,
  localisation: string,
): Promise<Dependant[]> {
  const normalizedMatricule = matricule.trim();
  const normalizedLocalisation = localisation.trim();
  if (!normalizedMatricule) throw new Error('Matricule requis');
  if (!normalizedLocalisation) throw new Error('Localisation requise');

  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadDependantsMutationState();
    const updated: Dependant[] = [];

    for (let idx = 0; idx < state.dataRows.length; idx++) {
      const row = state.dataRows[idx];
      if (str(row[DEP_COL.matricule]) !== normalizedMatricule) continue;

      const excelRow = DEPENDANTS_DATA_START + 1 + idx;
      state.sheet.cell(excelRow, DEP_COL.localisation + 1).value(normalizedLocalisation);
      row[DEP_COL.localisation] = normalizedLocalisation;

      const enriched = enrichDependant(row, state.employeeIndex);
      if (enriched) updated.push(enriched);
    }

    if (!updated.length) {
      throw new Error('Aucune famille trouvée pour ce matricule');
    }

    await savePopulateWorkbook(state.workbook, EXCEL_PATH);
    return updated;
  });
}

/**
 * Affecte (ou libère) une maison village sur la ligne employé DEPENDANTS.
 * Propage Numero Villa / Type de maison ; optionnellement aligne la localisation famille sur Zamba.
 */
export async function assignEmployeeMaison(params: {
  matricule: string;
  numeroVilla: string;
  typeMaison?: string;
  setLocalisationZamba?: boolean;
}): Promise<Dependant> {
  const results = await assignManyEmployeeMaisons([params]);
  const first = results[0];
  if (!first) throw new Error('Affectation impossible');
  return first;
}

/** Affectations groupées (un seul verrou Excel). */
export async function assignManyEmployeeMaisons(
  items: Array<{
    matricule: string;
    numeroVilla: string;
    typeMaison?: string;
    setLocalisationZamba?: boolean;
  }>,
): Promise<Dependant[]> {
  if (!items.length) return [];

  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadDependantsMutationState();
    const updated: Dependant[] = [];

    for (const params of items) {
      const matricule = params.matricule.trim();
      if (!matricule) continue;
      const numeroVilla = params.numeroVilla.trim();
      const typeMaison = (params.typeMaison ?? '').trim();

      const idx = state.dataRows.findIndex(
        (row) => str(row[DEP_COL.matricule]) === matricule && isEmployeeStatut(str(row[DEP_COL.statut])),
      );
      if (idx < 0) {
        throw new Error(`Ligne employé introuvable dans DEPENDANTS pour ${matricule}`);
      }

      const excelRow = DEPENDANTS_DATA_START + 1 + idx;
      state.sheet.cell(excelRow, DEP_COL.numeroVilla + 1).value(numeroVilla);
      state.sheet.cell(excelRow, DEP_COL.typeMaison + 1).value(typeMaison);
      state.dataRows[idx][DEP_COL.numeroVilla] = numeroVilla;
      state.dataRows[idx][DEP_COL.typeMaison] = typeMaison;

      // Tous les membres de la famille (même matricule) reçoivent le même n° villa / type.
      for (let i = 0; i < state.dataRows.length; i++) {
        if (str(state.dataRows[i]![DEP_COL.matricule]) !== matricule) continue;
        const r = DEPENDANTS_DATA_START + 1 + i;
        state.sheet.cell(r, DEP_COL.numeroVilla + 1).value(numeroVilla);
        state.sheet.cell(r, DEP_COL.typeMaison + 1).value(typeMaison);
        state.dataRows[i]![DEP_COL.numeroVilla] = numeroVilla;
        state.dataRows[i]![DEP_COL.typeMaison] = typeMaison;

        if (params.setLocalisationZamba !== false && numeroVilla) {
          state.sheet.cell(r, DEP_COL.localisation + 1).value('Zamba');
          state.dataRows[i]![DEP_COL.localisation] = 'Zamba';
        }
      }

      const enriched = enrichDependant(state.dataRows[idx], state.employeeIndex);
      if (enriched) updated.push(enriched);
    }

    await savePopulateWorkbook(state.workbook, EXCEL_PATH);
    return updated;
  });
}

/**
 * Aligne Numero Villa / Type de maison de chaque dépendant
 * sur la ligne Employé du même matricule.
 */
export async function syncAllDependantsVillaFromEmployees(): Promise<number> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadDependantsMutationState();
    const byMatricule = new Map<string, { villa: string; typeMaison: string }>();

    for (const row of state.dataRows) {
      const matricule = str(row[DEP_COL.matricule]);
      if (!matricule || !isEmployeeStatut(str(row[DEP_COL.statut]))) continue;
      byMatricule.set(matricule, {
        villa: str(row[DEP_COL.numeroVilla]),
        typeMaison: str(row[DEP_COL.typeMaison]),
      });
    }

    let changed = 0;
    for (let i = 0; i < state.dataRows.length; i++) {
      const row = state.dataRows[i]!;
      const matricule = str(row[DEP_COL.matricule]);
      if (!matricule) continue;
      const source = byMatricule.get(matricule);
      if (!source) continue;
      if (
        str(row[DEP_COL.numeroVilla]) === source.villa
        && str(row[DEP_COL.typeMaison]) === source.typeMaison
      ) {
        continue;
      }
      const excelRow = DEPENDANTS_DATA_START + 1 + i;
      state.sheet.cell(excelRow, DEP_COL.numeroVilla + 1).value(source.villa);
      state.sheet.cell(excelRow, DEP_COL.typeMaison + 1).value(source.typeMaison);
      row[DEP_COL.numeroVilla] = source.villa;
      row[DEP_COL.typeMaison] = source.typeMaison;
      changed += 1;
    }

    if (changed > 0) {
      await savePopulateWorkbook(state.workbook, EXCEL_PATH);
    }
    return changed;
  });
}
