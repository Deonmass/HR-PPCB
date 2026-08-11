import 'server-only';

import { randomUUID } from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_CHECK_DOCUMENTS_KEY,
  DURABLE_EMPLOYEES_KEY,
  DURABLE_EMPLOYEE_EXITS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import type {
  EmployeeCheckDocumentRecord,
  EmployeeExitRecord,
  EmployeeExitsJsonStoreData,
  EmployeeRecord,
  EmployeeCheckDocumentsJsonStoreData,
  EmployeesJsonStoreData,
} from './employees-json-types';
import { CHECK_DOCUMENTS_DATA_START, CHECK_DOCUMENTS_SHEET } from './check-documents-columns';
import { DOCUMENT_FIELDS, normalizeDocStatus } from './documents';
import { getEmployeeWorkbookPath } from './excel-data-paths';
import { getSheetBlock, readWorkbookForData, withExcelLock, type AoaRow } from './excel-io';
import {
  computeFinPeriodeEssai,
  isRealExitRaison,
  normalizeEmployeeStatut,
  todayDisplayDate,
} from './employee-columns';
import { resolveEssaiEcheanceEval, applyCddVersCdiHistory, computeFinContratFromDuree, resolveEssaiStatutEval } from './employees-trial';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type { Employee, EmployeeDocuments } from './types';

const DOC_COL_START = 6;

function resolvePath(relativeParts: string[]): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), ...relativeParts);
  }
  const writable = path.join(getWritableDataRoot(), ...relativeParts.slice(1));
  const bundled = path.join(process.cwd(), ...relativeParts);
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

function employeesPath(): string {
  return resolvePath(['data', 'employees', 'employees.json']);
}

function exitsPath(): string {
  return resolvePath(['data', 'employees', 'exits.json']);
}

function checkDocumentsPath(): string {
  return resolvePath(['data', 'employees', 'check-documents.json']);
}

function emptyDocuments(): EmployeeDocuments {
  return Object.fromEntries(
    DOCUMENT_FIELDS.map((field) => [field.key, 'N']),
  ) as EmployeeDocuments;
}

function normalizeDocuments(documents?: EmployeeDocuments): EmployeeDocuments {
  const next = emptyDocuments();
  for (const field of DOCUMENT_FIELDS) {
    next[field.key] = normalizeDocStatus(String(documents?.[field.key] || 'N'));
  }
  return next;
}

function toEmployeeRecord(employee: Employee, now: string, id: string = randomUUID()): EmployeeRecord {
  return {
    id,
    matricule: employee.matricule,
    nom: employee.nom,
    departement: employee.departement,
    grade: employee.grade,
    jobTitle: employee.jobTitle,
    localisation: employee.localisation ?? '',
    company: employee.company || '',
    centreCout: employee.centreCout || '',
    appointmentDate: employee.appointmentDate || '',
    gender: employee.gender || '',
    dateOfBirth: employee.dateOfBirth || '',
    age: employee.age ?? null,
    nationality: employee.nationality || '',
    maritalStatus: employee.maritalStatus || '',
    numberOfChildren: employee.numberOfChildren ?? null,
    personnelArea: employee.personnelArea || '',
    personnelSubArea: employee.personnelSubArea || '',
    employeeSubGroup: employee.employeeSubGroup || '',
    payrollArea: employee.payrollArea || '',
    position: employee.position || '',
    departmentHr: employee.departmentHr || '',
    lineManagerName: employee.lineManagerName || '',
    lineManagerPosition: employee.lineManagerPosition || '',
    patersonGrade: employee.patersonGrade || '',
    statut: normalizeEmployeeStatut(employee.statut),
    typeContrat: employee.typeContrat || '',
    dureeContratMois: employee.dureeContratMois ?? null,
    periodeEssaiMois: employee.periodeEssaiMois ?? null,
    dateFinPeriodeEssai: employee.dateFinPeriodeEssai || '',
    dateFinContrat: employee.dateFinContrat || '',
    raisonExit: employee.raisonExit || 'NA',
    essaiActions: employee.essaiActions || '',
    essaiResponsable: employee.essaiResponsable || '',
    essaiEcheanceEval: employee.essaiEcheanceEval || '',
    essaiStatutEval: employee.essaiStatutEval || '',
    essaiCommentaire: employee.essaiCommentaire || '',
    cddHistoriqueDebut: employee.cddHistoriqueDebut || '',
    cddHistoriqueFin: employee.cddHistoriqueFin || '',
    cddHistoriqueDureeMois: employee.cddHistoriqueDureeMois ?? null,
    datePassageCdi: employee.datePassageCdi || '',
    cnss: employee.cnss || '',
    nif: employee.nif || '',
    createdAt: now,
    updatedAt: now,
  };
}

function applyContractDefaults(employee: Employee): Employee {
  let statut = normalizeEmployeeStatut(employee.statut);
  const periodeEssaiMois = employee.periodeEssaiMois ?? null;
  const dateFinPeriodeEssai = computeFinPeriodeEssai(employee.appointmentDate || '', periodeEssaiMois);
  const dureeContratMois = employee.dureeContratMois ?? null;
  const finContratFromDuree = computeFinContratFromDuree(
    employee.appointmentDate || '',
    dureeContratMois,
  );
  let dateFinContrat =
    (dureeContratMois != null && dureeContratMois > 0 && finContratFromDuree)
      ? finContratFromDuree
      : (employee.dateFinContrat || finContratFromDuree || '');
  let raisonExit = employee.raisonExit || '';

  if (isRealExitRaison(raisonExit)) {
    statut = 'Inactive';
  } else if (/^na$/i.test(raisonExit.trim()) || !raisonExit.trim()) {
    raisonExit = 'NA';
    statut = 'Active';
  }

  if (statut === 'Inactive' && !dateFinContrat) {
    dateFinContrat = todayDisplayDate();
  }

  const withDates: Employee = {
    ...employee,
    statut,
    dureeContratMois,
    periodeEssaiMois,
    dateFinPeriodeEssai,
    dateFinContrat,
    raisonExit,
    essaiActions: employee.essaiActions || '',
    essaiResponsable: employee.essaiResponsable || '',
    essaiCommentaire: employee.essaiCommentaire || '',
    cddHistoriqueDebut: employee.cddHistoriqueDebut || '',
    cddHistoriqueFin: employee.cddHistoriqueFin || '',
    cddHistoriqueDureeMois: employee.cddHistoriqueDureeMois ?? null,
    datePassageCdi: employee.datePassageCdi || '',
  };

  return {
    ...withDates,
    essaiEcheanceEval: resolveEssaiEcheanceEval(withDates),
    essaiStatutEval: resolveEssaiStatutEval(withDates),
  };
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

async function readEmployeesStore(): Promise<EmployeesJsonStoreData> {
  return readJsonFile(DURABLE_EMPLOYEES_KEY, employeesPath(), { employees: [] });
}

async function readExitsStore(): Promise<EmployeeExitsJsonStoreData> {
  return readJsonFile(DURABLE_EMPLOYEE_EXITS_KEY, exitsPath(), { exits: [] });
}

async function readCheckDocumentsStore(): Promise<EmployeeCheckDocumentsJsonStoreData> {
  return readJsonFile(DURABLE_CHECK_DOCUMENTS_KEY, checkDocumentsPath(), { documents: [] });
}

async function writeAllStores(
  employees: EmployeesJsonStoreData,
  exits: EmployeeExitsJsonStoreData,
  documents: EmployeeCheckDocumentsJsonStoreData,
): Promise<void> {
  await writeJsonFile(DURABLE_EMPLOYEES_KEY, employeesPath(), employees);
  await writeJsonFile(DURABLE_EMPLOYEE_EXITS_KEY, exitsPath(), exits);
  await writeJsonFile(DURABLE_CHECK_DOCUMENTS_KEY, checkDocumentsPath(), documents);
}

function rawDocRowToDocuments(row: AoaRow): EmployeeDocuments {
  const docs = emptyDocuments();
  DOCUMENT_FIELDS.forEach((field, index) => {
    docs[field.key] = normalizeDocStatus(String(row[DOC_COL_START + index] || 'N'));
  });
  return docs;
}

async function readLegacyCheckDocumentRows(): Promise<Map<string, EmployeeDocuments>> {
  const livePath = getEmployeeWorkbookPath();
  return withExcelLock(livePath, async () => {
    const workbook = await readWorkbookForData(livePath);
    const block = getSheetBlock(workbook, CHECK_DOCUMENTS_SHEET, CHECK_DOCUMENTS_DATA_START, {
      keyCol: 0,
      emptyStreakLimit: 5,
    });
    const result = new Map<string, EmployeeDocuments>();
    for (const row of block.dataRows) {
      const matricule = String(row[0] ?? '').trim();
      const nom = String(row[1] ?? '').trim();
      if (!matricule || !nom || !/^\d/.test(matricule)) continue;
      result.set(matricule, rawDocRowToDocuments(row));
    }
    return result;
  });
}

async function ensureMigrated(): Promise<void> {
  const [employeesExists, exitsExists, docsExists] = await Promise.all([
    fsPromises.access(employeesPath()).then(() => true).catch(() => false),
    fsPromises.access(exitsPath()).then(() => true).catch(() => false),
    fsPromises.access(checkDocumentsPath()).then(() => true).catch(() => false),
  ]);
  if (employeesExists && exitsExists && docsExists) return;

  const livePath = getEmployeeWorkbookPath();
  if (!fs.existsSync(livePath)) {
    await writeAllStores({ employees: [] }, { exits: [] }, { documents: [] });
    return;
  }

  try {
  const [{ readEmployeesBundle }, docsByMatricule] = await Promise.all([
    import('./employees-excel-legacy'),
    readLegacyCheckDocumentRows(),
  ]);
  const legacy = await readEmployeesBundle();
  const now = new Date().toISOString();

  const employees: EmployeeRecord[] = legacy.employees.map((employee) =>
    toEmployeeRecord(employee, now),
  );
  const exits: EmployeeExitRecord[] = legacy.exits.map((employee) =>
    toEmployeeRecord({ ...employee, documents: employee.documents }, now),
  );
  const byMatricule = new Map<string, EmployeeRecord | EmployeeExitRecord>(
    [...employees, ...exits].map((item) => [item.matricule, item]),
  );
  const documents: EmployeeCheckDocumentRecord[] = [];

  for (const [matricule, docs] of docsByMatricule.entries()) {
    const employee = byMatricule.get(matricule);
    if (!employee) continue;
    documents.push({
      id: randomUUID(),
      employeeId: employee.id,
      matricule,
      documents: normalizeDocuments(docs),
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const employee of employees) {
    if (documents.some((item) => item.employeeId === employee.id)) continue;
    documents.push({
      id: randomUUID(),
      employeeId: employee.id,
      matricule: employee.matricule,
      documents: normalizeDocuments(),
      createdAt: now,
      updatedAt: now,
    });
  }

  await writeAllStores({ employees }, { exits }, { documents });
  } catch {
    await writeAllStores({ employees: [] }, { exits: [] }, { documents: [] });
  }
}

function composeEmployee(
  record: EmployeeRecord | EmployeeExitRecord,
  docRecord?: EmployeeCheckDocumentRecord,
): Employee {
  return {
    matricule: record.matricule,
    nom: record.nom,
    departement: record.departement,
    grade: record.grade,
    jobTitle: record.jobTitle,
    localisation: record.localisation,
    documents: normalizeDocuments(docRecord?.documents),
    company: record.company,
    centreCout: record.centreCout,
    appointmentDate: record.appointmentDate,
    gender: record.gender,
    dateOfBirth: record.dateOfBirth,
    age: record.age,
    nationality: record.nationality,
    maritalStatus: record.maritalStatus,
    numberOfChildren: record.numberOfChildren,
    personnelArea: record.personnelArea,
    personnelSubArea: record.personnelSubArea,
    employeeSubGroup: record.employeeSubGroup,
    payrollArea: record.payrollArea,
    position: record.position,
    departmentHr: record.departmentHr,
    lineManagerName: record.lineManagerName,
    lineManagerPosition: record.lineManagerPosition,
    patersonGrade: record.patersonGrade,
    statut: record.statut,
    typeContrat: record.typeContrat,
    dureeContratMois: record.dureeContratMois ?? null,
    periodeEssaiMois: record.periodeEssaiMois,
    dateFinPeriodeEssai: record.dateFinPeriodeEssai,
    dateFinContrat: record.dateFinContrat,
    raisonExit: record.raisonExit,
    essaiActions: record.essaiActions || '',
    essaiResponsable: record.essaiResponsable || '',
    essaiEcheanceEval: record.essaiEcheanceEval || '',
    essaiStatutEval: record.essaiStatutEval || '',
    essaiCommentaire: record.essaiCommentaire || '',
    cddHistoriqueDebut: record.cddHistoriqueDebut || '',
    cddHistoriqueFin: record.cddHistoriqueFin || '',
    cddHistoriqueDureeMois: record.cddHistoriqueDureeMois ?? null,
    datePassageCdi: record.datePassageCdi || '',
    cnss: record.cnss || '',
    nif: record.nif || '',
  };
}

export async function readEmployeesBundle(): Promise<{ employees: Employee[]; exits: Employee[] }> {
  await ensureMigrated();
  const [employeesStore, exitsStore, docsStore] = await Promise.all([
    readEmployeesStore(),
    readExitsStore(),
    readCheckDocumentsStore(),
  ]);
  const docsByEmployeeId = new Map(docsStore.documents.map((item) => [item.employeeId, item]));
  return {
    employees: employeesStore.employees
      .map((employee) => composeEmployee(employee, docsByEmployeeId.get(employee.id)))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    exits: exitsStore.exits
      .map((employee) => composeEmployee(employee, docsByEmployeeId.get(employee.id)))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  };
}

export async function readEmployees(): Promise<Employee[]> {
  const bundle = await readEmployeesBundle();
  return bundle.employees;
}

export async function readExitedEmployees(): Promise<Employee[]> {
  const bundle = await readEmployeesBundle();
  return bundle.exits;
}

export async function getEmployee(matricule: string): Promise<Employee | undefined> {
  const { employees, exits } = await readEmployeesBundle();
  return employees.find((item) => item.matricule === matricule)
    ?? exits.find((item) => item.matricule === matricule);
}

export async function getEmployeesRecordIndex(): Promise<{
  activeByMatricule: Map<string, EmployeeRecord>;
  exitByMatricule: Map<string, EmployeeExitRecord>;
}> {
  await ensureMigrated();
  const [employeesStore, exitsStore] = await Promise.all([readEmployeesStore(), readExitsStore()]);
  return {
    activeByMatricule: new Map(employeesStore.employees.map((item) => [item.matricule, item])),
    exitByMatricule: new Map(exitsStore.exits.map((item) => [item.matricule, item])),
  };
}

export async function upsertEmployee(employee: Employee): Promise<Employee> {
  await ensureMigrated();
  const [employeesStore, exitsStore, docsStore] = await Promise.all([
    readEmployeesStore(),
    readExitsStore(),
    readCheckDocumentsStore(),
  ]);
  const activeIndex = employeesStore.employees.findIndex((item) => item.matricule === employee.matricule);
  const exitIndex = exitsStore.exits.findIndex((item) => item.matricule === employee.matricule);
  const existing = activeIndex >= 0 ? employeesStore.employees[activeIndex] : exitIndex >= 0 ? exitsStore.exits[exitIndex] : null;
  const normalized = applyCddVersCdiHistory(existing, applyContractDefaults(employee));
  const now = new Date().toISOString();
  const nextRecord = {
    ...toEmployeeRecord(normalized, now, existing?.id ?? randomUUID()),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (normalized.statut === 'Inactive') {
    if (activeIndex >= 0) employeesStore.employees.splice(activeIndex, 1);
    if (exitIndex >= 0) exitsStore.exits[exitIndex] = nextRecord;
    else exitsStore.exits.push(nextRecord);
  } else {
    if (exitIndex >= 0) exitsStore.exits.splice(exitIndex, 1);
    if (activeIndex >= 0) employeesStore.employees[activeIndex] = nextRecord;
    else employeesStore.employees.push(nextRecord);
  }

  const docIndex = docsStore.documents.findIndex((item) => item.employeeId === nextRecord.id || item.matricule === nextRecord.matricule);
  if (docIndex >= 0) {
    docsStore.documents[docIndex] = {
      ...docsStore.documents[docIndex],
      employeeId: nextRecord.id,
      matricule: nextRecord.matricule,
      updatedAt: now,
      documents: normalizeDocuments(docsStore.documents[docIndex].documents),
    };
  } else {
    docsStore.documents.push({
      id: randomUUID(),
      employeeId: nextRecord.id,
      matricule: nextRecord.matricule,
      documents: normalizeDocuments(employee.documents),
      createdAt: now,
      updatedAt: now,
    });
  }

  await writeAllStores(employeesStore, exitsStore, docsStore);
  const saved = composeEmployee(nextRecord, docsStore.documents.find((item) => item.employeeId === nextRecord.id));

  const previousLoc = (existing?.localisation || '').trim();
  const nextLoc = (saved.localisation || '').trim();
  if (nextLoc && nextLoc !== previousLoc) {
    const { syncFamilyLocalisationFromEmployee } = await import('./dependants-json-store');
    await syncFamilyLocalisationFromEmployee(saved.matricule, nextLoc);
  }

  return saved;
}

/** Met à jour uniquement la localisation employé (sans reboucler vers dépendants). */
export async function setEmployeeLocalisationOnly(
  matricule: string,
  localisation: string,
): Promise<boolean> {
  await ensureMigrated();
  const nextLoc = localisation.trim();
  if (!matricule.trim() || !nextLoc) return false;

  const [employeesStore, exitsStore, docsStore] = await Promise.all([
    readEmployeesStore(),
    readExitsStore(),
    readCheckDocumentsStore(),
  ]);
  const activeIndex = employeesStore.employees.findIndex((item) => item.matricule === matricule);
  const exitIndex = exitsStore.exits.findIndex((item) => item.matricule === matricule);
  const target =
    activeIndex >= 0
      ? employeesStore.employees[activeIndex]
      : exitIndex >= 0
        ? exitsStore.exits[exitIndex]
        : null;
  if (!target) return false;
  if ((target.localisation || '').trim() === nextLoc) return false;

  const now = new Date().toISOString();
  target.localisation = nextLoc;
  target.updatedAt = now;
  await writeAllStores(employeesStore, exitsStore, docsStore);
  return true;
}

export async function deleteEmployee(matricule: string): Promise<boolean> {
  await ensureMigrated();
  const [employeesStore, exitsStore, docsStore] = await Promise.all([
    readEmployeesStore(),
    readExitsStore(),
    readCheckDocumentsStore(),
  ]);
  const activeIndex = employeesStore.employees.findIndex((item) => item.matricule === matricule);
  const exitIndex = exitsStore.exits.findIndex((item) => item.matricule === matricule);
  const existing = activeIndex >= 0 ? employeesStore.employees[activeIndex] : exitIndex >= 0 ? exitsStore.exits[exitIndex] : null;
  if (!existing) return false;

  if (activeIndex >= 0) employeesStore.employees.splice(activeIndex, 1);
  if (exitIndex >= 0) exitsStore.exits.splice(exitIndex, 1);
  docsStore.documents = docsStore.documents.filter(
    (item) => item.employeeId !== existing.id && item.matricule !== matricule,
  );
  await writeAllStores(employeesStore, exitsStore, docsStore);

  const { removeDependantsByMatricule } = await import('./dependants-json-store');
  await removeDependantsByMatricule(matricule);
  return true;
}

export async function updateEmployeeDocument(
  matricule: string,
  docKey: string,
  value: 'Y' | 'N' | 'NA',
): Promise<Employee | null> {
  await ensureMigrated();
  const [employeesStore, exitsStore, docsStore] = await Promise.all([
    readEmployeesStore(),
    readExitsStore(),
    readCheckDocumentsStore(),
  ]);
  const employee = employeesStore.employees.find((item) => item.matricule === matricule)
    ?? exitsStore.exits.find((item) => item.matricule === matricule);
  if (!employee) return null;

  const now = new Date().toISOString();
  const docIndex = docsStore.documents.findIndex((item) => item.employeeId === employee.id || item.matricule === matricule);
  if (docIndex >= 0) {
    docsStore.documents[docIndex] = {
      ...docsStore.documents[docIndex],
      employeeId: employee.id,
      matricule,
      updatedAt: now,
      documents: {
        ...normalizeDocuments(docsStore.documents[docIndex].documents),
        [docKey]: normalizeDocStatus(value),
      },
    };
  } else {
    docsStore.documents.push({
      id: randomUUID(),
      employeeId: employee.id,
      matricule,
      documents: {
        ...normalizeDocuments(),
        [docKey]: normalizeDocStatus(value),
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  await writeAllStores(employeesStore, exitsStore, docsStore);
  return composeEmployee(employee, docsStore.documents.find((item) => item.employeeId === employee.id));
}

export async function readCheckDocumentsIndex(): Promise<Map<string, EmployeeCheckDocumentRecord>> {
  await ensureMigrated();
  const store = await readCheckDocumentsStore();
  return new Map(store.documents.map((item) => [item.employeeId, item]));
}
